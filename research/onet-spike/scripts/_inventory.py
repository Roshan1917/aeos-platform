"""One-off: count rows and surface a sample from each O*NET v30.2 table."""

from pathlib import Path
import pandas as pd

DB = Path(__file__).resolve().parent.parent / "onet-exploration" / "db_30_2_excel"

interesting = [
    "Occupation Data.xlsx",
    "Alternate Titles.xlsx",
    "Task Statements.xlsx",
    "Task Ratings.xlsx",
    "Tasks to DWAs.xlsx",
    "DWA Reference.xlsx",
    "Work Activities.xlsx",
    "Skills.xlsx",
    "Knowledge.xlsx",
    "Abilities.xlsx",
    "Work Styles.xlsx",
    "Work Values.xlsx",
    "Interests.xlsx",
    "Work Context.xlsx",
    "Education, Training, and Experience.xlsx",
    "Job Zones.xlsx",
    "Technology Skills.xlsx",
    "Tools Used.xlsx",
    "Emerging Tasks.xlsx",
    "Related Occupations.xlsx",
    "Sample of Reported Titles.xlsx",
]

print(f"{'Table':<46} {'Rows':>8}  Sample columns")
print("-" * 110)
for name in interesting:
    p = DB / name
    if not p.exists():
        print(f"{name:<46} (missing)")
        continue
    df = pd.read_excel(p)
    cols = ", ".join(df.columns[:5])
    print(f"{name:<46} {len(df):>8,}  {cols}")

print()
print("Distinct occupations in Occupation Data:")
occ = pd.read_excel(DB / "Occupation Data.xlsx")
print(f"  total = {len(occ)}")
# SOC families (e.g., 13-1071, 15-1252) — the major job code
occ["family"] = occ["O*NET-SOC Code"].str[:7]
print(f"  distinct SOC families (7-digit) = {occ['family'].nunique()}")
print()
print("Sample occupations:")
for _, r in occ.sample(8, random_state=42).iterrows():
    title = r["Title"]
    code = r["O*NET-SOC Code"]
    print(f"  {code}  {title}")
