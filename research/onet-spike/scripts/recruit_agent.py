"""
O*NET-grounded recruiter agent.

Takes a job description + candidate resume, runs a multi-turn agent loop
against Azure OpenAI (gpt-4.1-nano by default), with tool calls that read
the O*NET v30.2 recruiter task catalog. Every output the agent produces
cites specific O*NET Task IDs so the work is auditable.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import AzureOpenAI

from onet_data import (
    estimate_recruiter_hours,
    recruiter_knowledge,
    recruiter_skills,
    recruiter_tasks,
)

SPIKE_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(SPIKE_ROOT / ".env")


# Tool implementations — run locally; the LLM sees only their JSON results.

def _list_onet_recruiter_tasks() -> list[dict]:
    return recruiter_tasks()


def _get_onet_task_details(task_id: int) -> dict:
    for t in recruiter_tasks():
        if t["task_id"] == int(task_id):
            return t
    return {"error": f"Task ID {task_id} not found in SOC 13-1071.00"}


def _list_onet_recruiter_skills() -> list[dict]:
    return recruiter_skills()[:10]


def _list_onet_recruiter_knowledge() -> list[dict]:
    return recruiter_knowledge()[:10]


def _record_screening_decision(
    candidate_summary: str,
    recommended_action: str,
    overall_fit_score: int,
    matched_onet_task_ids: list[int],
    matched_onet_skills: list[str],
    strengths: list[str],
    gaps: list[str],
    interview_questions: list[dict],
    rationale: str,
) -> dict:
    return {
        "candidate_summary": candidate_summary,
        "recommended_action": recommended_action,
        "overall_fit_score": overall_fit_score,
        "matched_onet_task_ids": matched_onet_task_ids,
        "matched_onet_skills": matched_onet_skills,
        "strengths": strengths,
        "gaps": gaps,
        "interview_questions": interview_questions,
        "rationale": rationale,
    }


def _estimate_effort(task_ids: list[int]) -> dict:
    return estimate_recruiter_hours(task_ids)


TOOL_IMPLS = {
    "list_onet_recruiter_tasks": _list_onet_recruiter_tasks,
    "get_onet_task_details": _get_onet_task_details,
    "list_onet_recruiter_skills": _list_onet_recruiter_skills,
    "list_onet_recruiter_knowledge": _list_onet_recruiter_knowledge,
    "record_screening_decision": _record_screening_decision,
    "estimate_effort": _estimate_effort,
}


TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "list_onet_recruiter_tasks",
            "description": (
                "Return all 26 O*NET tasks for SOC 13-1071.00 (Human Resources "
                "Specialists), sorted by Importance descending. Call this first."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_onet_task_details",
            "description": "Get full details for a single O*NET task by Task ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "O*NET Task ID"}
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_onet_recruiter_skills",
            "description": "Top O*NET skills required for SOC 13-1071.00.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_onet_recruiter_knowledge",
            "description": "Top O*NET knowledge areas for SOC 13-1071.00.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "estimate_effort",
            "description": (
                "Estimate the human-recruiter hours and dollar value displaced "
                "by the agent for a list of O*NET Task IDs it performed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "task_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                    }
                },
                "required": ["task_ids"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "record_screening_decision",
            "description": (
                "Record the final structured screening decision. Call this exactly "
                "ONCE at the end. Every strength, gap, and interview question MUST "
                "reference at least one O*NET Task ID or skill."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "candidate_summary": {"type": "string"},
                    "recommended_action": {
                        "type": "string",
                        "enum": ["advance", "phone_screen", "reject", "hold"],
                    },
                    "overall_fit_score": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 100,
                    },
                    "matched_onet_task_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                    },
                    "matched_onet_skills": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "strengths": {"type": "array", "items": {"type": "string"}},
                    "gaps": {"type": "array", "items": {"type": "string"}},
                    "interview_questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "question": {"type": "string"},
                                "onet_task_id": {"type": "integer"},
                                "purpose": {"type": "string"},
                            },
                            "required": ["question", "onet_task_id", "purpose"],
                        },
                        "minItems": 3,
                        "maxItems": 7,
                    },
                    "rationale": {"type": "string"},
                },
                "required": [
                    "candidate_summary",
                    "recommended_action",
                    "overall_fit_score",
                    "matched_onet_task_ids",
                    "matched_onet_skills",
                    "strengths",
                    "gaps",
                    "interview_questions",
                    "rationale",
                ],
            },
        },
    },
]


SYSTEM_PROMPT = """You are an O*NET-grounded recruiting agent.

Your job is to screen a candidate against a job opening. EVERY claim you make
must be anchored in O*NET data for SOC 13-1071.00 (Human Resources Specialists)
— the agent owns the recruiter workflow.

