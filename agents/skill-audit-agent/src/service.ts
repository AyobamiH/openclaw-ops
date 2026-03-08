import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Telemetry } from "../../shared/telemetry.js";
import { auditSkill } from "../../../orchestrator/src/skillAudit.ts";

type SkillRuntimeModule = {
  initializeSkills: () => Promise<void>;
  listSkills: () => Array<{ id: string }>;
  getSkillDefinition: (skillId: string) => unknown;
};

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
  audit?: Record<string, unknown>;
}

interface ResolvedConfig {
  id: string;
  serviceStatePath: string;
  heartbeatIntervalMs: number;
}

const telemetry = new Telemetry({ component: "skill-audit-agent-service" });
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

async function getSkillRuntime(): Promise<SkillRuntimeModule> {
  const runtime = await import("../../../skills/index.ts");
  return {
    initializeSkills: runtime.initializeSkills,
    listSkills: runtime.listSkills,
    getSkillDefinition: runtime.getSkillDefinition,
  };
}

async function loadConfig(): Promise<ResolvedConfig> {
  const configPath = resolve(__dirname, "../agent.config.json");
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as AgentConfig;
  const agentRoot = dirname(configPath);

  return {
    id: parsed.id,
    serviceStatePath: resolve(agentRoot, parsed.serviceStatePath),
    heartbeatIntervalMs: parseIntervalMs(parsed.heartbeat?.interval, 30 * 60 * 1000),
  };
}

async function saveServiceState(targetPath: string, state: ServiceState) {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(state, null, 2), "utf-8");
}

async function runOnce(config: ResolvedConfig) {
  const runtime = await getSkillRuntime();
  await runtime.initializeSkills();

  const skillIds = runtime.listSkills().map((entry) => entry.id);
  const results = skillIds.map((skillId) => {
    const definition = runtime.getSkillDefinition(skillId);
    const audit = auditSkill(definition);
    const failedChecks = audit.checks.filter((check) => check.status === "fail");
    const warnedChecks = audit.checks.filter((check) => check.status === "warn");

    return {
      skillId,
      passed: audit.passed,
      failedChecks: failedChecks.length,
      warnedChecks: warnedChecks.length,
      riskFlags: audit.riskFlags.length,
    };
  });

  const auditSummary = {
    skillsAudited: results.length,
    failedSkills: results.filter((entry) => !entry.passed).length,
    warningCount: results.reduce((sum, entry) => sum + entry.warnedChecks, 0),
    riskFlagCount: results.reduce((sum, entry) => sum + entry.riskFlags, 0),
    sample: results.slice(0, 5),
  };

  const lastStatus = auditSummary.failedSkills === 0 ? "ok" : "error";

  await saveServiceState(config.serviceStatePath, {
    lastRunAt: new Date().toISOString(),
    lastStatus,
    lastError:
      lastStatus === "ok"
        ? null
        : `${auditSummary.failedSkills} audited skills reported failing checks`,
    audit: auditSummary,
  });

  await telemetry.info("heartbeat", {
    status: lastStatus,
    audit: auditSummary,
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
