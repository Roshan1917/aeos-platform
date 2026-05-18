import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('substrate'),
  PORT: z.coerce.number().default(3002),

  // Database
  DATABASE_URL: z.string().min(1),

  // JWT — substrate issues tokens using this secret (HS256 in local dev)
  // In production this becomes an RSA key pair (substrate signs, others verify via JWKS)
  AUTH_JWT_SECRET: z.string().min(32),
  AUTH_JWT_EXPIRY_SECONDS: z.coerce.number().default(3600),          // 1 hour
  AUTH_REFRESH_EXPIRY_SECONDS: z.coerce.number().default(604800),    // 7 days

  // OpenFGA
  OPENFGA_API_URL: z.string().url().default('http://localhost:8080'),
  OPENFGA_STORE_ID: z.string().min(1),
  OPENFGA_MODEL_ID: z.string().min(1),

  // Kafka (for registry events)
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_SSL: z.string().default('false'),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),

  // Signing key for LedgerRow + Attestation co-signatures (base64-encoded Ed25519 private key)
  SIGNING_PRIVATE_KEY_B64: z.string().optional(),

  // Redis (session cache)
  REDIS_URL: z.string().default('redis://:aeos_dev_redis@localhost:6379'),

  // OTEL
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318/v1/traces'),
  PLATFORM_ENV: z.string().default('local'),

  // Hint emitted in agent-definition exports so downstream runtimes know
  // where to push AeosSpans. Not authoritative; agents still mint their own
  // ingest tokens via the telemetry service.
  AEOS_TELEMETRY_URL_HINT: z.string().default('http://localhost:3003'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('[substrate] Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
