import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PLATFORM_ENV: z.enum(['local', 'non-prod', 'prod']).default('local'),
  SERVICE_NAME: z.string().default('test-generator'),
  PORT: z.coerce.number().default(3005),

  DATABASE_URL: z.string().min(1),

  AUTH_JWT_SECRET: z.string().min(32),
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:3002'),

  TELEMETRY_URL: z.string().url().default('http://localhost:3003'),
  // Telemetry ingest token (aeos_tlm_...). Required for span mirroring;
  // telemetry no longer accepts user JWTs on POST /v1/spans. Mint via the
  // Settings → Telemetry Tokens UI as a tenant admin. If unset, runs still
  // complete but spans are not mirrored to the platform telemetry pipeline.
  AEOS_TELEMETRY_TOKEN: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('[test-generator] Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
