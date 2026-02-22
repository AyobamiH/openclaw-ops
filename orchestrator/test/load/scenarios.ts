/**
 * Load Test Scenarios & Task Generators
 * 
 * Defines realistic task distributions and scenario variants
 */

import { allAgents } from '../fixtures';

export interface TaskScenario {
  name: string;
  description: string;
  agentCount: number;
  tasksPerAgent: number;
  approvalGateRate: number; // percentage
  failureRate: number; // percentage
  latencyProfile: 'uniform' | 'normal' | 'skewed';
}

/**
 * Predefined scenarios for different load profiles
 */
export const scenarios: Record<string, TaskScenario> = {
  // Default: User-specified load test (3,000 tasks across 40 agents)
  production_standard: {
    name: 'Production Standard',
    description: 'Standard production load: 40 agents, 75 tasks each, 15% approval gates, 10% failures',
    agentCount: 40,
    tasksPerAgent: 75, // 3,000 total
    approvalGateRate: 15,
    failureRate: 10,
    latencyProfile: 'normal',
  },

  // Light testing: Quick validation with lower concurrency
  smoke_test: {
    name: 'Smoke Test',
    description: 'Quick validation: 5 agents, 10 tasks each, 5% approval gates, 2% failures',
    agentCount: 5,
    tasksPerAgent: 10,
    approvalGateRate: 5,
    failureRate: 2,
    latencyProfile: 'uniform',
  },

  // High load: Push to 5,000 tasks
  high_load: {
    name: 'High Load',
    description: 'Stress test: 40 agents, 125 tasks each, 20% approval gates, 15% failures',
    agentCount: 40,
    tasksPerAgent: 125, // 5,000 total
    approvalGateRate: 20,
    failureRate: 15,
    latencyProfile: 'skewed',
  },

  // Baseline: Conservative test with minimal approval/failure
  baseline: {
    name: 'Baseline',
    description: 'Baseline performance: 20 agents, 50 tasks each, 5% approval gates, 1% failures',
    agentCount: 20,
    tasksPerAgent: 50,
    approvalGateRate: 5,
    failureRate: 1,
    latencyProfile: 'uniform',
  },

  // Worst case: High approval + high failure rates
  stress_test: {
    name: 'Stress Test',
    description: 'Worst case: 40 agents, 100 tasks each, 50% approval gates, 25% failures',
    agentCount: 40,
    tasksPerAgent: 100,
    approvalGateRate: 50,
    failureRate: 25,
    latencyProfile: 'skewed',
  },
};

/**
 * Generate realistic latency based on profile
 */
export function generateLatency(profile: TaskScenario['latencyProfile']): number {
  switch (profile) {
    case 'uniform':
      // Constant: 100-150ms
      return 100 + Math.random() * 50;

    case 'normal':
      // Normal distribution around 150ms (most common)
      // Using Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.max(50, 150 + z * 75); // Mean 150ms, std 75ms, min 50ms

    case 'skewed':
      // Bimodal: fast (50-100ms) OR slow (200-500ms)
      if (Math.random() < 0.7) {
        return 50 + Math.random() * 50;
      }
      return 200 + Math.random() * 300;

    default:
      return 100;
  }
}

/**
 * Task generator based on scenario
 */
export class TaskGenerator {
  private scenario: TaskScenario;
  private skills: string[] = ['sourceFetch', 'documentParser', 'normalizer', 'testRunner', 'workspacePatch'];
  private taskCounter: number = 0;

  constructor(scenario: TaskScenario = scenarios.production_standard) {
    this.scenario = scenario;
  }

  /**
   * Get next task in sequence
   */
  nextTask(): {
    taskId: string;
    agentId: string;
    skillId: string;
    requiresApproval: boolean;
    shouldFail: boolean;
    expectedLatency: number;
  } {
    const totalTasks = this.scenario.agentCount * this.scenario.tasksPerAgent;
    const agentIndex = this.taskCounter % this.scenario.agentCount;
    const agentId = this.getAgentId(agentIndex);
    const skillId = this.skills[this.taskCounter % this.skills.length];
    const requiresApproval = Math.random() * 100 < this.scenario.approvalGateRate;
    const shouldFail = Math.random() * 100 < this.scenario.failureRate;
    const expectedLatency = generateLatency(this.scenario.latencyProfile);

    const task = {
      taskId: `task-${this.taskCounter}-${Date.now()}`,
      agentId,
      skillId,
      requiresApproval,
      shouldFail,
      expectedLatency,
    };

    this.taskCounter++;

    return task;
  }

  /**
   * Generate all tasks for scenario
   */
  generateAll(): Array<ReturnType<TaskGenerator['nextTask']>> {
    const tasks = [];
    const totalTasks = this.scenario.agentCount * this.scenario.tasksPerAgent;

    for (let i = 0; i < totalTasks; i++) {
      tasks.push(this.nextTask());
    }

    return tasks;
  }

