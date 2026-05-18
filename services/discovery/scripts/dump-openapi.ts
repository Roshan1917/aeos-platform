import { buildOpenApiDocument } from '@aeos/openapi-helpers';
import { buildRegistry } from '../src/openapi.js';

process.stdout.write(
  JSON.stringify(
    buildOpenApiDocument({
      title: 'AEOS Discovery',
      version: '0.1.0',
      description: 'LLM-driven business process discovery from uploaded documents.',
      registry: buildRegistry(),
      servers: [{ url: '/', description: 'Current host' }],
    }),
    null,
    2,
  ) + '\n',
);
