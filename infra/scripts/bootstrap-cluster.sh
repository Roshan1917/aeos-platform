#!/usr/bin/env bash
# bootstrap-cluster.sh — Bootstrap a new AEOS EKS cluster after Terraform apply.
#
# Usage:
#   ./bootstrap-cluster.sh <environment> <aws-region>
#
# Example:
#   ./bootstrap-cluster.sh prod us-east-1
#   ./bootstrap-cluster.sh non-prod us-east-1
#
# Prerequisites:
#   - kubectl
#   - helm (>= 3)
#   - aws CLI v2 (configured with appropriate credentials)
#   - ArgoCD CLI (optional, for repo access setup)

set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────────────
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <environment> <aws-region>"
  echo "  environment: prod | non-prod"
  echo "  aws-region:  e.g. us-east-1"
  exit 1
fi

ENVIRONMENT="$1"
AWS_REGION="$2"
CLUSTER_NAME="aeos-${ENVIRONMENT}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
die() { echo "[ERROR] $*" >&2; exit 1; }

check_prereqs() {
  for cmd in aws kubectl helm; do
    command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"
  done
  log "Prerequisites OK"
}

wait_for_rollout() {
  local namespace="$1"
  local deployment="$2"
  local timeout="${3:-300s}"
  log "Waiting for deployment ${namespace}/${deployment} to be ready (timeout: ${timeout})"
  kubectl rollout status deployment/"${deployment}" -n "${namespace}" --timeout="${timeout}"
}

# ── Step 1: Configure kubectl context ─────────────────────────────────────────
configure_kubectl() {
  log "Step 1: Configuring kubectl context for cluster ${CLUSTER_NAME}"
  aws eks update-kubeconfig \
    --region "${AWS_REGION}" \
    --name "${CLUSTER_NAME}" \
    --alias "aeos-${ENVIRONMENT}"
  kubectl config use-context "aeos-${ENVIRONMENT}"
  kubectl cluster-info
  log "kubectl context configured"
}

# ── Step 2: Install cert-manager ──────────────────────────────────────────────
install_cert_manager() {
  log "Step 2: Installing cert-manager"
  helm repo add jetstack https://charts.jetstack.io --force-update
  helm repo update jetstack

  helm upgrade --install cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --create-namespace \
    --version "v1.14.0" \
    --set installCRDs=true \
    --set global.leaderElection.namespace=cert-manager \
    --wait \
    --timeout 5m

  wait_for_rollout cert-manager cert-manager
  log "cert-manager installed"
}

# ── Step 3: Install external-secrets-operator ─────────────────────────────────
install_external_secrets() {
  log "Step 3: Installing external-secrets-operator"
  helm repo add external-secrets https://charts.external-secrets.io --force-update
  helm repo update external-secrets

  helm upgrade --install external-secrets external-secrets/external-secrets \
    --namespace external-secrets \
    --create-namespace \
    --version "0.9.13" \
    --set installCRDs=true \
    --wait \
    --timeout 5m

  wait_for_rollout external-secrets external-secrets

  log "Configuring ClusterSecretStore for AWS Secrets Manager"
  cat <<EOF | kubectl apply -f -
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secretsmanager
spec:
  provider:
    aws:
      service: SecretsManager
      region: ${AWS_REGION}
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
            namespace: external-secrets
EOF

  log "external-secrets-operator installed and ClusterSecretStore configured"
}

# ── Step 4: Install ingress-nginx ─────────────────────────────────────────────
install_ingress_nginx() {
  log "Step 4: Installing ingress-nginx"
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx --force-update
  helm repo update ingress-nginx

  helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx \
    --create-namespace \
    --version "4.9.1" \
    --set controller.service.type=LoadBalancer \
    --set controller.service.annotations."service\.beta\.kubernetes\.io/aws-load-balancer-type"=nlb \
    --set controller.metrics.enabled=true \
    --wait \
    --timeout 5m

  wait_for_rollout ingress-nginx ingress-nginx-controller
  log "ingress-nginx installed"

  # ── NLB security group restriction ──────────────────────────────────────────
  # The NLB created above does not, by default, restrict ingress to Cloudflare
  # IP ranges. Cloudflare proxy + zone-level WAF give protection at the edge,
  # but origin bypass is still possible via the NLB hostname.
  # Follow-up: install AWS Load Balancer Controller and add
  #   service.beta.kubernetes.io/aws-load-balancer-security-groups
  # annotation pointing at a SG whose ingress is the published Cloudflare
  # ranges (https://www.cloudflare.com/ips/). Tracked as a non-blocking item.
}

