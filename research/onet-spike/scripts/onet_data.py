"""
O*NET data loader.

PRIMARY source: live O*NET Web Services V2 API (onet_api.OnetClient).
FALLBACK source: local Excel dump at onet-exploration/db_30_2_excel/.

Behavior:
- On startup, we probe the API once. If reachable → API is used for everything.
- If the API is unreachable (newly-issued key not yet propagated, network down,
  rate-limit, etc.) → we transparently fall back to the local Excel.
- Set ONET_DATA_MODE=api in .env to force API-only (raises if unreachable).
- Set ONET_DATA_MODE=excel to force Excel-only (offline mode).

Source DB Excel files in db_30_2_excel/ are read-only — never written back.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import pandas as pd

from onet_api import OnetApiError, OnetClient

SPIKE_ROOT = Path(__file__).resolve().parent.parent
DB_DIR = SPIKE_ROOT / "onet-exploration" / "db_30_2_excel"

SOC_RECRUITER = "13-1071.00"

# BLS OES May 2024, Occupation Code 13-1071 (Human Resources Specialists)
# https://www.bls.gov/oes/current/oes131071.htm
MEDIAN_HOURLY_WAGE_USD = 32.27
MEDIAN_ANNUAL_WAGE_USD = 67_120


# ---------------------------------------------------------------------------
# Source-selection: API primary, Excel fallback, env override.
# ---------------------------------------------------------------------------

_MODE_ENV = os.environ.get("ONET_DATA_MODE", "auto").lower()  # api | excel | auto


@lru_cache(maxsize=1)
def _resolve_source() -> tuple[str, OnetClient | None]:
    """Return ('api', client) or ('excel', None). Cached for the process."""
    if _MODE_ENV == "excel":
        return ("excel", None)

    try:
        client = OnetClient()
    except OnetApiError:
        if _MODE_ENV == "api":
            raise
        return ("excel", None)

    if client.health_check():
        return ("api", client)

    if _MODE_ENV == "api":
        raise OnetApiError(
            "ONET_DATA_MODE=api but the API is not reachable (likely a newly-"
            "approved key still propagating). Wait 15-30 min and retry, or "
            "unset ONET_DATA_MODE to fall back to Excel."
        )
    return ("excel", None)


def active_source() -> str:
    """Returns 'api' or 'excel' — whichever is currently in use."""
    return _resolve_source()[0]


# ---------------------------------------------------------------------------
# Excel-backed helpers (kept identical to the original implementation).
# ---------------------------------------------------------------------------

def _tasks_from_excel() -> list[dict]:
    tasks = pd.read_excel(DB_DIR / "Task Statements.xlsx")
    ratings = pd.read_excel(DB_DIR / "Task Ratings.xlsx")
    col = "O*NET-SOC Code"
    rec = tasks[tasks[col] == SOC_RECRUITER].copy()
    importance = (
        ratings[(ratings[col] == SOC_RECRUITER) & (ratings["Scale ID"] == "IM")]
        .groupby("Task ID", as_index=False)["Data Value"]
        .mean()
        .rename(columns={"Data Value": "importance"})
    )
    rec = rec.merge(importance, on="Task ID", how="left")
    rec = rec.sort_values("importance", ascending=False)
    return [
        {
            "task_id": int(r["Task ID"]),
            "description": str(r["Task"]),
            "task_type": str(r["Task Type"]),
            "importance": round(float(r["importance"]), 2)
            if pd.notna(r["importance"])
            else None,
        }
        for _, r in rec.iterrows()
    ]


def _skills_from_excel() -> list[dict]:
    df = pd.read_excel(DB_DIR / "Skills.xlsx")
    col = "O*NET-SOC Code"
    rec = df[(df[col] == SOC_RECRUITER) & (df["Scale ID"] == "IM")].copy()
    rec = rec.sort_values("Data Value", ascending=False)
    return [
        {
            "element_id": str(r["Element ID"]),
            "skill": str(r["Element Name"]),
            "importance": round(float(r["Data Value"]), 2),
        }
        for _, r in rec.iterrows()
    ]


def _knowledge_from_excel() -> list[dict]:
    df = pd.read_excel(DB_DIR / "Knowledge.xlsx")
    col = "O*NET-SOC Code"
    rec = df[(df[col] == SOC_RECRUITER) & (df["Scale ID"] == "IM")].copy()
    rec = rec.sort_values("Data Value", ascending=False)
    return [
        {
            "element_id": str(r["Element ID"]),
            "area": str(r["Element Name"]),
            "importance": round(float(r["Data Value"]), 2),
        }
        for _, r in rec.iterrows()
    ]


# ---------------------------------------------------------------------------
# Public, source-agnostic API.
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def recruiter_tasks() -> list[dict]:
    src, client = _resolve_source()
    if src == "api":
        return client.tasks_for_soc(SOC_RECRUITER)
    return _tasks_from_excel()


@lru_cache(maxsize=1)
def recruiter_skills() -> list[dict]:
    src, client = _resolve_source()
    if src == "api":
        return client.skills_for_soc(SOC_RECRUITER)
    return _skills_from_excel()


@lru_cache(maxsize=1)
def recruiter_knowledge() -> list[dict]:
    src, client = _resolve_source()
    if src == "api":
        return client.knowledge_for_soc(SOC_RECRUITER)
    return _knowledge_from_excel()


def estimate_recruiter_hours(task_ids: list[int]) -> dict:
    """Crude effort estimate: each O*NET recruiter task = 1 hr weighted by importance/5.

    Placeholder model. Replace with real time-per-task data when available.
    """
    all_tasks = {t["task_id"]: t for t in recruiter_tasks()}
    selected = [all_tasks[tid] for tid in task_ids if tid in all_tasks]
    total_hours = sum((t["importance"] or 3.0) / 5.0 for t in selected)
    dollar_value = total_hours * MEDIAN_HOURLY_WAGE_USD
    return {
        "task_count": len(selected),
        "estimated_hours": round(total_hours, 2),
        "estimated_dollar_value": round(dollar_value, 2),
        "wage_basis_hourly_usd": MEDIAN_HOURLY_WAGE_USD,
        "wage_source": "BLS OES May 2024, 13-1071 Human Resources Specialists",
    }


if __name__ == "__main__":
    src = active_source()
    print(f"Active O*NET data source: {src.upper()}")
    tasks = recruiter_tasks()
    print(f"Loaded {len(tasks)} recruiter tasks. Top 3:")
    for t in tasks[:3]:
        print(f"  [{t['task_id']}] imp={t['importance']}  {t['description'][:80]}...")
    print(f"\nTop skills: {[s['skill'] for s in recruiter_skills()[:5]]}")
    print(f"Top knowledge: {[k['area'] for k in recruiter_knowledge()[:5]]}")
