#!/usr/bin/env bash
# build-push-images.sh — Build all AEOS service images and push to ECR.
#
# Usage:
#   ./infra/scripts/build-push-images.sh
#   ./infra/scripts/build-push-images.sh --tag v0.2.0
#   PROFILE=fuzebox-dev ./infra/scripts/build-push-images.sh --service aeos-web
#
# Requires:
#   - docker (running)
#   - aws CLI v2 with the named profile
#   - The ECR repos to already exist (run terraform apply first; non-prod
#     env's `module "ecr"` provisions them).

set -euo pipefail

PROFILE="${PROFILE:-fuzebox-dev}"
REGION="${REGION:-us-east-1}"
TAG="${TAG:-}"
ONLY_SERVICE="${ONLY_SERVICE:-}"
PLATFORM="${PLATFORM:-linux/amd64}" # match EKS node arch

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --region)  REGION="$2";  shift 2 ;;
    --tag)     TAG="$2";     shift 2 ;;
    --service) ONLY_SERVICE="$2"; shift 2 ;;
    --platform)PLATFORM="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "$TAG" ]]; then
  TAG="$(git rev-parse --short HEAD)"
fi

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "Account:  $ACCOUNT_ID"
echo "Registry: $REGISTRY"
echo "Tag:      $TAG"
echo "Platform: $PLATFORM"
echo ""

# Authenticate Docker to ECR
aws ecr get-login-password --region "$REGION" --profile "$PROFILE" \
  | docker login --username AWS --password-stdin "$REGISTRY"

# name | dockerfile (relative to REPO_ROOT) | build context
SERVICES=(
  "aeos-web|apps/web/Dockerfile|."
  "aeos-service-substrate|services/substrate/Dockerfile|."
  "aeos-service-telemetry|services/telemetry/Dockerfile|services/telemetry"
  "aeos-service-recommendations|services/recommendations/Dockerfile|services/recommendations"
  "aeos-service-test-generator|services/test-generator/Dockerfile|."
)

build_one() {
  local name="$1" dockerfile="$2" context="$3"
  if [[ -n "$ONLY_SERVICE" && "$ONLY_SERVICE" != "$name" ]]; then
    return 0
  fi
  if [[ ! -f "$dockerfile" ]]; then
    echo "SKIP $name — Dockerfile missing: $dockerfile"
    return 0
  fi

  local image="${REGISTRY}/${name}:${TAG}"
  local latest="${REGISTRY}/${name}:latest"

  echo ""
  echo "==> Build $name"
  docker buildx build \
    --platform "$PLATFORM" \
    -f "$dockerfile" \
    -t "$image" \
    -t "$latest" \
    --load \
    "$context"

  echo "==> Push  $image"
  docker push "$image"
  docker push "$latest"
}

for spec in "${SERVICES[@]}"; do
  IFS='|' read -r NAME DOCKERFILE CONTEXT <<< "$spec"
  build_one "$NAME" "$DOCKERFILE" "$CONTEXT"
done

cat <<EOF

Done. Images at:
  $REGISTRY/aeos-web:$TAG
  $REGISTRY/aeos-service-substrate:$TAG
  $REGISTRY/aeos-service-telemetry:$TAG
  $REGISTRY/aeos-service-recommendations:$TAG
  $REGISTRY/aeos-service-test-generator:$TAG

Update service helm values-non-prod.yaml image.tag to "$TAG" and ArgoCD will sync.
EOF