# ── Step 4b: Install external-dns (Cloudflare provider) ───────────────────────
install_external_dns() {
  log "Step 4b: Installing external-dns (Cloudflare provider)"
  helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/ --force-update
  helm repo update external-dns

  # No --wait: external-dns Pod references the cloudflare-api-token k8s
  # secret which is created later (operator pastes the CF token into AWS
  # Secrets Manager → ExternalSecret syncs it into the cluster). Pod will
  # CrashLoopBackOff until that happens; that's acceptable for bootstrap.
  # `cloudflare.proxied=true` is silently ignored on external-dns chart
  # 1.14.x — it doesn't map to any rendered arg, so records get created
  # un-proxied and `policy=sync` then drifts existing proxied records back
  # to un-proxied. Pass `--cloudflare-proxied=true` via extraArgs instead,
  # AND keep the per-record annotation
  # `external-dns.alpha.kubernetes.io/cloudflare-proxied: "true"` on every
  # AEOS Ingress so the proxy state is durable across chart upgrades.
  helm upgrade --install external-dns external-dns/external-dns \
    --namespace external-dns \
    --create-namespace \
    --version "1.14.5" \
    --set provider=cloudflare \
    --set 'extraArgs={--cloudflare-proxied}' \
    --set policy=sync \
    --set registry=txt \
    --set txtOwnerId="aeos-${ENVIRONMENT}" \
    --set 'sources={service,ingress}' \
    --set-string env[0].name=CF_API_TOKEN \
    --set-string env[0].valueFrom.secretKeyRef.name=cloudflare-api-token \
    --set-string env[0].valueFrom.secretKeyRef.key=api-token

  log "external-dns chart installed (Pod becomes Ready once cloudflare-api-token secret exists)"
}

# ── Step 5: Install ArgoCD and configure repo access ─────────────────────────
install_argocd() {
  log "Step 5: Installing ArgoCD"
  helm repo add argo https://argoproj.github.io/argo-helm --force-update
  helm repo update argo

  helm upgrade --install argocd argo/argo-cd \
    --namespace argocd \
    --create-namespace \
    --version "6.7.3" \
    --set server.service.type=ClusterIP \
    --set configs.params."server\.insecure"=true \
    --wait \
    --timeout 10m

  wait_for_rollout argocd argocd-server

  log "Waiting for ArgoCD initial admin secret..."
  kubectl -n argocd wait secret/argocd-initial-admin-secret \
    --for=jsonpath='{.data.password}' \
    --timeout=120s 2>/dev/null || true

  ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret \
    -o jsonpath="{.data.password}" | base64 -d 2>/dev/null || echo "<not-yet-available>")

  log "ArgoCD installed. Initial admin password: ${ARGOCD_PASSWORD}"
  log "Configure repo access: argocd repo add git@github.com:fuzebox/aeos-platform.git --ssh-private-key-path <key>"

  # ── Step 6: Apply ArgoCD Application manifests ─────────────────────────────
  log "Step 6: Applying ArgoCD Application manifests for platform services"
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ARGOCD_APPS_DIR="${SCRIPT_DIR}/../helm/platform/argocd-apps"

  if [[ -d "${ARGOCD_APPS_DIR}" ]]; then
    kubectl apply -f "${ARGOCD_APPS_DIR}/" -n argocd
    log "ArgoCD Application manifests applied from ${ARGOCD_APPS_DIR}"
  else
    log "WARN: ArgoCD apps directory not found at ${ARGOCD_APPS_DIR} — skipping. Create it and apply manually."
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  log "Bootstrapping AEOS EKS cluster: ${CLUSTER_NAME} in ${AWS_REGION}"
  log "Environment: ${ENVIRONMENT}"

  check_prereqs
  configure_kubectl
  install_cert_manager
  install_external_secrets
  install_ingress_nginx
  install_external_dns
  install_argocd

  log "Bootstrap complete for cluster: ${CLUSTER_NAME}"
  log ""
  log "Next steps:"
  log "  1. Configure ArgoCD repo SSH key:  argocd repo add git@github.com:fuzebox/aeos-platform.git --ssh-private-key-path <key>"
  log "  2. Sync ArgoCD apps:               argocd app sync --all"
  log "  3. Verify platform services:       kubectl get pods -A"
}

main "$@"
