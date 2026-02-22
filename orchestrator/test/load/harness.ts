/**
 * STAGE 2: Load Test Harness
 * 
 * Executes 3,000 tasks across 40 agents with:
 * - 15% requiring approval gates (<60s turnaround)
 * - 10% forced failures (test recovery)
 * - Latency tracking (p50/p95/p99)
 * - Error rate monitoring
 * - Cost budget enforcement (£20 cap)
 */

import { MockAuditLogger, MockAgentState, createTraceContext } from '../helpers';
import { allAgents } from '../fixtures';

interface LoadTestConfig {
  totalAgents: number; // 40
  tasksPerAgent: number; // 75 each
  approvalGatePercentage: number; // 15%
  failureRatePercentage: number; // 10%
  costBudgetCap: number; // £20
  p95LatencyTarget: number; // 2.5s
  errorRateTarget: number; // 1%
  approvalTurnaroundTarget: number; // 60s
}

interface TaskMetrics {
  taskId: string;
  agentId: string;
  skillId: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
  requiresApproval: boolean;
  approvalTurnaround?: number;
  cost: number;
  traceId: string;
}

interface LoadTestResult {
  config: LoadTestConfig;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  tasksRequiringApproval: number;
  approvalsCompleted: number;
  approvalsRejected: number;
  metrics: {
    latency: {
      p50: number;
      p95: number;
      p99: number;
      mean: number;
      min: number;
      max: number;
    };
    errorRate: number;
    approvalTurnaround: {
      mean: number;
      p95: number;
      max: number;
    };
    costSummary: {
      totalCost: number;
      costPerTask: number;
      costByAgent: Record<string, number>;
      withinBudget: boolean;
    };
  };
  agentStats: Record<string, {
    tasksCompleted: number;
    tasksFailed: number;
    averageLatency: number;
    errorRate: number;
    totalCost: number;
  }>;
  duration: number;
  startTime: number;
  endTime: number;
}

export class LoadTestHarness {
  private config: LoadTestConfig;
  private auditLogger: MockAuditLogger;
  private agentStates: Map<string, MockAgentState>;
  private taskMetrics: TaskMetrics[] = [];
  private approvalQueue: Array<{ taskId: string; turnaroundTime: number }> = [];

  constructor(
    config: Partial<LoadTestConfig> = {},
  ) {
    // Set defaults aligned with user requirements
    this.config = {
      totalAgents: 40,
      tasksPerAgent: 75,
      approvalGatePercentage: 15,
      failureRatePercentage: 10,
      costBudgetCap: 20, // £20
      p95LatencyTarget: 2.5, // seconds
      errorRateTarget: 0.01, // 1%
      approvalTurnaroundTarget: 60, // seconds
      ...config,
    };

    this.auditLogger = new MockAuditLogger();
    this.agentStates = new Map();

    // Initialize agents (use deployed agents + simulate extras for 40 total)
    for (let i = 0; i < this.config.totalAgents; i++) {
      const agent = allAgents[i % allAgents.length];
      const agentId = i < allAgents.length ? agent.id : `agent-${i}`;
      this.agentStates.set(agentId, new MockAgentState(agentId));
    }
  }

  /**
   * Execute the full 3,000-task load test
   */
  async run(): Promise<LoadTestResult> {
    const startTime = Date.now();

    console.log('🚀 Starting STAGE 2 Load Test');
    console.log(`   Total Tasks: ${this.config.totalAgents * this.config.tasksPerAgent}`);
    console.log(`   Approval Gates: ${this.config.approvalGatePercentage}%`);
    console.log(`   Failure Rate: ${this.config.failureRatePercentage}%`);

    // Phase 1: Generate and execute all tasks
    await this.executeAllTasks();

    // Phase 2: Process approval gates
    await this.processApprovalGates();

    // Phase 3: Collect and analyze metrics
    const result = this.compileResults(Date.now() - startTime, startTime);

    return result;
  }

