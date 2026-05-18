# Adding a New Service (In-Repo Folder)

Use this path when:
- The service is in early development
- It's evolving alongside shared packages
- A contractor team is delivering it and has access to this repo
- You want local workspace package resolution (no publishing step)

## Step-by-Step

### 1. Choose a template

```bash
# TypeScript (Assessment, Recommendations, Governance, substrate)
cp -r services/_template-ts services/my-service

# Python (Telemetry, Intelligence, data-heavy services)
cp -r services/_template-py services/my-service
```

### 2. Rename placeholders

Find all `REPLACE_ME` occurrences and replace with your service name:

```bash
cd services/my-service
grep -r "REPLACE_ME" . --include="*.json" --include="*.yaml" --include="*.ts" --include="*.py" --include="*.md"
```

Replace in:
- `package.json` or `pyproject.toml` — name field
- `Dockerfile` — directory path
- `helm/Chart.yaml` — chart name
- `helm/values.yaml` — service labels
- `.env.example` — `SERVICE_NAME` and `DATABASE_URL`
- `CLAUDE.md` — fill in all `[placeholder]` sections

### 3. Add to local dev database

In `local-dev/init-db.sql`, add:
```sql
CREATE DATABASE aeos_my_service;
GRANT ALL PRIVILEGES ON DATABASE aeos_my_service TO aeos;
```

### 4. Restart local Postgres

```bash
cd local-dev && docker-compose restart postgres
```

### 5. Fill in CLAUDE.md

The `CLAUDE.md` in your service directory is the primary onboarding document. Fill in:
- What the service does (2 sentences)
- Service boundaries (owns / reads / emits / consumes / does NOT own)
- API surface
- Which shared components you consume and how

### 6. Start building

```bash
cd services/my-service
cp .env.example .env
pnpm dev     # TypeScript
# or
uvicorn src.main:app --reload     # Python
```

Shared packages (`@aeos/*`) resolve automatically via the pnpm workspace — no publishing needed.

### 7. When to graduate to a separate repo

See [ADR-001](../architecture/adr/ADR-001-polyrepo-default.md) for graduation criteria.

When ready: follow [new-service-separate-repo.md](new-service-separate-repo.md).
