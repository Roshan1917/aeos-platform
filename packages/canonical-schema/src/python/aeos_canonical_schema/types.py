# AUTO-GENERATED from TypeScript source. Do not edit manually.
# Regenerate: pnpm --filter @aeos/canonical-schema build:python
# Source of truth: packages/canonical-schema/src/types/
# PATENT-ADJACENT types are annotated below — do not modify without CTO approval.

from __future__ import annotations

from enum import Enum
from typing import Annotated, Any, Literal, Optional, Union
from pydantic import BaseModel, Field


class Tenant(BaseModel):
    model_config = {"frozen": True}
    id: str
    name: str
    slug: str
    deployment_mode: Literal["pooled", "siloed", "on-prem"]
    status: Literal["active", "suspended", "offboarded"]
    created_at: str
    updated_at: str


class ComplianceFramework(str, Enum):
    EU_AI_ACT = "EU_AI_ACT"
    ISO_42001 = "ISO_42001"
    UNECE_WP29 = "UNECE_WP29"
    MAS_TRM = "MAS_TRM"
    SOC2 = "SOC2"


class TenantSettings(BaseModel):
    model_config = {"frozen": True}
    tenant_id: str
    anonymized_benchmarks_consent: bool
    data_retention_days: float
    compliance_frameworks: list[ComplianceFramework]
    agent_deployment_platform: Optional[AgentDeploymentPlatform]


class UoPCategory(str, Enum):
    REVENUE_GENERATION = "revenue_generation"
    COST_REDUCTION = "cost_reduction"
    RISK_MITIGATION = "risk_mitigation"
    COMPLIANCE = "compliance"
    CUSTOMER_EXPERIENCE = "customer_experience"
    OPERATIONAL_EFFICIENCY = "operational_efficiency"


class SystemOfRecord(str, Enum):
    SALESFORCE = "salesforce"
    SAP = "sap"
    HUBSPOT = "hubspot"
    ORACLE = "oracle"
    WORKDAY = "workday"
    SERVICENOW = "servicenow"
    CUSTOM = "custom"


# PATENT: Family 1 — do not modify without CTO approval (danny.goldstein@fuzebox.ai)
class UoP(BaseModel):
    model_config = {"frozen": True}
    schema_version: Literal["1.0"] = "1.0"
    id: str
    tenant_id: str
    name: str
    description: str
    category: UoPCategory
    system_of_record: SystemOfRecord
    sor_object_type: str
    sor_metric_field: str
    baseline_value: float
    baseline_currency: Optional[str] = None
    owner_team: str
    status: Literal["active", "deprecated"]
    created_at: str
    updated_at: str


class ProcessStep(BaseModel):
    model_config = {"frozen": True}
    step_id: str
    name: str
    type: Literal["human", "agent", "automated", "decision"]
    responsible_agent_id: Optional[str] = None
    inputs: list[str]
    outputs: list[str]
    next_steps: list[str]


class Process(BaseModel):
    model_config = {"frozen": True}
    id: str
    tenant_id: str
    uop_id: str
    name: str
    description: str
    steps: list[ProcessStep]
    status: Literal["active", "deprecated"]
    created_at: str
    updated_at: str


class VendorRuntime(str, Enum):
    AWS_BEDROCK = "aws_bedrock"
    AZURE_OPENAI = "azure_openai"
    GOOGLE_VERTEX = "google_vertex"
    ANTHROPIC_CLOUD = "anthropic_cloud"
    OPENAI_PLATFORM = "openai_platform"
    SALESFORCE_AGENTFORCE = "salesforce_agentforce"
    SERVICENOW_NOW_ASSIST = "servicenow_now_assist"
    MICROSOFT_COPILOT = "microsoft_copilot"
    SAP_JOULE = "sap_joule"
    WORKDAY_ILLUMINATE = "workday_illuminate"
    CUSTOM = "custom"


