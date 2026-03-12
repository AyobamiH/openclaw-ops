import type { AppEnv } from "../config/env.js";

export interface QueueAdapter {
  kind: "pg-boss";
  schema: string;
}

export function createQueueAdapter(env: AppEnv): QueueAdapter {
  return {
    kind: "pg-boss",
    schema: env.PG_BOSS_SCHEMA
  };
}
