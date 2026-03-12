import type { AppEnv } from "../config/env.js";

export interface DatabaseAdapter {
  kind: "postgres";
  connectionString: string;
  vectorSearchEnabled: boolean;
}

export function createDatabaseAdapter(env: AppEnv): DatabaseAdapter {
  return {
    kind: "postgres",
    connectionString: env.DATABASE_URL,
    vectorSearchEnabled: env.PGVECTOR_ENABLED
  };
}
