"""
O*NET data loader — parameterized by SOC (any of 1,016 occupations).

PRIMARY source: live O*NET Web Services V2 API (onet_api.OnetClient).
FALLBACK source: local Excel dump at onet-exploration/db_30_2_excel/.

Behavior:
- On startup, we probe the API once. If reachable → API is used for everything.
- If the API is unreachable → we transparently fall back to local Excel.
- Set ONET_DATA_MODE=api to force API-only; =excel for offline.

Source DB Excel files in db_30_2_excel/ are read-only — never written back.

Public API (all take a SOC except list_occupations / search_titles):
    list_occupations()                  -> list of {soc, title, description}
    search_titles(query, limit=8)       -> list of {soc, title, matched_title, kind}
    tasks_for(soc)                      -> list of task dicts
    skills_for(soc)                     -> list of skill dicts
    knowledge_for(soc)                  -> list of knowledge dicts
    occupation_meta(soc)                -> {soc, title, description}
    active_source()                     -> "api" | "excel"

Backwards-compat shims (still call the parameterized functions):
    recruiter_tasks()      -> tasks_for(SOC_RECRUITER)
    recruiter_skills()     -> skills_for(SOC_RECRUITER)
    recruiter_knowledge()  -> knowledge_for(SOC_RECRUITER)
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import pandas as pd

from onet_api import OnetApiError, OnetClient

SPIKE_ROOT = Path(__file__).resolve().parent.parent
DB_DIR = SPIKE_ROOT / "onet-exploration" / "db_30_2_excel"

# Default SOC for backwards-compat (the original demo target).
SOC_RECRUITER = "13-1071.00"

# BLS OES May 2024 — median hourly wages for the featured SOCs.
# Source: https://www.bls.gov/oes/current/<occupation-code>.htm
# Each value is the U.S. national median. Override per region/band in the UI.
WAGE_BY_SOC: dict[str, float] = {
    "13-1071.00": 32.27,   # Human Resources Specialists
    "15-1252.00": 66.71,   # Software Developers
    "11-2022.00": 63.46,   # Sales Managers
    "29-1141.00": 42.80,   # Registered Nurses
    "13-2011.00": 40.16,   # Accountants and Auditors
    "43-4051.00": 19.31,   # Customer Service Representatives
    "25-2021.00": 35.30,   # Elementary School Teachers
    "41-3091.00": 28.74,   # Sales Reps, Services
}

# Default fallback when a SOC isn't in WAGE_BY_SOC. We keep this at the
# HR-specialist median for backwards-compatibility with the original demo.
MEDIAN_HOURLY_WAGE_USD = WAGE_BY_SOC["13-1071.00"]
MEDIAN_ANNUAL_WAGE_USD = 67_120


def wage_for(soc: str) -> tuple[float, bool]:
    """
    Return (hourly_wage_usd, is_official_for_this_soc).

    Deprecated — kept for backwards compatibility. Use wage_info_for(soc)
    instead, which returns the full dict with source + year + freshness.
    """
    info = wage_info_for(soc)
    if info is None:
        return (MEDIAN_HOURLY_WAGE_USD, False)
    return (info["hourly"], not info.get("fallback", False))


@lru_cache(maxsize=128)
def wage_info_for(soc: str) -> dict | None:
    """
    Return the full wage info for a SOC. Resolution order:

      1. Live fetch from O*NET Online (cached 30 days on disk).
         Returns {hourly, annual, year, source, source_url, fetched_at}.
      2. If live fetch fails AND we have a hardcoded fallback for this SOC,
         return that with fallback=True so the UI can flag it.
      3. If nothing is available, return None.

    The UI calls this once per occupation and shows the result in the
    wage caption.
    """
    # Lazy import — wage_fetcher imports nothing heavy.
    from wage_fetcher import fetch_wage  # noqa: WPS433

    live = fetch_wage(soc)
    if live is not None:
        return live

    # Fall back to hardcoded if we have one for this SOC.
    if soc in WAGE_BY_SOC:
        return {
            "soc": soc,
            "hourly": WAGE_BY_SOC[soc],
            "annual": None,
            "year": "2024",
            "source": "Hardcoded fallback (BLS OES May 2024 snapshot)",
            "source_url": f"https://www.bls.gov/oes/current/oes{soc.replace('.', '').replace('-', '')[:6]}.htm",
            "fetched_at": None,
            "fallback": True,
        }
    return None


# ---------------------------------------------------------------------------
# Source-selection: API primary, Excel fallback, env override.
# ---------------------------------------------------------------------------

_MODE_ENV = os.environ.get("ONET_DATA_MODE", "auto").lower()


@lru_cache(maxsize=1)
def _resolve_source() -> tuple[str, OnetClient | None]:
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
            "ONET_DATA_MODE=api but the API is not reachable. "
            "Unset to fall back to Excel."
        )
    return ("excel", None)


def active_source() -> str:
    return _resolve_source()[0]


# ---------------------------------------------------------------------------
# Excel readers — one cached read per table per process.
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _occupation_data() -> pd.DataFrame:
    return pd.read_excel(DB_DIR / "Occupation Data.xlsx")


@lru_cache(maxsize=1)
def _task_statements() -> pd.DataFrame:
    return pd.read_excel(DB_DIR / "Task Statements.xlsx")


@lru_cache(maxsize=1)
def _task_ratings() -> pd.DataFrame:
    return pd.read_excel(DB_DIR / "Task Ratings.xlsx")


@lru_cache(maxsize=1)
def _skills_df() -> pd.DataFrame:
    return pd.read_excel(DB_DIR / "Skills.xlsx")


@lru_cache(maxsize=1)
def _knowledge_df() -> pd.DataFrame:
    return pd.read_excel(DB_DIR / "Knowledge.xlsx")


@lru_cache(maxsize=1)
def _alternate_titles_df() -> pd.DataFrame:
    return pd.read_excel(DB_DIR / "Alternate Titles.xlsx")


@lru_cache(maxsize=1)
def _reported_titles_df() -> pd.DataFrame:
    return pd.read_excel(DB_DIR / "Sample of Reported Titles.xlsx")


# ---------------------------------------------------------------------------
# Public: list/search occupations
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def list_occupations() -> list[dict]:
    """All 1,016 occupations, sorted by SOC code."""
    df = _occupation_data().sort_values("O*NET-SOC Code")
    out: list[dict] = []
    for _, r in df.iterrows():
        out.append(
            {
                "soc": str(r["O*NET-SOC Code"]),
                "title": str(r["Title"]),
                "description": str(r.get("Description", "")) if pd.notna(r.get("Description")) else "",
            }
        )
    return out


def search_titles(query: str, limit: int = 8) -> list[dict]:
    """
    Match a free-text job title against the official title + alternate titles +
    sample reported titles. Returns a ranked list of {soc, title, matched_title, kind}.

    Matching is intentionally simple: case-insensitive substring match, ranked
    by (priority of source) then (shortest title that contains the query).
    Good enough for a demo; replace with embedding similarity later for production.
    """
    q = (query or "").strip().lower()
    if len(q) < 2:
        return []

    hits: list[tuple[int, int, dict]] = []  # (priority, len(title), record)

    # 1) Match against official Occupation titles (priority 0).
    for occ in list_occupations():
        if q in occ["title"].lower():
            hits.append((
                0,
                len(occ["title"]),
                {
                    "soc": occ["soc"],
                    "title": occ["title"],
                    "matched_title": occ["title"],
                    "kind": "official",
                },
            ))

    # 2) Match against Alternate Titles (priority 1).
    alt = _alternate_titles_df()
    alt_mask = alt["Alternate Title"].astype(str).str.lower().str.contains(q, na=False)
    for _, r in alt[alt_mask].head(200).iterrows():
        hits.append((
            1,
            len(str(r["Alternate Title"])),
            {
                "soc": str(r["O*NET-SOC Code"]),
                "title": str(r["Title"]),
                "matched_title": str(r["Alternate Title"]),
                "kind": "alternate",
            },
        ))

    # 3) Match against Sample of Reported Titles (priority 2 — real-world job titles).
    rep = _reported_titles_df()
    rep_mask = rep["Reported Job Title"].astype(str).str.lower().str.contains(q, na=False)
    for _, r in rep[rep_mask].head(200).iterrows():
        hits.append((
            2,
            len(str(r["Reported Job Title"])),
            {
                "soc": str(r["O*NET-SOC Code"]),
                "title": str(r["Title"]),
                "matched_title": str(r["Reported Job Title"]),
                "kind": "reported",
            },
        ))

    hits.sort(key=lambda h: (h[0], h[1]))
    seen: set[str] = set()
    out: list[dict] = []
    for _, _, rec in hits:
        if rec["soc"] in seen:
            continue
        seen.add(rec["soc"])
        out.append(rec)
        if len(out) >= limit:
            break
    return out


def occupation_meta(soc: str) -> dict:
    df = _occupation_data()
    rows = df[df["O*NET-SOC Code"] == soc]
    if rows.empty:
        return {"soc": soc, "title": "(unknown)", "description": ""}
    r = rows.iloc[0]
    return {
        "soc": soc,
        "title": str(r["Title"]),
        "description": str(r.get("Description", "")) if pd.notna(r.get("Description")) else "",
    }


# ---------------------------------------------------------------------------
# Public: per-SOC tasks / skills / knowledge
# ---------------------------------------------------------------------------

@lru_cache(maxsize=64)
def tasks_for(soc: str) -> list[dict]:
    src, client = _resolve_source()
    if src == "api":
        return client.tasks_for_soc(soc)

    col = "O*NET-SOC Code"
    rec = _task_statements()[_task_statements()[col] == soc].copy()
    if rec.empty:
        return []
    ratings = _task_ratings()
    importance = (
        ratings[(ratings[col] == soc) & (ratings["Scale ID"] == "IM")]
        .groupby("Task ID", as_index=False)["Data Value"]
        .mean()
        .rename(columns={"Data Value": "importance"})
    )
    rec = rec.merge(importance, on="Task ID", how="left")
    rec = rec.sort_values("importance", ascending=False, na_position="last")
    return [
        {
            "task_id": int(r["Task ID"]),
            "description": str(r["Task"]),
            "task_type": str(r["Task Type"]),
            "importance": round(float(r["importance"]), 2) if pd.notna(r["importance"]) else None,
        }
        for _, r in rec.iterrows()
    ]


@lru_cache(maxsize=64)
def skills_for(soc: str) -> list[dict]:
    src, client = _resolve_source()
    if src == "api":
        return client.skills_for_soc(soc)
    col = "O*NET-SOC Code"
    df = _skills_df()
    rec = df[(df[col] == soc) & (df["Scale ID"] == "IM")].copy()
    rec = rec.sort_values("Data Value", ascending=False)
    return [
        {
            "element_id": str(r["Element ID"]),
            "skill": str(r["Element Name"]),
            "importance": round(float(r["Data Value"]), 2),
        }
        for _, r in rec.iterrows()
    ]


@lru_cache(maxsize=64)
def knowledge_for(soc: str) -> list[dict]:
    src, client = _resolve_source()
    if src == "api":
        return client.knowledge_for_soc(soc)
    col = "O*NET-SOC Code"
    df = _knowledge_df()
    rec = df[(df[col] == soc) & (df["Scale ID"] == "IM")].copy()
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
# Backwards-compat shims (the original demo's API).
# ---------------------------------------------------------------------------

def recruiter_tasks() -> list[dict]:
    return tasks_for(SOC_RECRUITER)


def recruiter_skills() -> list[dict]:
    return skills_for(SOC_RECRUITER)


def recruiter_knowledge() -> list[dict]:
    return knowledge_for(SOC_RECRUITER)


def estimate_recruiter_hours(task_ids: list[int]) -> dict:
    """Legacy helper kept for the screening agent — uses recruiter SOC."""
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
    print(f"Active O*NET data source: {active_source().upper()}")
    all_occ = list_occupations()
    print(f"Loaded {len(all_occ)} occupations.")
    print()
    print("Sample search 'engineer' (top 5):")
    for h in search_titles("engineer", limit=5):
        print(f"  {h['soc']:<12} [{h['kind']:<10}] {h['matched_title']}  ->  {h['title']}")
    print()
    print("Sample search 'recruiter' (top 5):")
    for h in search_titles("recruiter", limit=5):
        print(f"  {h['soc']:<12} [{h['kind']:<10}] {h['matched_title']}  ->  {h['title']}")
    print()
    soc = "13-1071.00"
    print(f"Tasks for {soc}: {len(tasks_for(soc))}")
    print(f"Top skills for {soc}: {[s['skill'] for s in skills_for(soc)[:3]]}")
