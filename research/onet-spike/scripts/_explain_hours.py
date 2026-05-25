"""Generate the audit trail for the screenshot's numbers, by driver."""
import json
from pathlib import Path

SPIKE = Path(__file__).resolve().parent.parent
P = SPIKE / "artifacts" / "profiles" / "13-1071.00.json"

# Slider values from the latest screenshot
OPEN_REQS = 15
APPS_PER_WK = 200
PHONE_PER_WK = 50
HIRES_PER_MO = 5
WAGE = 32.27

WEEKS_PER_MONTH = 4.33

UNITS = {
    "per_application": APPS_PER_WK,
    "per_phone_screen": PHONE_PER_WK,
    "per_hire": HIRES_PER_MO / WEEKS_PER_MONTH,
    "per_week": 1,
    "per_open_req": OPEN_REQS,
}

profiles = json.loads(P.read_text())["profiles"]
by_driver: dict[str, list[dict]] = {d: [] for d in UNITS}
for p in profiles:
    by_driver[p["driver"]].append(p)

print(f"{'='*80}")
print(f"AUDIT TRAIL — sliders: open_reqs={OPEN_REQS}, apps={APPS_PER_WK}, "
      f"phone={PHONE_PER_WK}, hires={HIRES_PER_MO}/mo")
print(f"{'='*80}\n")

total_human_hrs = 0.0
total_savings_hrs = 0.0
for driver, tasks in by_driver.items():
    if not tasks:
        continue
    units = UNITS[driver]
    print(f"\n-- driver = {driver}  (slider value x {units:.2f}/wk) --")
    sub_h = 0.0
    sub_s = 0.0
    for t in tasks:
        hm = t["human_minutes"]
        am = t["ai_minutes"]
        hrs_h = (hm / 60.0) * units
        hrs_s = ((hm - am) / 60.0) * units
        sub_h += hrs_h
        sub_s += hrs_s
        print(
            f"  Task {t['task_id']}: hum={hm}m, ai={am}m  -> "
            f"({hm}/60)x{units:.2f} = {hrs_h:.2f} hrs human, "
            f"saves {hrs_s:.2f} hrs"
        )
        print(f"    {t['description'][:78]}")
    total_human_hrs += sub_h
    total_savings_hrs += sub_s
    print(f"  * subtotals: {sub_h:.1f} hrs human, {sub_s:.1f} hrs savings, "
          f"{len(tasks)} tasks")

print(f"\n{'='*80}")
print(f"GRAND TOTAL: {total_human_hrs:.1f} hrs human, "
      f"{total_savings_hrs:.1f} hrs savings")
print(f"Cost: ${total_human_hrs * WAGE:,.0f}/wk")
print(f"AI savings: ${total_savings_hrs * WAGE:,.0f}/wk = "
      f"${total_savings_hrs * WAGE * 52:,.0f}/yr")
print(f"{'='*80}")
