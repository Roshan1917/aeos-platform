#!/usr/bin/env bash
# bootstrap-aws-prereqs.sh — One-shot AWS-side prereqs for ci-infra non-prod.
#
# Creates (idempotent — safe to re-run):
#   - GitHub OIDC identity provider
#   - S3 bucket aeos-terraform-state-non-prod (versioned, encrypted, public-blocked)
#   - DynamoDB lock table aeos-terraform-locks-non-prod
#   - IAM role aeos-github-actions-terraform with OIDC trust to repo + AdministratorAccess
#
# Plus prints the GH secret value to set + the env names to create.
#
# Usage:
#   ./infra/scripts/bootstrap-aws-prereqs.sh \
#     --profile fuzebox-dev \
#     --region us-east-1 \
#     --repo fuzebox-ai/aeos-platform \
#     [--scope main-only|repo-wide]      # default: repo-wide (main apply + PR plan)
#     [--policy admin|scoped]            # default: admin (simpler for non-prod sandbox)

set -euo pipefail

PROFILE="${PROFILE:-fuzebox-dev}"
REGION="${REGION:-us-east-1}"
REPO="${REPO:-fuzebox-ai/aeos-platform}"
SCOPE="repo-wide"
POLICY="admin"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --region)  REGION="$2";  shift 2 ;;
    --repo)    REPO="$2";    shift 2 ;;
    --scope)   SCOPE="$2";   shift 2 ;;
    --policy)  POLICY="$2";  shift 2 ;;
    *)         echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

log() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
ok()  { printf '  ✔ %s\n' "$*"; }
note(){ printf '  ℹ %s\n' "$*"; }

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)
log "Bootstrapping AWS prereqs in account $ACCOUNT_ID region $REGION for repo $REPO"

OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
ROLE_NAME="aeos-github-actions-terraform"
STATE_BUCKET="aeos-terraform-state-non-prod"
LOCK_TABLE="aeos-terraform-locks-non-prod"

# ── 1. GitHub OIDC identity provider ─────────────────────────────────────────
log "1. GitHub OIDC identity provider"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" \
     --profile "$PROFILE" >/dev/null 2>&1; then
  ok "OIDC provider already exists: $OIDC_ARN"
else
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
    --profile "$PROFILE" >/dev/null
  ok "Created OIDC provider $OIDC_ARN"
fi

# ── 2. Terraform state S3 bucket ─────────────────────────────────────────────
log "2. Terraform state bucket s3://$STATE_BUCKET"
if aws s3api head-bucket --bucket "$STATE_BUCKET" --profile "$PROFILE" 2>/dev/null; then
  ok "Bucket exists"
else
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION" \
      --profile "$PROFILE" >/dev/null
  else
    aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION" \
      --profile "$PROFILE" >/dev/null
  fi
  ok "Created bucket"
fi

aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled --profile "$PROFILE"
ok "Versioning enabled"

aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' \
  --profile "$PROFILE"
ok "AES256 encryption enabled"

aws s3api put-public-access-block --bucket "$STATE_BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
  --profile "$PROFILE"
ok "Public access blocked"

# ── 3. DynamoDB lock table ──────────────────────────────────────────────────
log "3. DynamoDB lock table $LOCK_TABLE"
if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" \
     --profile "$PROFILE" >/dev/null 2>&1; then
  ok "Table exists"
else
  aws dynamodb create-table \
    --table-name "$LOCK_TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" --profile "$PROFILE" >/dev/null
  ok "Created table"
fi

# ── 4. IAM role aeos-github-actions-terraform ───────────────────────────────
log "4. IAM role $ROLE_NAME (scope=$SCOPE policy=$POLICY)"

case "$SCOPE" in
  main-only)
    TRUST_DOC=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$OIDC_ARN" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:${REPO}:ref:refs/heads/main"
      }
    }
  }]
}
EOF
    )
    ;;
  repo-wide)
    TRUST_DOC=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ApplyOnMain",
      "Effect": "Allow",
      "Principal": { "Federated": "$OIDC_ARN" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:${REPO}:ref:refs/heads/main"
        }
      }
    },
    {
      "Sid": "PlanOnPullRequests",
      "Effect": "Allow",
      "Principal": { "Federated": "$OIDC_ARN" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:${REPO}:pull_request" }
      }
    },
    {
      "Sid": "EnvironmentTargeted",
      "Effect": "Allow",
      "Principal": { "Federated": "$OIDC_ARN" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:${REPO}:environment:*" }
      }
    }
  ]
}
EOF
    )
    ;;
  *) echo "unknown --scope: $SCOPE (use main-only|repo-wide)" >&2; exit 1 ;;
esac

TRUST_FILE=$(mktemp)
echo "$TRUST_DOC" > "$TRUST_FILE"

if aws iam get-role --role-name "$ROLE_NAME" --profile "$PROFILE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" \
    --policy-document "file://$TRUST_FILE" --profile "$PROFILE"
  ok "Updated trust policy"
else
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://$TRUST_FILE" \
    --description "GitHub Actions OIDC for terraform on aeos-platform non-prod" \
    --max-session-duration 3600 \
    --profile "$PROFILE" >/dev/null
  ok "Created role"
fi
rm -f "$TRUST_FILE"

# ── 5. Permissions policy ───────────────────────────────────────────────────
log "5. Permissions policy ($POLICY)"

if [[ "$POLICY" == "admin" ]]; then
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/AdministratorAccess \
    --profile "$PROFILE"
  ok "Attached AdministratorAccess"

