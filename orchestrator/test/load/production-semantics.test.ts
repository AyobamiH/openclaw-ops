import { describe, it, expect } from 'vitest';
import LoadTestHarness from './harness';

describe('STAGE 2: Production-Semantics Load Pass', () => {
  it(
    'should execute 3000 tasks with production-like failure profile',
    async () => {
      const harness = new LoadTestHarness({
        totalAgents: 40,
        tasksPerAgent: 75,
        approvalGatePercentage: 12,
        failureRatePercentage: 0.5,
        costBudgetCap: 20,
        p95LatencyTarget: 2.5,
        errorRateTarget: 0.01,
        approvalTurnaroundTarget: 60,
      });

      const result = await harness.run();

      console.log(LoadTestHarness.formatResults(result));

      expect(result.totalTasks).toBe(3000);
      expect(result.metrics.latency.p95).toBeLessThan(2500);
      expect(result.metrics.errorRate).toBeLessThan(1);
      expect(result.metrics.approvalTurnaround.mean).toBeLessThan(60000);
      expect(result.metrics.costSummary.withinBudget).toBe(true);
    },
    900000,
  );
});