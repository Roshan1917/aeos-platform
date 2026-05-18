# DNS & TLS

All AEOS platform DNS records are subdomains of `aeos.fuzebox.ai`. The
parent zone (`fuzebox.ai`) is hosted in Cloudflare; AEOS records inside
the `aeos.fuzebox.ai` subtree are automated via
[external-dns](https://github.com/kubernetes-sigs/external-dns) using the
Cloudflare provider, scoped via the `domainFilters: [aeos.fuzebox.ai]`
helm value so the operator can never touch unrelated records in the same
zone.

## Subdomain map

All hostnames are exactly one label deep under `aeos.fuzebox.ai` so a single
`*.aeos.fuzebox.ai` Cloudflare Origin CA cert covers every surface in every
environment. Two-level names (e.g. `argocd.staging.aeos.fuzebox.ai`) would
require a separate `*.staging.aeos.fuzebox.ai` cert; we avoid that by
prefixing the env to the surface name (`staging-argocd…`).

| Environment | Surface | Hostname |
|---|---|---|
| non-prod (staging) | Web app + APIs | `staging.aeos.fuzebox.ai` |
| non-prod | ArgoCD UI | `staging-argocd.aeos.fuzebox.ai` |
| non-prod | Grafana | `staging-grafana.aeos.fuzebox.ai` |
| non-prod | LangFuse | `staging-langfuse.aeos.fuzebox.ai` |
| prod | Web app + APIs | `app.aeos.fuzebox.ai` |
| prod | ArgoCD UI | `argocd.aeos.fuzebox.ai` |
| prod | Grafana | `grafana.aeos.fuzebox.ai` |
| prod | LangFuse | `langfuse.aeos.fuzebox.ai` |

The web app is a single SPA host that reverse-proxies
`/api/{substrate,telemetry,recommendations}/*` to in-cluster service
ClusterIPs — there are no per-service public hostnames. Adding a new
public surface means adding one Ingress with an `external-dns.alpha.kubernetes.io/hostname`
annotation; external-dns syncs the CNAME automatically.

## Traffic path

```
client (browser / curl)
  │  HTTPS, Cloudflare edge cert
  ▼
Cloudflare proxy (orange cloud)  ←  WAF, DDoS, rate limits, bot scoring
  │  HTTPS, validates origin against Cloudflare Origin CA  ← "Full (strict)"
  ▼
AWS NLB (in EKS public subnet)
  │  TCP 443
  ▼
ingress-nginx pod (default-ssl-certificate = ingress-nginx/cloudflare-origin-tls)
  │  TLS termination at the origin; sets X-Real-IP from CF-Connecting-IP
  │  (proxy-real-ip-cidr lists every Cloudflare IP range)
  ▼
service Pod (substrate / telemetry / recommendations / web)
```

## Cloudflare configuration (one-time, dashboard)

1. **DNS Records.** No manual records needed — external-dns creates them.
   Confirm the `aeos.fuzebox.ai` subtree is empty before first sync.
2. **SSL/TLS Encryption Mode.** Set to **Full (strict)** for the
   `fuzebox.ai` zone. Browser ↔ CF uses CF's edge cert; CF ↔ origin
   verifies the Origin CA cert below.
3. **Always Use HTTPS.** On.
4. **Automatic HTTPS Rewrites.** On.
5. **Minimum TLS Version.** 1.2 (or 1.3).

## Cloudflare Origin CA cert

Origin CA certs are free, trusted only by Cloudflare's edge, and can be
issued for up to 15 years. One cert is generated per environment with
SANs covering every subdomain in that env.

### Cert SANs (single cert covers both envs)

```
*.aeos.fuzebox.ai
aeos.fuzebox.ai
```

Because every hostname is one label under `aeos.fuzebox.ai` (env-prefix
naming, e.g. `staging-grafana.aeos.fuzebox.ai`), one wildcard cert
covers prod + non-prod. If you ever introduce two-deep hostnames,
add `*.staging.aeos.fuzebox.ai` etc. as additional SANs here.

### Generation procedure

1. CF dashboard → `fuzebox.ai` zone → SSL/TLS → **Origin Server** →
   *Create Certificate*.
2. Hostnames: paste the SAN list for that environment (one per line).
3. Key type: RSA 2048 (broadest compat) or ECC (smaller, faster).
4. Validity: 15 years.
5. Save **both** the certificate PEM and the private key PEM. The
   private key is shown once — copy it before closing the dialog.
6. Push to AWS Secrets Manager:

   ```bash
   aws secretsmanager put-secret-value \
     --secret-id aeos/non-prod/platform/cloudflare-origin-cert \
     --secret-string "$(jq -nc \
         --rawfile crt /tmp/cf-origin.crt \
         --rawfile key /tmp/cf-origin.key \
         '{"tls.crt":$crt,"tls.key":$key}')" \
     --region us-east-1
   shred -u /tmp/cf-origin.crt /tmp/cf-origin.key
   ```

7. The `cloudflare-origin-tls` ExternalSecret in the `ingress-nginx`
   namespace syncs the secret into a `kubernetes.io/tls` k8s secret,
   which ingress-nginx serves as `default-ssl-certificate` for every
   Ingress that does not specify its own `tls:` block.

## Cloudflare API token

external-dns needs a CF API token scoped to the `fuzebox.ai` zone.

1. CF dashboard → My Profile → API Tokens → *Create Token* → Custom token.
2. Permissions: `Zone → DNS → Edit`, `Zone → Zone → Read`.
3. Zone Resources: include specific zone `fuzebox.ai`.
4. Save → copy the token (shown once).
5. Push to Secrets Manager:

   ```bash
   aws secretsmanager put-secret-value \
     --secret-id aeos/non-prod/platform/cloudflare-api-token \
     --secret-string "$(jq -nc --arg t "$CF_TOKEN" '{"api-token":$t}')" \
     --region us-east-1
   ```

The `cloudflare-api-token` ExternalSecret syncs it into the `external-dns`
namespace; the external-dns Deployment reads `CF_API_TOKEN` from that
Kubernetes Secret via `secretKeyRef`.

## external-dns scope guard

Always set per-env:

```yaml
external-dns:
  domainFilters:
    - aeos.fuzebox.ai
  txtOwnerId: aeos-non-prod   # or aeos-prod
```

`domainFilters` keeps external-dns from touching anything outside the
AEOS subtree even though the CF token has zone-edit on all of
`fuzebox.ai`. `txtOwnerId` gates ownership in the TXT registry so a
non-prod cluster cannot prune records owned by prod (and vice versa).

## Adding a new subdomain

1. Add Ingress in your service Helm chart with:
   - `host: <name>.{staging,}aeos.fuzebox.ai`
   - `external-dns.alpha.kubernetes.io/hostname: <same>`
   - No `tls:` block — the cluster default cert covers it.
2. Add the new SAN to the Cloudflare Origin CA cert and rotate the
   `cloudflare-origin-cert` secret in Secrets Manager. ExternalSecret
   reconciles within `refreshInterval` (1h).
3. Wait <60 s for external-dns to write the CNAME to Cloudflare.

## NLB origin bypass — open follow-up

The NLB created by ingress-nginx accepts TCP 443 from any source by
default. Cloudflare's WAF only protects when traffic actually flows
through Cloudflare; a direct hit on the NLB hostname bypasses the WAF.

Mitigation (deferred): install AWS Load Balancer Controller and add the
`service.beta.kubernetes.io/aws-load-balancer-security-groups`
annotation pointing at a security group whose ingress rules are the
[Cloudflare published IP ranges](https://www.cloudflare.com/ips/).
Tracked in the unblock plan as a non-blocking item.
