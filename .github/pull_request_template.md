## What

<!-- One sentence: what does this PR do? -->

## Why

<!-- Why is this change needed? Link to issue/ticket if applicable. -->

## Patent-adjacent changes

<!-- Does this PR modify LedgerRow, Boundary, UoP, or Attestation types? -->
- [ ] No patent-adjacent types changed
- [ ] Yes — danny.goldstein@fuzebox.ai has reviewed and approved

## Breaking changes

<!-- Does this PR introduce a breaking change to a shared package (@aeos/*)? -->
- [ ] No breaking changes
- [ ] Yes — changeset added with major version bump, #aeos-platform notified

## Checklist

- [ ] tenant_id on all new DB rows, cache keys, Kafka events
- [ ] Auth on all new endpoints (except /healthz, /readyz)
- [ ] LedgerRow writes use INSERT only (no UPDATE/DELETE)
- [ ] Tests pass (pnpm test)
- [ ] CLAUDE.md updated if service boundaries changed