Workflow:
1. Call list_onet_recruiter_tasks to see the 26 recruiter tasks.
2. Call list_onet_recruiter_skills and list_onet_recruiter_knowledge for context.
3. Based on the job description, identify 5-10 O*NET Task IDs most relevant.
4. Assess the candidate's resume against those tasks and the O*NET skills.
5. Generate 3-5 interview questions, each tagged with the O*NET Task ID it probes.
6. Call estimate_effort with the O*NET Task IDs you covered.
7. Call record_screening_decision exactly once with the full structured output.

Hard rules:
- Never invent O*NET Task IDs. Only use IDs returned by the tools.
- Every strength, gap, and interview question must reference a real Task ID or skill.
- Be honest about gaps. The audit trail depends on it.
"""


@dataclass
class AgentRun:
    decision: dict[str, Any] | None = None
    effort: dict[str, Any] | None = None
    trace: list[dict[str, Any]] = field(default_factory=list)
    raw_messages: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None


def _client() -> AzureOpenAI:
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    key = os.environ.get("AZURE_OPENAI_KEY")
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")
    if not endpoint or not key:
        raise RuntimeError(
            "Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_KEY. "
            f"Copy {SPIKE_ROOT}/.env.example to .env and fill it in."
        )
    return AzureOpenAI(azure_endpoint=endpoint, api_key=key, api_version=api_version)


def run_agent(
    job_description: str,
    candidate_resume: str,
    max_turns: int = 10,
    deployment: str | None = None,
) -> AgentRun:
    client = _client()
    deployment = deployment or os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4.1-nano")

    user_msg = (
        "JOB DESCRIPTION\n---\n"
        + job_description.strip()
        + "\n\nCANDIDATE RESUME\n---\n"
        + candidate_resume.strip()
        + "\n\nScreen this candidate end-to-end following the workflow."
    )
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    run = AgentRun(raw_messages=messages)

    for turn in range(max_turns):
        try:
            response = client.chat.completions.create(
                model=deployment,
                messages=messages,
                tools=TOOLS_SCHEMA,
                tool_choice="auto",
                temperature=0.2,
            )
        except Exception as e:
            run.error = f"Azure OpenAI call failed on turn {turn}: {e}"
            return run

        msg = response.choices[0].message
        messages.append(msg.model_dump(exclude_none=True))

        if not msg.tool_calls:
            run.trace.append(
                {"turn": turn, "kind": "final_text", "content": msg.content}
            )
            break

        for tc in msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            impl = TOOL_IMPLS.get(name)
            if impl is None:
                result: Any = {"error": f"Unknown tool {name}"}
            else:
                try:
                    result = impl(**args)
                except Exception as e:
                    result = {"error": f"{type(e).__name__}: {e}"}

            run.trace.append(
                {
                    "turn": turn,
                    "kind": "tool_call",
                    "name": name,
                    "args": args,
                    "result_preview": _preview(result),
                }
            )

            if name == "record_screening_decision" and isinstance(result, dict) and "error" not in result:
                run.decision = result
            if name == "estimate_effort" and isinstance(result, dict) and "error" not in result:
                run.effort = result

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, default=str),
                }
            )

        if run.decision is not None and run.effort is not None:
            try:
                final = client.chat.completions.create(
                    model=deployment,
                    messages=messages,
                    tools=TOOLS_SCHEMA,
                    tool_choice="none",
                    temperature=0.2,
                )
                final_msg = final.choices[0].message
                messages.append(final_msg.model_dump(exclude_none=True))
                run.trace.append(
                    {"turn": turn + 1, "kind": "final_text", "content": final_msg.content}
                )
            except Exception:
                pass
            break

    run.raw_messages = messages
    return run


def _preview(obj: Any, limit: int = 240) -> str:
    s = json.dumps(obj, default=str)
    return s if len(s) <= limit else s[:limit] + "...(truncated)"


if __name__ == "__main__":
    import sys

    sample_job = """\
Senior Technical Recruiter — Software Engineering
We're hiring a recruiter to source, screen, and close software engineers
for our platform team. Responsibilities include sourcing on LinkedIn,
phone screens, coordinating loops, and partnering with hiring managers
on calibration. Knowledge of EEOC compliance required.
"""
    sample_resume = """\
Priya Sharma — priya@example.com
6 years as a tech recruiter at Infosys and a Series C startup.
Sourced and closed 80+ SWE hires in 2024 across India and the US.
Owned full lifecycle: sourcing, screening, scheduling, offer negotiation.
Strong with LinkedIn Recruiter, Greenhouse ATS. Some exposure to EEOC training.
Bachelor's in Psychology, English (fluent), Hindi (native).
"""
    result = run_agent(sample_job, sample_resume)
    if result.error:
        print("ERROR:", result.error)
        sys.exit(1)
    print(json.dumps({"decision": result.decision, "effort": result.effort}, indent=2))
