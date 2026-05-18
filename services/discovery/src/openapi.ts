import { OpenAPIRegistry, ErrorSchema, SECURITY_SCHEMES, z } from '@aeos/openapi-helpers';

export function buildRegistry(): OpenAPIRegistry {
  const r = new OpenAPIRegistry();
  r.registerComponent('securitySchemes', 'bearerJwt', SECURITY_SCHEMES.bearerJwt);
  r.register('Error', ErrorSchema);

  const Connector = r.register(
    'Connector',
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      name: z.string(),
      type: z.literal('document_only'),
      created_at: z.string().datetime(),
    }),
  );

  const Document = r.register(
    'Document',
    z.object({
      filename: z.string(),
      size_bytes: z.number().int(),
      content_type: z.string(),
      uploaded_at: z.string().datetime(),
    }),
  );

  const RunStatus = z.enum([
    'pending',
    'running',
    'awaiting_input',
    'succeeded',
    'failed',
    'cancelled',
  ]);

  const Run = r.register(
    'Run',
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      connector_id: z.string().uuid(),
      status: RunStatus,
      started_at: z.string().datetime(),
      finished_at: z.string().datetime().optional(),
      progress: z.record(z.unknown()).optional(),
      pending_questions: z.array(z.string()).optional(),
    }),
  );

  const Suggestion = r.register(
    'Suggestion',
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      run_id: z.string().uuid(),
      name: z.string(),
      description: z.string(),
      proposed_steps: z.array(z.record(z.unknown())),
      automation_score: z.number().min(0).max(1).optional(),
      status: z.enum(['proposed', 'refined', 'applied', 'rejected']),
    }),
  );

  const sec = [{ bearerJwt: [] }];

  // Connectors
  r.registerPath({
    method: 'post',
    path: '/v1/discovery/connectors',
    tags: ['Connectors'],
    summary: 'Create a document_only connector',
    security: sec,
    request: { body: { content: { 'application/json': { schema: z.object({ name: z.string() }) } } } },
    responses: { 201: { description: 'Created', content: { 'application/json': { schema: Connector } } } },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/discovery/connectors',
    tags: ['Connectors'],
    summary: 'List connectors for caller’s tenant',
    security: sec,
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.array(Connector) } } } },
  });

  for (const op of ['get', 'patch', 'delete'] as const) {
    r.registerPath({
      method: op,
      path: '/v1/discovery/connectors/{id}',
      tags: ['Connectors'],
      summary:
        op === 'get' ? 'Get connector' : op === 'patch' ? 'Update connector' : 'Delete connector',
      security: sec,
      request: {
        params: z.object({ id: z.string().uuid() }),
        ...(op === 'patch'
          ? {
              body: {
                content: {
                  'application/json': {
                    schema: z.object({ name: z.string().optional() }),
                  },
                },
              },
            }
          : {}),
      },
      responses: {
        [op === 'delete' ? 204 : 200]: {
          description: op === 'delete' ? 'Deleted' : 'OK',
          ...(op === 'delete'
            ? {}
            : { content: { 'application/json': { schema: Connector } } }),
        },
      },
    });
  }

  // Documents
  r.registerPath({
    method: 'post',
    path: '/v1/discovery/connectors/{id}/documents',
    tags: ['Documents'],
    summary: 'Upload one or more documents (multipart)',
    description: 'Accepted: PDF, DOCX, XLSX, TXT, CSV, JPG, PNG.',
    security: sec,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'multipart/form-data': {
            schema: z.object({ file: z.any().describe('binary file upload') }),
          },
        },
      },
    },
    responses: { 201: { description: 'Uploaded', content: { 'application/json': { schema: z.array(Document) } } } },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/discovery/connectors/{id}/documents',
    tags: ['Documents'],
    summary: 'List documents on a connector',
    security: sec,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.array(Document) } } } },
  });

  r.registerPath({
    method: 'delete',
    path: '/v1/discovery/connectors/{id}/documents/{filename}',
    tags: ['Documents'],
    summary: 'Delete a document',
    security: sec,
    request: { params: z.object({ id: z.string().uuid(), filename: z.string() }) },
    responses: { 204: { description: 'Deleted' } },
  });

  // Runs
  r.registerPath({
    method: 'post',
    path: '/v1/discovery/connectors/{id}/run',
    tags: ['Runs'],
    summary: 'Start a discovery run (fire-and-forget)',
    security: sec,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      202: {
        description: 'Run started',
        content: { 'application/json': { schema: z.object({ run_id: z.string().uuid() }) } },
      },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/v1/discovery/runs/{runId}',
    tags: ['Runs'],
    summary: 'Get run status + ephemeral progress',
    security: sec,
    request: { params: z.object({ runId: z.string().uuid() }) },
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: Run } } } },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/discovery/runs/{runId}/answer',
    tags: ['Runs'],
    summary: 'Answer interactive questions for an awaiting_input run',
    security: sec,
    request: {
      params: z.object({ runId: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({ answers: z.array(z.object({ question: z.string(), answer: z.string() })) }),
          },
        },
      },
    },
    responses: { 200: { description: 'OK' } },
  });

  r.registerPath({
    method: 'post',
    path: '/v1/discovery/runs/{runId}/skip',
    tags: ['Runs'],
    summary: 'Skip remaining interactive questions',
    security: sec,
    request: { params: z.object({ runId: z.string().uuid() }) },
    responses: { 200: { description: 'OK' } },
  });

  // Suggestions
  r.registerPath({
    method: 'get',
    path: '/v1/discovery/runs/{runId}/suggestions',
    tags: ['Suggestions'],
    summary: 'List suggestions for a run',
    security: sec,
    request: { params: z.object({ runId: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: z.array(Suggestion) } } },
    },
  });

  r.registerPath({
    method: 'patch',
    path: '/v1/discovery/suggestions/{id}',
    tags: ['Suggestions'],
    summary: 'Update suggestion status or proposed_steps',
    security: sec,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              status: z.enum(['proposed', 'refined', 'applied', 'rejected']).optional(),
              proposed_steps: z.array(z.record(z.unknown())).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: Suggestion } } } },
  });

  for (const action of ['refine', 'questions', 'analyze'] as const) {
    r.registerPath({
      method: 'post',
      path: `/v1/discovery/suggestions/{id}/${action}`,
      tags: ['Suggestions'],
      summary:
        action === 'refine'
          ? 'LLM-refine the suggestion'
          : action === 'questions'
          ? 'Generate analysis questions'
          : 'Run automation analysis',
      security: sec,
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: Suggestion } } },
      },
    });
  }

  r.registerPath({
    method: 'post',
    path: '/v1/discovery/suggestions/{id}/apply',
    tags: ['Suggestions'],
    summary: 'Register the suggestion as a canonical Process in substrate',
    security: sec,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({ uop_id: z.string().uuid() }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: z.object({ process_id: z.string().uuid() }) } },
      },
    },
  });

  return r;
}
