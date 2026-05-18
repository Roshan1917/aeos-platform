# Infrastructure

All AWS resources are managed via Terraform in `terraform/` and Helm in `helm/`.

## Terraform Layout

```
terraform/
├── environments/
│   ├── non-prod/   ← dev + staging (live)
│   └── prod/       ← production (wired, not yet applied)
└── modules/        ← reusable building blocks
    ├── eks-cluster/         ← cluster + managed node group + OIDC + external-secrets IRSA
    ├── rds-postgres/
    ├── msk-kafka/
    ├── elasticache-redis/
    ├── s3-buckets/
    ├── kms-keys/
    ├── networking/          ← VPC + subnets + NAT (single_nat_gateway flag for non-prod cost)
    ├── secrets-manager/     ← single-secret wrapper, used per-secret-slot
    └── ecr-repos/           ← container registries (per-env, KMS-encrypted, scan-on-push)
```

## Helm Layout

```
helm/
├── platform/            ← cross-cutting umbrella chart
│   ├── values.yaml + values-{non-prod,prod}.yaml
│   ├── argocd-apps/     ← ArgoCD Application manifests for the 6 charts (substrate, telemetry, recommendations, web, observability, langfuse)
│   └── templates/       ← cloudflare-secrets (ExternalSecret), argocd-ingress, clusterissuer, clustersecretstore, namespace
├── observability/       ← Grafana + kube-prometheus-stack + OTel Collector + public LangFuse Ingress
└── langfuse/            ← Langfuse v3 (web + worker + ClickHouse + Postgres + Redis + MinIO) — wraps upstream langfuse-k8s
```

Bootstrap (`platform`) chart pulls in dependency charts: `ingress-nginx`, `cert-manager`, `external-secrets`, `external-dns`. Cluster-side install is currently driven by `infra/scripts/bootstrap-cluster.sh` (see below) rather than `helm install` of the umbrella chart, because bootstrap pre-dates the chart and there are existing Helm releases for each component that the umbrella would conflict with on first apply. Migration to the umbrella chart is a follow-up.

Per-service Helm charts live under `services/*/helm/` and `apps/web/helm/`. ArgoCD manages those via `argocd-apps/*.yaml`.

## Making infrastructure changes

1. Edit a module or environment
2. Open a PR — CI (`.github/workflows/ci-infra.yml`) runs `terraform fmt -check -recursive` + `terraform validate` (non-prod + prod)
3. Merge to `main` — CI runs `terraform apply` (non-prod automatically) and then runs `infra/scripts/bootstrap-cluster.sh` to install / reconcile platform Helm releases on the cluster

Never run `terraform apply` locally against non-prod or prod. Use CI.

## Making image changes

