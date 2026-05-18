/**
 * Sample agent — calls Anthropic, emits AEOS telemetry spans.
 *
 * Pipeline per run:
 *   1. Auth to substrate as dev-corp admin → JWT + tenant_id
 *   2. Discover first registered agent_id + uop_id (seeded by seed-registries.ts)
 *   3. Call Anthropic messages.create with a tiny sales-quote prompt
 *   4. Emit 2 spans (aeos.decision + aeos.llm.call) along EITHER or BOTH of:
 *        - the telemetry service `/v1/spans` ingest (production pipeline)
 *        - LangFuse `/api/public/otel/v1/traces` direct OTLP push (skips
 *          the telemetry service; useful when telemetry isn't deployed
 *          or to validate a fresh LangFuse stand-up)
 *      If neither destination is configured the run errors at startup.
 *
 * Two preset configurations (see .env.example):
 *   - LOCAL (default):  hits localhost substrate + telemetry; LangFuse mirror
 *                       is handled by the telemetry service.
 *   - STAGING:          point AUTH_SERVICE_URL + TELEMETRY_URL at the
 *                       deployed cluster ingresses, optionally set the
 *                       three LANGFUSE_* knobs to also push directly.
 */
// `override: true` so values in .env beat any pre-exported shell env vars.
// Without this, an inherited AUTH_SERVICE_URL=http://localhost:3002 in the
// terminal will silently win over the staging URL set in .env.
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: true });
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ANTHROPIC_API_KEY = requireEnv('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002';
// Either or both ingest paths can be enabled. Empty / unset = skip.
const TELEMETRY_URL = process.env.TELEMETRY_URL ?? 'http://localhost:3003';
// Telemetry ingest now requires a tenant-scoped ingest token (aeos_tlm_...).
// Mint via POST /v1/admin/telemetry-tokens on the telemetry service as a
// tenant admin. The seed script `seed-telemetry-token.ts` does this for
// local dev and writes the token into .env as AEOS_TELEMETRY_TOKEN.
const TELEMETRY_TOKEN = process.env.AEOS_TELEMETRY_TOKEN ?? '';
const LANGFUSE_HOST = process.env.LANGFUSE_HOST ?? '';
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY ?? '';
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY ?? '';
const TENANT_SLUG = process.env.DEV_TENANT_SLUG ?? 'dev-corp';
const ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL ?? 'admin@dev-corp.local';
const ADMIN_PASSWORD = process.env.DEV_ADMIN_PASSWORD ?? 'DevPassword1234!';

// Approx public list pricing per 1M tokens (USD). Used for demo only — adjust
// if you switch models. Real pricing lives in the Intelligence service.
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

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
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
// Substrate auth + registry lookup
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

async function listFirst<T extends { id: string }>(
  url: string,
  token: string,
  resourceLabel: string,
): Promise<string> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Failed to list ${resourceLabel}: ${res.status} ${await res.text()}`);
  }
  const arr = (await res.json()) as T[];
  const id = arr[0]?.id;
  if (!id) throw new Error(`No ${resourceLabel} found — run seed-registries.ts first`);
  return id;
}

// ---------------------------------------------------------------------------
// Telemetry emission
// ---------------------------------------------------------------------------
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
  kind: 'llm_call' | 'tool_call' | 'agent_decision' | 'human_handoff' | 'internal';
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: 'ok' | 'error';
  attributes: Record<string, string | number | boolean>;
  events: unknown[];
};

async function postSpansToTelemetry(spans: AeosSpan[]): Promise<void> {
  if (!TELEMETRY_URL) return;
  if (!TELEMETRY_TOKEN) {
    throw new Error(
      'AEOS_TELEMETRY_TOKEN is required when TELEMETRY_URL is set. ' +
        'Mint one via POST /v1/admin/telemetry-tokens (or run seed-telemetry-token.ts).',
    );
  }
  const res = await fetch(`${TELEMETRY_URL}/v1/spans`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TELEMETRY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ spans }),
  });
  const body = await res.text();
  console.log(`POST ${TELEMETRY_URL}/v1/spans → ${res.status}`);
  console.log(body);
  if (!res.ok) throw new Error(`Telemetry rejected spans: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Direct push to LangFuse via OTLP/HTTP. Skips the telemetry service entirely.
// Useful when telemetry isn't deployed yet, or to validate a fresh LangFuse
// stand-up against real spans.
//
// LangFuse v3 OTLP ingest path: ${HOST}/api/public/otel/v1/traces
// Auth: HTTP Basic with `${PUBLIC_KEY}:${SECRET_KEY}`.
// ---------------------------------------------------------------------------
type OtlpKeyValue = {
  key: string;
  value:
    | { stringValue: string }
    | { intValue: string }
    | { doubleValue: number }
    | { boolValue: boolean };
};

function attrsToOtlp(attrs: Record<string, string | number | boolean>): OtlpKeyValue[] {
  return Object.entries(attrs).map(([key, v]) => {
    if (typeof v === 'string') return { key, value: { stringValue: v } };
    if (typeof v === 'boolean') return { key, value: { boolValue: v } };
    if (Number.isInteger(v)) return { key, value: { intValue: String(v) } };
    return { key, value: { doubleValue: v as number } };
  });
}

const SPAN_KIND_TO_OTLP: Record<AeosSpan['kind'], number> = {
  llm_call: 3, // CLIENT
  tool_call: 3, // CLIENT
  agent_decision: 1, // INTERNAL
  human_handoff: 1,
  internal: 1,
};

function aeosSpanToOtlp(span: AeosSpan): Record<string, unknown> {
  const startNs = BigInt(new Date(span.start_time).getTime()) * 1_000_000n;
  const endNs = BigInt(new Date(span.end_time).getTime()) * 1_000_000n;
  return {
    traceId: span.trace_id,
    spanId: span.span_id,
    ...(span.parent_span_id ? { parentSpanId: span.parent_span_id } : {}),
    name: span.name,
    kind: SPAN_KIND_TO_OTLP[span.kind] ?? 1,
    startTimeUnixNano: startNs.toString(),
    endTimeUnixNano: endNs.toString(),
    attributes: attrsToOtlp({
      ...span.attributes,
      'aeos.tenant_id': span.tenant_id,
      'aeos.agent_id': span.agent_id,
      'aeos.uop_id': span.uop_id,
      'aeos.decision_id': span.decision_id,
      'aeos.kind': span.kind,
    }),
    status: { code: span.status === 'ok' ? 1 : 2 },
  };
}

async function postSpansToLangFuse(spans: AeosSpan[]): Promise<void> {
  if (!LANGFUSE_HOST || !LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) return;
  const auth = Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64');
  const otlpPayload = {
    resourceSpans: [
      {
        resource: {
          attributes: attrsToOtlp({
            'service.name': 'aeos-anthropic-quote-agent',
            'aeos.sample': 'anthropic-quote-agent',
          }),
        },
        scopeSpans: [
          {
            scope: { name: 'aeos.sample.agent' },
            spans: spans.map(aeosSpanToOtlp),
          },
        ],
      },
    ],
  };
  const res = await fetch(`${LANGFUSE_HOST}/api/public/otel/v1/traces`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(otlpPayload),
  });
  const body = await res.text();
  console.log(`POST ${LANGFUSE_HOST}/api/public/otel/v1/traces → ${res.status}`);
  if (body) console.log(body);
  if (!res.ok) throw new Error(`LangFuse OTLP rejected spans: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('[diag] AUTH_SERVICE_URL =', AUTH_SERVICE_URL);
  console.log('[diag] TELEMETRY_URL   =', TELEMETRY_URL || '(unset)');
  console.log('[diag] LANGFUSE_HOST   =', LANGFUSE_HOST || '(unset)');
  console.log('[1/4] Authenticating to substrate…');
  const { token, tenantId } = await getAdminToken();

  console.log('[2/4] Resolving agent_id + uop_id from registries…');
  const agentId = await listFirst(
    `${AUTH_SERVICE_URL}/v1/tenants/${tenantId}/agents`,
    token,
    'agents',
  );
  const uopId = await listFirst(
    `${AUTH_SERVICE_URL}/v1/tenants/${tenantId}/uops`,
    token,
    'uops',
  );
  console.log(`        tenant=${tenantId} agent=${agentId} uop=${uopId}`);

  console.log(`[3/4] Calling Anthropic (${ANTHROPIC_MODEL})…`);
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const decisionId = crypto.randomUUID();
  const traceId = randTraceId();
  const llmSpanId = randSpanId();
  const decisionSpanId = randSpanId();

  const llmStart = Date.now();
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content:
          'You are a sales assistant. In 2 sentences, draft a quote summary for ' +
          '50 widgets at $19.99 each, 10% volume discount. Plain prose only.',
      },
    ],
  });
  const llmEnd = Date.now();

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost = costUsd(ANTHROPIC_MODEL, inputTokens, outputTokens);

  const summary = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  console.log('---');
  console.log(summary);
  console.log('---');
  console.log(
    `tokens in=${inputTokens} out=${outputTokens} cost=$${cost.toFixed(6)} latency=${
      llmEnd - llmStart
    }ms`,
  );

  console.log('[4/4] Emitting AEOS spans to telemetry service…');

  const llmSpan: AeosSpan = {
    schema_version: '1.0',
    span_id: llmSpanId,
    trace_id: traceId,
    parent_span_id: decisionSpanId,
    tenant_id: tenantId,
    agent_id: agentId,
    uop_id: uopId,
    decision_id: decisionId,
    name: 'aeos.llm.call',
    kind: 'llm_call',
    start_time: new Date(llmStart).toISOString(),
    end_time: new Date(llmEnd).toISOString(),
    duration_ms: llmEnd - llmStart,
    status: 'ok',
    attributes: {
      'aeos.vendor_runtime': 'anthropic_cloud',
      'aeos.model_provider': 'anthropic',
      'aeos.model_id': ANTHROPIC_MODEL,
      'aeos.input_tokens': inputTokens,
      'aeos.output_tokens': outputTokens,
      'aeos.cost_usd': cost,
    },
    events: [],
  };

  const decisionSpan: AeosSpan = {
    schema_version: '1.0',
    span_id: decisionSpanId,
    trace_id: traceId,
    tenant_id: tenantId,
    agent_id: agentId,
    uop_id: uopId,
    decision_id: decisionId,
    name: 'aeos.decision',
    kind: 'agent_decision',
    start_time: nowIso(-1),
    end_time: nowIso(0),
    duration_ms: llmEnd - llmStart,
    status: 'ok',
    attributes: {
      'aeos.decision_success': true,
      'aeos.decision_output_summary': summary.slice(0, 200),
    },
    events: [],
  };

  const spans: AeosSpan[] = [decisionSpan, llmSpan];

  if (!TELEMETRY_URL && !LANGFUSE_HOST) {
    throw new Error(
      'No telemetry destination configured: set TELEMETRY_URL and/or LANGFUSE_HOST (+ LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY).',
    );
  }
  await Promise.all([postSpansToTelemetry(spans), postSpansToLangFuse(spans)]);

  console.log('\nDone. Check:');
  if (LANGFUSE_HOST) {
    console.log(`  LangFuse:  ${LANGFUSE_HOST}/project (Traces — trace_id ${traceId})`);
  }
  if (TELEMETRY_URL) {
    console.log(`  Telemetry: ${TELEMETRY_URL}/v1/traces/${traceId} (with Bearer JWT for query API)`);
    console.log(
      `  Postgres:  psql $TELEMETRY_DATABASE_URL -c "SELECT span_id, name, kind FROM spans WHERE trace_id='${traceId}';"`,
    );
  }
}

main().catch((err) => {
  console.error('Sample agent failed:', err);
  process.exit(1);
});