  /**
   * Execute all 3,000 tasks
   */
  private async executeAllTasks(): Promise<void> {
    const totalTasks = this.config.totalAgents * this.config.tasksPerAgent;
    const skills = ['sourceFetch', 'documentParser', 'normalizer', 'testRunner', 'workspacePatch'];

    for (let taskNum = 0; taskNum < totalTasks; taskNum++) {
      // Distribute tasks across agents
      const agentIndex = taskNum % this.config.totalAgents;
      const agentId = this.getAgentIdByIndex(agentIndex);

      // Randomly select skill
      const skillId = skills[Math.floor(Math.random() * skills.length)];

      // Determine if this task requires approval
      const requiresApproval = Math.random() * 100 < this.config.approvalGatePercentage;

      // Determine if this task should fail
      const shouldFail = Math.random() * 100 < this.config.failureRatePercentage;

      // Execute task
      const taskMetric = await this.executeTask(
        agentId,
        skillId,
        requiresApproval,
        shouldFail,
        taskNum,
      );

      this.taskMetrics.push(taskMetric);

      // Progress feedback every 500 tasks
      if ((taskNum + 1) % 500 === 0) {
        const percent = ((taskNum + 1) / totalTasks) * 100;
        console.log(`   ⏳ ${taskNum + 1}/${totalTasks} tasks (${percent.toFixed(1)}%)`);
      }

      // Small delay to simulate realistic load
      if (taskNum % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    console.log(`   ✅ All ${totalTasks} tasks executed`);
  }

  /**
   * Execute a single task with metrics
   */
  private async executeTask(
    agentId: string,
    skillId: string,
    requiresApproval: boolean,
    shouldFail: boolean,
    taskNum: number,
  ): Promise<TaskMetrics> {
    const traceId = createTraceContext().traceId;
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      // Get agent state
      const agentState = this.agentStates.get(agentId);
      if (!agentState) throw new Error(`Agent not found: ${agentId}`);

      // Mark as running
      agentState.markRunning(skillId);

      // Simulate execution with realistic latency (50-300ms)
      const executionTime = 50 + Math.random() * 250;
      await new Promise((resolve) => setTimeout(resolve, executionTime));

      // Simulate failure if needed
      if (shouldFail) {
        throw new Error('Simulated task failure');
      }

      // If requires approval, add to queue
      if (requiresApproval) {
        this.approvalQueue.push({
          taskId: traceId,
          turnaroundTime: Date.now(),
        });

        agentState.markError('Pending approval');
      } else {
        agentState.markIdle();
      }
    } catch (err) {
      success = false;
      error = (err as Error).message;
      const agentState = this.agentStates.get(agentId);
      if (agentState) {
        agentState.markError(error);
      }
    }

    const duration = Date.now() - startTime;

    // Calculate cost (£0.001 - £0.01 per task based on model tier)
    const cost = 0.001 + Math.random() * 0.009;

    // Log audit trail
    this.auditLogger.logAction(success ? 'task_completed' : 'task_failed', agentId, skillId, {
      traceId,
      taskNum,
      duration,
      cost,
      requiresApproval,
    });

    return {
      taskId: traceId,
      agentId,
      skillId,
      duration,
      timestamp: Date.now(),
      success,
      error,
      requiresApproval,
      cost,
      traceId,
    };
  }

  /**
   * Process pending approval gates
   */
  private async processApprovalGates(): Promise<void> {
    const approvals = this.approvalQueue.length;
    let approved = 0;
    let rejected = 0;

    console.log(`⏳ Processing ${approvals} approval gates...`);

    for (const approval of this.approvalQueue) {
      // Simulate approval decision time (typically <60s)
      const turnaroundTime = Math.random() * 55000; // 0-55s

      // 95% approval rate in normal conditions
      const isApproved = Math.random() < 0.95;

      if (isApproved) {
        approved++;

        // Find and mark the corresponding task as completed
        const metric = this.taskMetrics.find((m) => m.taskId === approval.taskId);
        if (metric) {
          metric.success = true;
          metric.approvalTurnaround = turnaroundTime;
        }
      } else {
        rejected++;
      }

      // Log approval decision
      this.auditLogger.logAction('approval_processed', 'approval-gate', 'review', {
        traceId: approval.taskId,
        approved: isApproved,
        turnaroundTime,
      });
    }

    console.log(`   ✅ Approvals: ${approved} approved, ${rejected} rejected`);
  }

  /**
   * Get agent ID by index
   */
  private getAgentIdByIndex(index: number): string {
    if (index < allAgents.length) {
      return allAgents[index].id;
    }
    return `agent-${index}`;
  }

  /**
   * Compile and analyze results
   */
  private compileResults(duration: number, startTime: number): LoadTestResult {
    // Calculate latency percentiles
    const latencies = this.taskMetrics.map((m) => m.duration).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const meanLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    // Calculate error rate
    const failedTasks = this.taskMetrics.filter((m) => !m.success).length;
    const errorRate = failedTasks / this.taskMetrics.length;

    // Calculate approval turnaround
    const approvalTurnarounds = this.taskMetrics
      .filter((m) => m.approvalTurnaround)
      .map((m) => m.approvalTurnaround!);
    const meanApprovalTime = approvalTurnarounds.length > 0
      ? approvalTurnarounds.reduce((a, b) => a + b, 0) / approvalTurnarounds.length
      : 0;
    const p95ApprovalTime = approvalTurnarounds.length > 0
      ? approvalTurnarounds.sort((a, b) => a - b)[
          Math.floor(approvalTurnarounds.length * 0.95)
        ]
      : 0;

    // Calculate costs
    const totalCost = this.taskMetrics.reduce((sum, m) => sum + m.cost, 0);
    const costByAgent: Record<string, number> = {};
    for (const metric of this.taskMetrics) {
      costByAgent[metric.agentId] = (costByAgent[metric.agentId] || 0) + metric.cost;
    }

    // Calculate per-agent stats
    const agentStats: Record<string, any> = {};
    for (const [agentId] of this.agentStates) {
      const agentTasks = this.taskMetrics.filter((m) => m.agentId === agentId);
      const agentFailed = agentTasks.filter((m) => !m.success).length;
      const agentLatencies = agentTasks.map((m) => m.duration);

      agentStats[agentId] = {
        tasksCompleted: agentTasks.filter((m) => m.success).length,
        tasksFailed: agentFailed,
        averageLatency: agentLatencies.length > 0
          ? agentLatencies.reduce((a, b) => a + b, 0) / agentLatencies.length
          : 0,
        errorRate: agentTasks.length > 0 ? agentFailed / agentTasks.length : 0,
        totalCost: costByAgent[agentId] || 0,
      };
    }

    return {
      config: this.config,
      totalTasks: this.taskMetrics.length,
      successfulTasks: this.taskMetrics.filter((m) => m.success).length,
      failedTasks,
      tasksRequiringApproval: this.approvalQueue.length,
      approvalsCompleted: this.taskMetrics.filter((m) => m.approvalTurnaround).length,
      approvalsRejected: this.approvalQueue.length - this.taskMetrics.filter((m) => m.approvalTurnaround).length,
      metrics: {
        latency: {
          p50,
          p95,
          p99,
          mean: meanLatency,
          min: Math.min(...latencies),
          max: Math.max(...latencies),
        },
        errorRate: errorRate * 100, // Convert to percentage
        approvalTurnaround: {
          mean: meanApprovalTime,
          p95: p95ApprovalTime,
          max: Math.max(...approvalTurnarounds, 0),
        },
        costSummary: {
          totalCost: parseFloat(totalCost.toFixed(2)),
          costPerTask: parseFloat((totalCost / this.taskMetrics.length).toFixed(4)),
          costByAgent,
          withinBudget: totalCost <= this.config.costBudgetCap,
        },
      },
      agentStats,
      duration: duration / 1000, // Convert to seconds
      startTime,
      endTime: Date.now(),
    };
  }

  /**
   * Format and display results
   */
  static formatResults(result: LoadTestResult): string {
    const {
      totalTasks,
      successfulTasks,
      failedTasks,
      tasksRequiringApproval,
      approvalsCompleted,
      approvalsRejected,
      metrics,
      agentStats,
      duration,
      config,
    } = result;

    const lines: string[] = [
      '',
      '╔════════════════════════════════════════════════════════════════╗',
      '║         STAGE 2: LOAD TEST RESULTS (3,000 Tasks)             ║',
      '╚════════════════════════════════════════════════════════════════╝',
      '',
      '📊 EXECUTION SUMMARY',
      `   Total Duration: ${duration.toFixed(1)}s`,
      `   Total Tasks: ${totalTasks.toLocaleString()}`,
      `   ✅ Successful: ${successfulTasks.toLocaleString()} (${((successfulTasks / totalTasks) * 100).toFixed(1)}%)`,
      `   ❌ Failed: ${failedTasks.toLocaleString()} (${((failedTasks / totalTasks) * 100).toFixed(1)}%)`,
      '',
      '⏱️  LATENCY METRICS',
      `   p50:  ${metrics.latency.p50.toFixed(0)}ms ${metrics.latency.p50 <= config.p95LatencyTarget * 1000 ? '✅' : '⚠️'}`,
      `   p95:  ${metrics.latency.p95.toFixed(0)}ms ${metrics.latency.p95 <= config.p95LatencyTarget * 1000 ? '✅' : '❌'}`,
      `   p99:  ${metrics.latency.p99.toFixed(0)}ms`,
      `   Mean: ${metrics.latency.mean.toFixed(0)}ms`,
      `   Min:  ${metrics.latency.min.toFixed(0)}ms`,
      `   Max:  ${metrics.latency.max.toFixed(0)}ms`,
      '',
      '⚠️  ERROR RATE',
      `   Rate: ${metrics.errorRate.toFixed(2)}% ${metrics.errorRate <= config.errorRateTarget * 100 ? '✅' : '❌'}`,
      `   Target: ${(config.errorRateTarget * 100).toFixed(2)}%`,
      '',
      '🎫 APPROVAL GATES',
      `   Requiring Approval: ${tasksRequiringApproval.toLocaleString()} (${((tasksRequiringApproval / totalTasks) * 100).toFixed(1)}%)`,
      `   Approved: ${approvalsCompleted.toLocaleString()}`,
      `   Rejected: ${approvalsRejected.toLocaleString()}`,
      `   Avg Turnaround: ${metrics.approvalTurnaround.mean.toFixed(0)}ms ${metrics.approvalTurnaround.mean <= config.approvalTurnaroundTarget * 1000 ? '✅' : '⚠️'}`,
      `   p95 Turnaround: ${metrics.approvalTurnaround.p95.toFixed(0)}ms`,
      '',
      '💳 COST ANALYSIS',
      `   Total: £${metrics.costSummary.totalCost.toFixed(2)} ${metrics.costSummary.withinBudget ? '✅' : '❌'}`,
      `   Budget Cap: £${config.costBudgetCap.toFixed(2)}`,
      `   Per Task: £${metrics.costSummary.costPerTask.toFixed(4)}`,
      `   Remaining: £${(config.costBudgetCap - metrics.costSummary.totalCost).toFixed(2)}`,
      '',
      '✅ TEST RESULTS',
    ];

    // Check all SLA targets
    const slasMet = {
      latencyP95: metrics.latency.p95 <= config.p95LatencyTarget * 1000,
      errorRate: metrics.errorRate <= config.errorRateTarget * 100,
      approvalTurnaround: metrics.approvalTurnaround.mean <= config.approvalTurnaroundTarget * 1000,
      costBudget: metrics.costSummary.withinBudget,
    };

    const allPassed = Object.values(slasMet).every((v) => v === true);

    if (allPassed) {
      lines.push('   🎉 ALL SLA TARGETS MET');
    } else {
      if (!slasMet.latencyP95) lines.push('   ⚠️  p95 Latency EXCEEDED');
      if (!slasMet.errorRate) lines.push('   ⚠️  Error Rate EXCEEDED');
      if (!slasMet.approvalTurnaround) lines.push('   ⚠️  Approval Turnaround EXCEEDED');
      if (!slasMet.costBudget) lines.push('   ⚠️  Cost Budget EXCEEDED');
    }

    lines.push('', '🤖 TOP 5 AGENTS BY THROUGHPUT', '');

    // Sort agents by tasks completed
    const topAgents = Object.entries(agentStats)
      .sort(([, a], [, b]) => b.tasksCompleted - a.tasksCompleted)
      .slice(0, 5);

    for (const [agentId, stats] of topAgents) {
      lines.push(
        `   ${agentId}`,
        `     Tasks: ${stats.tasksCompleted} completed, ${stats.tasksFailed} failed`,
        `     Latency: ${stats.averageLatency.toFixed(0)}ms avg`,
        `     Cost: £${stats.totalCost.toFixed(2)}`,
      );
    }

    lines.push('', '');

    return lines.join('\n');
  }
}

export default LoadTestHarness;
