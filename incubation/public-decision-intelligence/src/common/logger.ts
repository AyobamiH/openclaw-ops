import pino from "pino";
import type { AppEnv } from "../config/env.js";

export function createLogger(env: AppEnv) {
  return pino({
    name: "public-decision-intelligence",
    level: env.LOG_LEVEL,
    base: {
      service: "public-decision-intelligence",
      env: env.NODE_ENV
    }
  });
}
