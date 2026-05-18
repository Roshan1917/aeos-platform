/**
 * Sample agent — emits a full "Lead Qualification Flow" trace to AEOS telemetry.
 *
 * The flow is the one seeded by `local-dev/seed/seed-registries.ts`:
 *
 *   step-1  Inbound Lead Received        (automated)  → internal span
 *   step-2  Agent Qualifies Lead         (agent)      → llm_call span (real Anthropic call)
 *   step-3  Human Reviews Borderline     (human)      → human_handoff span (aeos.human_override = true)
 *   step-4  Update Salesforce            (automated)  → internal span
 *
 * All four step spans are children of one root `aeos.decision` (agent_decision)
 * span and share a single trace_id + decision_id, so the trace renders as one
 * tree in LangFuse / the Postgres `spans` table.
 *
 * Pipeline per run:
 *   1. Auth to substrate as dev-corp admin → JWT + tenant_id
 *   2. Resolve the Lead Qualifier agent_id and Qualify-Inbound-Lead uop_id by name
 *   3. Synthesize a fake inbound lead payload
 *   4. Call Anthropic for a qualification verdict (real tokens + cost)
 *   5. Simulate a human reviewer approving / rejecting the borderline case
 *   6. POST 5 spans (1 root decision + 4 step spans) to telemetry /v1/spans
 *
 * View results in:
 *   - Postgres: SELECT * FROM spans WHERE trace_id = '<printed>' ORDER BY start_time;
 *   - LangFuse UI: http://localhost:3001 (project for tenant dev-corp)
 *   - Kafka: aeos.{tenant_id}.telemetry.telemetry.span.enriched
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ANTHROPIC_API_KEY = requireEnv('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002';
const TELEMETRY_URL = process.env.TELEMETRY_URL ?? 'http://localhost:3003';
// Telemetry ingest tokens (aeos_tlm_...) replace the substrate user JWT for
// posting spans. Mint via POST /v1/admin/telemetry-tokens as a tenant admin
// (or run local-dev/seed/seed-telemetry-token.ts).
const TELEMETRY_TOKEN = requireEnv('AEOS_TELEMETRY_TOKEN');
const TENANT_SLUG = process.env.DEV_TENANT_SLUG ?? 'dev-corp';
const ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL ?? 'admin@dev-corp.local';
const ADMIN_PASSWORD = process.env.DEV_ADMIN_PASSWORD ?? 'DevPassword1234!';
const AGENT_NAME = process.env.LEAD_AGENT_NAME ?? 'Lead Qualifier';
const UOP_NAME = process.env.LEAD_UOP_NAME ?? 'Qualify Inbound Lead';
const PROCESS_NAME = process.env.LEAD_PROCESS_NAME ?? 'Lead Qualification Flow';
const HUMAN_VERDICT = (process.env.HUMAN_VERDICT ?? 'auto').toLowerCase();

const MODEL_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

function randSpanId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function randTraceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING_USD_PER_MTOK[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Substrate auth + registry lookups
// ---------------------------------------------------------------------------
async function getAdminToken(): Promise<{ token: string; tenantId: string }> {
  const res = await fetch(`${AUTH_SERVICE_URL}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      tenant_slug: TENANT_SLUG,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Substrate auth failed (${res.status}). Did you run seed-tenant.ts? ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { access_token: string };
  const payloadB64 = body.access_token.split('.')[1]!;
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
    tenant_id: string;
  };
  return { token: body.access_token, tenantId: payload.tenant_id };
}

async function findByName<T extends { id: string; name: string }>(
  url: string,
  token: string,
  name: string,
  resourceLabel: string,
): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Failed to list ${resourceLabel}: ${res.status} ${await res.text()}`);
  }
  const arr = (await res.json()) as T[];
  const hit = arr.find((x) => x.name === name);
  if (!hit) {
    const names = arr.map((x) => x.name).join(', ') || '<empty>';
    throw new Error(
      `${resourceLabel} "${name}" not found — run seed-registries.ts. Available: ${names}`,
    );
  }
  return hit;
}

// ---------------------------------------------------------------------------
// Span shape (matches AeosSpan from @aeos/canonical-schema)
// ---------------------------------------------------------------------------
type SpanKind = 'llm_call' | 'tool_call' | 'agent_decision' | 'human_handoff' | 'internal';

type AeosSpan = {
  schema_version: '1.0';
  span_id: string;
  trace_id: string;
  parent_span_id?: string;
  tenant_id: string;
  agent_id: string;
  uop_id: string;
  decision_id: string;
  name: string;
  kind: SpanKind;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: 'ok' | 'error';
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: string; attributes?: Record<string, unknown> }>;
};

async function postSpans(spans: AeosSpan[]): Promise<void> {
  const res = await fetch(`${TELEMETRY_URL}/v1/spans`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TELEMETRY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ spans }),
  });
  const body = await res.text();
  console.log(`POST /v1/spans → ${res.status}`);
  console.log(body);
  if (!res.ok) throw new Error(`Telemetry rejected spans: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Synthetic inbound lead — what step-1 (Salesforce automation) would produce
// ---------------------------------------------------------------------------
type InboundLead = {
  lead_id: string;
  full_name: string;
  email: string;
  company: string;
  title: string;
  employee_count: number;
  annual_revenue_usd: number;
  industry: string;
  source: string;
  notes: string;
};

function syntheticLead(): InboundLead {
  return {
    lead_id: `LEAD-${crypto.randomInt(100_000, 999_999)}`,
    full_name: 'Priya Subramanian',
    email: 'priya@northstar-logistics.example',
    company: 'NorthStar Logistics',
    title: 'VP of Operations',
    employee_count: 320,
    annual_revenue_usd: 48_000_000,
    industry: 'Transportation & Logistics',
    source: 'webinar_q2_ai_in_supply_chain',
    notes: 'Asked detailed questions about multi-warehouse routing and SLA reporting.',
  };
}

// ---------------------------------------------------------------------------
// Step 2 — agent qualification via Anthropic
// ---------------------------------------------------------------------------
type Qualification = {
  verdict: 'qualified' | 'unqualified' | 'borderline';
  score: number; // 0..1
  rationale: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  startedAt: number;
  endedAt: number;
};

async function qualifyLead(lead: InboundLead): Promise<Qualification> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const startedAt = Date.now();

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 400,
    system:
      'You qualify inbound B2B leads for an AI-platform sales team. Respond ONLY with strict JSON ' +
      'matching {"verdict": "qualified"|"unqualified"|"borderline", "score": <0..1>, "rationale": "<1 sentence>"}. ' +
      'Use "borderline" when employee_count is 200-500 OR annual_revenue is between $25M and $75M.',
    messages: [
      {
        role: 'user',
        content: `Qualify this lead:\n${JSON.stringify(lead, null, 2)}`,
      },
    ],
  });
  const endedAt = Date.now();

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  let parsed: { verdict: Qualification['verdict']; score: number; rationale: string };
  try {
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    parsed = { verdict: 'borderline', score: 0.5, rationale: text.slice(0, 200) };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  return {
    verdict: parsed.verdict,
    score: parsed.score,
    rationale: parsed.rationale,
    inputTokens,
    outputTokens,
    costUsd: costUsd(ANTHROPIC_MODEL, inputTokens, outputTokens),
    startedAt,
    endedAt,
  };
}

// ---------------------------------------------------------------------------
// Step 3 — simulated human reviewer (only fires on borderline cases)
// ---------------------------------------------------------------------------
type HumanReview = {
  approved: boolean;
  reviewer_email: string;
  comment: string;
  startedAt: number;
  endedAt: number;
};

async function humanReview(q: Qualification): Promise<HumanReview> {
  const startedAt = Date.now();
  // Pretend the reviewer takes a few hundred ms (a real impl would await a
  // queue / Slack interaction — see sdk/adapters/human-workflow).
  await new Promise((r) => setTimeout(r, 250));
  const endedAt = Date.now();

  let approved: boolean;
  if (HUMAN_VERDICT === 'approve') approved = true;
  else if (HUMAN_VERDICT === 'reject') approved = false;
  else approved = q.score >= 0.6;

  return {
    approved,
    reviewer_email: 'sdr-manager@dev-corp.local',
    comment: approved
      ? `Override: agent score ${q.score.toFixed(2)} — sending to AE.`
      : `Override: agent score ${q.score.toFixed(2)} — recycle to nurture.`,
    startedAt,
    endedAt,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('[1/6] Authenticating to substrate…');
  const { token, tenantId } = await getAdminToken();

  console.log('[2/6] Resolving registry IDs by name…');
  const agent = await findByName<{ id: string; name: string }>(
    `${AUTH_SERVICE_URL}/v1/tenants/${tenantId}/agents`,
    token,
    AGENT_NAME,
    'Agent',
  );
  const uop = await findByName<{ id: string; name: string }>(
    `${AUTH_SERVICE_URL}/v1/tenants/${tenantId}/uops`,
    token,
    UOP_NAME,
    'UoP',
  );
  const proc = await findByName<{ id: string; name: string }>(
    `${AUTH_SERVICE_URL}/v1/tenants/${tenantId}/processes`,
    token,
    PROCESS_NAME,
    'Process',
  );
  console.log(
    `        tenant=${tenantId} agent=${agent.id} uop=${uop.id} process=${proc.id}`,
  );

  const traceId = randTraceId();
  const decisionId = crypto.randomUUID();
  console.log(`        trace_id=${traceId} decision_id=${decisionId}`);

  // Common attribute bag — every span in this trace ties back to the same
  // process + decision so they aggregate cleanly downstream.
  const baseAttrs = (stepId: string, stepName: string) => ({
    'aeos.process_name': PROCESS_NAME,
    'aeos.process_id_hint': proc.id,
    'aeos.step_id': stepId,
    'aeos.step_name': stepName,
  });

  // ── Step 1 — Inbound Lead Received (automated) ─────────────────────────────
  console.log('[3/6] Step 1: Inbound lead received…');
  const lead = syntheticLead();
  const step1Start = Date.now();
  await new Promise((r) => setTimeout(r, 25));
  const step1End = Date.now();

  const step1SpanId = randSpanId();
  const decisionSpanId = randSpanId();

  // ── Step 2 — Agent Qualifies Lead (real Anthropic call) ───────────────────
  console.log(`[4/6] Step 2: Calling Anthropic (${ANTHROPIC_MODEL}) to qualify…`);
  const q = await qualifyLead(lead);
  console.log(
    `        verdict=${q.verdict} score=${q.score.toFixed(2)} ` +
      `tokens in=${q.inputTokens} out=${q.outputTokens} cost=$${q.costUsd.toFixed(6)}`,
  );
  console.log(`        rationale: ${q.rationale}`);
  const step2SpanId = randSpanId();

  // ── Step 3 — Human reviews borderline cases ───────────────────────────────
  let review: HumanReview | null = null;
  let step3SpanId: string | null = null;
  if (q.verdict === 'borderline') {
    console.log('[5/6] Step 3: Borderline — simulating human reviewer…');
    review = await humanReview(q);
    step3SpanId = randSpanId();
    console.log(
      `        ${review.approved ? 'APPROVED' : 'REJECTED'} by ${review.reviewer_email}`,
    );
  } else {
    console.log(`[5/6] Step 3: Skipped — verdict is ${q.verdict}, no human review.`);
  }

  // ── Step 4 — Update Salesforce (automated) ────────────────────────────────
  console.log('[6/6] Step 4: Updating Salesforce…');
  const step4Start = Date.now();
  await new Promise((r) => setTimeout(r, 25));
  const step4End = Date.now();
  const step4SpanId = randSpanId();

  const finalDecision = review ? (review.approved ? 'qualified' : 'unqualified') : q.verdict;

  // ── Build the trace ───────────────────────────────────────────────────────
  const decisionStart = step1Start;
  const decisionEnd = step4End;

  const decisionSpan: AeosSpan = {
    schema_version: '1.0',
    span_id: decisionSpanId,
    trace_id: traceId,
    tenant_id: tenantId,
    agent_id: agent.id,
    uop_id: uop.id,
    decision_id: decisionId,
    name: 'aeos.decision',
    kind: 'agent_decision',
    start_time: isoAt(decisionStart),
    end_time: isoAt(decisionEnd),
    duration_ms: decisionEnd - decisionStart,
    status: 'ok',
    attributes: {
      'aeos.process_name': PROCESS_NAME,
      'aeos.process_id_hint': proc.id,
      'aeos.decision_success': finalDecision === 'qualified',
      'aeos.decision_output_summary': `final=${finalDecision} agent_verdict=${q.verdict} score=${q.score.toFixed(2)}`,
      'aeos.lead_id': lead.lead_id,
      'aeos.lead_company': lead.company,
      'aeos.human_override': review !== null,
    },
    events: [],
  };

  const step1Span: AeosSpan = {
    schema_version: '1.0',
    span_id: step1SpanId,
    trace_id: traceId,
    parent_span_id: decisionSpanId,
    tenant_id: tenantId,
    agent_id: agent.id,
    uop_id: uop.id,
    decision_id: decisionId,
    name: 'aeos.step.inbound_lead_received',
    kind: 'internal',
    start_time: isoAt(step1Start),
    end_time: isoAt(step1End),
    duration_ms: step1End - step1Start,
    status: 'ok',
    attributes: {
      ...baseAttrs('step-1', 'Inbound Lead Received'),
      'aeos.step_type': 'automated',
      'aeos.system_of_record': 'salesforce',
      'aeos.lead_id': lead.lead_id,
      'aeos.lead_company': lead.company,
      'aeos.lead_employee_count': lead.employee_count,
      'aeos.lead_annual_revenue_usd': lead.annual_revenue_usd,
      'aeos.lead_industry': lead.industry,
      'aeos.lead_source': lead.source,
    },
    events: [
      {
        name: 'lead.payload',
        timestamp: isoAt(step1Start),
        attributes: { lead },
      },
    ],
  };

  const step2Span: AeosSpan = {
    schema_version: '1.0',
    span_id: step2SpanId,
    trace_id: traceId,
    parent_span_id: decisionSpanId,
    tenant_id: tenantId,
    agent_id: agent.id,
    uop_id: uop.id,
    decision_id: decisionId,
    name: 'aeos.llm.call',
    kind: 'llm_call',
    start_time: isoAt(q.startedAt),
    end_time: isoAt(q.endedAt),
    duration_ms: q.endedAt - q.startedAt,
    status: 'ok',
    attributes: {
      ...baseAttrs('step-2', 'Agent Qualifies Lead'),
      'aeos.step_type': 'agent',
      'aeos.vendor_runtime': 'anthropic_cloud',
      'aeos.model_provider': 'anthropic',
      'aeos.model_id': ANTHROPIC_MODEL,
      'aeos.input_tokens': q.inputTokens,
      'aeos.output_tokens': q.outputTokens,
      'aeos.cost_usd': q.costUsd,
      'aeos.qualification_verdict': q.verdict,
      'aeos.qualification_score': q.score,
      'aeos.qualification_rationale': q.rationale.slice(0, 500),
    },
    events: [],
  };

  const step3Span: AeosSpan | null =
    review && step3SpanId
      ? {
          schema_version: '1.0',
          span_id: step3SpanId,
          trace_id: traceId,
          parent_span_id: decisionSpanId,
          tenant_id: tenantId,
          agent_id: agent.id,
          uop_id: uop.id,
          decision_id: decisionId,
          name: 'aeos.human.handoff',
          kind: 'human_handoff',
          start_time: isoAt(review.startedAt),
          end_time: isoAt(review.endedAt),
          duration_ms: review.endedAt - review.startedAt,
          status: 'ok',
          attributes: {
            ...baseAttrs('step-3', 'Human Reviews Borderline Cases'),
            'aeos.step_type': 'human',
            'aeos.vendor_runtime': 'human_workflow',
            'aeos.human_override': true,
            'aeos.human_reviewer': review.reviewer_email,
            'aeos.human_decision': review.approved ? 'approved' : 'rejected',
            'aeos.human_comment': review.comment,
            'aeos.agent_score_at_handoff': q.score,
          },
          events: [
            {
              name: review.approved ? 'human.approved' : 'human.rejected',
              timestamp: isoAt(review.endedAt),
              attributes: { reviewer: review.reviewer_email, comment: review.comment },
            },
          ],
        }
      : null;

  const step4Span: AeosSpan = {
    schema_version: '1.0',
    span_id: step4SpanId,
    trace_id: traceId,
    parent_span_id: decisionSpanId,
    tenant_id: tenantId,
    agent_id: agent.id,
    uop_id: uop.id,
    decision_id: decisionId,
    name: 'aeos.step.salesforce_update',
    kind: 'internal',
    start_time: isoAt(step4Start),
    end_time: isoAt(step4End),
    duration_ms: step4End - step4Start,
    status: 'ok',
    attributes: {
      ...baseAttrs('step-4', 'Update Salesforce'),
      'aeos.step_type': 'automated',
      'aeos.system_of_record': 'salesforce',
      'aeos.sor_object_type': 'Lead',
      'aeos.lead_id': lead.lead_id,
      'aeos.final_decision': finalDecision,
      'aeos.converted_to_opportunity': finalDecision === 'qualified',
    },
    events: [],
  };

  const spans: AeosSpan[] = [decisionSpan, step1Span, step2Span];
  if (step3Span) spans.push(step3Span);
  spans.push(step4Span);

  console.log(`\nEmitting ${spans.length} spans to telemetry…`);
  await postSpans(spans);

  console.log('\nDone. Inspect:');
  console.log(`  trace_id:  ${traceId}`);
  console.log(`  decision:  ${decisionId}`);
  console.log(`  LangFuse:  http://localhost:3001  (project for tenant ${TENANT_SLUG})`);
  console.log(
    `  Postgres:  psql $TELEMETRY_DATABASE_URL -c "SELECT span_id, name, kind, ` +
      `attributes->>'aeos.step_id' AS step FROM spans WHERE trace_id='${traceId}' ` +
      `ORDER BY start_time;"`,
  );
}

main().catch((err) => {
  console.error('Lead-qualification sample failed:', err);
  process.exit(1);
});
