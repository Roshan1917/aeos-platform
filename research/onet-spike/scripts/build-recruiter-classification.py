"""
Build the recruiter-task hand-classification template.

Reads the O*NET v30.2 Excel dump at onet-exploration/db_30_2_excel/, filters to
the chosen SOC code (default: 13-1071.00 Human Resources Specialists), joins
Task Statements with Task Ratings (Importance + Frequency aggregates), and
writes a single Excel file with three blank columns for hand classification.

Output: artifacts/recruiter-task-classification.xlsx
Run from repo root:  python research/onet-spike/scripts/build-recruiter-classification.py
"""

from pathlib import Path
import pandas as pd

# ---------------------------------------------------------------------------
# Config — edit SOC_CODE if Occupation Data.xlsx shows a different recruiter code.
# ---------------------------------------------------------------------------
SOC_CODE = "13-1071.00"

HERE = Path(__file__).resolve().parent
SPIKE = HERE.parent
DB = SPIKE / "onet-exploration" / "db_30_2_excel"
OUT = SPIKE / "artifacts" / "recruiter-task-classification.xlsx"

occ = pd.read_excel(DB / "Occupation Data.xlsx")
tasks = pd.read_excel(DB / "Task Statements.xlsx")
ratings = pd.read_excel(DB / "Task Ratings.xlsx")

occ_col = "O*NET-SOC Code"
title = occ.loc[occ[occ_col] == SOC_CODE, "Title"].iloc[0]
print(f"SOC {SOC_CODE} -> {title}")

rec_tasks = tasks[tasks[occ_col] == SOC_CODE].copy()
print(f"Tasks found: {len(rec_tasks)}")

# Task Ratings has one row per (Task, Scale, Category) — we want the mean
# Importance (IM) and mean Frequency (FT) per Task ID for this SOC.
rec_ratings = ratings[ratings[occ_col] == SOC_CODE].copy()

def agg_scale(scale_id: str) -> pd.DataFrame:
    sub = rec_ratings[rec_ratings["Scale ID"] == scale_id]
    return sub.groupby("Task ID", as_index=False)["Data Value"].mean().rename(
        columns={"Data Value": scale_id}
    )

importance = agg_scale("IM")  # Importance, 1-5 — single mean is meaningful
# NOTE: FT (Frequency) is a distribution across 7 buckets, not a single score.
# Skipping it for the hand-classification artifact; can be added later as a
# weighted score if needed.

df = rec_tasks.merge(importance, on="Task ID", how="left")
df = df.rename(columns={"IM": "Importance (1-5)"})

# Keep only the columns we need for hand classification.
keep = [
    "Task ID",
    "Task",
    "Task Type",
    "Importance (1-5)",
]
df = df[keep].copy()

# Blank columns for hand classification (Roshan + Andy fill these in).
df["AI Capability"] = ""           # Auto | Assist | Human-only
df["Confidence (1-5)"] = ""        # how sure are you
df["Rationale"] = ""               # 1-line why
df["Observable in agent telemetry?"] = ""  # Yes | No | Maybe
df["Notes"] = ""

# Sort by Importance descending — highest-leverage tasks at top.
df = df.sort_values("Importance (1-5)", ascending=False, na_position="last")

OUT.parent.mkdir(parents=True, exist_ok=True)
df.to_excel(OUT, index=False, sheet_name=f"Tasks {SOC_CODE}")
print(f"Wrote {OUT}  ({len(df)} rows)")
