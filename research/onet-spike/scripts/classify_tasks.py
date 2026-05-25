"""
One-shot agent: classifies all O*NET tasks for a given SOC for the cost calculator.

For each task in the chosen occupation, asks the LLM:
  - ai_capability:    "auto" | "assist" | "human_only"
  - driver:           "per_application" | "per_phone_screen" | "per_hire" |
                      "per_week" | "per_open_req"  (generalized; the LLM maps
                                                   the role's actual triggers)
  - human_minutes:    baseline minutes a person spends per unit
  - ai_minutes:       minutes still spent if AI takes over
  - rationale:        1-sentence reason citing the O*NET task wording

Output written to: artifacts/profiles/{soc}.json

Run from the spike root:
    python scripts/classify_tasks.py                  # default 13-1071.00
    python scripts/classify_tasks.py 15-1252.00       # any other SOC

The Streamlit calculator reads the JSON; it does NOT call the LLM during demo
once the cache exists for that SOC.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import AzureOpenAI

sys.path.insert(0, str(Path(__file__).resolve().parent))
from onet_data import active_source, occupation_meta, tasks_for  # noqa: E402

SPIKE_ROOT = Path(__file__).resolve().parent.parent
PROFILES_DIR = SPIKE_ROOT / "artifacts" / "profiles"
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


SYSTEM_PROMPT = """You are a workforce-analytics analyst classifying U.S. Department
of Labor O*NET tasks for a cost-and-automation model. You will be given the tasks
for a specific occupation (e.g. Recruiter, Software Developer, Registered Nurse).

