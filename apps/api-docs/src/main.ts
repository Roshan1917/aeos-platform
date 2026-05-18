import { createApiReference } from '@scalar/api-reference';
import '@scalar/api-reference/style.css';

/**
 * Per-service OpenAPI spec URLs.
 *
 * Resolution:
 *   - In dev (`pnpm dev`), Vite proxies `/api/<svc>/openapi.json` to the
 *     local backend ports (see vite.config.ts).
 *   - In staging/prod, the portal is served behind the same ingress as the
 *     services and uses the absolute `/api/<svc>/...` path that the ingress
 *     rewrites to the upstream service.
 */
type Service = {
  slug: string;
  name: string;
  url: string;
  description?: string;
};

const services: Service[] = [
  {
    slug: 'substrate',
    name: 'Substrate',
    url: '/api/substrate/openapi.json',
    description: 'Auth + RBAC + Org Management + Agent Identity + Registries',
  },
  {
    slug: 'telemetry',
    name: 'Telemetry',
    url: '/api/telemetry/openapi.json',
    description: 'OTel span ingestion, classification, enrichment, LangFuse mirror',
  },
  {
    slug: 'recommendations',
    name: 'Recommendations',
    url: '/api/recommendations/openapi.json',
    description: 'Variance → templated recommendations with status lifecycle',
  },
  {
    slug: 'discovery',
    name: 'Discovery',
    url: '/api/discovery/openapi.json',
    description: 'LLM-driven business process discovery from documents',
  },
  {
    slug: 'test-generator',
    name: 'Test-Case Generator',
    url: '/api/test-generator/openapi.json',
    description: 'Internal QA — LLM-generated synthetic agent traces',
  },
];

const container = document.getElementById('app');
if (!container) throw new Error('#app element missing');

createApiReference(container, {
  theme: 'default',
  layout: 'modern',
  hideClientButton: false,
  showSidebar: true,
  metaData: {
    title: 'AEOS Platform — API Reference',
    description:
      'Aggregated, browser-based API reference for the six AEOS services. Pick a service from the sidebar.',
  },
  sources: services.map((s) => ({
    slug: s.slug,
    title: s.name,
    url: s.url,
  })),
});
