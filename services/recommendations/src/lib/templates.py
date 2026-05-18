"""
Templated recommendation generator.

Given a `LedgerVarianceDetectedEvent` payload, returns the list of
recommendation candidates that should be created. Each template encodes a
single rule: matching condition + canonical recommendation fields.

Templates are intentionally simple in v1 — pattern detection beyond rule
matching (clustering variance signatures, ML-based recommendations) is
v2 work. The template_id is used as part of the dedup key in the DB so
the same recommendation isn't recreated for every variance row.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class RecommendationCandidate:
    template_id: str
    title: str
    description: str
    category: str  # RecommendationCategory string
    priority: str  # 'critical' | 'high' | 'medium' | 'low'
    estimated_impact_value: float | None = None
    estimated_impact_currency: str | None = None


@dataclass(frozen=True)
class Template:
    id: str
    matches: Callable[[dict[str, Any]], bool]
    build: Callable[[dict[str, Any]], RecommendationCandidate]


def _bucket(payload: dict[str, Any]) -> str:
    return str(payload.get("variance_bucket", ""))


def _pct(payload: dict[str, Any]) -> float:
    try:
        return float(payload.get("variance_pct", 0.0))
    except (TypeError, ValueError):
        return 0.0


def _agent(payload: dict[str, Any]) -> str:
    return str(payload.get("agent_id", "<unknown>"))


def _uop(payload: dict[str, Any]) -> str:
    return str(payload.get("uop_id", "<unknown>"))


# ── Template definitions ────────────────────────────────────────────────────

TEMPLATES: list[Template] = [
    Template(
        id="severe-underperformance-model-swap",
        matches=lambda p: (
            _bucket(p) == "negative_underperformance" and _pct(p) <= -20.0
        ),
        build=lambda p: RecommendationCandidate(
            template_id="severe-underperformance-model-swap",
            title=f"Consider swapping model for agent {_agent(p)}",
            description=(
                f"Agent {_agent(p)} on UoP {_uop(p)} is underperforming by "
                f"{_pct(p):.1f}% against contract. Sustained negative variance at "
                "this magnitude usually indicates a model capability mismatch."
            ),
            category="model_swap",
            priority="high",
        ),
    ),
    Template(
        id="moderate-underperformance-prompt",
        matches=lambda p: (
            _bucket(p) == "negative_underperformance"
            and -20.0 < _pct(p) <= -10.0
        ),
        build=lambda p: RecommendationCandidate(
            template_id="moderate-underperformance-prompt",
            title=f"Tune prompts for agent {_agent(p)}",
            description=(
                f"Agent {_agent(p)} on UoP {_uop(p)} is underperforming by "
                f"{_pct(p):.1f}%. Consider revising the system prompt or "
                "few-shot examples before escalating to model changes."
            ),
            category="prompt_improvement",
            priority="medium",
        ),
    ),
    Template(
        id="data-quality-tool-config",
        matches=lambda p: _bucket(p) == "data_quality_issue",
        build=lambda p: RecommendationCandidate(
            template_id="data-quality-tool-config",
            title=f"Audit tool inputs for agent {_agent(p)}",
            description=(
                "Variance attributed to data quality issues. Review the "
                f"connector configuration feeding agent {_agent(p)} on UoP "
                f"{_uop(p)} — schema drift in the system of record is the "
                "most common root cause."
            ),
            category="tool_configuration",
            priority="high",
        ),
    ),
    Template(
        id="model-drift-oversight",
        matches=lambda p: _bucket(p) == "model_drift",
        build=lambda p: RecommendationCandidate(
            template_id="model-drift-oversight",
            title=f"Increase human-in-the-loop for agent {_agent(p)}",
            description=(
                f"Model drift detected on UoP {_uop(p)}. Raise the human "
                "oversight ratio for this agent until variance returns to "
                "the within-tolerance bucket."
            ),
            category="human_oversight_adjustment",
            priority="medium",
        ),
    ),
    Template(
        id="positive-overperformance-cost",
        matches=lambda p: (
            _bucket(p) == "positive_overperformance" and _pct(p) >= 25.0
        ),
        build=lambda p: RecommendationCandidate(
            template_id="positive-overperformance-cost",
            title=f"Evaluate cost-down on agent {_agent(p)}",
            description=(
                f"Agent {_agent(p)} on UoP {_uop(p)} is overperforming by "
                f"{_pct(p):.1f}%. There may be headroom to swap to a smaller "
                "or cheaper model without breaching the contract."
            ),
            category="cost_optimization",
            priority="low",
        ),
    ),
]


def candidates_for(variance_payload: dict[str, Any]) -> list[RecommendationCandidate]:
    """Returns all templates that match the given variance event payload."""
    return [t.build(variance_payload) for t in TEMPLATES if t.matches(variance_payload)]
