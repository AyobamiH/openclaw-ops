import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { OrchestratorState } from "./types.js";

const DEFAULT_HISTORY_LIMIT = 50;
const DRIFT_LOG_LIMIT = 25;
const REDDIT_RESPONSE_LIMIT = 100;
const AGENT_DEPLOYMENT_LIMIT = 50;
const RSS_DRAFT_LIMIT = 200;
const RSS_SEEN_LIMIT = 400;
const APPROVALS_LIMIT = 1000;
const TASK_EXECUTION_LIMIT = 5000;
const MILESTONE_DELIVERY_LIMIT = 200;
const DEMAND_SUMMARY_DELIVERY_LIMIT = 200;

type StateRetentionOptions = {
  taskHistoryLimit?: number;
};

function normalizeTaskHistoryLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_HISTORY_LIMIT;
  const clamped = Math.floor(limit as number);
  if (clamped < 1) return 1;
  if (clamped > 10000) return 10000;
  return clamped;
}

export async function loadState(
  path: string,
  options: StateRetentionOptions = {},
): Promise<OrchestratorState> {
  const historyLimit = normalizeTaskHistoryLimit(options.taskHistoryLimit);

  if (!existsSync(path)) {
    return createDefaultState();
  }

  const raw = await readFile(path, "utf-8");
  try {
    const parsed = JSON.parse(raw) as OrchestratorState;
    return {
      ...createDefaultState(),
      ...parsed,
      taskHistory: parsed.taskHistory?.slice(-historyLimit) ?? [],
      taskExecutions: parsed.taskExecutions?.slice(-TASK_EXECUTION_LIMIT) ?? [],
      approvals: parsed.approvals?.slice(-APPROVALS_LIMIT) ?? [],
      pendingDocChanges: parsed.pendingDocChanges ?? [],
      driftRepairs: parsed.driftRepairs ?? [],
      redditQueue: parsed.redditQueue ?? [],
      redditResponses: parsed.redditResponses ?? [],
      agentDeployments: parsed.agentDeployments ?? [],
      rssDrafts: parsed.rssDrafts ?? [],
      rssSeenIds: parsed.rssSeenIds ?? [],
      milestoneDeliveries:
        parsed.milestoneDeliveries?.slice(-MILESTONE_DELIVERY_LIMIT) ?? [],
      demandSummaryDeliveries:
        parsed.demandSummaryDeliveries?.slice(-DEMAND_SUMMARY_DELIVERY_LIMIT) ??
        [],
    };
  } catch (error) {
    console.warn(
      `[state] Failed to parse state file, starting fresh: ${(error as Error).message}`,
    );
    return createDefaultState();
  }
}

export async function saveState(path: string, state: OrchestratorState) {
  await saveStateWithOptions(path, state, {});
}

export async function saveStateWithOptions(
  path: string,
  state: OrchestratorState,
  options: StateRetentionOptions = {},
) {
  const historyLimit = normalizeTaskHistoryLimit(options.taskHistoryLimit);
  await mkdir(dirname(path), { recursive: true });
  const prepared: OrchestratorState = {
    ...state,
    taskHistory: state.taskHistory.slice(-historyLimit),
    taskExecutions: state.taskExecutions.slice(-TASK_EXECUTION_LIMIT),
    approvals: state.approvals.slice(-APPROVALS_LIMIT),
    pendingDocChanges: state.pendingDocChanges.slice(0, 200),
    driftRepairs: state.driftRepairs.slice(-DRIFT_LOG_LIMIT),
    redditResponses: state.redditResponses.slice(-REDDIT_RESPONSE_LIMIT),
    agentDeployments: state.agentDeployments.slice(-AGENT_DEPLOYMENT_LIMIT),
    rssDrafts: state.rssDrafts.slice(-RSS_DRAFT_LIMIT),
    rssSeenIds: state.rssSeenIds.slice(-RSS_SEEN_LIMIT),
    milestoneDeliveries: state.milestoneDeliveries.slice(
      -MILESTONE_DELIVERY_LIMIT,
    ),
    demandSummaryDeliveries: state.demandSummaryDeliveries.slice(
      -DEMAND_SUMMARY_DELIVERY_LIMIT,
    ),
    updatedAt: new Date().toISOString(),
  };

  await writeFile(path, JSON.stringify(prepared, null, 2), "utf-8");
}

export function createDefaultState(): OrchestratorState {
  return {
    lastStartedAt: null,
    updatedAt: null,
    indexedDocs: 0,
    docIndexVersion: 0,
    pendingDocChanges: [],
    taskHistory: [],
    taskExecutions: [],
    approvals: [],
    driftRepairs: [],
    redditQueue: [],
    redditResponses: [],
    agentDeployments: [],
    rssDrafts: [],
    rssSeenIds: [],
    milestoneDeliveries: [],
    demandSummaryDeliveries: [],
    lastMilestoneDeliveryAt: null,
    lastDemandSummaryDeliveryAt: null,
    lastDriftRepairAt: null,
    lastRedditResponseAt: null,
    lastAgentDeployAt: null,
    lastRssSweepAt: null,
  };
}
