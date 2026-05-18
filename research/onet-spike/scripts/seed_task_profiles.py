"""
Hand-tuned baseline profiles for the 26 O*NET recruiter tasks (SOC 13-1071.00).

Each profile says:
  - ai_capability: can AI do it? (auto / assist / human_only)
  - driver: what triggers it? (per_application / per_phone_screen / per_hire /
                              per_week / per_open_req)
  - human_minutes: typical recruiter minutes per UNIT of the driver
  - ai_minutes:    minutes still spent if AI takes over its portion
  - rationale: short reason

These estimates are industry-typical for tech recruiting (sources: SHRM,
LinkedIn Talent Solutions, Glassdoor benchmarks). They are placeholders that
a real customer would calibrate against their own data.

Run this script to write artifacts/task-profiles.json (overwrites LLM output).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from onet_data import recruiter_tasks  # noqa: E402

SPIKE_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = SPIKE_ROOT / "artifacts" / "task-profiles.json"


# task_id -> (capability, driver, human_minutes, ai_minutes, rationale)
PROFILES: dict[int, tuple[str, str, float, float, str]] = {
    18861: (
        "human_only", "per_week", 120, 120,
        "Interpreting HR policies requires legal judgment and contextual reasoning that AI cannot safely replace.",
    ),
    18859: (
        "assist", "per_hire", 90, 30,
        "AI can pre-fill hiring paperwork and verify completeness; a human signs off and handles edge cases.",
    ),
    21097: (
        "human_only", "per_week", 180, 180,
        "Administering benefit plans requires regulated decisions and direct employee conversations.",
    ),
    18864: (
        "human_only", "per_week", 90, 90,
        "Maintaining current EEO/ADA knowledge requires reading legal updates and judgment.",
    ),
    18869: (
        "auto", "per_hire", 15, 2,
        "Scheduling tests is a calendar/integration task AI can fully automate via vendor APIs.",
    ),
    18866: (
        "auto", "per_hire", 30, 5,
        "Maintaining HRIS employment records is data entry and is fully automatable by an AI agent with HRIS tools.",
    ),
    18852: (
        "human_only", "per_week", 240, 240,
        "Employee relations and harassment investigations require human empathy, legal nuance, and direct conversations.",
    ),
    18855: (
        "auto", "per_hire", 30, 5,
        "Reference and background checks are triggered through vendor APIs (Checkr, GoodHire); AI orchestrates end-to-end.",
    ),
    18860: (
        "auto", "per_application", 5, 0.5,
        "Informing applicants of duties/comp/benefits is templated communication AI handles per applicant.",
    ),
    18868: (
        "auto", "per_application", 5, 0.5,
        "Reviewing applications to match job requirements is the classic AI resume-screening task.",
    ),
    18871: (
        "assist", "per_application", 8, 3,
        "AI ranks and shortlists; a recruiter or hiring manager makes the final referral decision.",
    ),
    18870: (
        "assist", "per_hire", 60, 30,
        "AI can deliver orientation content asynchronously; live Q&A and welcome are human-led.",
    ),
    18876: (
        "auto", "per_application", 5, 1,
        "Checking license eligibility against established codes is rule-based and automatable.",
    ),
    18863: (
        "assist", "per_week", 60, 20,
        "AI drafts updates to org charts and handbooks; a human approves changes.",
    ),
    18856: (
        "human_only", "per_week", 90, 90,
        "Conferring with management on personnel policy is a strategic human conversation.",
    ),
    18874: (
        "assist", "per_open_req", 30, 15,
        "AI analyzes selection criteria for bias and gaps; a human reviewer signs off on changes.",
    ),
    18857: (
        "auto", "per_application", 2, 0.1,
        "Application-status updates are templated emails — full automation, no judgment needed.",
    ),
    18854: (
        "assist", "per_week", 90, 30,
        "Exit interviews require a human conversation; AI can prepare the questionnaire and process the paperwork.",
    ),
    18862: (
        "assist", "per_phone_screen", 30, 20,
        "AI prepares tailored interview questions and can transcribe/note-take; the recruiter conducts the interview.",
    ),
    18865: (
        "auto", "per_open_req", 240, 30,
        "Candidate sourcing across LinkedIn/databases/job boards is the largest AI productivity gain in recruiting.",
    ),
    18867: (
        "human_only", "per_week", 60, 60,
        "Training managers on interviewing technique is a coaching activity requiring human delivery.",
    ),
    18853: (
        "auto", "per_week", 90, 10,
        "AI can pull HR data, run analyses, and draft reports end-to-end; a human reviews the output.",
    ),
    18872: (
        "human_only", "per_week", 90, 90,
        "Advising management on recruiting programs is strategic human-to-human consulting work.",
    ),
    18858: (
        "assist", "per_open_req", 60, 30,
        "AI proposes sourcing channels and target lists; a human approves the strategy.",
    ),
    18873: (
        "assist", "per_week", 60, 30,
        "AI manages routine staffing-agency coordination; humans handle relationship-sensitive issues.",
    ),
    18875: (
        "assist", "per_week", 30, 15,
        "AI helps run research on selection effectiveness; humans interpret and decide on changes.",
    ),
}


def main() -> int:
    tasks = recruiter_tasks()
    enriched = []
    missing = []
    for t in tasks:
        tid = t["task_id"]
        if tid not in PROFILES:
            missing.append(tid)
            continue
        cap, drv, h, a, rat = PROFILES[tid]
        enriched.append(
            {
                "task_id": tid,
                "description": t["description"],
                "importance": t["importance"],
                "task_type": t["task_type"],
                "ai_capability": cap,
                "driver": drv,
                "human_minutes": h,
                "ai_minutes": a,
                "rationale": rat,
            }
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps({"profiles": enriched}, indent=2))
    print(f"Wrote {OUT_PATH}  ({len(enriched)} profiles)")

    if missing:
        print(f"WARN: missing profiles for task IDs: {missing}")

    cap_counts: dict[str, int] = {}
    drv_counts: dict[str, int] = {}
    for e in enriched:
        cap_counts[e["ai_capability"]] = cap_counts.get(e["ai_capability"], 0) + 1
        drv_counts[e["driver"]] = drv_counts.get(e["driver"], 0) + 1
    print(f"AI capability mix: {cap_counts}")
    print(f"Driver mix:        {drv_counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