  /**
   * Get agent ID by index
   */
  private getAgentId(index: number): string {
    if (index < allAgents.length) {
      return allAgents[index].id;
    }
    return `agent-${index}`;
  }

  /**
   * Reset counter
   */
  reset(): void {
    this.taskCounter = 0;
  }

  /**
   * Get scenario info
   */
  getScenario(): TaskScenario {
    return this.scenario;
  }

  /**
   * Get progress
   */
  getProgress(): {
    completed: number;
    total: number;
    percentage: number;
  } {
    const total = this.scenario.agentCount * this.scenario.tasksPerAgent;
    return {
      completed: this.taskCounter,
      total,
      percentage: (this.taskCounter / total) * 100,
    };
  }
}

/**
 * Statistics calculator for load test results
 */
export class StatsCalculator {
  /**
   * Calculate percentile
   */
  static percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate mean
   */
  static mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  static stddev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = this.mean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate histogram
   */
  static histogram(
    values: number[],
    bucketSize: number = 50,
  ): Record<string, number> {
    const buckets: Record<string, number> = {};

    for (const value of values) {
      const bucket = Math.floor(value / bucketSize) * bucketSize;
      const key = `${bucket}-${bucket + bucketSize}`;
      buckets[key] = (buckets[key] || 0) + 1;
    }

    return buckets;
  }
}

/**
 * Approval gate simulator
 */
export class ApprovalSimulator {
  private approvalQueue: Array<{
    taskId: string;
    submittedAt: number;
  }> = [];

  /**
   * Submit task for approval
   */
  submitForApproval(taskId: string): void {
    this.approvalQueue.push({
      taskId,
      submittedAt: Date.now(),
    });
  }

  /**
   * Process next approval in queue
   */
  processNext(): {
    taskId: string;
    approved: boolean;
    turnaroundTime: number;
  } | null {
    if (this.approvalQueue.length === 0) return null;

    const approval = this.approvalQueue.shift()!;
    const turnaroundTime = Date.now() - approval.submittedAt;

    // 95% approval rate in normal conditions
    const approved = Math.random() < 0.95;

    return {
      taskId: approval.taskId,
      approved,
      turnaroundTime,
    };
  }

  /**
   * Process all pending approvals
   */
  processAll(): Array<{
    taskId: string;
    approved: boolean;
    turnaroundTime: number;
  }> {
    const results = [];

    while (this.approvalQueue.length > 0) {
      const result = this.processNext();
      if (result) results.push(result);
    }

    return results;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.approvalQueue.length;
  }

  /**
   * Get average wait time (approximate)
   */
  getAverageWaitTime(): number {
    if (this.approvalQueue.length === 0) return 0;

    const now = Date.now();
    const totalWait = this.approvalQueue.reduce((sum, item) => sum + (now - item.submittedAt), 0);
    return totalWait / this.approvalQueue.length;
  }
}

/**
 * Cost calculator
 */
export class CostCalculator {
  private modelCosts: Record<string, number> = {
    'gpt-4o-mini': 0.00015, // $0.00015 per 1K input tokens
    'claude-3-5-sonnet': 0.003, // $0.003 per 1K input tokens
  };

  private agentModels: Record<string, string> = {
    'market-research-agent': 'gpt-4o-mini',
    'data-extraction-agent': 'gpt-4o-mini',
    'qa-verification-agent': 'gpt-4o-mini',
    'summarization-agent': 'gpt-4o-mini',
    'build-refactor-agent': 'gpt-4o-mini',
    'security-review-agent': 'gpt-4o-mini',
    'content-normalization-agent': 'claude-3-5-sonnet',
    'content-creation-agent': 'claude-3-5-sonnet',
    'integration-orchestration-agent': 'claude-3-5-sonnet',
    'skill-audit-agent': 'claude-3-5-sonnet',
    'system-monitor-agent': 'claude-3-5-sonnet',
  };

  /**
   * Calculate cost for a task
   */
  calculateTaskCost(agentId: string, estimatedTokens: number = 1000): number {
    const model = this.agentModels[agentId] || 'gpt-4o-mini';
    const costPerToken = this.modelCosts[model] || 0.00015;
    return (estimatedTokens / 1000) * costPerToken;
  }

  /**
   * Estimate total cost for scenario
   */
  estimateTotalCost(scenario: TaskScenario): number {
    const totalTasks = scenario.agentCount * scenario.tasksPerAgent;
    const costPerTask = 0.001; // Average £0.001 per task
    return totalTasks * costPerTask;
  }

  /**
   * Get agent cost for period
   */
  getAgentCost(agentId: string, taskCount: number): number {
    return taskCount * this.calculateTaskCost(agentId);
  }
}

// Export scenario picker utility
export function getScenario(name: string): TaskScenario {
  return scenarios[name] || scenarios.production_standard;
}

export function listScenarios(): string[] {
  return Object.keys(scenarios);
}
