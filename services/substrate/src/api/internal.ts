/**
 * Internal signing endpoints — not exposed externally (cluster-internal only).
 * Enforced at the ingress/network policy layer; no external-facing auth needed.
 *
 * POST /internal/sign/ledger-row    — co-sign a LedgerRow hash
 * POST /internal/sign/attestation   — co-sign an AttestationBundle hash
 */
import { Router } from 'express';
import { z } from 'zod';
import { createHmac } from 'node:crypto';
import { config } from '../config.js';

export const internalRouter = Router();

// In production this would use Ed25519 private key from SIGNING_PRIVATE_KEY_B64.
// In local dev we use HMAC-SHA256 with the JWT secret as a simple placeholder.
function signHash(payload: string): string {
  if (config.SIGNING_PRIVATE_KEY_B64) {
    // TODO: implement Ed25519 signing using the base64-encoded private key
    // const privateKey = Buffer.from(config.SIGNING_PRIVATE_KEY_B64, 'base64');
    // return sign(null, Buffer.from(payload), privateKey).toString('base64');
  }
  // Local dev fallback
  return createHmac('sha256', config.AUTH_JWT_SECRET).update(payload).digest('base64');
}

// ── POST /internal/sign/ledger-row ────────────────────────────────────────────

const signLedgerRowSchema = z.object({
  ledger_row_id: z.string().min(1),
  tenant_id: z.string().min(1),
  row_hash: z.string().min(1), // SHA-256 hex of the canonical serialised LedgerRow
});

internalRouter.post('/ledger-row', async (req, res) => {
  const body = signLedgerRowSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  const payload = `ledger-row:${body.data.tenant_id}:${body.data.ledger_row_id}:${body.data.row_hash}`;
  const signature = signHash(payload);

  res.json({
    ledger_row_id: body.data.ledger_row_id,
    signed_by_fuzebox: signature,
  });
});

// ── POST /internal/sign/attestation ──────────────────────────────────────────

const signAttestationSchema = z.object({
  attestation_id: z.string().min(1),
  tenant_id: z.string().min(1),
  bundle_hash: z.string().min(1),
});

internalRouter.post('/attestation', async (req, res) => {
  const body = signAttestationSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  const payload = `attestation:${body.data.tenant_id}:${body.data.attestation_id}:${body.data.bundle_hash}`;
  const signature = signHash(payload);

  res.json({
    attestation_id: body.data.attestation_id,
    signed_by_fuzebox: signature,
  });
});
