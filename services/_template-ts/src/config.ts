import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PLATFORM_ENV: z.enum(['local', 'non-prod', 'prod']).default('local'),

  // Postgres
  DATABASE_URL: z.string().url(),

  // Auth
  AUTH_JWT_SECRET: z.string().min(1),
  AUTH_SERVICE_URL: z.string().url(),

  // Kafka
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_SSL: z.coerce.boolean().default(false),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),

  // Registry
  REGISTRY_URL: z.string().url(),

  // OTEL
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

  // Service name — set to the actual service name in each service's .env
  SERVICE_NAME: z.string().default('aeos-service-template'),
});

const result = ConfigSchema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid configuration:', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = result.data;
export type Config = typeof config;
