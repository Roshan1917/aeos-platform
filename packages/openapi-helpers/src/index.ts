import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import type { Request, Response, RequestHandler } from 'express';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';

// `OpenApiGeneratorV31.generateDocument` returns `OpenAPIObject` from
// openapi3-ts/oas31, which pnpm hoists to a `.pnpm/...` path that cannot
// appear in the generated .d.ts. Treat the spec opaquely at the boundary;
// consumers serialize it to JSON and never read its structure in TS.
export type OpenApiDocument = Record<string, unknown>;

extendZodWithOpenApi(z);

export { OpenAPIRegistry, z };
export type { OpenAPIRegistry as Registry };

export const SECURITY_SCHEMES = {
  bearerJwt: {
    type: 'http' as const,
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Substrate-issued JWT. Obtain via `POST /v1/auth/token` against the substrate service.',
  },
  ingestToken: {
    type: 'http' as const,
    scheme: 'bearer',
    bearerFormat: 'aeos_tlm_<payload>.<hmac>',
    description: 'Telemetry-issued ingest token. Mint via substrate-JWT-authenticated `POST /v1/admin/telemetry-tokens`.',
  },
};

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'invalid_request' }),
    message: z.string().optional().openapi({ example: 'Field `tenant_id` is required.' }),
  })
  .openapi('Error');

export const PaginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .openapi('Pagination');

export interface DocsRouterOptions {
  title: string;
  version: string;
  description?: string;
  registry: OpenAPIRegistry;
  servers?: Array<{ url: string; description?: string }>;
  /**
   * If provided, gates `/openapi.json` and `/docs` behind this middleware.
   * Pass auth-client's `requireAuth()` in prod, or undefined in non-prod.
   */
  requireAuth?: RequestHandler;
}

export function buildOpenApiDocument(opts: DocsRouterOptions): OpenApiDocument {
  const generator = new OpenApiGeneratorV31(opts.registry.definitions);
  const doc = generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: opts.title,
      version: opts.version,
      description: opts.description,
    },
    servers: opts.servers,
  });
  return doc as unknown as OpenApiDocument;
}

/**
 * Returns an Express Router exposing:
 *   GET /openapi.json  — the generated spec
 *   GET /docs          — Swagger UI rendering the spec
 *
 * Mount at the service root: `app.use(createDocsRouter({ ... }))`.
 */
export function createDocsRouter(opts: DocsRouterOptions): Router {
  const router = Router();
  const document = buildOpenApiDocument(opts);

  const gates: RequestHandler[] = opts.requireAuth ? [opts.requireAuth] : [];

  router.get('/openapi.json', ...gates, (_req: Request, res: Response) => {
    res.json(document);
  });

  router.use('/docs', ...gates, swaggerUi.serve);
  router.get(
    '/docs',
    ...gates,
    swaggerUi.setup(document, {
      customSiteTitle: `${opts.title} — API Docs`,
      swaggerOptions: { persistAuthorization: true },
    }),
  );

  return router;
}
