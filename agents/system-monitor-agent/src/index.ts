import { readFileSync } from "node:fs";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countByStatus,
  loadRuntimeState,
  readJsonFile,
  summarizeProofTransport,
  summarizeTaskExecutions,
  type RuntimeIncidentLedgerRecord,
  type RuntimeStateSubset,
} from "../../shared/runtime-evidence.js";

interface Task {
  id: string;
  type: string;
  agents?: string[];
}

interface AgentConfig {
  id: string;
  name: string;
  orchestratorStatePath: string;
  permissions: {
    skills?: Record<string, { allowed?: boolean }>;
  };
}

interface AgentDescriptor {
  id: string;
  name: string;
  orchestratorTask?: string;
  serviceStatePath?: string;
}

interface AgentServiceState {
  lastRunAt?: string;
  lastStatus?: "ok" | "error";
  lastError?: string | null;
  totalRuns?: number;
  errorCount?: number;
  successCount?: number;
}

interface RuntimeState extends RuntimeStateSubset {}

interface AgentHealthSnapshot {
  status: "OK" | "ACTIVE" | "DEGRADED" | "STALE" | "UNKNOWN";
  lastRunAt: string | null;
  lastStatus: string | null;
  totalRuns: number;
  successCount: number;
  errorCount: number;
  activeExecutions: number;
  failedExecutions: number;
  evidence: string[];
}

interface Result {
  success: boolean;
  metrics: {
    timestamp: string;
    agentHealth: Record<string, AgentHealthSnapshot>;
    systemMetrics: Record<string, unknown>;
    alerts: string[];
  };
  executionTime: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = resolve(__dirname, "../agent.config.json");
const workspaceRoot = resolve(__dirname, "../../..");
const agentsRoot = resolve(workspaceRoot, "agents");

function loadConfig(): AgentConfig {
  return JSON.parse(readFileSync(configPath, "utf-8")) as AgentConfig;
}

function canUseSkill(skillId: string): boolean {
  const config = loadConfig();
  return config.permissions.skills?.[skillId]?.allowed === true;
}

async function listAgentDescriptors(): Promise<AgentDescriptor[]> {
  const entries = await readdir(agentsRoot, { withFileTypes: true });
  const descriptors: AgentDescriptor[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "shared" || entry.name.startsWith(".")) continue;
    const agentConfigPath = resolve(agentsRoot, entry.name, "agent.config.json");
    try {
      const parsed = JSON.parse(await readFile(agentConfigPath, "utf-8")) as {
        id?: string;
        name?: string;
        orchestratorTask?: string;
        serviceStatePath?: string;
      };
      if (!parsed.id) continue;
      descriptors.push({
        id: parsed.id,
        name: parsed.name ?? parsed.id,
        orchestratorTask: parsed.orchestratorTask,
        serviceStatePath: parsed.serviceStatePath,
      });
    } catch {
      continue;
    }
  }

  return descriptors.sort((left, right) => left.id.localeCompare(right.id));
}

async function loadServiceState(
  descriptor: AgentDescriptor,
): Promise<AgentServiceState | null> {
  if (!descriptor.serviceStatePath) return null;
  const targetPath = resolve(agentsRoot, descriptor.id, descriptor.serviceStatePath);
  return readJsonFile<AgentServiceState | null>(targetPath, null);
}

async function isServiceStateStale(
  descriptor: AgentDescriptor,
  maxAgeMs: number,
): Promise<boolean> {
  if (!descriptor.serviceStatePath) return false;
  const targetPath = resolve(agentsRoot, descriptor.id, descriptor.serviceStatePath);
  try {
    const fileStat = await stat(targetPath);
    return Date.now() - fileStat.mtimeMs > maxAgeMs;
  } catch {
    return false;
  }
}

function summarizeIncidents(incidents: RuntimeIncidentLedgerRecord[]) {
  const open = incidents.filter((incident) => incident.status !== "resolved");
  return {
    openCount: open.length,
    criticalCount: open.filter((incident) => incident.severity === "critical").length,
    warningCount: open.filter((incident) => incident.severity === "warning").length,
    ownersAssigned: open.filter(
      (incident) => typeof incident.owner === "string" && incident.owner.length > 0,
    ).length,
  };
}

function deriveAgentHealthSnapshot(args: {
  descriptor: AgentDescriptor;
  state: RuntimeState;
  serviceState: AgentServiceState | null;
  stale: boolean;
}): AgentHealthSnapshot {
  const { descriptor, state, serviceState, stale } = args;
  const executionSummary = summarizeTaskExecutions(
    state.taskExecutions ?? [],
    descriptor.orchestratorTask ? [descriptor.orchestratorTask] : undefined,
  );

  const evidence = [
    descriptor.orchestratorTask
      ? `task-route:${descriptor.orchestratorTask}`
      : "task-route:unassigned",
    serviceState?.lastStatus ? `service:${serviceState.lastStatus}` : "service:unknown",
    executionSummary.lastHandledAt
      ? `last-execution:${executionSummary.lastHandledAt}`
      : "last-execution:none",
  ];

  let status: AgentHealthSnapshot["status"] = "UNKNOWN";
  if (stale) {
    status = "STALE";
    evidence.push("service-state:stale");
  } else if (executionSummary.running > 0 || executionSummary.retrying > 0) {
    status = "ACTIVE";
  } else if (
    executionSummary.failed > 0 ||
    serviceState?.lastStatus === "error" ||
    Number(serviceState?.errorCount ?? 0) > 0
  ) {
    status = "DEGRADED";
  } else if (
    serviceState?.lastStatus === "ok" ||
    executionSummary.success > 0 ||
    Number(serviceState?.successCount ?? 0) > 0
  ) {
    status = "OK";
  }

  return {
    status,
    lastRunAt: serviceState?.lastRunAt ?? executionSummary.lastHandledAt,
    lastStatus: serviceState?.lastStatus ?? null,
    totalRuns: Number(serviceState?.totalRuns ?? executionSummary.total ?? 0),
    successCount: Number(serviceState?.successCount ?? executionSummary.success ?? 0),
    errorCount: Number(serviceState?.errorCount ?? executionSummary.failed ?? 0),
    activeExecutions: executionSummary.running + executionSummary.retrying,
    failedExecutions: executionSummary.failed,
    evidence,
  };
}

