import { buildOpenApiDocument } from '@aeos/openapi-helpers';
import { buildRegistry } from '../src/openapi.js';

process.stdout.write(
  JSON.stringify(
    buildOpenApiDocument({
      title: 'AEOS Test-Case Generator',
      version: '0.1.0',
      description: 'Internal LLM-driven generator + executor for synthetic AEOS agent traces.',
      registry: buildRegistry(),
      servers: [{ url: '/', description: 'Current host' }],
    }),
    null,
    2,
  ) + '\n',
);
