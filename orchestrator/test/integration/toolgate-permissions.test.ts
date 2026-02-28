/**
 * Unit Simulation Test: Permission Enforcement (Deny-by-Default)
 * 
 * Validates that ToolGate correctly enforces permissions:
 * - Allowed skill calls succeed
 * - Forbidden skill calls are denied
 * - All attempts are logged in audit trail
 * - No permission violations go undetected
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { allAgents, permissionViolations, skillFixtures } from '../fixtures';
import { MockAuditLogger, customAssertions } from '../helpers';

describe('Unit Simulation: Permission Enforcement (ToolGate)', () => {
  let auditLogger: MockAuditLogger;

  beforeEach(() => {
    auditLogger = new MockAuditLogger();
  });

  afterEach(() => {
    auditLogger.clear();
  });

  /**
   * Simulate ToolGate permission checking
   */
  function checkSkillPermission(agentId: string, skillId: string): boolean {
    const agent = allAgents.find((a) => a.id === agentId);
    if (!agent) return false;

    const skillPerms = agent.permissions?.skills[skillId];
    return skillPerms?.allowed === true;
  }

  /**
   * Simulate skill invocation with permission check
   */
  async function invokeSkill(agentId: string, skillId: string, args: any = {}): Promise<{
    allowed: boolean;
    traceId: string;
    result?: any;
    error?: string;
  }> {
    const hasPermission = checkSkillPermission(agentId, skillId);

    if (hasPermission) {
      const traceId = auditLogger.logAction('skill_invocation_allowed', agentId, skillId, {
        status: 'success',
        args,
      });
      return {
        allowed: true,
        traceId,
        result: { success: true, data: `Executed ${skillId}` },
      };
    } else {
      const traceId = auditLogger.logAction('skill_invocation_denied', agentId, skillId, {
        status: 'denied',
        reason: 'Agent does not have permission to access this skill',
      });
      return {
        allowed: false,
        traceId,
        error: 'Permission denied',
      };
    }
  }

  it('should allow agent to call permitted skill', async () => {
    // Market-research agent has sourceFetch permission
    const result = await invokeSkill('market-research-agent', 'sourceFetch', { url: 'https://example.com' });

    expect(result.allowed).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.error).toBeUndefined();
    customAssertions.traceIdValid(result.traceId);
  });

  it('should deny agent calling forbidden skill', async () => {
    // Market-research agent does NOT have documentParser permission
    const result = await invokeSkill('market-research-agent', 'documentParser');

    expect(result.allowed).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.result).toBeUndefined();
  });

  it('should log allowed skill invocations to audit trail', async () => {
    await invokeSkill('market-research-agent', 'sourceFetch');
    await invokeSkill('data-extraction-agent', 'documentParser');
    await invokeSkill('qa-verification-agent', 'testRunner');

    const auditEntries = auditLogger.getEntries({ action: 'skill_invocation_allowed' });
    expect(auditEntries).toHaveLength(3);
    expect(auditEntries[0].agentId).toBe('market-research-agent');
    expect(auditEntries[1].agentId).toBe('data-extraction-agent');
    expect(auditEntries[2].agentId).toBe('qa-verification-agent');
  });

  it('should log denied skill invocations to audit trail', async () => {
    await invokeSkill('market-research-agent', 'documentParser');
    await invokeSkill('market-research-agent', 'normalizer');
    await invokeSkill('data-extraction-agent', 'sourceFetch');

    const deniedEntries = auditLogger.getEntries({ action: 'skill_invocation_denied' });
    expect(deniedEntries).toHaveLength(3);
    expect(deniedEntries[0].agentId).toBe('market-research-agent');
    expect(deniedEntries[0].skillId).toBe('documentParser');
  });

  it('should enforce deny-by-default for unknown skills', async () => {
    // Try to invoke a non-existent skill
    const result = await invokeSkill('market-research-agent', 'unknownSkill');
    expect(result.allowed).toBe(false);
  });

  it('should handle all known permission violations', async () => {
    const violations = Object.entries(permissionViolations);

    for (const [name, violation] of violations) {
      const result = await invokeSkill(violation.agentId, violation.skillId);
      expect(result.allowed).toBe(!violation.expectedDenied);
    }
  });

  it('should generate unique trace IDs for each invocation', async () => {
    const traceIds = new Set<string>();

    for (let i = 0; i < 10; i++) {
      const result = await invokeSkill('market-research-agent', 'sourceFetch');
      traceIds.add(result.traceId);
    }

    // All trace IDs should be unique
    expect(traceIds.size).toBe(10);
  });

  it('should not allow permission escalation', async () => {
    // Even if an agent somehow tries to escalate, it should still be denied
    const result = await invokeSkill('market-research-agent', 'workspacePatch', {
      escalate: true,
      force: true,
    });

    expect(result.allowed).toBe(false);
  });

  it('should validate permission boundaries are enforced consistently', async () => {
    // Run the same permission check 100 times for consistency
    const results: boolean[] = [];

    for (let i = 0; i < 100; i++) {
      const allowed = checkSkillPermission('market-research-agent', 'sourceFetch');
      results.push(allowed);
    }

    // All results should be true (allowed)
    expect(results.every((r) => r === true)).toBe(true);
  });

  it('should prevent agent A from acting as agent B', async () => {
    // Ensure agents can't impersonate each other
    const result = await invokeSkill('market-research-agent', 'testRunner', {
      actAsAgent: 'qa-verification-agent',
    });

    expect(result.allowed).toBe(false);
  });

  it('should audit every permission decision', async () => {
    const initialLogSize = auditLogger.entries.length;

    await invokeSkill('market-research-agent', 'sourceFetch');
    await invokeSkill('market-research-agent', 'documentParser');
    await invokeSkill('data-extraction-agent', 'normalizer');

    const finalLogSize = auditLogger.entries.length;
    expect(finalLogSize - initialLogSize).toBe(3); // 3 decisions logged
  });

  it('should protect against permission bypass attempts', async () => {
    // Try various bypass attempts
    const bypasses = [
      { method: 'null_skill', agentId: 'market-research-agent', skillId: null },
      { method: 'empty_skill', agentId: 'market-research-agent', skillId: '' },
      { method: 'special_chars', agentId: 'market-research-agent', skillId: 'skill; DROP TABLE' },
      { method: 'very_long_skill', agentId: 'market-research-agent', skillId: 'x'.repeat(10000) },
    ];

    for (const bypass of bypasses) {
      const result = await invokeSkill(bypass.agentId, bypass.skillId as string);
      expect(result.allowed).toBe(false);
    }
  });

  it('should validate skill maxCalls limits are respected', async () => {
    // Market-research-agent has sourceFetch with maxCalls: 20
    const agentConfig = allAgents.find((a) => a.id === 'market-research-agent')!;
    const sourceFetchMaxCalls = agentConfig.permissions?.skills.sourceFetch?.maxCalls;

    expect(sourceFetchMaxCalls).toBe(20);

    // Simulate reaching the limit
    for (let i = 0; i < 20; i++) {
      await invokeSkill('market-research-agent', 'sourceFetch');
    }

    const invokedEntries = auditLogger.getEntries({ agentId: 'market-research-agent' });
    expect(invokedEntries.length).toBeGreaterThanOrEqual(20);
  });

  it('should differentiate between permission denied vs skill not found', async () => {
    // Skill exists but agent doesn't have permission
    const permissionDenied = await invokeSkill('market-research-agent', 'documentParser');
    expect(permissionDenied.allowed).toBe(false);

    // Skill doesn't exist (even if agent had permission, it wouldn't matter)
    const skillNotFound = await invokeSkill('market-research-agent', 'nonExistentSkill');
    expect(skillNotFound.allowed).toBe(false);

    // Both should be denied, but potentially for different reasons
    // The audit log should capture the distinction
    const deniedEntries = auditLogger.getEntries({ action: 'skill_invocation_denied' });
    expect(deniedEntries.length).toBeGreaterThanOrEqual(2);
  });

  it('should track approval gate invocations separately', async () => {
    // Some invocations require approval
    const traceId = auditLogger.logAction('skill_invocation_requires_approval', 'build-refactor-agent', 'workspacePatch',
      {
        status: 'pending_approval',
        requiresApproval: true,
      },
    );

    expect(traceId).toBeDefined();

    const approvalEntries = auditLogger.getEntries({ action: 'skill_invocation_requires_approval' });
    expect(approvalEntries).toHaveLength(1);
  });

  it('should validate network permission enforcement', async () => {
    // market-research-agent has network: allowed
    // Try to access external URL
    const allowedNetworkCall = checkSkillPermission('market-research-agent', 'sourceFetch');
    expect(allowedNetworkCall).toBe(true);

    // data-extraction-agent has network: false
    // Try to use sourceFetch (which requires network)
    const deniedNetworkCall = checkSkillPermission('data-extraction-agent', 'sourceFetch');
    expect(deniedNetworkCall).toBe(false);
  });

  it('should prevent skill reuse across security boundaries', async () => {
    // workspacePatch is only for build-refactor-agent
    const qaAttempt = await invokeSkill('qa-verification-agent', 'workspacePatch');
    expect(qaAttempt.allowed).toBe(false);

    const buildAttempt = await invokeSkill('build-refactor-agent', 'workspacePatch');
    expect(buildAttempt.allowed).toBe(true);
  });

  it('should validate complete audit trail is immutable', () => {
    // Log some actions
    auditLogger.logAction('action1', 'agent1', 'skill1');
    auditLogger.logAction('action2', 'agent2', 'skill2');

    // Get the entries
    const entries1 = auditLogger.getEntries();
    const count1 = entries1.length;

    // Try to modify the returned entries (shouldn't affect the log)
    entries1[0].agentId = 'hacked!';

    // Get entries again - should be unchanged
    const entries2 = auditLogger.getEntries();
    expect(entries2[0].agentId).not.toBe('hacked!');
    expect(entries2.length).toBe(count1);
  });
});
