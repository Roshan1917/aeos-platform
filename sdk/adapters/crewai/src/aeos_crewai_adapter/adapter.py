"""
AEOS CrewAI Adapter
===================
Wraps ``Crew.kickoff()`` to emit AEOS-compatible OTel spans.

Usage::

    from aeos_crewai_adapter import CrewAIAeosAdapter
    from crewai import Crew, Agent, Task

    adapter = CrewAIAeosAdapter(
        tenant_id="tenant-abc",
        agent_id="agent-xyz",
        otlp_endpoint="http://localhost:4317",
    )

    crew = Crew(agents=[...], tasks=[...])
    result = adapter.kickoff(crew, inputs={"topic": "AI governance"})

The adapter wraps ``crew.kickoff()`` with OTel span emission.
No CrewAI runtime dependency is imported here — the caller provides the Crew
instance.  Import CrewAI separately in your application.

Requires: ``opentelemetry-api`` (the host app provides the SDK + exporter).
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from opentelemetry import trace
from opentelemetry.trace import StatusCode

# ---------------------------------------------------------------------------
# SDK version used as the tracer instrumentation scope version
# ---------------------------------------------------------------------------
_SDK_VERSION = "0.1.0"

# ---------------------------------------------------------------------------
# AEOS OTel span attribute keys — matches the TypeScript adapter constants
# ---------------------------------------------------------------------------
_ATTR_TENANT_ID = "aeos.tenant_id"
_ATTR_AGENT_ID = "aeos.agent_id"
_ATTR_UOP_ID = "aeos.uop_id"
_ATTR_DECISION_ID = "aeos.decision_id"
_ATTR_VENDOR_RUNTIME = "aeos.vendor_runtime"
_ATTR_MODEL_PROVIDER = "aeos.model_provider"
_ATTR_MODEL_ID = "aeos.model_id"
_ATTR_INPUT_TOKENS = "aeos.input_tokens"
_ATTR_OUTPUT_TOKENS = "aeos.output_tokens"
_ATTR_COST_USD = "aeos.cost_usd"
_ATTR_TOOL_NAME = "aeos.tool_name"
_ATTR_TOOL_SUCCESS = "aeos.tool_success"
_ATTR_HUMAN_OVERRIDE = "aeos.human_override"
_ATTR_DECISION_SUCCESS = "aeos.decision_success"


class CrewAIAeosAdapter:
    """
    AEOS adapter for CrewAI.

    Wraps ``Crew.kickoff()`` to emit AEOS OTel spans tracking the full
    crew execution as a decision cycle.

    Parameters
    ----------
    tenant_id:
        AEOS tenant identifier — present on every emitted span.
    agent_id:
        AEOS agent identifier — present on every emitted span.
    otlp_endpoint:
        OTLP gRPC or HTTP endpoint for span export.  The host application
        is responsible for configuring and registering an OTel provider.
    uop_id:
        Optional AEOS Unit-of-Performance identifier.
    """

    def __init__(
        self,
        tenant_id: str,
        agent_id: str,
        otlp_endpoint: str,
        uop_id: Optional[str] = None,
    ) -> None:
        self.tenant_id = tenant_id
        self.agent_id = agent_id
        self.otlp_endpoint = otlp_endpoint
        self.uop_id = uop_id
        self._tracer = trace.get_tracer("aeos.adapter-sdk", _SDK_VERSION)

    # -------------------------------------------------------------------------
    # kickoff — wraps crew.kickoff() with AEOS OTel span emission
    #
    # Accepts the Crew instance as ``Any`` to avoid a hard CrewAI dependency.
    # The caller is responsible for providing a valid crewai.Crew object.
    #
    # Parameters
    # ----------
    # crew:
    #     ``crewai.Crew`` instance (typed as Any to avoid import dependency).
    # inputs:
    #     Optional dict passed through to crew.kickoff(inputs=...).
    # -------------------------------------------------------------------------
    def kickoff(self, crew: Any, inputs: Optional[dict[str, Any]] = None) -> Any:
        """
        Execute a CrewAI crew and emit AEOS OTel spans.

        Returns the result of ``crew.kickoff()``.
        """
        decision_id = str(uuid.uuid4())
        start_ms = int(time.monotonic() * 1000)

        with self._tracer.start_as_current_span("aeos.decision") as decision_span:
            self._set_identity_attrs(decision_span, decision_id)
            decision_span.set_attribute(_ATTR_VENDOR_RUNTIME, "crewai")
            decision_span.set_attribute(_ATTR_MODEL_PROVIDER, "crewai")

            with self._tracer.start_as_current_span("aeos.llm.call") as llm_span:
                self._set_identity_attrs(llm_span, decision_id)
                llm_span.set_attribute(_ATTR_VENDOR_RUNTIME, "crewai")
                llm_span.set_attribute(_ATTR_MODEL_PROVIDER, "crewai")
                llm_span.set_attribute(_ATTR_MODEL_ID, "crewai-crew")

                result = None
                success = True
                try:
                    if inputs is not None:
                        result = crew.kickoff(inputs=inputs)
                    else:
                        result = crew.kickoff()
                except Exception as exc:
                    success = False
                    llm_span.set_status(StatusCode.ERROR, str(exc))
                    decision_span.set_status(StatusCode.ERROR, str(exc))
                    raise
                finally:
                    duration_ms = int(time.monotonic() * 1000) - start_ms
                    llm_span.set_attribute("aeos.duration_ms", duration_ms)

                decision_span.set_attribute(_ATTR_DECISION_SUCCESS, success)

        return result

    # -------------------------------------------------------------------------
    # _set_identity_attrs — helper to stamp identity attributes on a span
    # -------------------------------------------------------------------------
    def _set_identity_attrs(self, span: Any, decision_id: str) -> None:
        span.set_attribute(_ATTR_TENANT_ID, self.tenant_id)
        span.set_attribute(_ATTR_AGENT_ID, self.agent_id)
        span.set_attribute(_ATTR_DECISION_ID, decision_id)
        if self.uop_id is not None:
            span.set_attribute(_ATTR_UOP_ID, self.uop_id)

    # -------------------------------------------------------------------------
    # Convenience hooks — can be called manually if needed
    # -------------------------------------------------------------------------
    def emit_tool_call(
        self,
        decision_id: str,
        tool_name: str,
        success: bool,
        error: Optional[str] = None,
    ) -> None:
        """Emit a standalone tool call span."""
        with self._tracer.start_as_current_span("aeos.tool.call") as span:
            self._set_identity_attrs(span, decision_id)
            span.set_attribute(_ATTR_TOOL_NAME, tool_name)
            span.set_attribute(_ATTR_TOOL_SUCCESS, success)
            if not success and error:
                span.set_status(StatusCode.ERROR, error)

    def emit_human_override(self, decision_id: str, reason: str) -> None:
        """Emit a human override span."""
        with self._tracer.start_as_current_span("aeos.human_override") as span:
            self._set_identity_attrs(span, decision_id)
            span.set_attribute(_ATTR_HUMAN_OVERRIDE, True)
            span.set_attribute("aeos.human_override_reason", reason)
