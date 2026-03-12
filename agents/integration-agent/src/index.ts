import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadRuntimeState,
  summarizeTaskExecutions,
  type RuntimeStateSubset,
} from "../../shared/runtime-evidence.js";

interface WorkflowStep {
  name?: string;
  agent?: string;
  taskType?: string;
  skillId?: string;
  dependsOn?: string[];
  optional?: boolean;
  simulateFailure?: boolean;
}

interface Task {
  id: string;
  type: string;
  steps: WorkflowStep[];
}

interface AgentConfigRecord {
  id?: string;
  name?: string;
  orchestratorTask?: string;
  orchestratorStatePath?: string;
  serviceStatePath?: string;
  permissions?: {
    skills?: Record<string, { allowed?: boolean }>;
  };
}

interface RuntimeState extends RuntimeStateSubset {}

interface StepResult {
  name: string;
  agent: string | null;
  success: boolean;
  duration: number;
  output: string;
  status: "ready" | "blocked" | "skipped";
  blockers: string[];
}

interface RelationshipOutput {
  from: string;
  to: string;
  relationship: "coordinates-agent" | "feeds-agent";
  detail: string;
  evidence: string[];
}

interface Result {
  success: boolean;
  steps: StepResult[];
  totalTime: number;
  executionTime: number;
  relationships: RelationshipOutput[];
  stopReason: string | null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = resolve(__dirname, "../agent.config.json");
const workspaceRoot = resolve(__dirname, "../../..");
const agentsRoot = resolve(workspaceRoot, "agents");

function loadConfig(): AgentConfigRecord {
  return JSON.parse(readFileSync(configPath, "utf-8")) as AgentConfigRecord;
}

function canUseSkill(skillId: string): boolean {
  const config = loadConfig();
  return config.permissions?.skills?.[skillId]?.allowed === true;
}

async function listAgentConfigs() {
  const entries = await readdir(agentsRoot, { withFileTypes: true });
  const configs = new Map<string, AgentConfigRecord>();

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "shared") {
      continue;
    }
    const agentConfigPath = resolve(agentsRoot, entry.name, "agent.config.json");
    try {
      const raw = await readFile(agentConfigPath, "utf-8");
      const parsed = JSON.parse(raw) as AgentConfigRecord;
      if (parsed.id) {
        configs.set(parsed.id, parsed);
      }
    } catch {
      continue;
    }
  }

  return configs;
}

function resolveDependencyIds(step: WorkflowStep) {
  return Array.isArray(step.dependsOn)
    ? step.dependsOn.filter((value): value is string => typeof value === "string")
    : [];
}

async function handleTask(task: Task): Promise<Result> {
  const startTime = Date.now();
  const executedSteps: StepResult[] = [];
  const relationships: RelationshipOutput[] = [];
  const completedSteps = new Set<string>();
  const taskDurations: number[] = [];
  let stopReason: string | null = null;

  const config = loadConfig();
  const state = await loadRuntimeState<RuntimeState>(
    configPath,
    config.orchestratorStatePath,
  );
  const agentConfigs = await listAgentConfigs();

  const integrationRuns = summarizeTaskExecutions(
    state.taskExecutions ?? [],
    ["integration-workflow"],
  );

  for (const [index, step] of task.steps.entries()) {
    const stepStartedAt = Date.now();
    const name = step.name ?? `step-${index + 1}`;
    const blockers: string[] = [];
    const agentId = typeof step.agent === "string" ? step.agent : null;
    const configRecord = agentId ? agentConfigs.get(agentId) ?? null : null;

    if (!agentId) {
      blockers.push("missing agent");
    } else if (!configRecord) {
      blockers.push(`unknown agent ${agentId}`);
    }

    if (step.simulateFailure === true) {
      blockers.push(`simulated failure requested for ${name}`);
    }

    const dependencyIds = resolveDependencyIds(step);
    for (const dependencyId of dependencyIds) {
      if (!completedSteps.has(dependencyId)) {
        blockers.push(`dependency ${dependencyId} not satisfied`);
      }
    }

    if (configRecord && step.taskType && configRecord.orchestratorTask !== step.taskType) {
      blockers.push(
        `${agentId} routes ${configRecord.orchestratorTask ?? "no-task"} instead of ${step.taskType}`,
      );
    }

    if (
      configRecord &&
      typeof step.skillId === "string" &&
      configRecord.permissions?.skills?.[step.skillId]?.allowed !== true
    ) {
      blockers.push(`${agentId} manifest does not allow skill ${step.skillId}`);
    }

    const success = blockers.length === 0;
    const status =
      success ? "ready" : step.optional === true ? "skipped" : "blocked";
    const output = success
      ? `${agentId ?? "unknown-agent"} is ready for ${
          step.taskType ?? configRecord?.orchestratorTask ?? "workflow work"
        }`
      : blockers.join("; ");
    const duration = Date.now() - stepStartedAt;
    taskDurations.push(duration);

    executedSteps.push({
      name,
      agent: agentId,
      success,
      duration,
      output,
      status,
      blockers,
    });

    if (success) {
      completedSteps.add(name);
      if (agentId) {
        relationships.push({
          from: "agent:integration-agent",
          to: `agent:${agentId}`,
          relationship: "coordinates-agent",
          detail: `integration-agent validated ${agentId} for ${name}.`,
          evidence: [
            `taskType:${step.taskType ?? configRecord?.orchestratorTask ?? "unknown"}`,
            `integration-runs:${integrationRuns.success}`,
          ],
        });
      }
    }

    const previousSuccessfulAgent = [...executedSteps]
      .slice(0, -1)
      .reverse()
      .find((entry) => entry.success && entry.agent && entry.agent !== agentId);
    if (success && previousSuccessfulAgent?.agent && agentId) {
      relationships.push({
        from: `agent:${previousSuccessfulAgent.agent}`,
        to: `agent:${agentId}`,
        relationship: "feeds-agent",
        detail: `${previousSuccessfulAgent.agent} hands workflow context to ${agentId}.`,
        evidence: [`from-step:${previousSuccessfulAgent.name}`, `to-step:${name}`],
      });
    }

    if (!success && step.optional !== true) {
      stopReason = `workflow blocked at ${name}: ${output}`;
      break;
    }
  }

  return {
    success: stopReason === null,
    steps: executedSteps,
    totalTime: taskDurations.reduce((sum, value) => sum + value, 0),
    executionTime: Date.now() - startTime,
    relationships,
    stopReason,
  };
}

async function main(): Promise<void> {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    return;
  }

  try {
    const payloadRaw = await readFile(payloadPath, "utf-8");
    const taskInput = JSON.parse(payloadRaw) as Task;
    const result = await handleTask(taskInput);

    const resultFile = process.env.INTEGRATION_AGENT_RESULT_FILE;
    if (resultFile) {
      await mkdir(dirname(resultFile), { recursive: true });
      await writeFile(resultFile, JSON.stringify(result, null, 2), "utf-8");
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

export { handleTask, loadConfig, canUseSkill };
