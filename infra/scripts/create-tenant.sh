#!/usr/bin/env bash
# create-tenant.sh — Create a new tenant via the AEOS substrate API.
#
# Usage:
#   ./create-tenant.sh --name "Acme Corp" --slug "acme" --admin-email "admin@acme.com" --env non-prod
#
# Options:
#   --name          Tenant display name (required)
#   --slug          URL-safe tenant slug, e.g. "acme-corp" (required)
#   --admin-email   Email for the initial tenant admin user (required)
#   --env           Deployment environment: non-prod | prod (required)
#   --seed-rbac     If set, seed OpenFGA with initial RBAC tuples (optional)
#   --substrate-url Override the substrate API URL (optional)
#   --jwt           Platform admin JWT (optional; falls back to Secrets Manager)
#
# Prerequisites:
#   - aws CLI v2 (configured for the target environment)
#   - curl
#   - jq

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
TENANT_NAME=""
TENANT_SLUG=""
ADMIN_EMAIL=""
ENVIRONMENT=""
SEED_RBAC=false
SUBSTRATE_URL_OVERRIDE=""
JWT_OVERRIDE=""

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
die()  { echo "[ERROR] $*" >&2; exit 1; }
info() { echo "[INFO]  $*"; }

usage() {
  grep '^#' "$0" | grep -v '#!/' | sed 's/^# \{0,1\}//'
  exit 0
}

check_prereqs() {
  for cmd in aws curl jq; do
    command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"
  done
}

# ── Arg parsing ───────────────────────────────────────────────────────────────
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --name)          TENANT_NAME="$2";          shift 2 ;;
      --slug)          TENANT_SLUG="$2";           shift 2 ;;
      --admin-email)   ADMIN_EMAIL="$2";           shift 2 ;;
      --env)           ENVIRONMENT="$2";           shift 2 ;;
      --seed-rbac)     SEED_RBAC=true;             shift   ;;
      --substrate-url) SUBSTRATE_URL_OVERRIDE="$2"; shift 2 ;;
      --jwt)           JWT_OVERRIDE="$2";          shift 2 ;;
      --help|-h)       usage ;;
      *) die "Unknown argument: $1. Run with --help for usage." ;;
    esac
  done

  [[ -n "$TENANT_NAME"  ]] || die "--name is required"
  [[ -n "$TENANT_SLUG"  ]] || die "--slug is required"
  [[ -n "$ADMIN_EMAIL"  ]] || die "--admin-email is required"
  [[ -n "$ENVIRONMENT"  ]] || die "--env is required (non-prod | prod)"

  # Validate environment
  case "$ENVIRONMENT" in
    non-prod|prod) ;;
    *) die "--env must be 'non-prod' or 'prod', got: $ENVIRONMENT" ;;
  esac

  # Validate slug format
  if ! echo "$TENANT_SLUG" | grep -qE '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$'; then
    die "--slug must be lowercase alphanumeric with hyphens, e.g. 'acme-corp'"
  fi
}

# ── Resolve substrate URL ─────────────────────────────────────────────────────
resolve_substrate_url() {
  if [[ -n "$SUBSTRATE_URL_OVERRIDE" ]]; then
    SUBSTRATE_URL="$SUBSTRATE_URL_OVERRIDE"
    return
  fi

  case "$ENVIRONMENT" in
    non-prod)
      SUBSTRATE_URL="https://substrate.non-prod.aeos.fuzebox.ai"
      ;;
    prod)
      SUBSTRATE_URL="https://substrate.aeos.fuzebox.ai"
      ;;
  esac

  log "Substrate URL: ${SUBSTRATE_URL}"
}

