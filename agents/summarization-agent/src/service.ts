import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Telemetry } from "../../shared/telemetry.js";

interface AgentConfig {
  id: string;
  orchestratorStatePath: string;
  serviceStatePath: string;
  heartbeat?: {
    interval?: string | number;
  };
  permissions?: {
    skills?: Record<string, { allowed?: boolean }>;
    network?: {
      allowed?: boolean;
    };
  };
  constraints?: {
    maxSummaryLength?: number;
    minCompressionRatio?: number;
  };
}

interface TaskExecution {
  type?: string;
  status?: string;
  lastHandledAt?: string | null;
}

interface OrchestratorState {
  taskExecutions?: TaskExecution[];
}

interface ServiceState {
  lastRunAt?: string;
  lastStatus?: "ok" | "error";
  lastError?: string | null;
  summary?: Record<string, unknown>;
}

interface ResolvedConfig {
  id: string;
  orchestratorStatePath: string;
  serviceStatePath: string;
  heartbeatIntervalMs: number;
  documentParserAllowed: boolean;
  normalizerAllowed: boolean;
  networkAllowed: boolean;
  maxSummaryLength: number;
  minCompressionRatio: number;
}

const telemetry = new Telemetry({ component: "summarization-agent-service" });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function assertServiceBoundary() {
  if (process.env.ALLOW_DIRECT_SERVICE !== "true") {
    throw new Error(
      "Direct service execution blocked. Set ALLOW_DIRECT_SERVICE=true for system-managed runs.",
    );
  }
}

function parseIntervalMs(value: string | number | undefined, fallbackMs: number) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return fallbackMs;
  }

  const match = value.trim().match(/^(\d+)\s*(ms|s|m|h)?$/i);
  if (!match) {
    return fallbackMs;
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? "ms").toLowerCase();

  switch (unit) {
    case "h":
      return amount * 60 * 60 * 1000;
    case "m":
      return amount * 60 * 1000;
    case "s":
      return amount * 1000;
    default:
      return amount;
  }
}

async function loadJsonFile<T>(targetPath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(targetPath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function saveServiceState(targetPath: string, state: ServiceState) {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(state, null, 2), "utf-8");
}

async function loadConfig(): Promise<ResolvedConfig> {
  const configPath = resolve(__dirname, "../agent.config.json");
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as AgentConfig;
  const agentRoot = dirname(configPath);

  return {
    id: parsed.id,
    orchestratorStatePath: resolve(agentRoot, parsed.orchestratorStatePath),
    serviceStatePath: resolve(agentRoot, parsed.serviceStatePath),
    heartbeatIntervalMs: parseIntervalMs(parsed.heartbeat?.interval, 5 * 60 * 1000),
    documentParserAllowed: parsed.permissions?.skills?.documentParser?.allowed === true,
    normalizerAllowed: parsed.permissions?.skills?.normalizer?.allowed === true,
    networkAllowed: parsed.permissions?.network?.allowed === true,
    maxSummaryLength: parsed.constraints?.maxSummaryLength ?? 2000,
    minCompressionRatio: parsed.constraints?.minCompressionRatio ?? 0.1,
  };
}

async function runOnce(config: ResolvedConfig) {
  const state = await loadJsonFile<OrchestratorState>(
    config.orchestratorStatePath,
    {},
  );
  const executions = (state.taskExecutions ?? []).filter(
    (entry) => entry.type === "summarize-content",
  );

  const summary = {
    documentParserAllowed: config.documentParserAllowed,
    normalizerAllowed: config.normalizerAllowed,
    networkAllowed: config.networkAllowed,
    maxSummaryLength: config.maxSummaryLength,
    minCompressionRatio: config.minCompressionRatio,
    totalTrackedRuns: executions.length,
    failedRuns: executions.filter((entry) => entry.status === "failed").length,
    recentHandledAt:
      executions
        .map((entry) => entry.lastHandledAt ?? null)
        .filter((value): value is string => typeof value === "string")
        .sort()
        .slice(-5),
  };

  const lastStatus =
    summary.documentParserAllowed &&
    summary.normalizerAllowed &&
    summary.networkAllowed === false
      ? "ok"
      : "error";

  await saveServiceState(config.serviceStatePath, {
    lastRunAt: new Date().toISOString(),
    lastStatus,
    lastError:
      lastStatus === "ok"
        ? null
        : "summarization service readiness incomplete",
    summary,
  });

  await telemetry.info("heartbeat", {
    status: lastStatus,
    summary,
  });
}

function installSignalHandlers() {
  let stopping = false;

  const stop = () => {
    stopping = true;
  };

  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  return () => stopping;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop() {
  assertServiceBoundary();
  const config = await loadConfig();
  const isStopping = installSignalHandlers();

  while (!isStopping()) {
    try {
      await runOnce(config);
    } catch (error) {
      await telemetry.error("service.error", {
        message: error instanceof Error ? error.message : String(error),
      });
      await saveServiceState(config.serviceStatePath, {
        lastRunAt: new Date().toISOString(),
        lastStatus: "error",
        lastError: error instanceof Error ? error.message : String(error),
      });
    }

    if (isStopping()) {
      break;
    }

    await sleep(config.heartbeatIntervalMs);
  }
}

loop().catch(async (error) => {
  await telemetry.error("service.fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