class ModelProvider(str, Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    GOOGLE = "google"
    META = "meta"
    MISTRAL = "mistral"
    COHERE = "cohere"
    AMAZON = "amazon"
    CUSTOM = "custom"


class AgentFramework(str, Enum):
    LANGGRAPH = "langgraph"
    CREWAI = "crewai"
    AUTOGEN = "autogen"
    SEMANTIC_KERNEL = "semantic_kernel"
    LLAMAINDEX = "llamaindex"
    DSPY = "dspy"
    CUSTOM = "custom"


# PATENT: Family 1 — do not modify without CTO approval
class Agent(BaseModel):
    model_config = {"frozen": True}
    schema_version: Literal["1.0"] = "1.0"
    id: str
    tenant_id: str
    name: str
    description: str
    vendor_runtime: VendorRuntime
    model_provider: ModelProvider
    model_id: str
    framework: Optional[AgentFramework] = None
    adapter_sdk_version: Optional[str] = None
    status: Literal["active", "deprecated", "suspended"]
    created_at: str
    updated_at: str


# PATENT: Family 1
class UefWeights(BaseModel):
    model_config = {"frozen": True}
    task_completion: float
    decision_quality: float
    resource_efficiency: float
    compliance_adherence: float
    human_oversight_ratio: float
    error_recovery: float
    knowledge_utilization: float
    coordination_effectiveness: float


# PATENT: Family 1 — do not modify without CTO approval
class AgentContract(BaseModel):
    model_config = {"frozen": True}
    schema_version: Literal["1.0"] = "1.0"
    id: str
    tenant_id: str
    agent_id: str
    uop_id: str
    target_value: float
    target_currency: Optional[str] = None
    scoring_weights: UefWeights
    effective_from: str
    effective_until: Optional[str] = None
    status: Literal["active", "superseded", "terminated"]
    created_by: str
    created_at: str


class BoundaryType(str, Enum):
    DATA_ACCESS = "data_access"
    TOOL_INVOCATION = "tool_invocation"
    COST_CEILING = "cost_ceiling"
    DECISION_AUTHORITY = "decision_authority"
    COMPLIANCE_CONSTRAINT = "compliance_constraint"
    HUMAN_ESCALATION_TRIGGER = "human_escalation_trigger"


class BoundaryScope(str, Enum):
    AGENT = "agent"
    PROCESS = "process"
    UOP = "uop"
    TENANT = "tenant"


# PATENT: Family 3
class BoundaryDefinition(BaseModel):
    model_config = {"frozen": True}
    condition: str
    threshold: Optional[float] = None
    threshold_unit: Optional[str] = None
    allowed_tools: Optional[list[str]] = None
    denied_tools: Optional[list[str]] = None
    allowed_data_classes: Optional[list[str]] = None
    denied_data_classes: Optional[list[str]] = None


# PATENT: Family 3 — do not modify without CTO approval
class Boundary(BaseModel):
    model_config = {"frozen": True}
    schema_version: Literal["1.0"] = "1.0"
    id: str
    tenant_id: str
    agent_id: str
    boundary_type: BoundaryType
    scope: BoundaryScope
    definition: BoundaryDefinition
    enforcement_mode: Literal["observe", "alert", "block"]
    status: Literal["active", "suspended"]
    created_by: str
    created_at: str
    updated_at: str


class SpanKind(str, Enum):
    LLM_CALL = "llm_call"
    TOOL_CALL = "tool_call"
    AGENT_DECISION = "agent_decision"
    HUMAN_HANDOFF = "human_handoff"
    INTERNAL = "internal"


class SpanStatus(str, Enum):
    OK = "ok"
    ERROR = "error"
    UNSET = "unset"


class SpanAttributes(BaseModel):
    model_config = {"frozen": True, "extra": "allow"}
    aeos_vendor_runtime: Optional[str] = Field(None, alias="aeos.vendor_runtime")
    aeos_model_provider: Optional[str] = Field(None, alias="aeos.model_provider")
    aeos_model_id: Optional[str] = Field(None, alias="aeos.model_id")
    aeos_input_tokens: Optional[float] = Field(None, alias="aeos.input_tokens")
    aeos_output_tokens: Optional[float] = Field(None, alias="aeos.output_tokens")
    aeos_cost_usd: Optional[float] = Field(None, alias="aeos.cost_usd")
    aeos_hallucination_score: Optional[float] = Field(None, alias="aeos.hallucination_score")
    aeos_tool_name: Optional[str] = Field(None, alias="aeos.tool_name")
    aeos_tool_success: Optional[bool] = Field(None, alias="aeos.tool_success")
    aeos_human_override: Optional[bool] = Field(None, alias="aeos.human_override")


class SpanEvent(BaseModel):
    model_config = {"frozen": True}
    name: str
    timestamp: str
    attributes: Optional[dict[str, Any]] = None


class AeosSpan(BaseModel):
    model_config = {"frozen": True}
    schema_version: Literal["1.0"] = "1.0"
    span_id: str
    trace_id: str
    parent_span_id: Optional[str] = None
    tenant_id: str
    agent_id: str
    uop_id: Optional[str] = None
    decision_id: Optional[str] = None
    name: str
    kind: SpanKind
    start_time: str
    end_time: str
    duration_ms: float
    status: SpanStatus
    attributes: SpanAttributes
    events: list[SpanEvent]


# PATENT: Families 2 & 8
class UefScore(BaseModel):
    model_config = {"frozen": True}
    task_completion: float
    decision_quality: float
    resource_efficiency: float
    compliance_adherence: float
    human_oversight_ratio: float
    error_recovery: float
    knowledge_utilization: float
    coordination_effectiveness: float
    composite: float


class LedgerRowType(str, Enum):
    PREDICTED = "predicted"
    ACTUAL = "actual"
    VARIANCE = "variance"
    ATTRIBUTION = "attribution"
    CORRECTION = "correction"


# PATENT: Families 2 & 8
class PredictedPayload(BaseModel):
    model_config = {"frozen": True}
    type: Literal["predicted"] = "predicted"
    uef_score: UefScore
    predicted_value: float
    predicted_currency: str
    confidence_interval_low: float
    confidence_interval_high: float
    model_version: str


# PATENT: Families 2 & 8
class ActualPayload(BaseModel):
    model_config = {"frozen": True}
    type: Literal["actual"] = "actual"
    sor_connector: str
    sor_record_id: str
    actual_value: float
    actual_currency: str
    sor_timestamp: str


class VarianceBucket(str, Enum):
    WITHIN_TOLERANCE = "within_tolerance"
    POSITIVE_OVERPERFORMANCE = "positive_overperformance"
    NEGATIVE_UNDERPERFORMANCE = "negative_underperformance"
    DATA_QUALITY_ISSUE = "data_quality_issue"
    MODEL_DRIFT = "model_drift"


# PATENT: Families 2 & 8
class VariancePayload(BaseModel):
    model_config = {"frozen": True}
    type: Literal["variance"] = "variance"
    predicted_row_id: str
    actual_row_id: str
    variance_value: float
    variance_pct: float
    variance_bucket: VarianceBucket


# PATENT: Families 2 & 8
class AttributionFactor(BaseModel):
    model_config = {"frozen": True}
    factor_type: str
    contribution_pct: float
    description: str


# PATENT: Families 2 & 8
class AttributionPayload(BaseModel):
    model_config = {"frozen": True}
    type: Literal["attribution"] = "attribution"
    variance_row_id: str
    attribution_factors: list[AttributionFactor]


# PATENT: Families 2 & 8
class CorrectionPayload(BaseModel):
    model_config = {"frozen": True}
    type: Literal["correction"] = "correction"
    corrects_row_id: str
    correction_reason: str
    corrected_by: str
    corrected_at: str


# PATENT: Families 2 & 8 (USPTO #63/898,712) — APPEND-ONLY — do not modify without CTO approval
class LedgerRow(BaseModel):
    model_config = {"frozen": True}
    schema_version: Literal["1.0"] = "1.0"
    id: str
    tenant_id: str
    uop_id: str
    agent_id: str
    contract_id: str
    decision_id: str
    row_type: LedgerRowType
    recorded_at: str
    signed_by_fuzebox: str
    signed_by_rp: str
    payload: Annotated[
        Union[PredictedPayload, ActualPayload, VariancePayload, AttributionPayload, CorrectionPayload],
        Field(discriminator="type"),
    ]


class RecommendationCategory(str, Enum):
    PROMPT_IMPROVEMENT = "prompt_improvement"
    ROUTING_CHANGE = "routing_change"
    TOOL_CONFIGURATION = "tool_configuration"
    HUMAN_OVERSIGHT_ADJUSTMENT = "human_oversight_adjustment"
    MODEL_SWAP = "model_swap"
    COST_OPTIMIZATION = "cost_optimization"
    COMPLIANCE_REMEDIATION = "compliance_remediation"


class Recommendation(BaseModel):
    model_config = {"frozen": True}
    id: str
    tenant_id: str
    uop_id: str
    agent_id: Optional[str] = None
    template_id: str
    title: str
    description: str
    category: RecommendationCategory
    priority: Literal["critical", "high", "medium", "low"]
    estimated_impact_value: Optional[float] = None
    estimated_impact_currency: Optional[str] = None
    status: Literal["open", "in_progress", "adopted", "dismissed"]
    evidence_row_ids: list[str]
    created_at: str
    updated_at: str


# PATENT: Family 8
class ComplianceReadinessScore(BaseModel):
    model_config = {"frozen": True}
    overall: float
    eu_ai_act_article14: Optional[float] = None
    iso_42001: Optional[float] = None
    unece_wp29: Optional[float] = None
    mas_trm: Optional[float] = None
    soc2: Optional[float] = None
    dimension_scores: dict[str, float]


# PATENT: Family 8 — do not modify without CTO approval
class AttestationBundle(BaseModel):
    model_config = {"frozen": True}
    schema_version: Literal["1.0"] = "1.0"
    id: str
    tenant_id: str
    period_start: str
    period_end: str
    compliance_frameworks: list[ComplianceFramework]
    ledger_row_ids: list[str]
    compliance_readiness_score: ComplianceReadinessScore
    signed_by_fuzebox: str
    signed_by_rp: str
    bundle_hash: str
    s3_path: str
    generated_at: str
    status: Literal["draft", "signed", "delivered", "superseded"]
