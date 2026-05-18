# CLAUDE.md — O*NET Research Spike (scoped context)

> Persistent context for Claude Code sessions working inside `research/onet-spike/`.
> The root `CLAUDE.md` (Fuzebox-wide conventions) still applies — this file adds spike-specific context.

---

## 0. Session Bootstrap

When starting a new session in this folder:
1. Read this file fully
2. Read `README.md` (human-facing status)
3. Confirm understanding back to Roshan; ask which workstream to advance
4. Never modify code outside `research/onet-spike/` during the spike phase

---

## 1. What This Spike Is

**Assignee:** Roshan R&nbsp;&nbsp;|&nbsp;&nbsp;**Sponsor:** Anand Padia ("Andy")&nbsp;&nbsp;|&nbsp;&nbsp;**Started:** May 2026

**Goal:** Determine how O*NET (US Dept. of Labor occupational taxonomy) can be integrated into AEOS's existing services to enrich observability, scoring, and economic measurement of third-party AI agents — using HR Recruitment as the demo vertical.

**Trigger (Andy's message):**
> "We use https://www.onetonline.org/ for evaluating human effort as starting point. Nothing has been done for this. This is demo setup we need next. Take hr recruitment as demo tasks."

**Andy's specific directives:**
1. See how the O*NET database can be used
2. Research the top agents present in the US market and their workflows
3. Find what data in O*NET can fill gaps in existing agentic workflows
4. Explore the data in O*NET hands-on
5. Quantify time saved and business value using O*NET data
6. Use the same tech stack as the main AEOS app so the research is portable

---

## 2. Critical Context — AEOS is an Observability Platform, Not an Agent Builder

AEOS = AI Ecosystem Observation System. It **watches** third-party AI agents (Anthropic, OpenAI, Bedrock, LangGraph, CrewAI, Agentforce, Cowork, etc.), classifies their telemetry, scores their effectiveness, and helps customers govern them.

**v1 is observational only** — never blocks or mutates agent execution.

This is a hard framing constraint:
- We are **NOT** building a recruiting agent
- We **ARE** researching how O*NET data enriches AEOS's existing services when they observe a third-party recruiting agent (e.g., a customer's Paradox or Eightfold deployment)
- The "demo" shows AEOS measuring an observed recruiting agent's effort displacement using O*NET as the baseline taxonomy

---

## 3. The Integration Thesis — How O*NET Plugs Into AEOS Services

Each AEOS service gets enriched differently by O*NET data:

### Process Discovery service
- **O*NET tasks become canonical Units-of-Process (UoPs)** in the semantic registry
- Each O*NET-SOC code (e.g., `13-1071.01` Recruiters) maps to ~25–30 standardized tasks → seeds the UoP catalog
- Enables out-of-the-box process mapping for any customer hiring for standard roles

### Telemetry service
- **Span classification enrichment** — when ingesting OTLP/LangFuse spans from an observed recruiting agent, classify the activity against O*NET tasks
- Adds a `onet_task_id` enrichment field to telemetry records
- Powered by embedding similarity between span content and O*NET task descriptions

### Intelligence service (Economic Ledger + Scoring Engine)
- **O*NET's wage data + task frequency = "what would a human have cost"** baseline
- Each observed agent action → immutable ledger row with O*NET-anchored economic value calculation
- Scoring Engine produces effort-displacement metrics per UoP, per agent, per tenant

### Recommendations service
- **Gap detection** — when an observed agent covers fewer O*NET tasks than expected for its role, flag as automation opportunity
- Template suggestions reference O*NET task IDs for traceability

### Governance service
- **Policy packs anchored to O*NET tasks** — e.g., "any agent performing O*NET task 4.A.4.b.4 must log decision rationale"
- Board attestation reports cite O*NET task coverage as an objective metric

### Assessment service (CAITO)
- **O*NET-anchored readiness scoring** — assesses how prepared a customer's workforce roles are for AI augmentation based on O*NET task automation potential

---

## 4. O*NET Primer