async function handleTask(task: Task): Promise<Result> {
  const startTime = Date.now();

  if (!canUseSkill("documentParser")) {
    return {
      success: false,
      metrics: {
        timestamp: new Date().toISOString(),
        agentHealth: {},
        systemMetrics: {},
        alerts: ["documentParser skill access is required"],
      },
      executionTime: Date.now() - startTime,
    };
  }

  try {
    const config = loadConfig();
    const state = await loadRuntimeState<RuntimeState>(
      configPath,
      config.orchestratorStatePath,
    );
    const descriptors = await listAgentDescriptors();
    const selectedAgents =
      Array.isArray(task.agents) && task.agents.length > 0
        ? descriptors.filter((descriptor) => task.agents?.includes(descriptor.id))
        : descriptors;

    const agentHealthEntries = await Promise.all(
      selectedAgents.map(async (descriptor) => {
        const [serviceState, stale] = await Promise.all([
          loadServiceState(descriptor),
          isServiceStateStale(descriptor, 2 * 60 * 60 * 1000),
        ]);
        return [
          descriptor.id,
          deriveAgentHealthSnapshot({
            descriptor,
            state,
            serviceState,
            stale,
          }),
        ] as const;
      }),
    );

    const agentHealth = Object.fromEntries(agentHealthEntries);
    const taskExecutionSummary = summarizeTaskExecutions(state.taskExecutions ?? []);
    const incidentSummary = summarizeIncidents(state.incidentLedger ?? []);
    const proofMetrics = {
      milestone: summarizeProofTransport(state.milestoneDeliveries ?? []),
      demandSummary: summarizeProofTransport(state.demandSummaryDeliveries ?? []),
    };
    const repairSummary = countByStatus(state.repairRecords ?? []);
    const alerts: string[] = [];

    if (incidentSummary.criticalCount > 0) {
      alerts.push(`${incidentSummary.criticalCount} critical incident(s) remain open`);
    }
    if ((proofMetrics.milestone.deadLetter ?? 0) > 0) {
      alerts.push(`${proofMetrics.milestone.deadLetter} milestone delivery dead-letter record(s)`);
    }
    if ((proofMetrics.demandSummary.deadLetter ?? 0) > 0) {
      alerts.push(
        `${proofMetrics.demandSummary.deadLetter} demand-summary dead-letter record(s)`,
      );
    }
    if ((taskExecutionSummary.failed ?? 0) > 0) {
      alerts.push(`${taskExecutionSummary.failed} failed task execution(s) recorded`);
    }
    if ((state.taskRetryRecoveries ?? []).length > 0) {
      alerts.push(`${state.taskRetryRecoveries?.length ?? 0} retry recovery item(s) queued`);
    }
    for (const [agentId, snapshot] of Object.entries(agentHealth)) {
      if (snapshot.status === "DEGRADED" || snapshot.status === "STALE") {
        alerts.push(`${agentId} ${snapshot.status.toLowerCase()} according to runtime evidence`);
      }
    }

    return {
      success: true,
      metrics: {
        timestamp: new Date().toISOString(),
        agentHealth,
        systemMetrics: {
          stateUpdatedAt: state.updatedAt ?? null,
          lastStartedAt: state.lastStartedAt ?? null,
          taskExecutions: taskExecutionSummary,
          pendingApprovalCount: (state.approvals ?? []).filter(
            (entry) => entry.status === "pending",
          ).length,
          repairSummary,
          openIncidentCount: incidentSummary.openCount,
          criticalIncidentCount: incidentSummary.criticalCount,
          retryRecoveryCount: (state.taskRetryRecoveries ?? []).length,
          proofDelivery: proofMetrics,
          workflowEventCount: (state.workflowEvents ?? []).length,
          relationshipObservationCount: (state.relationshipObservations ?? []).length,
        },
        alerts,
      },
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      metrics: {
        timestamp: new Date().toISOString(),
        agentHealth: {},
        systemMetrics: {},
        alerts: [(error as Error).message],
      },
      executionTime: Date.now() - startTime,
    };
  }
}

export { handleTask, loadConfig, canUseSkill };

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    return;
  }

  const raw = await readFile(payloadPath, "utf-8");
  const payload = JSON.parse(raw) as Task;
  const result = await handleTask(payload);

  const resultFile = process.env.SYSTEM_MONITOR_AGENT_RESULT_FILE;
  if (resultFile) {
    await mkdir(dirname(resultFile), { recursive: true });
    await writeFile(resultFile, JSON.stringify(result, null, 2), "utf-8");
  } else {
    process.stdout.write(JSON.stringify(result));
  }

  if (result.success !== true) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
