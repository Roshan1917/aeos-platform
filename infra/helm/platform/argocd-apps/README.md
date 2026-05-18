# ArgoCD Application Manifests

Applied by `infra/scripts/bootstrap-cluster.sh` (Step 6) after ArgoCD is
installed. Each manifest declares a single `argoproj.io/v1alpha1.Application`
that points ArgoCD at a Helm chart inside this monorepo.

## Apps

| File | Source path | Destination namespace |
|---|---|---|
| `substrate.yaml` | `services/substrate/helm` | `substrate` |
| `telemetry.yaml` | `services/telemetry/helm` | `differentiated` |
| `recommendations.yaml` | `services/recommendations/helm` | `differentiated` |
| `web.yaml` | `apps/web/helm` | `platform` |
| `observability.yaml` | `infra/helm/observability` | `observability` |

## Per-environment overrides

Each manifest references `values.yaml` + `values-non-prod.yaml`. The
non-prod files set replica count to 1, image tag to `main`, in-cluster
service DNS, and AWS Secrets Manager paths under
`aeos/non-prod/<service>`. For prod, add a sibling `values-prod.yaml`
in each chart and a separate ArgoCD project / app set per environment.

## Follow-ups (out of scope for the unblock plan)

- `services/test-generator/helm/` is missing a chart entirely; once it
  exists, add a matching `test-generator.yaml` Application here.
- Add per-environment values files (`values-non-prod.yaml`,
  `values-prod.yaml`) under each service `helm/` and reference them here.
- Replace placeholder image repositories
  (`REPLACE_WITH_ECR_REPO/...`) with the real ECR registry path before
  first sync, otherwise pods will `ImagePullBackOff`.
