from src.lib.templates import candidates_for


def _payload(**overrides):
    base = {
        "variance_row_id": "var-1",
        "uop_id": "uop-1",
        "agent_id": "agent-1",
        "variance_bucket": "negative_underperformance",
        "variance_pct": -25.0,
    }
    base.update(overrides)
    return base


def test_severe_underperformance_triggers_model_swap() -> None:
    cands = candidates_for(_payload(variance_pct=-25.0))
    assert any(c.template_id == "severe-underperformance-model-swap" for c in cands)
    assert all(c.priority == "high" for c in cands if c.template_id == "severe-underperformance-model-swap")


def test_moderate_underperformance_triggers_prompt() -> None:
    cands = candidates_for(_payload(variance_pct=-15.0))
    ids = {c.template_id for c in cands}
    assert "moderate-underperformance-prompt" in ids
    assert "severe-underperformance-model-swap" not in ids


def test_under_threshold_no_template() -> None:
    cands = candidates_for(_payload(variance_pct=-5.0))
    # Below the moderate threshold, no template should fire
    assert cands == []


def test_data_quality_triggers_tool_config() -> None:
    cands = candidates_for(_payload(variance_bucket="data_quality_issue", variance_pct=0.0))
    ids = {c.template_id for c in cands}
    assert ids == {"data-quality-tool-config"}


def test_model_drift_triggers_oversight() -> None:
    cands = candidates_for(_payload(variance_bucket="model_drift", variance_pct=0.0))
    ids = {c.template_id for c in cands}
    assert ids == {"model-drift-oversight"}


def test_overperformance_triggers_cost_optimization() -> None:
    cands = candidates_for(_payload(variance_bucket="positive_overperformance", variance_pct=30.0))
    ids = {c.template_id for c in cands}
    assert ids == {"positive-overperformance-cost"}


def test_within_tolerance_no_template() -> None:
    cands = candidates_for(_payload(variance_bucket="within_tolerance", variance_pct=2.0))
    assert cands == []


def test_unknown_bucket_no_template() -> None:
    cands = candidates_for(_payload(variance_bucket="unknown_bucket"))
    assert cands == []


def test_payload_with_missing_pct_handled() -> None:
    cands = candidates_for(_payload(variance_pct="not-a-number"))
    # variance_pct parsing failure → 0.0; bucket alone is not enough
    # for the underperformance templates (need ≤ -10%).
    assert cands == []


def test_template_descriptions_include_agent_and_uop() -> None:
    cands = candidates_for(_payload(variance_pct=-30.0, agent_id="A", uop_id="U"))
    desc = cands[0].description
    assert "A" in desc and "U" in desc
