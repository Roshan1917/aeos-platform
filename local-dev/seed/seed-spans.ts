/**
 * seed-spans.ts — emits a small batch of synthetic AEOS spans to the
 * Telemetry service for local smoke testing.
 *
 * Run after:
 *   1. docker-compose up -d
 *   2. seed-tenant.ts
 *   3. seed-registries.ts          ← creates UoP/process/agent records
 *   4. cd services/telemetry && alembic upgrade head
 *   5. cd services/telemetry && uvicorn src.main:app --port 3003
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../.env') });

const AUTH_SERVICE_URL = process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3002';
const TELEMETRY_URL = process.env['TELEMETRY_URL'] ?? 'http://localhost:3003';

async function getAdminToken(): Promise<{ token: string; tenantId: string }> {
  const res = await fetch(`${AUTH_SERVICE_URL}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@dev-corp.local',
      password: 'DevPassword1234!',
      tenant_slug: 'dev-corp',
    }),
  });
  if (!res.ok) {
    throw new Error(`Auth failed (run seed-tenant.ts first): ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  const [, payloadB64] = data.access_token.split('.');
  const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString()) as {
    tenant_id: string;
  };
  return { token: data.access_token, tenantId: payload.tenant_id };
}

async function listFirstUoP(token: string, tenantId: string): Promise<string | null> {
  const res = await fetch(`${AUTH_SERVICE_URL}/v1/tenants/${tenantId}/uops`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as Array<{ id: string }>;
  return arr[0]?.id ?? null;
}

async function listFirstAgent(token: string, tenantId: string): Promise<string | null> {
  const res = await fetch(`${AUTH_SERVICE_URL}/v1/tenants/${tenantId}/agents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as Array<{ id: string }>;
  return arr[0]?.id ?? null;
}

function now(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function main() {
  const { token, tenantId } = await getAdminToken();
  const uopId = await listFirstUoP(token, tenantId);
  const agentId = await listFirstAgent(token, tenantId);

  if (!uopId || !agentId) {
    console.error('Missing UoP or Agent — run seed-registries.ts first.');
    process.exit(1);
  }

  const traceId = crypto.randomUUID().replace(/-/g, '');
  const decisionId = crypto.randomUUID();

  const spans = [
    {
      schema_version: '1.0',
      span_id: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      trace_id: traceId,
      tenant_id: tenantId,
      agent_id: agentId,
      uop_id: uopId,
      decision_id: decisionId,
      name: 'aeos.llm.call',
      kind: 'llm_call',
      start_time: now(0),
      end_time: now(1234),
      duration_ms: 1234,
      status: 'ok',
      attributes: {
        'aeos.model_provider': 'anthropic',
        'aeos.model_id': 'claude-sonnet-4-6',
        'aeos.input_tokens': 542,
        'aeos.output_tokens': 128,
        'aeos.cost_usd': 0.00321,
      },
      events: [],
    },
    {
      schema_version: '1.0',
      span_id: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      trace_id: traceId,
      tenant_id: tenantId,
      agent_id: agentId,
      uop_id: uopId,
      decision_id: decisionId,
      name: 'aeos.tool.call',
      kind: 'tool_call',
      start_time: now(1234),
      end_time: now(1500),
      duration_ms: 266,
      status: 'ok',
      attributes: {
        'aeos.tool_name': 'sap.create_quote',
        'aeos.tool_success': true,
      },
      events: [],
    },
  ];

  // Ingest now requires a telemetry-issued token, not the substrate user JWT.
  // Honour AEOS_TELEMETRY_TOKEN if pre-set (e.g. by seed-telemetry-token.ts);
  // otherwise mint one inline so this script remains a one-shot smoke test.
  let ingestToken = process.env['AEOS_TELEMETRY_TOKEN'];
  if (!ingestToken) {
    const mintRes = await fetch(`${TELEMETRY_URL}/v1/admin/telemetry-tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'seed-spans' }),
    });
    if (!mintRes.ok) {
      console.error(`Failed to mint telemetry token: ${mintRes.status} ${await mintRes.text()}`);
      process.exit(1);
    }
    ingestToken = ((await mintRes.json()) as { token: string }).token;
  }

  const res = await fetch(`${TELEMETRY_URL}/v1/spans`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ingestToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ spans }),
  });

  const body = await res.text();
  console.log(`POST /v1/spans → ${res.status}`);
  console.log(body);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
