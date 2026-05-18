# Staging Deploy Runbook

How non-prod (staging) is deployed today. Single shared EKS cluster `aeos-non-prod` in `us-east-1`. Edge: Cloudflare → NLB → ingress-nginx.

Hostnames (all proxied by Cloudflare, Full-strict TLS via Cloudflare Origin CA cert):

| Host | Ingress |
|---|---|
| `staging.aeos.fuzebox.ai` | web (root) + `/api/substrate/*` + `/api/telemetry/*` + `/api/recommendations/*` + `/api/test-generator/*` |
| `staging-argocd.aeos.fuzebox.ai` | ArgoCD UI |
| `staging-grafana.aeos.fuzebox.ai` | Grafana (observability stack) |
| `staging-langfuse.aeos.fuzebox.ai` | LangFuse v3 UI (web + worker, ClickHouse + Postgres + Redis + MinIO bundled — staging only) |

---

## Prerequisites

| Tool | Version |
|---|---|
| AWS CLI | v2 (configured for non-prod account) |
| kubectl | 1.30+ |
| helm | 3.14+ |
| ArgoCD CLI | 2.10+ (optional) |

```bash
aws eks update-kubeconfig --name aeos-non-prod --region us-east-1
kubectl get nodes
```

Operator IAM principals are granted cluster-admin via EKS access entries (see [infra/CLAUDE.md](../../infra/CLAUDE.md) post-apply step 4) — no aws-auth ConfigMap edits.

---

## Normal Deploy Path

Two pipelines feed staging, both gated on `main`:

