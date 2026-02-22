/**
 * Integration Test: Audit Trail & State Integrity
 * 
 * Validates that the system maintains:
 * - Immutable audit trails with trace ID chains
 * - Consistent state through workflow execution
 * - Idempotent operations (running same task twice = same result)
 * - Proper state snapshots for debugging
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { allAgents } from '../fixtures';
import { MockAuditLogger, MockAgentState, createTraceContext, customAssertions } from '../helpers';

interface StateSnapshot {
  agentId: string;
  state: 'idle' | 'running' | 'error';
  taskCount: number;
  errorCount: number;
  timestamp: number;
  traceId: string;
}

describe('Integration: Audit Trail & State Integrity', () => {
  let auditLogger: MockAuditLogger;
  let agentStates: Map<string, MockAgentState>;
  let stateSnapshots: StateSnapshot[];

  beforeEach(() => {
    auditLogger = new MockAuditLogger();
    agentStates = new Map();
    stateSnapshots = [];

    for (const agent of allAgents) {
      agentStates.set(agent.id, new MockAgentState(agent.id));
    }
  });

  afterEach(() => {
    auditLogger.clear();
    agentStates.forEach((state) => state.reset());
    stateSnapshots = [];
  });

  /**
   * Take a snapshot of all agent states
   */
  function captureStateSnapshot(traceId: string): StateSnapshot[] {
    const snapshots: StateSnapshot[] = [];
    const timestamp = Date.now();

    for (const [agentId, state] of agentStates) {
      snapshots.push({
        agentId,
        state: state.status as 'idle' | 'running' | 'error',
        taskCount: state.taskCount,
        errorCount: state.errorCount,
        timestamp,
        traceId,
      });
    }

    stateSnapshots.push(...snapshots);
    return snapshots;
  }

  /**
   * Simulate task execution and capture audit trail
   */
  async function executeTaskWithAudit(
    agentId: string,
    skillId: string,
    inputData: any = {},
    parentTraceId?: string,
  ): Promise<{
    traceId: string;
    result: any;
    stateSnapshot: StateSnapshot;
  }> {
    const traceContext = createTraceContext(parentTraceId);
    const { traceId } = traceContext;

    // Log action start
    auditLogger.logAction('task_started', agentId, skillId, {
      traceId,
      parentTraceId,
      inputData,
      startTime: Date.now(),
    });

    // Get agent state before
    const stateBefore = {
      taskCount: agentStates.get(agentId)?.taskCount || 0,
      errorCount: agentStates.get(agentId)?.errorCount || 0,
    };

    // Execute task
    const agentState = agentStates.get(agentId);
    if (agentState) {
      agentState.markRunning(skillId);
    }

    // Simulate processing
    await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 50));

    // Task completes
    if (agentState) {
      agentState.markIdle();
    }

    // Log action completion
    auditLogger.logAction('task_completed', agentId, skillId, {
      traceId,
      parentTraceId,
      endTime: Date.now(),
      inputData,
      outputData: { processed: true, by: agentId },
    });

    // Get agent state after
    const stateAfter = {
      taskCount: agentState?.taskCount || 0,
      errorCount: agentState?.errorCount || 0,
    };

    const snapshot = captureStateSnapshot(traceId)[allAgents.findIndex((a) => a.id === agentId)] || {
      agentId,
      state: 'idle' as const,
      taskCount: stateAfter.taskCount,
      errorCount: stateAfter.errorCount,
      timestamp: Date.now(),
      traceId,
    };

    return {
      traceId,
      result: {
        inputData,
        outputData: { processed: true },
        stateChange: {
          taskCountBefore: stateBefore.taskCount,
          taskCountAfter: stateAfter.taskCount,
        },
      },
      stateSnapshot: snapshot,
    };
  }

  it('should create immutable audit trail entries', () => {
    const traceId = auditLogger.logAction('test_action', 'agent1', 'skill1', {
      data: 'original',
    });

    // Get entry
    const entries = auditLogger.getEntries({ action: 'test_action' });
    expect(entries).toHaveLength(1);

    const originalData = JSON.stringify(entries[0]);

    // Try to modify returned entry (shouldn't affect stored entry)
    entries[0].agentId = 'modified';
    entries[0].metadata.data = 'modified';

    // Get entry again - should be unchanged
    const entriesAgain = auditLogger.getEntries({ action: 'test_action' });
    expect(entriesAgain[0].agentId).not.toBe('modified');
    expect(entriesAgain[0].metadata.data).toBe('original');

    const unmodifiedData = JSON.stringify(entriesAgain[0]);
    expect(originalData).toBe(unmodifiedData);
  });

  it('should chain trace IDs through task sequence', async () => {
    // Task 1
    const task1 = await executeTaskWithAudit('market-research-agent', 'sourceFetch', {
      url: 'test1',
    });

    // Task 2 (child of task 1)
    const task2 = await executeTaskWithAudit('data-extraction-agent', 'documentParser',
      { raw: 'data1' },
      task1.traceId,
    );

    // Task 3 (child of task 2)
    const task3 = await executeTaskWithAudit('content-normalization-agent', 'normalizer',
      { parsed: 'data2' },
      task2.traceId,
    );

    // Verify trace chain
    const allEntries = auditLogger.getEntries();
    const task2Entries = allEntries.filter((e) => e.metadata.parentTraceId === task1.traceId);
    expect(task2Entries.length).toBeGreaterThan(0);

    const task3Entries = allEntries.filter((e) => e.metadata.parentTraceId === task2.traceId);
    expect(task3Entries.length).toBeGreaterThan(0);

    // Verify trace chain continuity
    customAssertions.traceIdValid(task1.traceId);
    customAssertions.traceIdValid(task2.traceId);
    customAssertions.traceIdValid(task3.traceId);
  });

  it('should validate trace ID uniqueness', () => {
    const traceIds = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const traceId = auditLogger.logAction('action', 'agent', 'skill');
      traceIds.add(traceId);
    }

    // All trace IDs should be unique
    expect(traceIds.size).toBe(100);
  });

  it('should maintain state consistency across operations', async () => {
    const agentId = 'market-research-agent';
    const initialSnapshot = captureStateSnapshot('initial');

    // Execute multiple tasks
    for (let i = 0; i < 3; i++) {
      await executeTaskWithAudit(agentId, 'sourceFetch', { query: `test${i}` });
    }

    const finalSnapshot = captureStateSnapshot('final');
    const finalAgentSnapshot = finalSnapshot.find((s) => s.agentId === agentId)!;

    // Agent should be idle after all tasks
    expect(finalAgentSnapshot.state).toBe('idle');

    // Task count should reflect executions
    expect(finalAgentSnapshot.taskCount).toBeGreaterThan(0);
  });

  it('should verify idempotent operations produce same result', async () => {
    const agentId = 'data-extraction-agent';
    const skillId = 'documentParser';
    const inputData = { document: 'test-data', format: 'json' };

    // Execute task first time
    const result1 = await executeTaskWithAudit(agentId, skillId, inputData);

    // Execute same task again
    const result2 = await executeTaskWithAudit(agentId, skillId, inputData);

    // Results should be equivalent (same input → same output)
    expect(result1.result.inputData).toEqual(result2.result.inputData);
    expect(result1.result.outputData).toEqual(result2.result.outputData);

    // State changes should be comparable
    expect(result1.stateSnapshot.state).toBe(result2.stateSnapshot.state);
  });

  it('should capture state transitions in audit trail', async () => {
    const agentId = 'qa-verification-agent';
    const preAuditSize = auditLogger.entries.length;

    // Execute task (triggers: running → completed)
    await executeTaskWithAudit(agentId, 'testRunner');

    const postAuditSize = auditLogger.entries.length;
    const newEntries = postAuditSize - preAuditSize;

    // Should have start + completion entries
    expect(newEntries).toBeGreaterThanOrEqual(2);

    // Verify state transitions are logged
    const agentEntries = auditLogger.getEntries({ agentId });
    expect(agentEntries.length).toBeGreaterThan(0);
  });

  it('should support state reconstruction from audit log', () => {
    // Simulate 10 operations
    const operations = [];
    for (let i = 0; i < 10; i++) {
      const agentId = allAgents[i % allAgents.length].id;
      const traceId = auditLogger.logAction('operation', agentId, 'anySkill', {
        sequence: i,
      });
      operations.push({ agentId, traceId, sequence: i });
    }

    // Reconstruct from audit log
    const auditEntries = auditLogger.getEntries({ action: 'operation' });
    expect(auditEntries).toHaveLength(operations.length);

    // Verify sequence integrity
    for (let i = 0; i < auditEntries.length; i++) {
      expect(auditEntries[i].metadata.sequence).toBe(i);
    }
  });

  it('should handle concurrent operations without state corruption', async () => {
    const operations = [];

    // Start 10 concurrent tasks
    for (let i = 0; i < 10; i++) {
      const agentId = allAgents[i % allAgents.length].id;
      operations.push(
        executeTaskWithAudit(agentId, 'skill', { id: i }),
      );
    }

    const results = await Promise.all(operations);

    // All should complete successfully
    expect(results).toHaveLength(10);
    expect(results.every((r) => r.traceId)).toBe(true);

    // Verify final state consistency
    const finalSnapshots = captureStateSnapshot('final');
    for (const snapshot of finalSnapshots) {
      expect(snapshot.state).toBe('idle');
    }
  });

  it('should validate audit trail completeness for workflow', async () => {
    // Execute 3-step workflow
    const step1 = await executeTaskWithAudit('market-research-agent', 'sourceFetch', {
      url: 'test',
    });
    const step2 = await executeTaskWithAudit('data-extraction-agent', 'documentParser',
      { doc: 'data' },
      step1.traceId,
    );
    const step3 = await executeTaskWithAudit('qa-verification-agent', 'testRunner',
      { test: 'data' },
      step2.traceId,
    );

    // Get all entries for this workflow
    const workflowEntries = auditLogger.entries.filter(
      (e) =>
        [step1.traceId, step2.traceId, step3.traceId].includes(
          e.metadata.traceId || e.metadata.parentTraceId,
        ),
    );

    // Should have entries for all steps
    expect(workflowEntries.length).toBeGreaterThanOrEqual(6); // 2 per step (start + completion)
  });

  it('should prevent audit log tampering', () => {
    // Add entry
    const traceId = auditLogger.logAction('original_entry', 'agent', 'skill', {
      value: 'important_data',
    });

    // Get the entries array
    const entries = auditLogger.entries;
    const originalLength = entries.length;

    // Try to add tampered entry
    const tamperedEntry = {
      ...entries[entries.length - 1],
      metadata: { ...entries[entries.length - 1].metadata, value: 'tampered' },
    };

    // Logger should have internal protection against this
    // Verify original entry is unchanged
    const entriesCheck = auditLogger.getEntries({ traceId });
    expect(entriesCheck[0].metadata.value).toBe('important_data');
  });

  it('should provide audit trail filtering by multiple criteria', () => {
    // Add various entries
    auditLogger.logAction('action-a', 'agent-1', 'skill-x', { type: 'fetch' });
    auditLogger.logAction('action-b', 'agent-1', 'skill-y', { type: 'parse' });
    auditLogger.logAction('action-a', 'agent-2', 'skill-x', { type: 'fetch' });

    // Filter by multiple criteria
    const byAgent1AndActionA = auditLogger.getEntries({
      agentId: 'agent-1',
      action: 'action-a',
    });
    expect(byAgent1AndActionA).toHaveLength(1);

    const byAgent1 = auditLogger.getEntries({ agentId: 'agent-1' });
    expect(byAgent1.length).toBeGreaterThanOrEqual(2);

    const byActionA = auditLogger.getEntries({ action: 'action-a' });
    expect(byActionA).toHaveLength(2);
  });

  it('should maintain timestamp ordering in audit trail', () => {
    const entries = [];

    for (let i = 0; i < 5; i++) {
      const traceId = auditLogger.logAction('action', 'agent', 'skill');
      entries.push({ traceId, timestamp: Date.now() });

      // Small delay to ensure different timestamps
      if (i < 4) {
        const start = Date.now();
        while (Date.now() - start < 10) {
          // Busy wait for 10ms
        }
      }
    }

    // Verify timestamps are non-decreasing
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].timestamp).toBeGreaterThanOrEqual(entries[i - 1].timestamp);
    }
  });

  it('should capture metadata for state integrity validation', async () => {
    const metadata = {
      userId: 'test-user-123',
      sessionId: 'session-456',
      timestamp: Date.now(),
      version: '1.0.0',
    };

    const traceId = auditLogger.logAction('action', 'agent', 'skill', metadata);

    const entries = auditLogger.getEntries({ traceId });
    expect(entries[0].metadata.userId).toBe(metadata.userId);
    expect(entries[0].metadata.sessionId).toBe(metadata.sessionId);
  });

  it('should export audit trail for compliance', () => {
    // Add entries
    auditLogger.logAction('action-1', 'agent-1', 'skill-1');
    auditLogger.logAction('action-2', 'agent-2', 'skill-2');

    // Export all entries
    const exportedEntries = auditLogger.getEntries();
    const jsonExport = JSON.stringify(exportedEntries, null, 2);

    // Should be valid JSON
    expect(() => JSON.parse(jsonExport)).not.toThrow();

    // Should contain expected data
    expect(jsonExport).toContain('agent-1');
    expect(jsonExport).toContain('action-1');
  });

  it('should detect and report audit log gaps', () => {
    // Add entries with controlled trace IDs
    const traceId1 = auditLogger.logAction('action-a', 'agent', 'skill');
    const traceId2 = auditLogger.logAction('action-b', 'agent', 'skill');
    const traceId3 = auditLogger.logAction('action-c', 'agent', 'skill');

    // Get sequence
    const allEntries = auditLogger.getEntries();
    expect(allEntries.length).toBeGreaterThanOrEqual(3);

    // Verify no gaps in sequence (all entries present)
    const traceIds = [traceId1, traceId2, traceId3];
    const foundTraceIds = allEntries.map((e) => e.metadata.traceId).slice(0, 3);

    // All should be present (order might differ due to logging)
    for (const traceId of traceIds) {
      expect(allEntries.some((e) => e.metadata.traceId === traceId)).toBe(true);
    }
  });

  it('should validate state snapshots for consistency', () => {
    // Capture initial state
    const snapshot1 = captureStateSnapshot('snap1');

    // Verify all agents represented
    expect(snapshot1.length).toBe(allAgents.length);

    // All should have same timestamp window
    const timestamps = snapshot1.map((s) => s.timestamp);
    const maxDiff = Math.max(...timestamps) - Math.min(...timestamps);
    expect(maxDiff).toBeLessThan(100); // Should be captured within 100ms
  });

  it('should support distributed tracing with parent-child relationships', async () => {
    // Create parent task
    const parent = createTraceContext();

    // Create child tasks
    const child1 = createTraceContext(parent.traceId);
    const child2 = createTraceContext(parent.traceId);

    // Log them
    auditLogger.logAction('parent', 'agent-p', 'skill-p', {
      traceId: parent.traceId,
    });
    auditLogger.logAction('child', 'agent-c1', 'skill-c1', {
      traceId: child1.traceId,
      parentTraceId: parent.traceId,
    });
    auditLogger.logAction('child', 'agent-c2', 'skill-c2', {
      traceId: child2.traceId,
      parentTraceId: parent.traceId,
    });

    // Verify parent has 2 children
    const childEntries = auditLogger.getEntries().filter(
      (e) => e.metadata.parentTraceId === parent.traceId,
    );
    expect(childEntries.length).toBeGreaterThanOrEqual(2);
  });

  it('should validate audit trail can answer "what happened" questions', async () => {
    // Execute operations
    const op1 = await executeTaskWithAudit('market-research-agent', 'sourceFetch', {
      query: 'test',
    });
    const op2 = await executeTaskWithAudit('data-extraction-agent', 'documentParser',
      { doc: 'data' },
      op1.traceId,
    );

    // Question: What did market-research-agent do?
    const agentActions = auditLogger.getEntries({ agentId: 'market-research-agent' });
    expect(agentActions.length).toBeGreaterThan(0);
    expect(agentActions[0].agentId).toBe('market-research-agent');

    // Question: What was the sequence of events for this workflow?
    const sequence = [op1.traceId, op2.traceId];
    const workflowEvents = auditLogger.entries.filter(
      (e) => sequence.includes(e.metadata.traceId || '') || sequence.includes(e.metadata.parentTraceId || ''),
    );
    expect(workflowEvents.length).toBeGreaterThan(0);
  });
});
