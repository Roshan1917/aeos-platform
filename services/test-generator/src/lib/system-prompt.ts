/**
 * System prompt asking Claude to emit a JSON-only TestCase plan.
 * Output must validate against `testCasePlanSchema` in `./schema.ts`.
 */
export const TEST_CASE_SYSTEM_PROMPT = `You design synthetic AEOS agent process traces for QA.

You will receive a free-form scenario description from a tester. Return a JSON
object describing an ordered list of process steps that exercises the AEOS
telemetry pipeline. Mix step kinds so that all observable span types appear.

The JSON must conform exactly to this shape (no extra fields, no commentary):

{
  "title": string,
  "description": string,
  "agent_hint": string,
  "uop_hint": string,
  "steps": Array<TestStep>
}

TestStep is a discriminated union on "kind":

LLM call:
  { "kind": "llm_call",
    "name": string (e.g. "aeos.llm.call"),
    "model_provider": "anthropic" | "openai" | "google" | "aws",
    "model_id": string,
    "prompt_summary": string,
    "input_tokens": number,
    "output_tokens": number,
    "cost_usd": number,
    "duration_ms": number,
    "status": "ok" | "error" }

Tool call:
  { "kind": "tool_call",
    "name": string (e.g. "aeos.tool.call"),
    "tool_name": string (e.g. "salesforce.create_lead"),
    "tool_args": object,
    "tool_success": boolean,
    "tool_error": string (only if tool_success is false),
    "duration_ms": number,
    "status": "ok" | "error" }

Human handoff (always emits an aeos.human_override span):
  { "kind": "human_handoff",
    "name": string (e.g. "aeos.human_override"),
    "prompt": string (what the human is asked to decide),
    "expected_decision": "approve" | "reject",
    "override_reason": string,
    "duration_ms": number,
    "status": "ok" | "error" }

Agent decision (typically the final summary span of the trace):
  { "kind": "agent_decision",
    "name": "aeos.decision",
    "success": boolean,
    "output_summary": string,
    "duration_ms": number,
    "status": "ok" | "error" }

Rules:
- Output ONLY JSON. No prose, no markdown code fences.
- Include at least one step of each kind unless the user's prompt clearly
  excludes one (e.g. "no human steps").
- Order the steps to tell a coherent story. The last step is usually an
  agent_decision summarising the overall outcome.
- Token counts and costs should be plausible (200-2000 input tokens, 50-500
  output tokens, USD cost = (input_tokens * 0.000003) + (output_tokens * 0.000015)
  rounded to 6 decimals — these are illustrative values for synthetic spans).
- Durations: LLM calls 500-3000 ms, tool calls 50-800 ms, human handoffs
  2000-30000 ms, agent decisions 50-200 ms.
- Keep "name" fields short and use the conventional aeos.* names above.`;

export interface FewShotExample {
  prompt: string;
  plan: object;
}

export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    prompt:
      'Lead qualification: classify a new lead, look it up in Salesforce, ask a human if it looks suspicious, then return a decision.',
    plan: {
      title: 'Lead qualification with human review',
      description:
        'Agent classifies an inbound lead, enriches via CRM, escalates a borderline case to a human reviewer, then issues a final decision.',
      agent_hint: 'lead-qualification-agent',
      uop_hint: 'lead.qualify',
      steps: [
        {
          kind: 'llm_call',
          name: 'aeos.llm.call',
          model_provider: 'anthropic',
          model_id: 'claude-sonnet-4-6',
          prompt_summary: 'Classify lead intent and quality from raw email body.',
          input_tokens: 612,
          output_tokens: 184,
          cost_usd: 0.004596,
          duration_ms: 1320,
          status: 'ok',
        },
        {
          kind: 'tool_call',
          name: 'aeos.tool.call',
          tool_name: 'salesforce.lookup_account',
          tool_args: { domain: 'acme.example' },
          tool_success: true,
          duration_ms: 220,
          status: 'ok',
        },
        {
          kind: 'human_handoff',
          name: 'aeos.human_override',
          prompt: 'Lead score borderline (0.62). Approve auto-routing to AE?',
          expected_decision: 'reject',
          override_reason: 'reviewer_blocked_low_confidence',
          duration_ms: 18450,
          status: 'ok',
        },
        {
          kind: 'agent_decision',
          name: 'aeos.decision',
          success: false,
          output_summary: 'Lead held for manual review per human override.',
          duration_ms: 80,
          status: 'ok',
        },
      ],
    },
  },
];
