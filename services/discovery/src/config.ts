import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PLATFORM_ENV: z.enum(['local', 'non-prod', 'prod']).default('local'),
  SERVICE_NAME: z.string().default('discovery'),
  PORT: z.coerce.number().default(3006),

  DATABASE_URL: z.string().min(1),

  AUTH_JWT_SECRET: z.string().min(32),
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  SUBSTRATE_URL: z.string().url().default('http://localhost:3002'),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  DOCUMENT_STORAGE_PATH: z
    .string()
    .default('/app/services/discovery/uploads/documents'),

  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_SSL: z.string().default('false'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('[discovery] Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
