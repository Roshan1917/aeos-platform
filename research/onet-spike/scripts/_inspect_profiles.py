import json
from collections import Counter
from pathlib import Path

p = Path(__file__).resolve().parent.parent / "artifacts" / "task-profiles.json"
profiles = json.loads(p.read_text())["profiles"]

drivers = Counter(x["driver"] for x in profiles)
caps = Counter(x["ai_capability"] for x in profiles)
print(f"Drivers ({len(drivers)} distinct): {dict(drivers)}")
print(f"Capabilities: {dict(caps)}")
print()

print("Interview/screen-related tasks (candidates for per_phone_screen):")
for x in profiles:
    d = (x["description"] or "").lower()
    if any(k in d for k in ["interview", "screen", "applicant", "phone"]):
        print(
            f"  {x['task_id']}  drv={x['driver']:<18} cap={x['ai_capability']:<10} "
            f"human={x['human_minutes']:>4}m ai={x['ai_minutes']:>4}m"
        )
        print(f"           {(x['description'] or '')[:100]}")
