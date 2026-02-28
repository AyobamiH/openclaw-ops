import { beforeAll, describe, expect, it } from 'vitest';
import { ToolGate } from '../src/toolGate.js';

describe('ToolGate runtime wiring', () => {
  const gate = new ToolGate();

  beforeAll(async () => {
    await gate.initialize();
  });

  it('allows configured task execution mapping', () => {
    const allowed = gate.canExecuteTask('market-research-agent', 'market-research');
    expect(allowed.allowed).toBe(true);
  });

  it('denies mismatched task execution mapping', () => {
    const denied = gate.canExecuteTask('market-research-agent', 'qa-verification');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('not assigned');
  });

  it('allows permitted skill calls from agent config', async () => {
    const result = await gate.executeSkill('market-research-agent', 'sourceFetch', {
      mode: 'test',
    });
    expect(result.success).toBe(true);
  });

  it('denies forbidden skill calls from agent config', async () => {
    const result = await gate.executeSkill('market-research-agent', 'workspacePatch', {
      mode: 'test',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('allowlist');
  });
});
