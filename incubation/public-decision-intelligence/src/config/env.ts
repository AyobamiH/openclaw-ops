import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4310),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  LEDGER_DRIVER: z.enum(["filesystem"]).default("filesystem"),
  FILESYSTEM_LEDGER_PATH: z.string().min(1),
  DATABASE_URL: z.string().min(1).default("postgres://placeholder"),
  PGVECTOR_ENABLED: z.coerce.boolean().default(true),
  PG_BOSS_SCHEMA: z.string().default("job_queue"),
  OBJECT_STORAGE_DRIVER: z.enum(["s3", "filesystem"]).default("s3"),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  OBJECT_STORAGE_BASE_DIR: z.string().min(1),
  INGESTION_TMP_DIR: z.string().min(1),
  MAX_SOURCE_FILE_MB: z.coerce.number().int().positive().default(250),
  OCR_FALLBACK_ENABLED: z.coerce.boolean().default(true),
  REVIEW_REQUIRED_FOR_PUBLISH: z.coerce.boolean().default(true),
  PUBLIC_API_ENABLED: z.coerce.boolean().default(false)
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(input);
}