elif [[ "$POLICY" == "scoped" ]]; then
  POLICY_FILE=$(mktemp)
  cat > "$POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TerraformStateBucket",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket","s3:GetBucketVersioning",
        "s3:GetObject","s3:PutObject","s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::${STATE_BUCKET}",
        "arn:aws:s3:::${STATE_BUCKET}/*"
      ]
    },
    {
      "Sid": "TerraformLockTable",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem","dynamodb:PutItem","dynamodb:DeleteItem","dynamodb:DescribeTable"
      ],
      "Resource": "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${LOCK_TABLE}"
    },
    { "Sid":"EKS","Effect":"Allow","Action":["eks:*"],"Resource":"*" },
    { "Sid":"VPCAndEC2","Effect":"Allow","Action":["ec2:*"],"Resource":"*" },
    { "Sid":"RDS","Effect":"Allow","Action":["rds:*"],"Resource":"*" },
    { "Sid":"MSK","Effect":"Allow","Action":["kafka:*","kafka-cluster:*"],"Resource":"*" },
    { "Sid":"ElastiCache","Effect":"Allow","Action":["elasticache:*"],"Resource":"*" },
    {
      "Sid":"S3Buckets","Effect":"Allow","Action":["s3:*"],
      "Resource":["arn:aws:s3:::aeos-*","arn:aws:s3:::aeos-*/*"]
    },
    {
      "Sid":"KMS","Effect":"Allow",
      "Action":[
        "kms:CreateKey","kms:CreateAlias","kms:DeleteAlias","kms:DescribeKey",
        "kms:EnableKey","kms:DisableKey","kms:EnableKeyRotation","kms:DisableKeyRotation",
        "kms:GetKeyPolicy","kms:GetKeyRotationStatus","kms:ListAliases","kms:ListKeys",
        "kms:ListResourceTags","kms:PutKeyPolicy","kms:ScheduleKeyDeletion",
        "kms:CancelKeyDeletion","kms:TagResource","kms:UntagResource","kms:UpdateAlias"
      ],
      "Resource":"*"
    },
    {
      "Sid":"SecretsManager","Effect":"Allow",
      "Action":[
        "secretsmanager:CreateSecret","secretsmanager:DeleteSecret",
        "secretsmanager:DescribeSecret","secretsmanager:GetResourcePolicy",
        "secretsmanager:GetSecretValue","secretsmanager:ListSecrets",
        "secretsmanager:ListSecretVersionIds","secretsmanager:PutResourcePolicy",
        "secretsmanager:PutSecretValue","secretsmanager:RestoreSecret",
        "secretsmanager:TagResource","secretsmanager:UntagResource",
        "secretsmanager:UpdateSecret","secretsmanager:UpdateSecretVersionStage"
      ],
      "Resource":"arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:aeos/*"
    },
    {
      "Sid":"IAM","Effect":"Allow",
      "Action":[
        "iam:CreateRole","iam:DeleteRole","iam:GetRole","iam:UpdateRole",
        "iam:UpdateAssumeRolePolicy","iam:AttachRolePolicy","iam:DetachRolePolicy",
        "iam:PutRolePolicy","iam:DeleteRolePolicy","iam:GetRolePolicy",
        "iam:ListRolePolicies","iam:ListAttachedRolePolicies",
        "iam:CreatePolicy","iam:DeletePolicy","iam:GetPolicy","iam:GetPolicyVersion",
        "iam:CreatePolicyVersion","iam:DeletePolicyVersion","iam:ListPolicyVersions",
        "iam:CreateOpenIDConnectProvider","iam:DeleteOpenIDConnectProvider",
        "iam:GetOpenIDConnectProvider","iam:UpdateOpenIDConnectProviderThumbprint",
        "iam:TagRole","iam:UntagRole","iam:TagPolicy","iam:UntagPolicy",
        "iam:CreateServiceLinkedRole","iam:PassRole"
      ],
      "Resource":"*"
    },
    {
      "Sid":"LoggingAndELB","Effect":"Allow",
      "Action":["logs:*","elasticloadbalancing:*","autoscaling:*","application-autoscaling:*"],
      "Resource":"*"
    }
  ]
}
EOF
  aws iam put-role-policy --role-name "$ROLE_NAME" \
    --policy-name aeos-terraform-permissions \
    --policy-document "file://$POLICY_FILE" --profile "$PROFILE"
  rm -f "$POLICY_FILE"
  ok "Attached scoped inline policy"
else
  echo "unknown --policy: $POLICY (use admin|scoped)" >&2; exit 1
fi

# ── Done ─────────────────────────────────────────────────────────────────────
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
log "DONE — AWS prereqs ready"
ok "Account:    $ACCOUNT_ID"
ok "Region:     $REGION"
ok "OIDC:       $OIDC_ARN"
ok "Role ARN:   $ROLE_ARN"
ok "State:      s3://$STATE_BUCKET"
ok "Lock:       dynamodb:$LOCK_TABLE"

cat <<EOF

Next — set GH secret + create environments:

  1. gh secret set AWS_ACCOUNT_ID_NON_PROD --body "$ACCOUNT_ID" --repo $REPO

  2. https://github.com/$REPO/settings/environments
     - Create environment: non-prod-plan
     - Create environment: non-prod
       (recommended: required reviewer + restrict deployment branches to main)

After both done, push any infra change OR rerun the latest ci-infra run:
  gh run rerun \$(gh run list --workflow=ci-infra.yml --limit 1 --repo $REPO --json databaseId --jq '.[0].databaseId') --repo $REPO

EOF
