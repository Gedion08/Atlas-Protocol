import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z
    .string()
    .default("postgres://postgres:postgres@localhost:5432/atlas"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  CLICKHOUSE_URL: z.string().default("http://localhost:8123"),
  CLICKHOUSE_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  ORACLE_LOOP_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  ORACLE_LOOP_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  ORACLE_SUSPEND_THRESHOLD: z.coerce.number().int().min(0).max(100).default(40),
  /** Solana oracle signer keypair as a JSON array of numbers (CLI id.json format). */
  ORACLE_KEYPAIR: z.string().optional(),
  /** Governance keypair for the on-chain circuit breaker (set_status). */
  GOVERNANCE_KEYPAIR: z.string().optional(),
  CIRCUIT_BREAKER_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  CIRCUIT_BREAKER_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  ATLAS_REGISTRY_PROGRAM_ID: z
    .string()
    .default("CgLpJydFMSrkAHLjhmEZX3pFF4M5BC8CY36ajBe2bvTs"),
  /** on-chain atlas-vault program id (deployed on devnet). */
  ATLAS_VAULT_PROGRAM_ID: z
    .string()
    .default("BeEtwSTYjPs47ZWa4joMppCNdJs4f4GRumCRtKXfSfSR"),
  /** on-chain governance program id (deployed on devnet). */
  ATLAS_GOVERNANCE_PROGRAM_ID: z
    .string()
    .default("5fcfpz4DK8G4HbPMyX259fgotXJaE4v7yNhXidRAtWnD"),
  KAFKA_BROKERS: z.string().default("localhost:9092"),
  KAFKA_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  REPOSITORY_DRIVER: z.enum(["memory", "postgres"]).default("memory"),
  /** Apply pending SQL migrations at backend startup when using the postgres driver. */
  DB_AUTO_MIGRATE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  /** Seed demo data on startup only when the database is empty (postgres driver). */
  DB_AUTO_SEED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  CORS_ORIGINS: z.string().default("*"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  HELIUS_WEBHOOK_SECRET: z.string().optional(),
  HELIUS_WEBHOOK_SIGNATURE_HEADER: z.string().default("x-webhook-signature"),
  HELIUS_API_KEY: z.string().default(""),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  METRICS_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(overrides: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(overrides);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

export const env = loadEnv();
