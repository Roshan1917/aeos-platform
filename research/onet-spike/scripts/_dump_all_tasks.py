import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from onet_data import recruiter_tasks

for t in recruiter_tasks():
    print(f"  {t['task_id']:>6}  imp={t['importance']:>4}  {t['description']}")
