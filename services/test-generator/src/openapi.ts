import { OpenAPIRegistry, ErrorSchema, SECURITY_SCHEMES, z } from '@aeos/openapi-helpers';

export function buildRegistry(): OpenAPIRegistry {
  const r = new OpenAPIRegistry();
  r.registerComponent('securitySchemes', 'bearerJwt', SECURITY_SCHEMES.bearerJwt);
  r.register('Error', ErrorSchema);

  const StepKind = z.enum(['llm_call', 'tool_call', 'human_handoff', 'agent_decision']);
  const TestCasePlan = r.register(
    'TestCasePlan',
    z.object({
      name: z.string(),
      agent_name: z.string().optional(),
      uop_name: z.string().optional(),
      steps: z.array(
        z.object({
          kind: StepKind,
          name: z.string(),
          expected_decision: z.string().optional(),
          tokens_in: z.number().int().optional(),
          tokens_out: z.number().int().optional(),
          cost_usd: z.number().optional(),
          duration_ms: z.number().int().optional(),
        }),
      ),
    }),
  );

  const TestCase = r.register(
    'TestCase',
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      name: z.string(),
      plan: TestCasePlan,
      created_at: z.string().datetime(),
    }),
  );

  const ExecuteRequest = r.register(
    'ExecuteRequest',
    z.object({
      mode: z.enum(['synthetic', 'live']).default('synthetic'),
      human_mode: z.enum(['auto', 'interactive']).default('auto'),
      agent_id: z.string().uuid().optional(),
      uop_id: z.string().uuid().optional(),
    }),
  );

  const RunState = r.register(
    'RunState',
    z.object({
      run_id: z.string().uuid(),
      test_case_id: z.string().uuid(),
      status: z.enum(['pending', 'running', 'awaiting_human', 'succeeded', 'failed']),
      mode: z.enum(['synthetic', 'live']),
      human_mode: z.enum(['auto', 'interactive']),
      started_at: z.string().datetime(),
      finished_at: z.string().datetime().optional(),
      events: z.array(z.record(z.unknown())),
    }),
  );

  const sec = [{ bearerJwt: [] }];

  r.registerPath({
    method: 'post',
    path: '/v1/test-cases/generate',
    tags: ['Generation'],
    summary: 'LLM-generate a TestCasePlan from a natural-language prompt',
    description: 'Calls Anthropic to produce a structured plan. Does NOT persist.',
    security: sec,
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              prompt: z.string().min(1),
              num_steps: z.number().int().min(1).max(20).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: TestCasePlan } } } },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/test-cases',
    tags: ['Test Cases'],
    summary: 'Save a TestCasePlan',
    security: sec,
    request: { body: { content: { 'application/json': { schema: z.object({ name: z.string(), plan: TestCasePlan }) } } } },
    responses: { 201: { description: 'Created', content: { 'application/json': { schema: TestCase } } } },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/test-cases',
    tags: ['Test Cases'],
    summary: 'List test cases for caller’s tenant',
    security: sec,
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.array(TestCase) } } } },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/test-cases/{id}',
    tags: ['Test Cases'],
    summary: 'Get a saved test case',
    security: sec,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: TestCase } } } },
  });

  r.registerPath({
    method: 'delete',
    path: '/v1/test-cases/{id}',
    tags: ['Test Cases'],
    summary: 'Delete a saved test case',
    security: sec,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 204: { description: 'Deleted' } },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/test-cases/{id}/execute',
    tags: ['Execution'],
    summary: 'Start a run — emits spans to the Telemetry service',
    security: sec,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: ExecuteRequest } } },
    },
    responses: {
      202: {
        description: 'Run started',
        content: { 'application/json': { schema: z.object({ run_id: z.string().uuid() }) } },
      },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/runs/{run_id}',
    tags: ['Execution'],
    summary: 'Get current run state + event history',
    security: sec,
    request: { params: z.object({ run_id: z.string().uuid() }) },
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: RunState } } } },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/runs/{run_id}/events',
    tags: ['Execution'],
    summary: 'Server-sent event stream for a run',
    security: sec,
    request: { params: z.object({ run_id: z.string().uuid() }) },
    responses: {
      200: {
        description: 'text/event-stream of run events',
        content: { 'text/event-stream': { schema: z.string() } },
      },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/runs/{run_id}/decisions',
    tags: ['Execution'],
    summary: 'Supply a human decision for an interactive run',
    security: sec,
    request: {
      params: z.object({ run_id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().optional() }),
          },
        },
      },
    },
    responses: { 200: { description: 'Accepted' } },
  });

  return r;
}
