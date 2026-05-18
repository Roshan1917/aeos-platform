# Creating a New Service (Separate Repo)

Use this path when:
- The service has a stable API contract
- A dedicated team or contractor group owns it exclusively
- It has a distinct release cadence
- It should not need access to this entire umbrella repo

## Step-by-Step

### 1. Create the GitHub repo

```bash
gh repo create fuzebox/aeos-my-service --private
```

### 2. Clone the scaffold

```bash
git clone git@github.com:fuzebox/aeos-platform.git /tmp/aeos-platform

# TypeScript
cp -r /tmp/aeos-platform/templates/new-service-repo-ts aeos-my-service
cd aeos-my-service && git init && git remote add origin git@github.com:fuzebox/aeos-my-service.git

# Python
cp -r /tmp/aeos-platform/templates/new-service-repo-py aeos-my-service
```

### 3. Configure npm/PyPI access

**TypeScript:**
```bash
# Add to .npmrc in the repo root
@aeos:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Add `AEOS_NPM_TOKEN` to the repo's GitHub Secrets (get from 1Password: AEOS Dev Secrets → GitHub Packages Token).

**Python:**
```bash
# pip.conf or in pyproject.toml [tool.pip]
extra-index-url = https://__token__:${AEOS_PYPI_TOKEN}@AEOS_PYPI_URL/simple/
```

Add `AEOS_PYPI_TOKEN` to GitHub Secrets.

### 4. Update CLAUDE.md

The `CLAUDE.md` at the repo root is the primary onboarding document. Fill in all `[placeholder]` sections — this is what new team members and AI assistants read first.

### 5. Pin package versions

Update `package.json` or `pyproject.toml` with the latest published versions:

```bash
# Check latest versions
npm view @aeos/canonical-schema version
npm view @aeos/auth-client version

# Install
pnpm add @aeos/canonical-schema@^0.1.0 @aeos/auth-client@^0.1.0 ...
```

### 6. Configure CI/CD

The `.github/workflows/ci.yml` scaffold already calls the umbrella's reusable workflow. Add the required secrets to the repo:
- `AEOS_NPM_TOKEN` (or `AEOS_PYPI_TOKEN`) — package registry access
- `AWS_ACCOUNT_ID` — ECR push
- `AWS_REGION` — ECR push

### 7. Register with the platform team

Post in `#aeos-platform` with:
- Repo URL
- Service name and brief description
- Which canonical event types you produce/consume
- Your team's on-call contact

The platform team will:
- Register your Helm chart location with ArgoCD
- Add your service to the `CODEOWNERS` map
- Create your Kafka topics in non-prod

### 8. Local development

Option A — run the local stack yourself:
```bash
git clone git@github.com:fuzebox/aeos-platform.git /tmp/aeos-platform
cd /tmp/aeos-platform/local-dev
docker-compose up -d
./seed/kafka-topics.sh
```

Option B — use the shared dev cluster (kubeconfig from `#aeos-platform`).

## Package Version Management

When a `@aeos/*` package releases a breaking change (major version bump):
1. A notice is posted in `#aeos-platform` before publishing
2. Your CI will start failing on the old version — update `package.json` or `pyproject.toml`
3. Review the changelog in `packages/{package-name}/CHANGELOG.md` in the umbrella repo

Patch and minor updates are non-breaking — pin to `^major.minor` and accept them automatically.
