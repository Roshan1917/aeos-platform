from aeos_canonical_schema.types import SpanKind

from src.lib.classifier import classify


def test_classify_llm_call() -> None:
    assert classify("aeos.llm.call") == SpanKind.LLM_CALL


def test_classify_tool_call() -> None:
    assert classify("aeos.tool.call") == SpanKind.TOOL_CALL


def test_classify_decision() -> None:
    assert classify("aeos.decision") == SpanKind.AGENT_DECISION


def test_classify_human_override() -> None:
    assert classify("aeos.human_override") == SpanKind.HUMAN_HANDOFF


def test_classify_unknown_falls_back_to_internal() -> None:
    assert classify("http.server.request") == SpanKind.INTERNAL


def test_existing_kind_wins_when_specific() -> None:
    assert classify("aeos.llm.call", existing_kind=SpanKind.TOOL_CALL) == SpanKind.TOOL_CALL


def test_existing_internal_does_not_override() -> None:
    # Caller passing INTERNAL is treated as "no opinion" — name lookup wins.
    assert classify("aeos.llm.call", existing_kind=SpanKind.INTERNAL) == SpanKind.LLM_CALL


def test_string_existing_kind_accepted() -> None:
    assert classify("aeos.tool.call", existing_kind="tool_call") == SpanKind.TOOL_CALL
