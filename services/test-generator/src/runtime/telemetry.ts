/**
 * Posts a batch of synthetic AeosSpans to the Telemetry service.
 *
 * Auth: telemetry-issued ingest token resolved via `telemetryToken.ts`. The
 * telemetry service no longer accepts user JWTs on `POST /v1/spans`. The
 * token is tenant-scoped and signed by telemetry; tenant_id is read from
 * the token, so this service does not pass it explicitly.
 *
 * Mirroring is best-effort. If we cannot obtain a token (e.g. non-admin
 * caller and no cached token for the tenant) or telemetry is unreachable,
 * the run still completes — we just skip the trace mirror and log a hint.
 */
import { config } from '../config.js';
import type { SpanPayload } from '../lib/spans.js';
import {
  TelemetryTokenError,
  getOrMintTelemetryToken,
  invalidateTelemetryToken,
  type CallerIdentity,
} from './telemetryToken.js';

export async function postSpans(
  caller: CallerIdentity,
  spans: SpanPayload[],
): Promise<void> {
  let token: string;
  try {
    token = await getOrMintTelemetryToken(caller);
  } catch (err) {
    if (err instanceof TelemetryTokenError) {
      console.warn(`[test-generator] telemetry mirror skipped: ${err.message}`);
      return;
    }
    console.warn(
      '[test-generator] telemetry mirror skipped (token resolve failed):',
      (err as Error).message,
    );
    return;
  }

  const send = async (bearer: string) =>
    fetch(`${config.TELEMETRY_URL}/v1/spans`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ spans }),
    });

  try {
    let res = await send(token);
    if (res.status === 401) {
      // Cached token was rejected (likely revoked or signing-secret rotated).
      // Drop it and try minting a fresh one in the same call so this run still
      // mirrors. If the caller isn't admin, getOrMintTelemetryToken throws and
      // we fall through to the warn-and-skip branch below.
      await invalidateTelemetryToken(caller.tenantId);
      try {
        const fresh = await getOrMintTelemetryToken(caller);
        res = await send(fresh);
      } catch (err) {
        console.warn(
          `[test-generator] telemetry mirror skipped after 401: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return;
      }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[test-generator] telemetry mirror skipped: ${res.status} ${body}`);
    }
  } catch (err) {
    console.warn(
      `[test-generator] telemetry mirror skipped (unreachable):`,
      (err as Error).message,
    );
  }
}