For each task, return a structured profile:

  ai_capability — can a modern AI agent (LLM with tools) do this task?
    "auto"       = AI can fully execute end-to-end with minimal human review.
                   Examples that ARE auto across roles: parsing/screening
                   documents, drafting routine written output, scheduling,
                   structured record-keeping, basic data lookup, standardized
                   reporting, generating boilerplate text/code.
    "assist"     = AI prepares/proposes; a human reviews or signs off.
                   Examples: drafting analysis a human will edit, summarizing
                   complex documents, recommending courses of action.
    "human_only" = requires legal/clinical/professional judgment, sensitive
                   human conversation, physical presence, or final authority
                   with liability.

  driver — what triggers the task? Pick the MOST APPROPRIATE driver from these
  five generalized options. Map them sensibly to the occupation's actual work:
    "per_application"   = scales with raw incoming work items
                          (resumes for a recruiter; tickets for an engineer;
                          calls for a support rep; patients for a nurse)
    "per_phone_screen"  = scales with each direct human interaction
                          (phone screens for recruiters; consultations for
                          nurses; client meetings for sales)
    "per_hire"          = scales with each closed/delivered outcome
                          (hires for recruiters; deployments for engineers;
                          deals closed for sales; surgeries for surgeons)
    "per_week"          = a constant weekly load regardless of volume
                          (compliance reading, weekly metrics, regulatory
                          updates, ongoing supervision)
    "per_open_req"      = scales with active projects / accounts / roles
                          (open job reqs for recruiters; active projects
                          for managers; open cases for analysts)

  human_minutes — realistic minutes a human spends per UNIT of the driver.
    Use the relevant professional body's typical benchmark for THIS occupation:

      HR/Recruiting:           SHRM, LinkedIn Talent Solutions, ATS vendor data
      Software/Engineering:    IEEE, Stack Overflow Developer Survey, DORA
      Healthcare/Nursing:      NCBI/PubMed time-motion studies, ANA workload
      Sales:                   Gartner, SiriusDecisions, Salesforce State-of-Sales
      Accounting/Finance:      AICPA, IMA productivity studies
      Education/Teaching:      NEA, RAND education research, BLS time-use
      Customer Service:        Forrester, ICMI agent productivity studies
      Legal:                   ABA, Thomson Reuters, ALM legal-ops surveys
      Other:                   BLS American Time Use Survey, OECD productivity

  ai_minutes — minutes still spent on the task if AI handles its portion.
    "auto"       => 0-2 min (allow ~1-2 min for spot-checking)
    "assist"     => roughly 30-50% of human_minutes
    "human_only" => equal to human_minutes (AI cannot reduce it)

  rationale — ONE sentence with TWO things:
    (a) WHY the AI capability label fits (quote key words from the O*NET
        task description), AND
    (b) WHICH benchmark/source your minutes estimate is anchored to
        (name the professional body — e.g. "SHRM benchmarks suggest
        ~5 min per resume review" or "IEEE time-motion data: ~15 min
        per code review").

HARD REQUIREMENTS:

1. DRIVER DIVERSITY. Across all tasks of this occupation, EVERY one of the 5
   drivers should appear at least once when sensible. Real jobs span all 5.
   In particular: if ANY task description contains words like "interview",
   "consultation", "meeting with", "patient encounter", "call with client",
   that task should use `per_phone_screen` (direct human interactions).

2. AT LEAST 3 TASKS MUST BE "human_only" wherever the occupation involves
   sensitive judgment. Use `human_only` for tasks containing words like:
   "harassment", "discrimination", "exit interview", "termination",
   "grievance", "disciplinary", "negotiate offer", "diagnose", "prescribe",
   "legal compliance", "audit sign-off", "regulatory certification",
   "performance review with employee", "in-person counseling". These
   carry legal liability or require human presence and cannot be safely
   automated by 2026 AI.

3. AT LEAST 4 TASKS MUST BE "auto" wherever the occupation has obvious AI-
   amenable work (paperwork, standardized communications, scheduling, lookups,
   document summarization). Be honest about what 2026 LLMs can do.

4. USE OCCUPATION-APPROPRIATE BENCHMARKS in the rationale. For an HR role
   cite SHRM or LinkedIn Talent Solutions — NOT IEEE. For software cite
   IEEE or Stack Overflow — NOT SHRM. Match the source to the field.

5. Don't invent O*NET Task IDs. Use only the IDs given.

6. Return one profile for EVERY task given. Do not skip any.
"""


def classify_soc(soc: str) -> dict:
    """Run the classifier for one SOC. Returns the enriched JSON payload."""
    tasks = tasks_for(soc)
    if not tasks:
        raise ValueError(
            f"No tasks found for SOC {soc!r}. "
            f"Either the SOC is wrong or O*NET has no task data for it."
        )

    meta = occupation_meta(soc)
    print(f"Classifying {len(tasks)} tasks for SOC {soc} — {meta['title']}")
    print(f"  (data source: {active_source().upper()})")

    user_msg = (
        f"Occupation: {meta['title']} (SOC {soc}).\n"
        f"Description: {meta['description']}\n\n"
        f"Classify all of these O*NET tasks for this occupation:\n\n"
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

    # gpt-5+ reasoning models only accept the default temperature (1.0).
    # gpt-4.x and older accept custom values; we set 0.1 for determinism.
    is_reasoning_model = deployment.startswith("gpt-5") or deployment.startswith("o")
    create_kwargs: dict = dict(
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
    )
    if not is_reasoning_model:
        create_kwargs["temperature"] = 0.1

    resp = client.chat.completions.create(**create_kwargs)

    payload = json.loads(resp.choices[0].message.content)
    profiles = payload.get("profiles", [])

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

    out_path = PROFILES_DIR / f"{soc}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload_out = {
        "soc": soc,
        "title": meta["title"],
        "description": meta["description"],
        "source": active_source(),
        "profiles": enriched,
    }
    out_path.write_text(json.dumps(payload_out, indent=2))
    print(f"  -> wrote {out_path} ({len(enriched)} profiles)")
    return payload_out


def main() -> int:
    soc = sys.argv[1] if len(sys.argv) > 1 else "13-1071.00"
    payload = classify_soc(soc)
    caps: dict[str, int] = {}
    drivers: dict[str, int] = {}
    for p in payload["profiles"]:
        caps[p["ai_capability"]] = caps.get(p["ai_capability"], 0) + 1
        drivers[p["driver"]] = drivers.get(p["driver"], 0) + 1
    print(f"  AI capability mix: {caps}")
    print(f"  Driver mix: {drivers}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
