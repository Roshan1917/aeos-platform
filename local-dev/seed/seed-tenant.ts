/**
 * seed-tenant.ts — creates the dev tenant + admin user via substrate API
 *
 * Run after:
 *   1. docker-compose up -d
 *   2. pnpm prisma migrate dev (in services/substrate)
 *   3. seed-openfga.ts
 *
 * Uses a locally-signed platform_admin JWT (AUTH_JWT_SECRET from .env) to
 * call POST /v1/tenants, which atomically creates the tenant + bootstrap admin.
 */
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../.env') });
import crypto from 'node:crypto';

const AUTH_SERVICE_URL = process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3002';
const AUTH_JWT_SECRET = process.env['AUTH_JWT_SECRET'];

if (!AUTH_JWT_SECRET) {
  console.error('AUTH_JWT_SECRET not set. Copy local-dev/.env.example to local-dev/.env first.');
  process.exit(1);
}

/**
 * Generate a short-lived platform_admin HS256 JWT using the shared HMAC secret.
 * No external JWT library needed — uses Node built-in crypto.
 */
function bootstrapAdminToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'system-bootstrap',
      tenant_id: 'system',
      roles: ['platform_admin'],
      type: 'access',
      iat: now,
      exp: now + 300, // 5 minutes
    }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', AUTH_JWT_SECRET!).update(data).digest('base64url');
  return `${data}.${sig}`;
}

async function jsonPost(path: string, body: unknown, token: string): Promise<Response> {
  return fetch(`${AUTH_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function seedTenant(): Promise<void> {
  console.log('Seeding dev tenant via substrate API...');

  const adminToken = bootstrapAdminToken();

  // ── Create dev tenant (also creates bootstrap admin user) ─────────────────
  const tenantRes = await jsonPost(
    '/v1/tenants',
    {
      name: 'Dev Corp',
      slug: 'dev-corp',
      deployment_mode: 'pooled',
      admin_email: 'admin@dev-corp.local',
      admin_password: 'DevPassword1234!',   // local dev only — not a secret
      admin_display_name: 'Dev Admin',
    },
    adminToken,
  );

  if (tenantRes.status === 409) {
    console.log('  ✓ Tenant dev-corp already exists — skipping');
  } else if (!tenantRes.ok) {
    const body = await tenantRes.text();
    throw new Error(`Failed to create tenant: ${tenantRes.status} ${body}`);
  } else {
    const tenant = await tenantRes.json() as { id: string; name: string; slug: string };
    console.log(`  ✓ Tenant created: ${tenant.name} (id=${tenant.id}, slug=${tenant.slug})`);
    console.log(`  ✓ Admin user: admin@dev-corp.local / DevPassword1234!`);
  }

  // ── Create additional dev users (analyst, viewer) ──────────────────────────
  // First get an admin JWT for the dev tenant by logging in
  const tokenRes = await fetch(`${AUTH_SERVICE_URL}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@dev-corp.local',
      password: 'DevPassword1234!',
      tenant_slug: 'dev-corp',
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.warn(`  ! Could not log in as dev admin (may be expected on first run): ${body}`);
    console.log('Tenant seed complete (partial — dev users not created).');
    return;
  }

  const { access_token } = await tokenRes.json() as { access_token: string };

  const devUsers: Array<{ email: string; password: string; display_name: string; roles: string[] }> = [
    { email: 'analyst@dev-corp.local', password: 'DevPassword1234!', display_name: 'Dev Analyst', roles: ['member', 'analyst'] },
    { email: 'viewer@dev-corp.local', password: 'DevPassword1234!', display_name: 'Dev Viewer', roles: ['member'] },
  ];

  for (const u of devUsers) {
    const userRes = await jsonPost('/v1/users', u, access_token);
    if (userRes.status === 409) {
      console.log(`  ✓ User ${u.email} already exists — skipping`);
    } else if (!userRes.ok) {
      console.warn(`  ! Could not create user ${u.email}: ${userRes.status}`);
    } else {
      const user = await userRes.json() as { id: string; email: string };
      console.log(`  ✓ User created: ${user.email} (id=${user.id})`);
    }
  }

  console.log('\nTenant seed complete.');
  console.log('  Dev credentials:');
  console.log('    admin@dev-corp.local / DevPassword1234!');
  console.log('    analyst@dev-corp.local / DevPassword1234!');
  console.log('    viewer@dev-corp.local / DevPassword1234!');
}

seedTenant().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
