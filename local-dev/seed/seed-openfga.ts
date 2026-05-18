#!/usr/bin/env tsx
/**
 * seed-openfga.ts
 *
 * Creates the AEOS authorization model in OpenFGA and writes bootstrap
 * relationship tuples for the dev tenant.
 *
 * Run after OpenFGA is up:
 *   pnpm tsx seed/seed-openfga.ts
 *
 * Requires OpenFGA running on http://localhost:8080 (see docker-compose.yml).
 */

const OPENFGA_URL = process.env['OPENFGA_URL'] ?? 'http://localhost:8080';
const DEV_TENANT_ID = process.env['DEV_TENANT_ID'] ?? 'tenant_dev_001';
const DEV_ADMIN_USER_ID = process.env['DEV_ADMIN_USER_ID'] ?? 'user_dev_admin';

// ── Authorization model ───────────────────────────────────────────────────────
// ReBAC model using OpenFGA DSL (JSON schema form)
// Object types: tenant, user, agent, uop, ledger_row, recommendation, attestation
// Relations: reader, writer, admin, owner

const AUTH_MODEL = {
  schema_version: '1.1',
  type_definitions: [
    {
      type: 'user',
      relations: {},
      metadata: { relations: {} },
    },
    {
      type: 'tenant',
      relations: {
        owner: { this: {} },
        admin: {
          union: {
            child: [
              { this: {} },
              { computedUserset: { relation: 'owner' } },
            ],
          },
        },
        member: {
          union: {
            child: [
              { this: {} },
              { computedUserset: { relation: 'admin' } },
            ],
          },
        },
      },
      metadata: {
        relations: {
          owner: { directly_related_user_types: [{ type: 'user' }] },
          admin: { directly_related_user_types: [{ type: 'user' }] },
          member: { directly_related_user_types: [{ type: 'user' }] },
        },
      },
    },
    {
      type: 'agent',
      relations: {
        tenant: { this: {} },
        reader: {
          union: {
            child: [
              { this: {} },
              { tupleToUserset: { tupleset: { relation: 'tenant' }, computedUserset: { relation: 'member' } } },
            ],
          },
        },
        writer: {
          union: {
            child: [
              { this: {} },
              { tupleToUserset: { tupleset: { relation: 'tenant' }, computedUserset: { relation: 'admin' } } },
            ],
          },
        },
      },
      metadata: {
        relations: {
          tenant: { directly_related_user_types: [{ type: 'tenant' }] },
          reader: { directly_related_user_types: [{ type: 'user' }] },
          writer: { directly_related_user_types: [{ type: 'user' }] },
        },
      },
    },
    {
      type: 'uop',
      relations: {
        tenant: { this: {} },
        reader: {
          tupleToUserset: {
            tupleset: { relation: 'tenant' },
            computedUserset: { relation: 'member' },
          },
        },
        writer: {
          tupleToUserset: {
            tupleset: { relation: 'tenant' },
            computedUserset: { relation: 'admin' },
          },
        },
      },
      metadata: {
        relations: {
          tenant: { directly_related_user_types: [{ type: 'tenant' }] },
          reader: { directly_related_user_types: [] },
          writer: { directly_related_user_types: [] },
        },
      },
    },
    {
      type: 'ledger_row',
      relations: {
        tenant: { this: {} },
        reader: {
          tupleToUserset: {
            tupleset: { relation: 'tenant' },
            computedUserset: { relation: 'member' },
          },
        },
        // LedgerRow is append-only — no write relation (INSERT only via service)
      },
      metadata: {
        relations: {
          tenant: { directly_related_user_types: [{ type: 'tenant' }] },
          reader: { directly_related_user_types: [] },
        },
      },
    },
    {
      type: 'recommendation',
      relations: {
        tenant: { this: {} },
        reader: {
          tupleToUserset: {
            tupleset: { relation: 'tenant' },
            computedUserset: { relation: 'member' },
          },
        },
        writer: {
          tupleToUserset: {
            tupleset: { relation: 'tenant' },
            computedUserset: { relation: 'admin' },
          },
        },
      },
      metadata: {
        relations: {
          tenant: { directly_related_user_types: [{ type: 'tenant' }] },
          reader: { directly_related_user_types: [] },
          writer: { directly_related_user_types: [] },
        },
      },
    },
    {
      type: 'attestation',
      relations: {
        tenant: { this: {} },
        reader: {
          tupleToUserset: {
            tupleset: { relation: 'tenant' },
            computedUserset: { relation: 'member' },
          },
        },
      },
      metadata: {
        relations: {
          tenant: { directly_related_user_types: [{ type: 'tenant' }] },
          reader: { directly_related_user_types: [] },
        },
      },
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fgaPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${OPENFGA_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenFGA ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[seed-openfga] Connecting to ${OPENFGA_URL}...`);

  // 1. Create a store
  const storeRes = await fgaPost('/stores', { name: 'aeos-local' }) as { id: string };
  const storeId = storeRes.id;
  console.log(`[seed-openfga] Created store: ${storeId}`);

  // 2. Write authorization model
  const modelRes = await fgaPost(`/stores/${storeId}/authorization-models`, AUTH_MODEL) as { authorization_model_id: string };
  const modelId = modelRes.authorization_model_id;
  console.log(`[seed-openfga] Created authorization model: ${modelId}`);

  // 3. Write bootstrap tuples for dev tenant
  await fgaPost(`/stores/${storeId}/write`, {
    writes: {
      tuple_keys: [
        // Dev admin user is owner of dev tenant
        {
          user: `user:${DEV_ADMIN_USER_ID}`,
          relation: 'owner',
          object: `tenant:${DEV_TENANT_ID}`,
        },
      ],
    },
    authorization_model_id: modelId,
  });
  console.log(`[seed-openfga] Wrote bootstrap tuples for dev tenant ${DEV_TENANT_ID}`);

  console.log('');
  console.log('[seed-openfga] ✓ Done. Add these to your .env:');
  console.log(`  OPENFGA_STORE_ID=${storeId}`);
  console.log(`  OPENFGA_MODEL_ID=${modelId}`);
  console.log(`  OPENFGA_API_URL=${OPENFGA_URL}`);
}

main().catch((err) => {
  console.error('[seed-openfga] Failed:', err);
  process.exit(1);
});
