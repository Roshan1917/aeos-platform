"""Show capability/driver mix and 2 sample rationales per SOC."""
import json
import sys
from collections import Counter
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "artifacts" / "profiles"

socs = sys.argv[1:] or sorted(p.stem for p in DIR.glob("*.json"))

for soc in socs:
    p = DIR / f"{soc}.json"
    if not p.exists():
        print(f"\n--- {soc} MISSING ---")
        continue
    data = json.loads(p.read_text(encoding="utf-8"))
    profs = data["profiles"]
    caps = Counter(x["ai_capability"] for x in profs)
    drvs = Counter(x["driver"] for x in profs)
    title = data.get("title", "?")
    print(f"\n=== {soc} -- {title}  ({len(profs)} tasks) ===")
    print(f"  cap: {dict(caps)}")
    print(f"  drv: {dict(drvs)}")
    autos = [x for x in profs if x["ai_capability"] == "auto"]
    humans = [x for x in profs if x["ai_capability"] == "human_only"]
    samples = (autos[:1] + humans[:1]) or profs[:1]
    for x in samples:
        print(f"\n  [{x['task_id']}] cap={x['ai_capability']}  drv={x['driver']}")
        print(f"    human={x['human_minutes']}m  ai={x['ai_minutes']}m")
        # Strip non-ASCII for Windows-cp1252 console safety.
        r = x["rationale"].encode("ascii", "replace").decode("ascii")
        print(f"    Rationale: {r}")
