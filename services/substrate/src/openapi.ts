/**
 * OpenAPI registry for the Substrate service.
 *
 * Routes are hand-registered here rather than auto-extracted so the spec stays
 * stable across implementation refactors. Keep this file in sync with
 * `src/api/*.ts` — the CI drift check (`pnpm openapi:check`) catches divergence.
 */
import { OpenAPIRegistry, ErrorSchema, SECURITY_SCHEMES, z } from '@aeos/openapi-helpers';

export function buildRegistry(): OpenAPIRegistry {
  const r = new OpenAPIRegistry();

  r.registerComponent('securitySchemes', 'bearerJwt', SECURITY_SCHEMES.bearerJwt);

  // ── Schemas ────────────────────────────────────────────────────────────────
  const TokenRequest = r.register(
    'TokenRequest',
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
      tenant_slug: z.string().min(1),
    }),
  );

  const TokenResponse = r.register(
    'TokenResponse',
    z.object({
      access_token: z.string(),
      refresh_token: z.string(),
      token_type: z.literal('Bearer'),
      expires_in: z.number().int(),
    }),
  );

  const RefreshRequest = r.register(
    'RefreshRequest',
    z.object({ refresh_token: z.string().min(1) }),
  );

  const Tenant = r.register(
    'Tenant',
    z.object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      status: z.enum(['active', 'suspended']),
      created_at: z.string().datetime(),
    }),
  );

  const User = r.register(
    'User',
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      email: z.string().email(),
      roles: z.array(z.string()),
      status: z.enum(['active', 'suspended']),
    }),
  );

  const RbacCheckRequest = r.register(
    'RbacCheckRequest',
    z.object({
      user: z.string(),
      relation: z.string(),
      object: z.string().describe('Format: <object_type>:<object_id>'),
    }),
  );

  const RbacCheckResponse = r.register('RbacCheckResponse', z.object({ allowed: z.boolean() }));

  const Agent = r.register(
    'Agent',
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      name: z.string(),
      vendor_runtime: z.string().optional(),
      model_id: z.string().optional(),
      created_at: z.string().datetime(),
    }),
  );

  const AgentContract = r.register(
    'AgentContract',
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      agent_id: z.string().uuid(),
      contract_version: z.string(),
      created_at: z.string().datetime(),
    }),
  );

  const UoP = r.register(
    'UoP',
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      name: z.string(),
      kind: z.string(),
    }),
  );

  const Process = r.register(
    'Process',
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      uop_id: z.string().uuid().optional(),
      name: z.string(),
    }),
  );

  r.register('Error', ErrorSchema);

  // ── Auth ───────────────────────────────────────────────────────────────────
  r.registerPath({
    method: 'post',
    path: '/v1/auth/token',
    tags: ['Auth'],
    summary: 'Issue access + refresh JWT',
    request: { body: { content: { 'application/json': { schema: TokenRequest } } } },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: TokenResponse } } },
      401: { description: 'Invalid credentials', content: { 'application/json': { schema: ErrorSchema } } },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/auth/refresh',
    tags: ['Auth'],
    summary: 'Rotate refresh token, return new access + refresh JWT',
    request: { body: { content: { 'application/json': { schema: RefreshRequest } } } },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: TokenResponse } } },
      401: { description: 'Invalid or expired token', content: { 'application/json': { schema: ErrorSchema } } },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/.well-known/jwks.json',
    tags: ['Auth'],
    summary: 'Public JWKS for verifying RS256/EdDSA-signed access tokens',
    responses: {
      200: {
        description: 'JWKS document (empty `keys` array in HMAC mode).',
        content: { 'application/json': { schema: z.object({ keys: z.array(z.record(z.unknown())) }) } },
      },
    },
  });

  // ── Tenants ────────────────────────────────────────────────────────────────
  r.registerPath({
    method: 'post',
    path: '/v1/tenants',
    tags: ['Tenants'],
    summary: 'Create a tenant (platform-admin only)',
    security: [{ bearerJwt: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ slug: z.string(), name: z.string() }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: Tenant } } },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/tenants/{id}',
    tags: ['Tenants'],
    summary: 'Get a tenant by id',
    security: [{ bearerJwt: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: Tenant } } },
      404: { description: 'Not found', content: { 'application/json': { schema: ErrorSchema } } },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/tenants/{id}/settings',
    tags: ['Tenants'],
    summary: 'Get tenant settings',
    security: [{ bearerJwt: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.record(z.unknown()) } } },
    },
  });

  r.registerPath({
    method: 'patch',
    path: '/v1/tenants/{id}/settings',
    tags: ['Tenants'],
    summary: 'Update tenant settings',
    security: [{ bearerJwt: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: z.record(z.unknown()) } } },
    },
    responses: { 200: { description: 'OK' } },
  });

  // ── Users ──────────────────────────────────────────────────────────────────
  r.registerPath({
    method: 'post',
    path: '/v1/users',
    tags: ['Users'],
    summary: 'Create a user within the caller’s tenant',
    security: [{ bearerJwt: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              email: z.string().email(),
              password: z.string().min(8),
              roles: z.array(z.string()).default([]),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: User } } },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/users',
    tags: ['Users'],
    summary: 'List users in caller’s tenant',
    security: [{ bearerJwt: [] }],
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.array(User) } } },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/users/{id}',
    tags: ['Users'],
    summary: 'Get user by id (must be in caller’s tenant)',
    security: [{ bearerJwt: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: User } } },
    },
  });

  // ── RBAC ───────────────────────────────────────────────────────────────────
  r.registerPath({
    method: 'post',
    path: '/v1/rbac/check',
    tags: ['RBAC'],
    summary: 'OpenFGA permission check',
    description: 'Used internally by `@aeos/auth-client`. Returns `{ allowed: boolean }`.',
    security: [{ bearerJwt: [] }],
    request: { body: { content: { 'application/json': { schema: RbacCheckRequest } } } },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: RbacCheckResponse } } },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/rbac/write',
    tags: ['RBAC'],
    summary: 'Write OpenFGA relationship tuples (admin only)',
    security: [{ bearerJwt: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              writes: z.array(RbacCheckRequest).optional(),
              deletes: z.array(RbacCheckRequest).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'OK' } },
  });

  // ── Agents + Contracts ─────────────────────────────────────────────────────
  r.registerPath({
    method: 'get',
    path: '/v1/agents',
    tags: ['Agents'],
    summary: 'List agents in tenant',
    security: [{ bearerJwt: [] }],
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.array(Agent) } } },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/agents',
    tags: ['Agents'],
    summary: 'Register a new agent',
    security: [{ bearerJwt: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z.string(),
              vendor_runtime: z.string().optional(),
              model_id: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: Agent } } },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/agents/{id}',
    tags: ['Agents'],
    summary: 'Get agent by id',
    security: [{ bearerJwt: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: Agent } } },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/agent-contracts',
    tags: ['Agents'],
    summary: 'Create an agent contract',
    description: '**PATENT-ADJACENT** — schema changes require CTO approval.',
    security: [{ bearerJwt: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              agent_id: z.string().uuid(),
              contract_version: z.string(),
              spec: z.record(z.unknown()),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: AgentContract } } },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/agent-contracts/{id}',
    tags: ['Agents'],
    summary: 'Get an agent contract',
    security: [{ bearerJwt: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: AgentContract } } },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/agent-contracts/{id}/verify',
    tags: ['Agents'],
    summary: 'Verify agent identity against a contract',
    security: [{ bearerJwt: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.object({ valid: z.boolean() }) } } },
    },
  });

  // ── Registries (UoP / Process / Agent) ─────────────────────────────────────
  r.registerPath({
    method: 'get',
    path: '/v1/tenants/{id}/uops',
    tags: ['Registries'],
    summary: 'List UoPs (Units of Potential) for a tenant',
    description: '**PATENT-ADJACENT** — `UoP` schema changes require CTO approval.',
    security: [{ bearerJwt: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.array(UoP) } } },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/tenants/{id}/uops',
    tags: ['Registries'],
    summary: 'Register a UoP (Assessment service only)',
    security: [{ bearerJwt: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({ name: z.string(), kind: z.string() }),
          },
        },
      },
    },
    responses: { 201: { description: 'Created', content: { 'application/json': { schema: UoP } } } },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/tenants/{id}/processes',
    tags: ['Registries'],
    summary: 'List business processes',
    security: [{ bearerJwt: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.array(Process) } } },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/tenants/{id}/processes',
    tags: ['Registries'],
    summary: 'Register a process (Discovery service only)',
    security: [{ bearerJwt: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({ name: z.string(), uop_id: z.string().uuid().optional() }),
          },
        },
      },
    },
    responses: { 201: { description: 'Created', content: { 'application/json': { schema: Process } } } },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/tenants/{id}/agents',
    tags: ['Registries'],
    summary: 'List agents (registry view)',
    security: [{ bearerJwt: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.array(Agent) } } },
    },
  });

  return r;
}
