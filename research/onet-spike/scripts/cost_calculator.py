"""
O*NET-grounded recruitment cost calculator.

Pure math. No LLM calls. No HTTP. Loads the pre-classified task profiles
from artifacts/task-profiles.json and computes weekly recruiter effort,
cost, and AI-automatable savings given a team's volume metrics.

Usage:
    from cost_calculator import CalculatorInputs, calculate
    result = calculate(CalculatorInputs(
        applications_per_week=200,
        phone_screens_per_week=50,
        hires_per_month=5,
        open_reqs=15,
    ))
    print(result.weekly_human_hours, result.weekly_savings_usd)
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from onet_data import MEDIAN_HOURLY_WAGE_USD, active_source  # noqa: E402

SPIKE_ROOT = Path(__file__).resolve().parent.parent
PROFILES_PATH = SPIKE_ROOT / "artifacts" / "task-profiles.json"

WEEKS_PER_MONTH = 4.33  # 52 / 12


@dataclass
class CalculatorInputs:
    applications_per_week: int = 200
    phone_screens_per_week: int = 50
    hires_per_month: int = 5
    open_reqs: int = 15
    wage_hourly_usd: float = MEDIAN_HOURLY_WAGE_USD


@dataclass
class TaskBreakdown:
    task_id: int
    description: str
    importance: float | None
    task_type: str
    ai_capability: str  # auto | assist | human_only
    driver: str
    rationale: str
    units_per_week: float
    human_hours_per_week: float
    ai_hours_per_week: float
    savings_hours_per_week: float
    human_cost_per_week: float
    ai_cost_per_week: float
    savings_per_week: float


@dataclass
class CapabilityTotals:
    capability: str
    task_count: int
    human_hours_per_week: float
    ai_hours_per_week: float
    savings_hours_per_week: float
    human_cost_per_week: float
    savings_per_week: float


@dataclass
class CalculatorResult:
    weekly_human_hours: float
    weekly_ai_hours: float
    weekly_savings_hours: float
    weekly_human_cost_usd: float
    weekly_ai_cost_usd: float
    weekly_savings_usd: float
    annual_savings_usd: float
    automation_percent: float
    per_task: list[TaskBreakdown]
    by_capability: dict[str, CapabilityTotals]
    source: str  # "api" or "excel"
    wage_hourly_usd: float

    def to_dict(self) -> dict:
        return {
            **{k: v for k, v in asdict(self).items() if k not in ("per_task", "by_capability")},
            "per_task": [asdict(t) for t in self.per_task],
            "by_capability": {k: asdict(v) for k, v in self.by_capability.items()},
        }


def _units_per_week(driver: str, inputs: CalculatorInputs) -> float:
    if driver == "per_application":
        return float(inputs.applications_per_week)
    if driver == "per_phone_screen":
        return float(inputs.phone_screens_per_week)
    if driver == "per_hire":
        return inputs.hires_per_month / WEEKS_PER_MONTH
    if driver == "per_week":
        return 1.0
    if driver == "per_open_req":
        return float(inputs.open_reqs)
    raise ValueError(f"Unknown driver: {driver!r}")


def _load_profiles() -> list[dict]:
    if not PROFILES_PATH.exists():
        raise FileNotFoundError(
            f"{PROFILES_PATH} not found. Run "
            f"`python scripts/classify_tasks.py` first to generate it."
        )
    return json.loads(PROFILES_PATH.read_text())["profiles"]


def calculate(inputs: CalculatorInputs) -> CalculatorResult:
    profiles = _load_profiles()
    wage = float(inputs.wage_hourly_usd)

    per_task: list[TaskBreakdown] = []
    for p in profiles:
        driver = p["driver"]
        units = _units_per_week(driver, inputs)
        human_min = float(p["human_minutes"])
        ai_min = float(p["ai_minutes"])

        human_hrs = (human_min / 60.0) * units
        ai_hrs = (ai_min / 60.0) * units
        savings_hrs = max(0.0, human_hrs - ai_hrs)
        human_cost = human_hrs * wage
        ai_cost = ai_hrs * wage
        savings_cost = max(0.0, human_cost - ai_cost)

        per_task.append(
            TaskBreakdown(
                task_id=int(p["task_id"]),
                description=p["description"],
                importance=p.get("importance"),
                task_type=p.get("task_type", ""),
                ai_capability=p["ai_capability"],
                driver=driver,
                rationale=p.get("rationale", ""),
                units_per_week=round(units, 2),
                human_hours_per_week=round(human_hrs, 3),
                ai_hours_per_week=round(ai_hrs, 3),
                savings_hours_per_week=round(savings_hrs, 3),
                human_cost_per_week=round(human_cost, 2),
                ai_cost_per_week=round(ai_cost, 2),
                savings_per_week=round(savings_cost, 2),
            )
        )

    weekly_human_hours = sum(t.human_hours_per_week for t in per_task)
    weekly_ai_hours = sum(t.ai_hours_per_week for t in per_task)
    weekly_savings_hours = sum(t.savings_hours_per_week for t in per_task)
    weekly_human_cost = sum(t.human_cost_per_week for t in per_task)
    weekly_ai_cost = sum(t.ai_cost_per_week for t in per_task)
    weekly_savings = sum(t.savings_per_week for t in per_task)
    annual_savings = weekly_savings * 52.0
    automation_pct = (
        100.0 * weekly_savings_hours / weekly_human_hours
        if weekly_human_hours > 0
        else 0.0
    )

    by_cap: dict[str, CapabilityTotals] = {}
    for cap in ("auto", "assist", "human_only"):
        rows = [t for t in per_task if t.ai_capability == cap]
        by_cap[cap] = CapabilityTotals(
            capability=cap,
            task_count=len(rows),
            human_hours_per_week=round(sum(r.human_hours_per_week for r in rows), 2),
            ai_hours_per_week=round(sum(r.ai_hours_per_week for r in rows), 2),
            savings_hours_per_week=round(sum(r.savings_hours_per_week for r in rows), 2),
            human_cost_per_week=round(sum(r.human_cost_per_week for r in rows), 2),
            savings_per_week=round(sum(r.savings_per_week for r in rows), 2),
        )

    return CalculatorResult(
        weekly_human_hours=round(weekly_human_hours, 2),
        weekly_ai_hours=round(weekly_ai_hours, 2),
        weekly_savings_hours=round(weekly_savings_hours, 2),
        weekly_human_cost_usd=round(weekly_human_cost, 2),
        weekly_ai_cost_usd=round(weekly_ai_cost, 2),
        weekly_savings_usd=round(weekly_savings, 2),
        annual_savings_usd=round(annual_savings, 2),
        automation_percent=round(automation_pct, 1),
        per_task=per_task,
        by_capability=by_cap,
        source=active_source(),
        wage_hourly_usd=wage,
    )


if __name__ == "__main__":
    inputs = CalculatorInputs(
        applications_per_week=200,
        phone_screens_per_week=50,
        hires_per_month=5,
        open_reqs=15,
    )
    r = calculate(inputs)
    print(f"O*NET data source: {r.source.upper()}")
    print(f"Wage: ${r.wage_hourly_usd}/hr (BLS OES May 2024)")
    print()
    print(f"Weekly recruiter hours (human-only baseline): {r.weekly_human_hours} hrs")
    print(f"Weekly recruiter hours (with AI):             {r.weekly_ai_hours} hrs")
    print(f"Weekly hours saved by AI:                     {r.weekly_savings_hours} hrs ({r.automation_percent}%)")
    print()
    print(f"Weekly cost (human-only):  ${r.weekly_human_cost_usd:,.2f}")
    print(f"Weekly cost (with AI):     ${r.weekly_ai_cost_usd:,.2f}")
    print(f"Weekly savings:            ${r.weekly_savings_usd:,.2f}")
    print(f"Annual savings:            ${r.annual_savings_usd:,.2f}")
    print()
    print("By capability:")
    for cap, totals in r.by_capability.items():
        print(
            f"  {cap:<10} tasks={totals.task_count:>2}  "
            f"human={totals.human_hours_per_week:>6.1f}h  "
            f"savings={totals.savings_hours_per_week:>6.1f}h  "
            f"= ${totals.savings_per_week:>8,.2f}/wk"
        )
    print()
    print("Top 5 savings opportunities:")
    top = sorted(r.per_task, key=lambda t: t.savings_per_week, reverse=True)[:5]
    for t in top:
        print(
            f"  [{t.task_id}] {t.ai_capability:<10} {t.driver:<18} "
            f"saves ${t.savings_per_week:>7,.2f}/wk  "
            f"{t.description[:55]}..."
        )