`.github/workflows/build-images.yml` builds + pushes service images to non-prod ECR on every push to `main` that touches `services/`, `apps/`, `packages/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or `tsconfig.base.json`. Images are tagged with the short SHA and `latest`. After build, the workflow patches each ArgoCD application to refresh and bounces deployments to pull `:latest`.

The Python services (`services/telemetry`, `services/recommendations`) are excluded from the matrix until the private PyPI is set up — they install internal `aeos-*` Python packages from a registry that doesn't exist yet.

## Two AWS Accounts

| Account | Alias | Purpose |
|---|---|---|
| `$AWS_ACCOUNT_ID_NON_PROD` | aeos-non-prod | dev + staging |
| `$AWS_ACCOUNT_ID_PROD` | aeos-prod | production |

CI assumes `arn:aws:iam::<account>:role/aeos-github-actions-terraform` via OIDC. The trust policy must allow the `repo:fuzebox-ai/aeos-platform:ref:refs/heads/main` and `repo:fuzebox-ai/aeos-platform:environment:*` subject claims (the latter is required because GH Actions sets the sub to `environment:<name>` for jobs that target a deployment environment).

## Helm

`helm/platform/` — cross-cutting: ingress-nginx, cert-manager, external-secrets-operator, ArgoCD, external-dns
`helm/observability/` — Grafana, Prometheus, OTel Collector, LangFuse

Service-specific Helm charts live in each service's `helm/` directory.

## Key conventions

- All resources tagged with `aeos:environment`, `aeos:managed-by=terraform`, `aeos:project=aeos-platform`
- KMS keys are created per-environment (`platform_key_arn`) plus per-tenant (when tenants are onboarded)
- Secrets Manager paths: `aeos/{env}/{service}/...` for service secrets, `aeos/{env}/{tenant_id}/...` for tenant secrets, `aeos/{env}/platform/...` for shared platform secrets (Cloudflare API token, Origin CA cert, Grafana admin)
- EKS uses IRSA — no static AWS credentials in pods
- ECR repos: `aeos-web`, `aeos-service-substrate`, `aeos-service-telemetry`, `aeos-service-recommendations`, `aeos-service-test-generator`
- Non-prod uses a **single shared NAT Gateway** (`single_nat_gateway = true`) to save EIPs and ~$30/month; prod uses one NAT per AZ
- EKS authentication mode is `API_AND_CONFIG_MAP` so operators can be granted access via `aws eks create-access-entry` without aws-auth ConfigMap edits

## DNS + TLS

All AEOS hostnames are subdomains of `aeos.fuzebox.ai`, managed by **external-dns** (Cloudflare provider). Cloudflare proxies (orange cloud) all AEOS records and terminates TLS at the edge using its standard cert; CF→origin uses a Cloudflare Origin CA cert installed cluster-wide as the ingress-nginx `default-ssl-certificate`. SSL mode is **Full (strict)**.

The Origin CA cert is generated once via the Cloudflare dashboard and stored in Secrets Manager at `aeos/{env}/platform/cloudflare-origin-cert`; the `cloudflare-origin-tls` ExternalSecret syncs it into a `kubernetes.io/tls` secret. Same flow for `aeos/{env}/platform/cloudflare-api-token` → `cloudflare-api-token` secret in the `external-dns` namespace.

Full traffic-path diagram + cert procedure in [docs/architecture/dns-and-tls.md](../docs/architecture/dns-and-tls.md).

## Operator scripts

`infra/scripts/`:
- `bootstrap-aws-prereqs.sh` — one-shot: GH OIDC provider, terraform state bucket + DynamoDB lock table, IAM role with trust policy. Run once per AWS account before the first CI apply.
- `bootstrap-cluster.sh <env> <region>` — runs after `terraform apply`. Configures kubectl, then `helm upgrade --install` for cert-manager, external-secrets, ingress-nginx, external-dns, ArgoCD; then `kubectl apply -f infra/helm/platform/argocd-apps/`.
- `build-push-images.sh` — local fallback to the GH Actions image build (rarely needed).
- `create-tenant.sh` — convenience wrapper around the substrate seed scripts.

## Post-apply manual steps (one-time per environment)

After `terraform apply` + `bootstrap-cluster.sh` succeed, the operator must do these manually:

1. **Cloudflare API token** — generate scoped to `fuzebox.ai` zone (DNS:Edit + Zone:Read), push to Secrets Manager:
   ```
   aws secretsmanager put-secret-value \
     --secret-id aeos/non-prod/platform/cloudflare-api-token \
     --secret-string '{"api-token":"<token>"}'
   ```
2. **Cloudflare Origin CA cert** — generate via dashboard with SAN `*.aeos.fuzebox.ai` + `aeos.fuzebox.ai`, push as `{"tls.crt":"<pem>","tls.key":"<pem>"}` to `aeos/{env}/platform/cloudflare-origin-cert`.
3. **Cloudflare SSL mode** — set to **Full (strict)** for the `fuzebox.ai` zone in the Cloudflare dashboard.
4. **EKS operator access** — grant the operator's IAM principal cluster-admin via access entries:
   ```
   aws eks create-access-entry --cluster-name aeos-non-prod --principal-arn <operator-iam-role>
   aws eks associate-access-policy --cluster-name aeos-non-prod \
     --principal-arn <operator-iam-role> \
     --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
     --access-scope type=cluster
   ```
5. **AWS EBS CSI driver** — install as a managed EKS addon with IRSA. Without this, no PVC dynamic provisioning. Required by Grafana + Prometheus PVCs.
6. **OpenFGA in-cluster** — substrate's RBAC backend. `helm upgrade --install openfga openfga/openfga --namespace openfga --create-namespace --set datastore.engine=memory`. Then create a store + write the AEOS authorization model + put `OPENFGA_API_URL/STORE_ID/MODEL_ID` into the substrate AWS secret.
7. **Substrate AWS secret** — at `aeos/{env}/substrate`, JSON shape `{ DATABASE_URL, AUTH_JWT_SECRET, OPENFGA_API_URL, OPENFGA_STORE_ID, OPENFGA_MODEL_ID, SIGNING_PRIVATE_KEY_B64 }`. The `substrate-secrets` ExternalSecret in the `substrate` namespace syncs it.
8. **Substrate `/v1/rbac/write`** — write the bootstrap admin's `owner` tuple on the dev tenant via a platform-admin token (the seed scripts do this end-to-end; manual call also works).
9. **Substrate API ingress** — `Ingress` in the `substrate` namespace owning `/api/substrate/*` on `staging.aeos.fuzebox.ai`, with `rewrite-target: /$2`. Currently created via `kubectl apply` from a snippet in [docs/runbooks/staging-deploy.md](../docs/runbooks/staging-deploy.md); migrating into the substrate Helm chart is a follow-up.
10. **LangFuse signing material + bundled-dep credentials** — generate the random values and push to Secrets Manager at `aeos/{env}/platform/langfuse`:
    ```
    aws secretsmanager create-secret \
      --name aeos/non-prod/platform/langfuse \
      --secret-string "$(jq -n \
        --arg ns "$(openssl rand -base64 32)" \
        --arg salt "$(openssl rand -base64 32)" \
        --arg ek "$(openssl rand -hex 32)" \
        --arg pg "$(openssl rand -hex 24)" \
        --arg rd "$(openssl rand -hex 24)" \
        --arg ch "$(openssl rand -hex 24)" \
        --arg mu "minio" \
        --arg mp "$(openssl rand -hex 24)" \
        '{"nextauth-secret":$ns,"salt":$salt,"encryption-key":$ek,"postgresql-password":$pg,"redis-password":$rd,"clickhouse-password":$ch,"minio-root-user":$mu,"minio-root-password":$mp,"telemetry-public-key":"","telemetry-secret-key":""}')"
    ```
    `encryption-key` MUST be exactly 32 bytes hex (64 chars) — LangFuse rejects anything else at boot. The four dep passwords use `openssl rand -hex 24` (URL-safe alphanumeric); `-base64` output contains `+`, `/`, `=` which break the `postgresql://user:<pwd>@host:5432/db` connection URL the LangFuse chart builds (Prisma rejects with `P1013: invalid port number in database URL`). The bundled Postgres / Valkey / ClickHouse / MinIO subcharts read their respective passwords from this same secret via `existingSecret` refs, so all four come up clean on first sync. The two `telemetry-*` keys start empty and are filled in after first login: open `https://staging-langfuse.aeos.fuzebox.ai`, create the bootstrap project, mint API keys (Project → API Keys), then `aws secretsmanager put-secret-value` with the keys merged in. The `langfuse-otel-credentials` ExternalSecret picks them up and the OTel Collector exporter starts shipping spans.

Step-by-step in [docs/runbooks/staging-deploy.md](../docs/runbooks/staging-deploy.md).

### LangFuse: prod variant follow-up

The `aeos-langfuse` chart ships in-cluster Postgres + Redis + MinIO for staging. Before flipping prod live, swap to managed deps so a node loss doesn't take observability down:

- **Postgres** → new RDS instance via `infra/terraform/modules/rds-postgres/`; creds at `aeos/prod/platform/langfuse-db`; flip `postgresql.deploy: false` and wire `langfuse.langfuse.{databaseUrl|postgresql.host}` to the RDS endpoint.
- **Redis** → ElastiCache via `infra/terraform/modules/elasticache-redis/`; flip `redis.deploy: false`.
- **Object storage** → S3 bucket via `infra/terraform/modules/s3-buckets/` (`aeos-prod-langfuse-events`); IRSA role on the langfuse-worker pod with `s3:GetObject/PutObject` scoped to the bucket; flip `s3.deploy: false`.
- **ClickHouse** → no AWS managed equivalent — stays in-cluster. Schedule a `clickhouse-backup` CronJob to S3 for DR.
