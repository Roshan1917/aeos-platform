/**
 * seed-telemetry-token.ts — mint a telemetry ingest token for the dev tenant.
 *
 * Run after:
 *   1. docker-compose up -d
 *   2. seed-tenant.ts                          ← creates dev tenant + admin
 *   3. cd services/telemetry && alembic upgrade head
 *   4. cd services/telemetry && uvicorn src.main:app --port 3003
 *
 * Logs in as the dev tenant admin via substrate, then calls
 * POST /v1/admin/telemetry-tokens on the telemetry service to mint a token.
 * The raw token is printed to stdout AND appended/replaced in
 * local-dev/.telemetry-token.env (gitignored) so other seed scripts and
 * agent samples can pick it up via:
 *
 *   export $(grep -v '^#' local-dev/.telemetry-token.env | xargs)
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../.env') });

const AUTH_SERVICE_URL = process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3002';
const TELEMETRY_URL = process.env['TELEMETRY_URL'] ?? 'http://localhost:3003';
const TENANT_SLUG = process.env['DEV_TENANT_SLUG'] ?? 'dev-corp';
const ADMIN_EMAIL = process.env['DEV_ADMIN_EMAIL'] ?? 'admin@dev-corp.local';
const ADMIN_PASSWORD = process.env['DEV_ADMIN_PASSWORD'] ?? 'DevPassword1234!';
const TOKEN_NAME = process.env['TELEMETRY_TOKEN_NAME'] ?? 'dev-local';

async function login(): Promise<string> {
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
      `Substrate login failed (${res.status}). Did you run seed-tenant.ts? ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

async function mintToken(adminJwt: string): Promise<string> {
  const res = await fetch(`${TELEMETRY_URL}/v1/admin/telemetry-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: TOKEN_NAME }),
  });
  if (!res.ok) {
    throw new Error(
      `Telemetry token mint failed (${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { token: string; id: string; prefix: string };
  console.log(`  ✓ Minted telemetry ingest token: ${body.prefix} (id=${body.id})`);
  return body.token;
}

async function main() {
  console.log(`[telemetry-token] logging in as ${ADMIN_EMAIL}…`);
  const adminJwt = await login();
  console.log(`[telemetry-token] minting token "${TOKEN_NAME}" via ${TELEMETRY_URL}…`);
  const token = await mintToken(adminJwt);

  const outPath = resolve(__dirname, '../.telemetry-token.env');
  writeFileSync(outPath, `AEOS_TELEMETRY_TOKEN=${token}\n`, { mode: 0o600 });
  console.log(`[telemetry-token] wrote ${outPath}`);
  console.log('');
  console.log('To use in this shell:');
  console.log(`  export $(grep -v '^#' ${outPath} | xargs)`);
  console.log('');
  console.log('Token (store securely — shown only once):');
  console.log(`  ${token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