# ── Get platform admin JWT ─────────────────────────────────────────────────────
get_jwt() {
  if [[ -n "$JWT_OVERRIDE" ]]; then
    JWT="$JWT_OVERRIDE"
    log "Using provided JWT"
    return
  fi

  if [[ -n "${AEOS_PLATFORM_ADMIN_JWT:-}" ]]; then
    JWT="$AEOS_PLATFORM_ADMIN_JWT"
    log "Using JWT from AEOS_PLATFORM_ADMIN_JWT env var"
    return
  fi

  log "Fetching platform admin JWT from Secrets Manager..."
  SECRET_ID="aeos/${ENVIRONMENT}/substrate/platform-admin-jwt"

  JWT=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_ID" \
    --query 'SecretString' \
    --output text 2>/dev/null | jq -r '.jwt // .' 2>/dev/null) \
    || die "Failed to retrieve JWT from Secrets Manager (secret: ${SECRET_ID}). Pass --jwt or set AEOS_PLATFORM_ADMIN_JWT."

  [[ -n "$JWT" ]] || die "JWT from Secrets Manager was empty (secret: ${SECRET_ID})"
  log "JWT retrieved from Secrets Manager"
}

# ── Create tenant via substrate API ───────────────────────────────────────────
create_tenant() {
  log "Creating tenant: name='${TENANT_NAME}' slug='${TENANT_SLUG}' admin='${ADMIN_EMAIL}'"

  PAYLOAD=$(jq -n \
    --arg name  "$TENANT_NAME" \
    --arg slug  "$TENANT_SLUG" \
    --arg email "$ADMIN_EMAIL" \
    '{
      name:        $name,
      slug:        $slug,
      admin_email: $email,
      plan:        "enterprise"
    }')

  HTTP_RESPONSE=$(curl --silent --show-error --write-out "\n%{http_code}" \
    --max-time 30 \
    -X POST "${SUBSTRATE_URL}/v1/tenants" \
    -H "Authorization: Bearer ${JWT}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

  HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
  HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

  if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
    die "Substrate API returned HTTP ${HTTP_CODE}. Body: ${HTTP_BODY}"
  fi

  TENANT_ID=$(echo "$HTTP_BODY" | jq -r '.tenant_id // .id // empty')
  [[ -n "$TENANT_ID" ]] || die "tenant_id not found in response: ${HTTP_BODY}"

  log "Tenant created successfully"
  info ""
  info "  tenant_id:    ${TENANT_ID}"
  info "  name:         ${TENANT_NAME}"
  info "  slug:         ${TENANT_SLUG}"
  info "  admin_email:  ${ADMIN_EMAIL}"
  info "  environment:  ${ENVIRONMENT}"
  info ""

  echo "$TENANT_ID"
}

# ── Seed OpenFGA RBAC tuples ──────────────────────────────────────────────────
seed_rbac() {
  local tenant_id="$1"
  log "Seeding OpenFGA with initial RBAC tuples for tenant ${tenant_id}"

  RBAC_PAYLOAD=$(jq -n \
    --arg tenant_id  "$tenant_id" \
    --arg admin_email "$ADMIN_EMAIL" \
    '{
      tenant_id: $tenant_id,
      tuples: [
        {
          user:     ("user:" + $admin_email),
          relation: "admin",
          object:   ("tenant:" + $tenant_id)
        },
        {
          user:     ("user:" + $admin_email),
          relation: "member",
          object:   ("tenant:" + $tenant_id)
        }
      ]
    }')

  HTTP_RESPONSE=$(curl --silent --show-error --write-out "\n%{http_code}" \
    --max-time 30 \
    -X POST "${SUBSTRATE_URL}/v1/rbac/tuples" \
    -H "Authorization: Bearer ${JWT}" \
    -H "Content-Type: application/json" \
    -d "$RBAC_PAYLOAD")

  HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
  HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

  if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
    log "WARN: RBAC seeding returned HTTP ${HTTP_CODE}. Body: ${HTTP_BODY}"
    log "WARN: RBAC tuples may need to be seeded manually."
  else
    log "RBAC tuples seeded successfully for tenant ${tenant_id}"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  parse_args "$@"
  check_prereqs
  resolve_substrate_url
  get_jwt

  TENANT_ID=$(create_tenant)

  if [[ "$SEED_RBAC" == "true" ]]; then
    seed_rbac "$TENANT_ID"
  fi

  log "Done. tenant_id: ${TENANT_ID}"
}

main "$@"
