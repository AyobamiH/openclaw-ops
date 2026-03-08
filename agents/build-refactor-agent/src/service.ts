import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
  };
  constraints?: {
    requiresReview?: boolean;
    dryRunRequired?: boolean;
  };
}

interface TaskExecution {
  type?: string;
  status?: string;
  lastHandledAt?: string | null;
}

interface ApprovalRecord {
  type?: string;
  status?: string;
}

interface OrchestratorState {
  taskExecutions?: TaskExecution[];
  approvals?: ApprovalRecord[];
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
  workspaceRoot: string;
  requiresReview: boolean;
  dryRunRequired: boolean;
  workspacePatchAllowed: boolean;
  testRunnerAllowed: boolean;
}

const telemetry = new Telemetry({ component: "build-refactor-agent-service" });
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

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
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
    heartbeatIntervalMs: parseIntervalMs(parsed.heartbeat?.interval, 10 * 60 * 1000),
    workspaceRoot: resolve(agentRoot, "../.."),
    requiresReview: parsed.constraints?.requiresReview !== false,
    dryRunRequired: parsed.constraints?.dryRunRequired !== false,
    workspacePatchAllowed:
      parsed.permissions?.skills?.workspacePatch?.allowed === true,
    testRunnerAllowed:
      parsed.permissions?.skills?.testRunner?.allowed === true,
  };
}

async function runOnce(config: ResolvedConfig) {
  const state = await loadJsonFile<OrchestratorState>(
    config.orchestratorStatePath,
    {},
  );
  const executions = (state.taskExecutions ?? []).filter(
    (entry) => entry.type === "build-refactor",
  );
  const pendingApprovals = (state.approvals ?? []).filter(
    (entry) =>
      entry.type === "build-refactor" && entry.status === "pending",
  ).length;

  const summary = {
    orchestratorBuildPresent: await pathExists(
      resolve(config.workspaceRoot, "orchestrator/dist/index.js"),
    ),
    workspacePatchAllowed: config.workspacePatchAllowed,
    testRunnerAllowed: config.testRunnerAllowed,
    requiresReview: config.requiresReview,
    dryRunRequired: config.dryRunRequired,
    totalTrackedRuns: executions.length,
    recentFailures: executions.filter((entry) => entry.status === "failed").length,
    pendingApprovals,
    lastHandledAt:
      executions
        .map((entry) => entry.lastHandledAt ?? null)
        .filter((value): value is string => typeof value === "string")
        .sort()
        .at(-1) ?? null,
  };

  const lastStatus =
    summary.orchestratorBuildPresent &&
    summary.workspacePatchAllowed &&
    summary.testRunnerAllowed
      ? "ok"
      : "error";

  await saveServiceState(config.serviceStatePath, {
    lastRunAt: new Date().toISOString(),
    lastStatus,
    lastError: lastStatus === "ok" ? null : "build-refactor service readiness check failed",
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