- **Source:** US Department of Labor / Employment and Training Administration
- **Coverage:** ~900 occupations, each with O*NET-SOC code (e.g., `13-1071.01`)
- **Per-occupation data:** Tasks, Skills, Knowledge, Abilities, Work Activities, Tools & Technology, Work Context, Education, Wages, Interests, Work Styles, Work Values — all with importance/level ratings (1–5 scale)
- **Access:** Web Services API (https://services.onetcenter.org/) + full DB download (https://www.onetcenter.org/database.html) in TXT/MySQL/Excel
- **Licensing:** Public domain, attribution required, commercially usable
- **Key limitation:** US-centric. India equivalent = NCO (National Classification of Occupations) from NCS India — overlay needed for non-US tenants

---

## 5. Demo Vertical — HR Recruitment

The walkthrough scenario: an AEOS tenant has deployed a third-party AI recruiting agent (think Paradox, Eightfold, Moonhub). AEOS observes that agent and produces an O*NET-anchored economic report.

**Demo flow:**
1. Tenant onboards their recruiting agent via an AEOS adapter
2. AEOS Telemetry ingests spans of the agent's activities
3. Process Discovery classifies each span against O*NET task IDs (e.g., `13-1071.01` tasks)
4. Intelligence service generates Economic Ledger entries with effort-displacement values
5. Recommendations flags O*NET tasks the agent is NOT covering (upsell opportunity)
6. Governance produces an attestation report anchored to O*NET coverage

**Why this vertical:** dense O*NET coverage, many observable third-party agents in market, clean ROI math.

---

## 6. Research Workstreams

### Workstream A — O*NET Data Audit
- [ ] Register for O*NET Web Services API; document auth + rate limits
- [ ] Download full O*NET database (TXT + MySQL formats)
- [ ] Load into local DuckDB; profile schema (tables, row counts, relationships)
- [ ] Document every field, type, example value
- [ ] Identify which O*NET tables feed which AEOS service
- **Deliverable:** `onet-exploration/schema-audit.md` + profiling notebook

### Workstream B — US Competitor Teardown
Target agents (the ones AEOS would observe):
- Paradox (Olivia), Eightfold AI, HireVue, Mercor, Moonhub, Fetcher, SeekOut, Findem, Phenom

For each:
- [ ] What the agent actually does (workflow)
- [ ] What telemetry/signals it emits that AEOS could observe
- [ ] How a customer would deploy + monitor it
- [ ] Whether they themselves use O*NET (likely no — that's the gap)
- **Deliverable:** `competitor-teardowns/<competitor>.md` + `_summary-matrix.md`

### Workstream C — Gap Analysis (THE strategic doc)
- [ ] Matrix: O*NET data fields × competitor capabilities
- [ ] Identify O*NET fields no competitor exploits
- [ ] Hypothesize unique AEOS capabilities enabled by those gaps
- [ ] Map each gap to which AEOS service would deliver it
- **Deliverable:** `gap-analysis.md` (the headline output)

### Workstream D — ROI / Business Impact Model
- [ ] Build parameterized model
- [ ] Baseline: recruiter hours per hire, time-to-fill, cost per hire
- [ ] Target: with AEOS-measured agent contribution
- [ ] Sensitivity analysis
- **Deliverable:** `artifacts/roi-model.ipynb` + one-page summary

### Workstream E — AEOS Service Integration Notes
For each of the six AEOS services, document:
- Which O*NET data feeds in
- Which existing AEOS schema/contract changes (if any) would be needed
- Proof-of-concept sketch (no code yet, just architecture)
- **Deliverable:** `service-integration-notes/<service>.md` per service

---

## 7. Tech Stack — Must Match AEOS

Confirmed AEOS stack (matched from repo audit):

| Layer | Use this |
|---|---|
| Primary language | TypeScript / Node 20+ |
| Secondary language | Python (for telemetry + recommendations) |
| Monorepo | pnpm 9 workspaces + Changesets |
| Type system | TypeScript 5.4 |
| Test | Vitest |
| Lint/Format | ESLint + Prettier |
| Frontend | React 18 / Vite (SPA) |
| ORM | Prisma |
| Event Bus | Kafka (MSK), via `@aeos/event-bus-client` |
| RDBMS | PostgreSQL |
| Cache | Redis |
| AuthZ | OpenFGA |
| Observability | OpenTelemetry + LangFuse |
| Schema | `@aeos/canonical-schema` (TS + Python parallel builds) |
| Cloud | AWS (us-east-1), EKS 1.30, Terraform, Helm, ArgoCD |
| Local dev | docker-compose at `local-dev/` |

**Hard rule for the spike:** any prototyping uses the above stack. No introducing new frameworks (no LangChain, LangGraph, CrewAI as project deps — those are *observed* agents, not our stack).

For data exploration only, Python with pandas/DuckDB inside a notebook in `onet-exploration/` is fine since it's research scratch work, not platform code.

---

## 8. AEOS-Specific Conventions to Respect

Surfaced from root `CLAUDE.md`:

- **Strict multi-tenancy** — any schema sketches must include `tenant_id` on every row, cache key, and Kafka event
- **Append-only Ledger** — Ledger rows are immutable; compensating rows only (this is patent-adjacent IP per CLAUDE.md)
- **Three deployment modes** — pooled SaaS, single-tenant siloed AWS, on-prem. Any integration design must work across all three.
- **v1 is observational only** — research designs must respect the no-block, no-mutate rule
- **Canonical schema first** — new fields go through `packages/canonical-schema/` (don't sketch service-local schemas)

---

## 9. Risks to Surface Early

1. **Bias & fairness** — AI hiring regulated under NYC Local Law 144, EU AI Act. Any O*NET-based scoring needs audit logs and fairness metrics.
2. **O*NET is US-centric** — NCO (India) overlay required for non-US tenants. Address in Phase 2.
3. **Explainability** — Every score must trace back to specific O*NET task IDs with citations. No black boxes.
4. **PII handling** — Even though AEOS doesn't store resumes, observed spans may contain candidate PII. Region-locked storage rules apply.
5. **O*NET update cadence** — O*NET releases periodically. UoP registry must version-track O*NET releases.

---

## 10. Conventions for Sessions in This Folder

1. **Always read this file + README.md first**
2. **Match the AEOS stack** — TS/Node primary, Python for data work only
3. **Cite O*NET fields by exact name** (`Task ID`, `IWA Title`, `Element ID`)
4. **All outputs under `research/onet-spike/`** — never touch production code
5. **Multi-tenancy aware** in every architecture sketch
6. **Track time-saved estimates** when proposing capabilities
7. **Surface uncertainty** — ask before assuming AEOS internal patterns

---

## 11. Immediate Next Steps (priority order)

1. Read repo to confirm tech stack section above matches actual code
2. Pull O*NET task list for `13-1071.01` → manually classify Auto/Assist/Human-only in `artifacts/recruiter-task-classification.xlsx`
3. Download O*NET DB → load into local DuckDB → schema audit
4. First three competitor teardowns: Paradox, Eightfold, Moonhub
5. Draft initial gap-analysis hypothesis after first three teardowns
6. Refine with remaining teardowns + Workstream E service integration notes

---

## 12. Open Questions for Roshan (ask in first working session)

- Target customer geography: US-only or India also? (Affects O*NET vs. NCO strategy)
- Target demo date?
- Any specific third-party recruiting agent the demo should be modeled after?
- Should service-integration-notes target all six services or just a subset for v1?
- Is there an existing AEOS pattern for "external taxonomy ingestion" we should follow?

---

## 13. Reference Links

- O*NET Online: https://www.onetonline.org/
- O*NET Web Services: https://services.onetcenter.org/
- O*NET Database Download: https://www.onetcenter.org/database.html
- Recruiter SOC: `13-1071.01` → https://www.onetonline.org/link/summary/13-1071.01
- Software Developer SOC: `15-1252.00` → https://www.onetonline.org/link/summary/15-1252.00

---

*Last updated: 2026-05-14 — initial spike scaffolding*
