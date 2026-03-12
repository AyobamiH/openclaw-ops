import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type ExecuteSkillFn = (
  skillId: string,
  input: Record<string, unknown>,
  requestingAgent?: string,
) => Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}>;

interface AgentConfig {
  id: string;
  serviceStatePath: string;
  heartbeat?: {
    interval?: string | number;
  };
}

interface ServiceState {
  lastRunAt?: string;
  lastStatus?: "ok" | "error";
  lastError?: string | null;
  lastVerification?: Record<string, unknown>;
}

interface ResolvedConfig {
  id: string;
  serviceStatePath: string;
  heartbeatIntervalMs: number;
  orchestratorRoot: string;
}

class LocalTelemetry {
  constructor(private readonly component: string) {}

  private emit(
    severity: "info" | "warn" | "error",
    event: string,
    data: Record<string, unknown> = {},
  ) {
    console.log(`[${this.component}] ${severity.toUpperCase()} ${event}`, data);
  }

  info(event: string, data?: Record<string, unknown>) {
    this.emit("info", event, data);
  }

  warn(event: string, data?: Record<string, unknown>) {
    this.emit("warn", event, data);
  }

  error(event: string, data?: Record<string, unknown>) {
    this.emit("error", event, data);
  }
}

const telemetry = new LocalTelemetry("qa-verification-agent-service");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_COMMAND = "build-verify";

let executeSkillFn: ExecuteSkillFn | null = null;

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

async function getExecuteSkill(): Promise<ExecuteSkillFn> {
  if (executeSkillFn) {
    return executeSkillFn;
  }

  const skillsModule = await import("../../../skills/index.ts");
  const candidate =
    (skillsModule as { executeSkill?: ExecuteSkillFn }).executeSkill;

  if (typeof candidate !== "function") {
    throw new Error("skills registry executeSkill export unavailable");
  }

  executeSkillFn = candidate;
  return executeSkillFn;
}

async function loadConfig(): Promise<ResolvedConfig> {
  const configPath = resolve(__dirname, "../agent.config.json");
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as AgentConfig;
  const agentRoot = dirname(configPath);

  return {
    id: parsed.id,
    serviceStatePath: resolve(agentRoot, parsed.serviceStatePath),
    heartbeatIntervalMs: parseIntervalMs(parsed.heartbeat?.interval, 5 * 60 * 1000),
    orchestratorRoot: resolve(agentRoot, "../../orchestrator"),
  };
}

async function saveServiceState(targetPath: string, state: ServiceState) {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(state, null, 2), "utf-8");
}

async function withWorkingDirectory<T>(targetDir: string, fn: () => Promise<T>) {
  const previousDir = process.cwd();
  process.chdir(targetDir);
  try {
    return await fn();
  } finally {
    process.chdir(previousDir);
  }
}

async function runOnce(config: ResolvedConfig) {
  const executeSkill = await getExecuteSkill();

  const result = await withWorkingDirectory(config.orchestratorRoot, () =>
    executeSkill(
      "testRunner",
      {
        command: DEFAULT_COMMAND,
        timeout: 60_000,
        collectCoverage: false,
        mode: "dry-run",
        dryRun: true,
      },
      config.id,
    ),
  );

  const summary = {
    command: DEFAULT_COMMAND,
    mode: "dry-run",
    runnerSuccess: result.success,
    outcomeSummary:
      typeof result.data?.outcomeSummary === "string"
        ? result.data.outcomeSummary
        : result.error ?? null,
  };

  const lastStatus = result.success ? "ok" : "error";

  await saveServiceState(config.serviceStatePath, {
    lastRunAt: new Date().toISOString(),
    lastStatus,
    lastError: result.success ? null : result.error ?? "testRunner dry-run failed",
    lastVerification: summary,
  });

  if (result.success) {
    await telemetry.info("heartbeat", {
      status: lastStatus,
      verification: summary,
    });
    return;
  }

  await telemetry.warn("verification.failed", {
    status: lastStatus,
    verification: summary,
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

async function sleep(ms: number, isStopping: () => boolean) {
  const deadline = Date.now() + ms;

  while (!isStopping()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 1000)));
  }
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

    await sleep(config.heartbeatIntervalMs, isStopping);
  }
}

loop().catch(async (error) => {
  await telemetry.error("service.fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