1. **`.github/workflows/ci-infra.yml`** — `terraform apply` against non-prod, then runs `infra/scripts/bootstrap-cluster.sh` to install/reconcile platform Helm releases (cert-manager, external-secrets, ingress-nginx, external-dns, ArgoCD) and `kubectl apply -f infra/helm/platform/argocd-apps/`.
2. **`.github/workflows/build-images.yml`** — builds + pushes service images to non-prod ECR on every push to `main` that touches `services/`, `apps/`, `packages/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or `tsconfig.base.json`. Tags: short SHA + `latest`. After build, patches each ArgoCD `Application` with `argocd.argoproj.io/refresh: hard` and runs `kubectl rollout restart deployment --all` in `substrate`, `differentiated`, and `platform` namespaces to pull `:latest`.

ArgoCD watches `infra/helm/platform/argocd-apps/*.yaml` (Substrate, Telemetry, Recommendations, Test-Generator, Web, Observability, LangFuse). Each `Application` points at the in-repo Helm chart. Auto-sync + self-heal are on.

Python services (Telemetry, Recommendations) are **excluded** from the image build matrix until the private PyPI is live — they install internal `aeos-*` packages from a registry that doesn't exist yet.

### Check sync + rollout

```bash
kubectl get applications -n argocd
kubectl get pods -n substrate
kubectl get pods -n differentiated
kubectl rollout status deployment/substrate -n substrate
```

### Force a re-sync without a code push

```bash
kubectl -n argocd patch application aeos-service-substrate --type merge \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'
kubectl -n substrate rollout restart deployment substrate
```

---

## First-time bring-up of an environment

After `terraform apply` + `bootstrap-cluster.sh` succeed, the operator must do the post-apply manual steps documented in [infra/CLAUDE.md](../../infra/CLAUDE.md):

1. Cloudflare API token → `aeos/non-prod/platform/cloudflare-api-token`
2. Cloudflare Origin CA cert → `aeos/non-prod/platform/cloudflare-origin-cert`
3. Cloudflare SSL mode = **Full (strict)** for the `fuzebox.ai` zone
4. EKS access entries for operator IAM principals
5. AWS EBS CSI driver as managed addon (Grafana + Prometheus PVCs depend on it)
6. OpenFGA in-cluster (`helm upgrade --install openfga openfga/openfga -n openfga --create-namespace --set datastore.engine=memory`) + create store + write the AEOS authorization model + put `OPENFGA_API_URL/STORE_ID/MODEL_ID` into the substrate secret
7. Substrate AWS secret `aeos/non-prod/substrate` populated with `{ DATABASE_URL, AUTH_JWT_SECRET, OPENFGA_API_URL, OPENFGA_STORE_ID, OPENFGA_MODEL_ID, SIGNING_PRIVATE_KEY_B64 }`
8. Bootstrap admin tuple: `POST /v1/rbac/write` to make the bootstrap user `owner` of the dev tenant
9. Substrate API ingress in the `substrate` namespace owning `/api/substrate/*` on `staging.aeos.fuzebox.ai` with `nginx.ingress.kubernetes.io/rewrite-target: /$2` AND `external-dns.alpha.kubernetes.io/cloudflare-proxied: "true"` (currently `kubectl apply` from a snippet — migrating into the substrate Helm chart is a follow-up)
10. **LangFuse signing material** at `aeos/non-prod/platform/langfuse` — JSON `{ nextauth-secret, salt, encryption-key, telemetry-public-key, telemetry-secret-key }`. `encryption-key` must be 32-byte hex. Two telemetry keys start empty and are filled in after first LangFuse login (Project → API Keys), then put-secret-value back into AWS so the OTel Collector exporter has credentials. See [infra/CLAUDE.md](../../infra/CLAUDE.md) post-apply step 10 for the one-liner.

---

## Smoke flow after a fresh deploy

```bash
# 1. Edge reachable
curl -sf https://staging.aeos.fuzebox.ai/healthz

# 2. Substrate reachable through the ingress rewrite
curl -sf https://staging.aeos.fuzebox.ai/api/substrate/healthz

# 3. Login (bootstrap dev tenant)
TOKEN=$(curl -s -X POST https://staging.aeos.fuzebox.ai/api/substrate/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@dev-corp.local","password":"DevPassword1234!","tenant_slug":"dev-corp"}' \
  | jq -r .access_token)

# 4. Registries seeded
curl -sf -H "Authorization: Bearer $TOKEN" \
  https://staging.aeos.fuzebox.ai/api/substrate/v1/tenants/<tenant_id>/agents | jq

# 5. Test-case generate (test-generator wired through the same edge)
curl -sf -X POST https://staging.aeos.fuzebox.ai/api/test-generator/v1/test-cases/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"quick lead qual flow with one human approval"}' | jq

# 6. LangFuse health (UI + ingest API)
curl -sf https://staging-langfuse.aeos.fuzebox.ai/api/public/health
```

If `agents` is empty, the registries haven't been seeded against the cluster yet. Run `pnpm tsx local-dev/seed/seed-registries.ts` with `AEOS_SUBSTRATE_URL=https://staging.aeos.fuzebox.ai/api/substrate` and the platform-admin JWT.

---

## Hybrid local mode (FE local, substrate from cluster)

Used to develop the web UI against real cluster substrate without rebuilding images.

```bash
# 1. Tunnel cluster substrate locally (or hit it through the ingress)
export AEOS_SUBSTRATE_URL=https://staging.aeos.fuzebox.ai/api/substrate

# 2. Run test-generator locally — it talks to the local substrate proxy via /api/substrate
cd services/test-generator
pnpm dev   # :3005

# 3. Run web locally, pointing /api/substrate at staging
cd apps/web
AEOS_SUBSTRATE_URL=https://staging.aeos.fuzebox.ai/api/substrate \
AEOS_TEST_GENERATOR_URL=http://localhost:3005 \
pnpm dev   # :5173
```

JWTs issued by cluster substrate are signed with the cluster `AUTH_JWT_SECRET` — they will not validate against a local substrate process and vice versa. Pick one auth source per session.

---

## Migrations (Prisma)

Substrate runs `npx prisma migrate deploy` as an initContainer in its Helm chart on every rollout. No separate migration Job today.

If a migration fails, the substrate pod will fail readiness — `kubectl logs -n substrate <pod> -c prisma-migrate` for the error.

---

## Logs

```bash
# Live tail from a deployment
kubectl logs -n substrate -l app=substrate --follow --tail=100

# Crashed container's previous logs
kubectl logs -n substrate <pod> --previous
```

Centralized log shipping (CloudWatch / Loki) is **not yet wired** in non-prod — `kubectl logs` is the source of truth.

---

## Cloudflare proxy regression — recovery

If Cloudflare records flip from proxied (orange cloud) to DNS-only, AEOS hostnames break (Origin CA cert is only valid for proxied flows; clients hit the NLB directly and TLS-handshake errors). Symptom: `curl https://staging.aeos.fuzebox.ai/healthz` hangs or returns a TLS error.

Two-step fix:

1. **Re-proxy existing records via Cloudflare API** (or dashboard — orange-cloud each `*.aeos.fuzebox.ai` record):
   ```bash
   ZONE_ID="<fuzebox.ai zone id>"
   CF_API_TOKEN="$(aws --profile fuzebox-dev --region us-east-1 \
     secretsmanager get-secret-value \
     --secret-id aeos/non-prod/platform/cloudflare-api-token \
     --query SecretString --output text | jq -r .'"api-token"')"

   for HOST in staging staging-argocd staging-grafana staging-langfuse; do
     RID=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
       "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=${HOST}.aeos.fuzebox.ai" \
       | jq -r '.result[0].id')
     curl -s -X PATCH \
       -H "Authorization: Bearer $CF_API_TOKEN" \
       -H 'Content-Type: application/json' \
       -d '{"proxied":true}' \
       "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RID" \
       | jq -r '.result | {name, proxied}'
   done
   ```

2. **Annotate the live substrate-api Ingress** (no Helm template owns it yet, so chart re-sync won't touch it):
   ```bash
   kubectl -n substrate annotate ingress substrate-api \
     external-dns.alpha.kubernetes.io/cloudflare-proxied=true --overwrite
   ```

All chart-managed Ingresses (web, telemetry, test-generator, grafana, langfuse, argocd) carry the `cloudflare-proxied: "true"` annotation in the templates and refresh on the next ArgoCD sync.

---

## Rollback

ArgoCD is the preferred path:

```bash
argocd app history aeos-service-substrate
argocd app rollback aeos-service-substrate <revision>
```

Failing that, `kubectl rollout undo deployment/substrate -n substrate`. Image-tag rollback isn't useful right now because services run `:latest` in non-prod.

---

## Related

- [infra/CLAUDE.md](../../infra/CLAUDE.md) — Terraform + Helm structure, post-apply steps
- [docs/architecture/dns-and-tls.md](../architecture/dns-and-tls.md) — Cloudflare → NLB → ingress traffic path + cert procedure
- [docs/runbooks/local-dev-setup.md](local-dev-setup.md) — Local dev environment
