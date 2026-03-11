import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { OrchestratorConfig } from "./types.js";

const DEFAULT_CONFIG_URL = new URL(
  "../../orchestrator_config.json",
  import.meta.url,
);

function parseCsvEnv(name: string): string[] | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parsed.length > 0 ? Array.from(new Set(parsed)) : [];
}

function parseBooleanEnv(name: string): boolean | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(
    `${name} must be one of: true|false|1|0|yes|no|on|off`,
  );
}

function parseIntegerEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid integer`);
  }
  return parsed;
}

export async function loadConfig(
  customPath?: string,
): Promise<OrchestratorConfig> {
  const path =
    customPath ??
    process.env.ORCHESTRATOR_CONFIG ??
    fileURLToPath(DEFAULT_CONFIG_URL);

  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw);

  // Allow env-var overrides for local dev (config bakes in Docker paths)
  if (process.env.STATE_FILE) parsed.stateFile = process.env.STATE_FILE;
  if (process.env.MILESTONE_FEED_PATH)
    parsed.milestoneFeedPath = process.env.MILESTONE_FEED_PATH;
  if (process.env.MILESTONE_INGEST_URL) {
    parsed.milestoneIngestUrl = process.env.MILESTONE_INGEST_URL;
  }
  if (process.env.DEMAND_SUMMARY_INGEST_URL) {
    parsed.demandSummaryIngestUrl = process.env.DEMAND_SUMMARY_INGEST_URL;
  }

  const corsAllowedOrigins = parseCsvEnv("ORCHESTRATOR_CORS_ALLOWED_ORIGINS");
  if (corsAllowedOrigins !== undefined) {
    parsed.corsAllowedOrigins = corsAllowedOrigins;
  }
  const corsAllowedMethods = parseCsvEnv("ORCHESTRATOR_CORS_ALLOWED_METHODS");
  if (corsAllowedMethods !== undefined) {
    parsed.corsAllowedMethods = corsAllowedMethods;
  }
  const corsAllowedHeaders = parseCsvEnv("ORCHESTRATOR_CORS_ALLOWED_HEADERS");
  if (corsAllowedHeaders !== undefined) {
    parsed.corsAllowedHeaders = corsAllowedHeaders;
  }
  const corsExposedHeaders = parseCsvEnv("ORCHESTRATOR_CORS_EXPOSED_HEADERS");
  if (corsExposedHeaders !== undefined) {
    parsed.corsExposedHeaders = corsExposedHeaders;
  }
  const corsAllowCredentials = parseBooleanEnv(
    "ORCHESTRATOR_CORS_ALLOW_CREDENTIALS",
  );
  if (corsAllowCredentials !== undefined) {
    parsed.corsAllowCredentials = corsAllowCredentials;
  }
  const corsMaxAgeSeconds = parseIntegerEnv("ORCHESTRATOR_CORS_MAX_AGE_SECONDS");
  if (corsMaxAgeSeconds !== undefined) {
    parsed.corsMaxAgeSeconds = corsMaxAgeSeconds;
  }

  if (!parsed.docsPath) {
    throw new Error("orchestrator_config.json is missing docsPath");
  }
  if (!parsed.logsDir) {
    throw new Error("orchestrator_config.json is missing logsDir");
  }
  if (!parsed.stateFile) {
    throw new Error("orchestrator_config.json is missing stateFile");
  }

  return parsed as OrchestratorConfig;
}
