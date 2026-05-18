# O*NET Research Spike

> **One-line:** Evaluating how O*NET occupational data enriches AEOS's existing services when observing third-party AI recruiting agents — and where it gives us a defensible edge.

**Owner:** Roshan R&nbsp;&nbsp;|&nbsp;&nbsp;**Sponsor:** Anand Padia ("Andy")&nbsp;&nbsp;|&nbsp;&nbsp;**Status:** 🟡 In Progress&nbsp;&nbsp;|&nbsp;&nbsp;**Started:** May 2026

---

## TL;DR

Andy assigned a research spike to determine how the **O*NET database** (US Dept. of Labor occupational taxonomy, ~900 occupations) should be integrated into AEOS.

**Key framing:** AEOS is an **observability platform**, not an agent builder. The research is about enriching the six AEOS services (Process Discovery, Telemetry, Intelligence, Recommendations, Governance, Assessment) with O*NET data — so AEOS can produce taxonomy-anchored economic measurements of third-party AI agents it observes.

The spike answers four questions:

1. **Can we use the data?** — API access, licensing, schema, coverage
2. **What agents would AEOS observe?** — Teardowns of top US recruiting agents (Paradox, Eightfold, Moonhub, etc.)
3. **What gaps can O*NET fill?** — Where competitor telemetry alone is insufficient and O*NET adds defensible value
4. **What's the business case?** — Quantified human-effort displacement metrics

**Demo vertical:** HR Recruitment, with Software Developer hiring as the concrete walkthrough.

---

## Why This Matters

AEOS's pitch is "observability + governance for AI agents." But observed telemetry alone doesn't tell you *what human work the agent is doing or displacing.* O*NET supplies that missing layer:

> *"This recruiting agent completed 1,247 instances of O*NET task 4.A.4.b.4 (Evaluating Information) this week. At median recruiter wage × O*NET-frequency baseline, that displaces ~83 hours of human effort, valued at ~$X."*

That's the wedge — for AEOS's customers (CHROs, COOs, AI governance leads), it converts vague "agent productivity" into auditable, taxonomy-anchored economics.

---

## Folder Structure

```
research/onet-spike/
├── README.md                          ← you are here (human view)
├── CLAUDE.md                          ← context for Claude Code sessions
│
├── onet-exploration/                  ← Workstream A
│   ├── schema-audit.md
│   ├── data-profiling.ipynb
│   └── api-access-notes.md
│
├── competitor-teardowns/              ← Workstream B
│   ├── _summary-matrix.md
│   ├── paradox.md
│   ├── eightfold.md
│   ├── moonhub.md
│   └── ... (6 more)
│
├── service-integration-notes/         ← Workstream E
│   ├── process-discovery.md
│   ├── telemetry.md
│   ├── intelligence.md
│   ├── recommendations.md
│   ├── governance.md
│   └── assessment.md
│
├── gap-analysis.md                    ← Workstream C (strategic deliverable)
│
└── artifacts/
    ├── recruiter-task-classification.xlsx
    ├── roi-model.ipynb
    └── architecture-diagram.png
```

---

## Workstream Status

| # | Workstream | Status | Target |
|---|---|---|---|
| A | O*NET data audit & exploration | ⬜ Not started | TBD |
| B | US competitor teardowns (9 companies) | ⬜ Not started | TBD |
| C | Gap analysis | ⬜ Not started | TBD |
| D | ROI / business impact model | ⬜ Not started | TBD |
| E | AEOS service integration notes (6 services) | ⬜ Not started | TBD |
| F | Functional demo build | ⬜ Blocked on A–E | TBD |

Legend: ⬜ Not started · 🟡 In progress · ✅ Done · 🔴 Blocked

---

## Key Findings *(updated as work progresses)*

### O*NET Data
- _Workstream A_

### Competitor Landscape
- _Workstream B_

### Gaps AEOS Can Exploit
- _Workstream C — headline deliverable_

### ROI Estimate
- _Workstream D — early targets:_
  - Recruiter hours per hire baseline: ~25h
  - Observed agent displacement potential: 60–75% of O*NET recruiter tasks
  - Quantifiable savings per tenant per role-family per month: TBD

---

## How O*NET Plugs Into AEOS Services (summary — full detail in CLAUDE.md)

| AEOS Service | O*NET Contribution |
|---|---|
| Process Discovery | O*NET tasks seed canonical Units-of-Process registry |
| Telemetry | Span classification enrichment with `onet_task_id` |
| Intelligence | Economic Ledger entries with O*NET-anchored value calculations |
| Recommendations | Gap detection when agents don't cover expected O*NET tasks |
| Governance | Policy packs and attestations anchored to O*NET task coverage |
| Assessment | CAITO readiness scoring using O*NET task automation potential |

---

## Demo Scope — HR Recruitment

**Scenario:** an AEOS tenant has deployed a third-party AI recruiting agent. AEOS observes the agent and produces an O*NET-anchored economic report.

**Demo flow:**
1. Tenant onboards their recruiting agent via AEOS adapter
2. AEOS Telemetry ingests the agent's spans
3. Process Discovery classifies activities against O*NET task IDs
4. Intelligence generates Economic Ledger entries with O*NET-anchored values
5. Recommendations flags O*NET task coverage gaps
6. Governance produces an attestation report

---

## Open Questions

- Target customer geography: US-only or India also? (Drives O*NET vs. NCO strategy)
- Target demo date?
- Specific third-party agent to model the demo after?
- All six service integrations for v1, or a subset?

---

## Risks Flagged Early

1. **Bias & fairness** — AI hiring regulated (NYC Local Law 144, EU AI Act). Audit logs + fairness metrics required.
2. **PII** — Observed spans may contain candidate PII. Region-locked storage rules apply.
3. **Explainability** — Every score traces back to specific O*NET task IDs. No black boxes.
4. **O*NET is US-centric** — NCO overlay needed for India tenants (Phase 2).
5. **O*NET update cadence** — UoP registry must version-track O*NET releases.

---

## How to Navigate This Folder

**Reviewers (Andy, others):**
- Read this README
- Skim `gap-analysis.md` when published (strategic deliverable)
- Glance at `artifacts/roi-model.ipynb` for business case

**Developers joining:**
- Read `CLAUDE.md` first
- Then relevant `service-integration-notes/*.md` for the service you're touching

**AI assistants (Claude Code):**
- `CLAUDE.md` in this folder + root `CLAUDE.md` both apply
- Output stays under `research/onet-spike/` — never touch production code during the spike

---

## Reference Links

- O*NET Online: https://www.onetonline.org/
- O*NET Web Services: https://services.onetcenter.org/
- O*NET Database Download: https://www.onetcenter.org/database.html
- Recruiter SOC code: `13-1071.01` → https://www.onetonline.org/link/summary/13-1071.01

---

## Changelog

| Date | Change | By |
|---|---|---|
| 2026-05-14 | Initial spike scoped; folder + CLAUDE.md + README.md created | Roshan |

---

*Maintained by Roshan R. Questions → ping in team chat.*
