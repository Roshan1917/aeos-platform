"""
Tiny probe to check whether the O*NET API key has activated yet.

Run any time:
    python research/onet-spike/scripts/check_api.py

Exits 0 if API works, 1 if still blocked.
"""

from __future__ import annotations

import sys

from onet_api import OnetClient


def main() -> int:
    c = OnetClient()
    if c.health_check():
        print("API: LIVE — key activated.")
        tasks = c.tasks_for_soc("13-1071.00")
        print(f"Pulled {len(tasks)} tasks for SOC 13-1071.00 over the wire.")
        if tasks:
            print(
                f"Top task: [{tasks[0]['task_id']}] imp={tasks[0]['importance']}  "
                f"{tasks[0]['description'][:90]}..."
            )
        return 0
    print("API: STILL 403 — key not yet propagated. Retry in 15-30 min.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
