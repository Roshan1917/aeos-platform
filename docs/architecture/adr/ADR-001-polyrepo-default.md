# ADR-001: Polyrepo as Default Service Deployment Target

**Status:** Accepted  
**Date:** 2026-04-27  
**Author:** Danny Goldstein

## Context

AEOS consists of six differentiated services, one substrate, and three cross-cutting platform capabilities. Services will be owned by different teams (internal + contractors: Trigent, Arkos). We need to decide whether to use a monorepo or polyrepo approach.

## Decision

**Polyrepo is the default end state.** Each service that has reached a stable API contract and has dedicated ownership lives in its own repo.

Services start life in `aeos-platform/services/` (the umbrella repo) and graduate to their own repos when they meet the graduation criteria.

Shared packages (canonical schema, auth client, event bus, etc.) remain in the umbrella repo and are published to a private npm/PyPI registry.

## Rationale

1. **Independent release cadence** — Telemetry and Intelligence have very different deployment frequency than Governance or Assessment.
2. **Contractor isolation** — Trigent and Arkos deliver services; they should not have write access to the entire platform repo.
3. **CI/CD clarity** — Per-repo CI means a test failure in Telemetry doesn't block a Governance deployment.
4. **Ownership legibility** — CODEOWNERS per repo is cleaner than per-directory.

## Graduation Criteria (In-repo → Separate repo)

A service graduates when:
1. API contract is stable (no planned breaking changes in the next sprint)
2. A dedicated team or contractor group takes sole ownership
3. The service has a distinct release cadence from other in-repo services
4. Integration tests against the shared packages are passing

## Consequences

- Breaking changes to shared packages require a coordination step (version bump + changelog + Slack notice)
- New developers building separate-repo services must configure npm/PyPI registry access
- The `templates/new-service-repo-ts/` and `templates/new-service-repo-py/` templates must be kept current
