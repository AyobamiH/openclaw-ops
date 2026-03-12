import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAgentRelationshipWindow,
  buildIncidentPriorityQueue,
  buildWorkflowBlockerSummary,
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
  relationship:
    | "coordinates-agent"
    | "feeds-agent"
    | "delegates-task"
    | "depends-on-run"
    | "cross-run-handoff";
  detail: string;
  evidence: string[];
  targetTaskId?: string;
  targetRunId?: string;
}

interface ToolInvocationOutput {
  toolId: string;
  detail: string;
  evidence: string[];
  classification: "required" | "optional";
}

interface WorkflowGraphOutput {
  nodes: Array<{
    id: string;
    kind: "step" | "agent" | "dependency" | "tool";
    label: string;
    status: "ready" | "rerouted" | "blocked" | "skipped";
    detail: string;
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    relationship: string;
    status: "ready" | "blocked" | "rerouted";
    detail: string;
  }>;
}

interface WorkflowPlan {
  objective: string;
  totalSteps: number;
  readySteps: number;
  blockedSteps: number;
  reroutedSteps: number;
  fallbackDecisions: string[];
  resumePath: string[];
}

interface Result {
  success: boolean;
  steps: StepResult[];
  totalTime: number;
  executionTime: number;
  relationships: RelationshipOutput[];
  toolInvocations: ToolInvocationOutput[];
  workflowGraph: WorkflowGraphOutput;
  plan: WorkflowPlan;
  reroutes: Array<{ step: string; from: string; to: string; reason: string }>;
  stopClassification: "dependency-blocked" | "agent-missing" | "skill-mismatch" | "simulated-failure" | "complete";
  stopReason: string | null;
  recoveryPlan: {
    priorityIncidents: Array<{
      incidentId: string;
      severity: string;
      summary: string;
      nextAction: string;
      owner: string | null;
      recommendedOwner: string | null;
      remediationTaskType: string | null;
    }>;
    workflowWatch: ReturnType<typeof buildWorkflowBlockerSummary>;
    verificationHandoff: {
      required: boolean;
      agentId: string;
      reason: string;
    };
    relationshipWindows: Array<{
      agentId: string;
      recentSixHours: number;
      recentTwentyFourHours: number;
      total: number;
    }>;
  };
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

function findFallbackAgent(step: WorkflowStep, agentConfigs: Map<string, AgentConfigRecord>) {
  if (!step.taskType) return null;
  for (const [agentId, configRecord] of agentConfigs.entries()) {
    if (agentId === step.agent) continue;
    if (configRecord.orchestratorTask !== step.taskType) continue;
    if (
      typeof step.skillId === "string" &&
      configRecord.permissions?.skills?.[step.skillId]?.allowed !== true
    ) {
      continue;
    }
    return { agentId, configRecord };
  }
  return null;
}

async function handleTask(task: Task): Promise<Result> {
  const startTime = Date.now();
  const executedSteps: StepResult[] = [];
  const relationships: RelationshipOutput[] = [];
  const toolInvocations: ToolInvocationOutput[] = [];
  const workflowNodes: WorkflowGraphOutput["nodes"] = [];
  const workflowEdges: WorkflowGraphOutput["edges"] = [];
  const reroutes: Result["reroutes"] = [];
  const completedSteps = new Set<string>();
  const taskDurations: number[] = [];
  let stopReason: string | null = null;
  let stopClassification: Result["stopClassification"] = "complete";

  const config = loadConfig();
  const state = await loadRuntimeState<RuntimeState>(
    configPath,
    config.orchestratorStatePath,
  );
  const agentConfigs = await listAgentConfigs();
  const incidentQueue = buildIncidentPriorityQueue(state.incidentLedger ?? []);
  const runtimeWorkflowWatch = buildWorkflowBlockerSummary(state.workflowEvents ?? []);

  const integrationRuns = summarizeTaskExecutions(
    state.taskExecutions ?? [],
    ["integration-workflow"],
  );

  for (const [index, step] of task.steps.entries()) {
    const stepStartedAt = Date.now();
    const name = step.name ?? `step-${index + 1}`;
    const blockers: string[] = [];
    let agentId = typeof step.agent === "string" ? step.agent : null;
    let configRecord = agentId ? agentConfigs.get(agentId) ?? null : null;

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

    let rerouted = false;
    if (blockers.length > 0 && step.optional !== true) {
      const recoverable =
        blockers.some((blocker) => blocker.startsWith("unknown agent")) ||
        blockers.some((blocker) => blocker.includes("routes")) ||
        blockers.some((blocker) => blocker.includes("manifest does not allow skill"));
      if (recoverable) {
        const fallback = findFallbackAgent(step, agentConfigs);
        if (fallback) {
          const previousAgent = agentId ?? "unknown-agent";
          agentId = fallback.agentId;
          configRecord = fallback.configRecord;
          blockers.length = 0;
          rerouted = true;
          reroutes.push({
            step: name,
            from: previousAgent,
            to: fallback.agentId,
            reason: `${previousAgent} could not satisfy ${step.taskType ?? "workflow work"}; rerouted to ${fallback.agentId}.`,
          });
          relationships.push({
            from: "agent:integration-agent",
            to: `agent:${fallback.agentId}`,
            relationship: "delegates-task",
            detail: `integration-agent rerouted ${name} from ${previousAgent} to ${fallback.agentId}.`,
            evidence: [
              `taskType:${step.taskType ?? "unknown"}`,
              `fallback-from:${previousAgent}`,
            ],
          });
        }
      }
    }

    if (typeof step.skillId === "string") {
      toolInvocations.push({
        toolId: step.skillId,
        detail: `${name} requires ${step.skillId}${rerouted ? ` after reroute to ${agentId}` : ""}.`,
        evidence: [
          `step:${name}`,
          `taskType:${step.taskType ?? configRecord?.orchestratorTask ?? "unknown"}`,
          `agent:${agentId ?? "unknown"}`,
        ],
        classification: step.optional === true ? "optional" : "required",
      });
    }

    const success = blockers.length === 0;
    const status =
      success
        ? "ready"
        : step.optional === true
          ? "skipped"
          : "blocked";
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

    workflowNodes.push({
      id: `step:${name}`,
      kind: "step",
      label: name,
      status: success ? (rerouted ? "rerouted" : "ready") : status,
      detail: output,
    });
    if (agentId) {
      workflowNodes.push({
        id: `agent:${agentId}`,
        kind: "agent",
        label: agentId,
        status: success ? (rerouted ? "rerouted" : "ready") : status,
        detail: step.taskType ?? configRecord?.orchestratorTask ?? "workflow work",
      });
      workflowEdges.push({
        id: `edge:step:${name}:agent:${agentId}`,
        from: `step:${name}`,
        to: `agent:${agentId}`,
        relationship: rerouted ? "rerouted-to" : "assigned-to",
        status: success ? (rerouted ? "rerouted" : "ready") : "blocked",
        detail: `${name} ${rerouted ? "rerouted to" : "assigned to"} ${agentId}.`,
      });
    }

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
        relationship: "cross-run-handoff",
        detail: `${previousSuccessfulAgent.agent} hands workflow context to ${agentId}.`,
        evidence: [`from-step:${previousSuccessfulAgent.name}`, `to-step:${name}`],
      });
      workflowEdges.push({
        id: `edge:handoff:${previousSuccessfulAgent.name}:${name}`,
        from: `agent:${previousSuccessfulAgent.agent}`,
        to: `agent:${agentId}`,
        relationship: "context-handoff",
        status: "ready",
        detail: `${previousSuccessfulAgent.agent} hands context to ${agentId}.`,
      });
    }

    for (const dependencyId of dependencyIds) {
      workflowNodes.push({
        id: `dependency:${name}:${dependencyId}`,
        kind: "dependency",
        label: dependencyId,
        status: completedSteps.has(dependencyId) ? "ready" : "blocked",
        detail: `${name} depends on ${dependencyId}.`,
      });
      workflowEdges.push({
        id: `edge:dependency:${dependencyId}:${name}`,
        from: `step:${dependencyId}`,
        to: `step:${name}`,
        relationship: "depends-on",
        status: completedSteps.has(dependencyId) ? "ready" : "blocked",
        detail: `${name} depends on ${dependencyId}.`,
      });
      relationships.push({
        from: `step:${name}`,
        to: `step:${dependencyId}`,
        relationship: "depends-on-run",
        detail: `${name} depends on ${dependencyId} before execution can continue.`,
        evidence: [`step:${name}`, `dependsOn:${dependencyId}`],
      });
    }

    if (!success && step.optional !== true) {
      stopReason = `workflow blocked at ${name}: ${output}`;
      stopClassification = blockers.some((blocker) => blocker.includes("dependency"))
        ? "dependency-blocked"
        : blockers.some((blocker) => blocker.includes("unknown agent"))
          ? "agent-missing"
          : blockers.some((blocker) => blocker.includes("skill"))
            ? "skill-mismatch"
            : blockers.some((blocker) => blocker.includes("simulated failure"))
              ? "simulated-failure"
              : "dependency-blocked";
      break;
    }
  }

  const readySteps = executedSteps.filter((step) => step.status === "ready").length;
  const blockedSteps = executedSteps.filter((step) => step.status === "blocked").length;
  const reroutedSteps = reroutes.length;
  const selectedAgentIds = Array.from(
    new Set(
      executedSteps
        .map((step) => step.agent)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  const relationshipWindows = selectedAgentIds.map((agentId) =>
    buildAgentRelationshipWindow(state.relationshipObservations ?? [], agentId),
  );
  const verificationHandoffRequired =
    stopReason !== null ||
    reroutedSteps > 0 ||
    incidentQueue.some((incident) => incident.verificationStatus !== "passed");

  return {
    success: stopReason === null,
    steps: executedSteps,
    totalTime: taskDurations.reduce((sum, value) => sum + value, 0),
    executionTime: Date.now() - startTime,
    relationships,
    toolInvocations,
    workflowGraph: {
      nodes: workflowNodes,
      edges: workflowEdges,
    },
    plan: {
      objective: `Coordinate ${task.steps.length} workflow step(s) for ${task.type}.`,
      totalSteps: task.steps.length,
      readySteps,
      blockedSteps,
      reroutedSteps,
      fallbackDecisions: reroutes.map((reroute) => reroute.reason),
      resumePath: task.steps
        .map((step, index) => ({ step, index }))
        .filter(({ step, index }) => {
          const stepName = step.name ?? `step-${index + 1}`;
          return !completedSteps.has(stepName);
        })
        .map(({ step, index }) => step.name ?? `step-${index + 1}`),
    },
    reroutes,
    stopClassification,
    stopReason,
    recoveryPlan: {
      priorityIncidents: incidentQueue.slice(0, 5).map((incident) => ({
        incidentId: incident.incidentId,
        severity: incident.severity,
        summary: incident.summary,
        nextAction: incident.nextAction,
        owner: incident.owner,
        recommendedOwner: incident.recommendedOwner,
        remediationTaskType: incident.remediationTaskType,
      })),
      workflowWatch: {
        totalStopSignals:
          runtimeWorkflowWatch.totalStopSignals + (stopReason !== null ? 1 : 0),
        latestStopAt: runtimeWorkflowWatch.latestStopAt,
        latestStopCode:
          runtimeWorkflowWatch.latestStopCode ??
          (stopClassification !== "complete" ? stopClassification : null),
        byStage: runtimeWorkflowWatch.byStage,
        byClassification: runtimeWorkflowWatch.byClassification,
        byStopCode: runtimeWorkflowWatch.byStopCode,
        blockedRunIds: runtimeWorkflowWatch.blockedRunIds,
        proofStopSignals: runtimeWorkflowWatch.proofStopSignals,
      },
      verificationHandoff: {
        required: verificationHandoffRequired,
        agentId: "qa-verification-agent",
        reason:
          verificationHandoffRequired
            ? stopReason !== null
              ? "Workflow stopped or rerouted and needs verifier review before closure."
              : "Runtime incidents still require verifier-backed closure."
            : "Workflow can complete without immediate verifier handoff.",
      },
      relationshipWindows: relationshipWindows.map((window) => ({
        agentId: window.agentId,
        recentSixHours: window.recentSixHours,
        recentTwentyFourHours: window.recentTwentyFourHours,
        total: window.total,
      })),
    },
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
