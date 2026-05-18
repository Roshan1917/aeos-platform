/**
 * Standalone OpenAPI spec dumper. Lets CI lint the spec without booting the
 * service. Usage: `pnpm openapi:dump > spec.json`.
 */
import { buildOpenApiDocument } from '@aeos/openapi-helpers';
import { buildRegistry } from '../src/openapi.js';

const doc = buildOpenApiDocument({
  title: 'AEOS Substrate',
  version: '0.1.0',
  description: 'Auth, RBAC, Org Management, Agent Identity, and Registry APIs.',
  registry: buildRegistry(),
  servers: [{ url: '/', description: 'Current host' }],
});

process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
