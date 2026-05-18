"""
One-shot agent: classifies all 26 O*NET recruiter tasks for the cost calculator.

For each task in SOC 13-1071.00, asks the LLM:
  - ai_capability:    "auto" | "assist" | "human_only"
  - driver:           "per_application" | "per_phone_screen" | "per_hire" |
                      "per_week" | "per_open_req"
  - human_minutes:    baseline minutes a recruiter spends per unit
  - ai_minutes:       minutes still spent if AI takes over (0 if fully auto,
                      partial if assist, same as human_minutes if human_only)
  - rationale:        1-sentence reason citing the O*NET task wording

Output written to: artifacts/task-profiles.json

Run once:
    python scripts/classify_tasks.py

The Streamlit calculator reads the JSON; it does NOT call the LLM during demo.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import AzureOpenAI

sys.path.insert(0, str(Path(__file__).resolve().parent))
from onet_data import active_source, recruiter_tasks  # noqa: E402

SPIKE_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = SPIKE_ROOT / "artifacts" / "task-profiles.json"
load_dotenv(SPIKE_ROOT / ".env")


SCHEMA = {
    "type": "object",
    "properties": {
        "profiles": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "ai_capability": {
                        "type": "string",
                        "enum": ["auto", "assist", "human_only"],
                    },
                    "driver": {
                        "type": "string",
                        "enum": [
                            "per_application",
                            "per_phone_screen",
                            "per_hire",
                            "per_week",
                            "per_open_req",
                        ],
                    },
                    "human_minutes": {"type": "number", "minimum": 0},
                    "ai_minutes": {"type": "number", "minimum": 0},
                    "rationale": {"type": "string"},
                },
                "required": [
                    "task_id",
                    "ai_capability",
                    "driver",
                    "human_minutes",
                    "ai_minutes",
                    "rationale",
                ],
            },
        }
    },
    "required": ["profiles"],
}


SYSTEM_PROMPT = """You are an HR operations analyst classifying U.S. Department
of Labor O*NET tasks for a recruiting cost model that powers a live demo.

For each task you're given, return a structured profile:

  ai_capability — can a modern AI agent (LLM with tools) do this task?
    "auto"       = AI can fully execute end-to-end with minimal human review
                   Examples that ARE auto: parsing a resume, screening apps
                   against criteria, generating outreach messages, scheduling
                   interview times, populating ATS records, drafting offer
                   letters, sending status notifications to candidates,
                   matching applications against job requirements, basic
                   reference-check email automation.
    "assist"     = AI prepares/proposes; a human reviews or signs off.
                   Examples: drafting interview question banks, summarizing
                   candidate pipelines for hiring managers, recommending who
                   to advance, calibration analysis.
    "human_only" = requires legal judgment, sensitive human conversation,
                   physical presence, or final hiring authority.
                   Examples: deciding on harassment/discrimination cases,
                   conducting in-person interviews with sensitive content,
                   final hire/reject decision with legal exposure,
                   negotiating offers with senior candidates.

  driver — what triggers the task? Pick the MOST APPROPRIATE driver:
    "per_application"   = scales with applications received (resume review,
                          application matching, app-stage candidate comms)
    "per_phone_screen"  = scales with phone/initial screens conducted
                          (the screen itself, screen-summary writeups,
                          scheduling the screen)
    "per_hire"          = scales with finalized hires (offer paperwork,
                          background checks, onboarding paperwork,
                          reference checks for finalists, hiring records)
    "per_week"          = a constant weekly load regardless of pipeline
                          (policy/EEO compliance reading, weekly metrics
                          reporting, employee relations escalations)
    "per_open_req"      = scales with the number of open requisitions
                          (job-description authoring, hiring-manager
                          calibration meetings, sourcing strategy per role)

  human_minutes — realistic minutes a human recruiter spends per UNIT of
    the driver. Use industry-typical estimates (SHRM, LinkedIn Talent
    Solutions). Examples: a resume review = 3-5 min per application; a
    phone screen = 30 min per screen; a full offer-paperwork cycle =
    60-120 min per hire; EEO/policy reading = 60-120 min per week.

  ai_minutes — minutes still spent on the task if AI handles its portion.
    "auto"       => 0-2 min (allow ~1-2 min for spot-checking output)
    "assist"     => roughly 30-50% of human_minutes
    "human_only" => equal to human_minutes (AI cannot reduce it)

  rationale — ONE short sentence justifying the classification, quoting
    key words from the O*NET task description so a reviewer can audit it.

HARD REQUIREMENTS — read carefully before responding:

1. DRIVER DIVERSITY IS MANDATORY. Across the 26 tasks you'll be given,
   EVERY one of the 5 drivers must appear at least once. If your output
   uses only 1-2 drivers, you are wrong and must reclassify. A recruiter's
   work genuinely spans all 5 drivers — application review scales with
   apps, paperwork scales with hires, policy reading is weekly, etc.

2. AT LEAST 4 TASKS MUST BE "auto". Modern LLM agents in 2026 can fully
   handle resume parsing, application screening, scheduling, basic outreach,
   record-keeping, and candidate communication. Be honest: not every task
   needs a human. Reserve "human_only" for tasks that genuinely require
   legal judgment, sensitive conversations, or final hiring authority.

3. Don't invent O*NET Task IDs. Use only the IDs given.

4. Return one profile for EVERY task given. Do not skip any.
"""


def main() -> int:
    tasks = recruiter_tasks()
    print(f"Classifying {len(tasks)} tasks (source: {active_source().upper()})...")

    user_msg = (
        "Classify all of these O*NET recruiter tasks (SOC 13-1071.00):\n\n"
        + "\n".join(
            f"[{t['task_id']}] (importance {t['importance']}, {t['task_type']}) "
            f"{t['description']}"
            for t in tasks
        )
        + "\n\nReturn JSON matching the schema. One profile per task. "
        "Do not skip any task."
    )

    client = AzureOpenAI(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_key=os.environ["AZURE_OPENAI_KEY"],
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21"),
    )
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4.1-nano")

    resp = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "task_profiles",
                "schema": SCHEMA,
                "strict": False,
            },
        },
        temperature=0.1,
    )

    payload = json.loads(resp.choices[0].message.content)
    profiles = payload.get("profiles", [])
    print(f"Got {len(profiles)} profiles back.")

    # Index by task_id and stitch O*NET descriptions back in so the JSON is
    # self-contained (the calculator does not have to re-load O*NET data
    # to render labels).
    by_id = {t["task_id"]: t for t in tasks}
    enriched = []
    for p in profiles:
        tid = p["task_id"]
        base = by_id.get(tid, {})
        enriched.append(
            {
                "task_id": tid,
                "description": base.get("description"),
                "importance": base.get("importance"),
                "task_type": base.get("task_type"),
                **p,
            }
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps({"profiles": enriched}, indent=2))
    print(f"Wrote {OUT_PATH}")

    # Quick sanity summary.
    cap_counts: dict[str, int] = {}
    for e in enriched:
        cap_counts[e["ai_capability"]] = cap_counts.get(e["ai_capability"], 0) + 1
    print(f"AI capability distribution: {cap_counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
