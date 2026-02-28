/**
 * Agent Metrics Service
 *
 * Tracks performance metrics for each agent in the swarm.
 * - Task completion rates
 * - Latency distributions
 * - Cost per agent
 * - Active workload
 *
 * These metrics are used by Grafana dashboards and alerting.
 */

import {
  agentTasksStarted,
  agentTasksCompleted,
  agentTasksFailed,
  agentActiveTasks,
  agentTaskDuration,
  agentCostPerDay,
  agentTotalCostPerDay,
  recordTaskCompletion,
  recordTaskFailure,
  updateAgentCost,
  updateTotalCost,
} from "./prometheus.js";

/**
 * Per-agent cost tracking (in-memory until persisted)
 */
const agentCostMap = new Map<string, { model: string; cost: number }>();
/**
 * Per-agent active task counters
 */
const agentActiveCounters = new Map<string, number>();

/**
 * Agent startup metric
 * Call when an agent begins processing a task
 */
export function onAgentTaskStart(
  agent: string,
  model: string,
  _taskId: string
): void {
  agentTasksStarted.labels(agent, model).inc();
  
  // Increment active task counter
  const current = agentActiveCounters.get(agent) || 0;
  const newCount = current + 1;
  agentActiveCounters.set(agent, newCount);
  agentActiveTasks.labels(agent).set(newCount);
}

/**
 * Agent task completion metric
 * Call when a task completes successfully
 */
export function onAgentTaskComplete(
  agent: string,
  model: string,
  taskType: string,
  durationMs: number,
  costDelta: number
): void {
  const durationSec = durationMs / 1000;
  recordTaskCompletion(agent, model, taskType, durationSec);
  
  // Decrement active task counter
  const current = agentActiveCounters.get(agent) || 0;
  const newCount = Math.max(0, current - 1);
  agentActiveCounters.set(agent, newCount);
  agentActiveTasks.labels(agent).set(newCount);
  
  // Track cost
  const key = `${agent}:${model}`;
  const existing = agentCostMap.get(key) || { model, cost: 0 };
  existing.cost += costDelta;
  agentCostMap.set(key, existing);
  
  updateAgentCost(agent, model, existing.cost);
  updateTotalCostMetric();
}

/**
 * Agent task failure metric
 * Call when a task fails
 */
export function onAgentTaskFailure(
  agent: string,
  errorType: string,
  _durationMs: number
): void {
  recordTaskFailure(agent, errorType);
  
  // Decrement active task counter
  const current = agentActiveCounters.get(agent) || 0;
  const newCount = Math.max(0, current - 1);
  agentActiveCounters.set(agent, newCount);
  agentActiveTasks.labels(agent).set(newCount);
}

/**
 * Update total cost metric across all agents
 */
function updateTotalCostMetric(): void {
  let total = 0;
  for (const entry of agentCostMap.values()) {
    total += entry.cost;
  }
  updateTotalCost(total);
}

/**
 * Get current cost for an agent
 */
export function getAgentCost(agent: string): number {
  let cost = 0;
  for (const [key, entry] of agentCostMap.entries()) {
    if (key.startsWith(agent)) {
      cost += entry.cost;
    }
  }
  return cost;
}

/**
 * Get total cost across all agents
 */
export function getTotalCost(): number {
  let total = 0;
  for (const entry of agentCostMap.values()) {
    total += entry.cost;
  }
  return total;
}

/**
 * Reset daily cost (called at midnight UTC)
 */
export function resetDailyCosts(): void {
  agentCostMap.clear();
  updateTotalCostMetric();
}

/**
 * Export cost snapshot (for daily memory consolidation)
 */
export function exportCostSnapshot(): {
  total: number;
  byAgent: Record<string, number>;
  byModel: Record<string, number>;
} {
  const byAgent: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  
  for (const [key, entry] of agentCostMap.entries()) {
    const [agent, model] = key.split(":");
    byAgent[agent] = (byAgent[agent] || 0) + entry.cost;
    byModel[model] = (byModel[model] || 0) + entry.cost;
  }
  
  return {
    total: getTotalCost(),
    byAgent,
    byModel,
  };
}
