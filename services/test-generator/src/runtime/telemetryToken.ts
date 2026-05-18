/**
 * Per-tenant telemetry ingest token store.
 *
 * Telemetry ingest no longer accepts user JWTs — it requires an opaque
 * `aeos_tlm_*` token signed by the telemetry service. Test-generator caches
 * one token per tenant in its own DB so subsequent runs can post spans
 * without prompting the user. The token is minted on-demand the first time
 * a tenant runs a test, using the caller's substrate JWT — which must carry
 * an admin role since `POST /v1/admin/telemetry-tokens` is admin-gated.
 *
 * If the cached token has been revoked upstream we transparently re-mint
 * (caller must still be admin); otherwise the run completes without span
 * mirroring and the executor logs a hint.
 */
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';

const ADMIN_ROLES = new Set(['admin', 'tenant_admin', 'platform_admin']);

export interface CallerIdentity {
  tenantId: string;
  userId: string;
  roles: string[];
  jwt: string;
}

export class TelemetryTokenError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_admin' | 'mint_failed',
  ) {
    super(message);
  }
}

async function mintToken(caller: CallerIdentity): Promise<{ id: string; token: string }> {
  if (!caller.roles.some((r) => ADMIN_ROLES.has(r))) {
    throw new TelemetryTokenError(
      'No telemetry ingest token cached for this tenant. A tenant admin must run a test once (or mint a token in Settings → Telemetry Tokens) before non-admin runs can mirror spans.',
      'not_admin',
    );
  }
  const res = await fetch(`${config.TELEMETRY_URL}/v1/admin/telemetry-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${caller.jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: `test-generator (${caller.userId})` }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new TelemetryTokenError(
      `Telemetry token mint failed: ${res.status} ${body}`,
      'mint_failed',
    );
  }
  const data = (await res.json()) as { id: string; token: string };
  return data;
}

/**
 * Return a usable telemetry ingest token for the caller's tenant. Mints +
 * caches if missing. Throws TelemetryTokenError on misconfiguration.
 */
export async function getOrMintTelemetryToken(caller: CallerIdentity): Promise<string> {
  const existing = await prisma.tenantTelemetryToken.findUnique({
    where: { tenantId: caller.tenantId },
  });
  if (existing) return existing.token;

  const minted = await mintToken(caller);
  await prisma.tenantTelemetryToken.upsert({
    where: { tenantId: caller.tenantId },
    create: {
      tenantId: caller.tenantId,
      tokenId: minted.id,
      token: minted.token,
      createdBy: caller.userId,
    },
    update: {
      tokenId: minted.id,
      token: minted.token,
      createdBy: caller.userId,
    },
  });
  return minted.token;
}

/** Drop the cached token after telemetry rejected it (e.g. revoked upstream). */
export async function invalidateTelemetryToken(tenantId: string): Promise<void> {
  await prisma.tenantTelemetryToken.deleteMany({ where: { tenantId } });
}
