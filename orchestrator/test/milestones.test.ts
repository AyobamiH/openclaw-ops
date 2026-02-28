/**
 * Sprint B: Milestone Emitter Test Suite
 * Tests MilestoneEmitter emit(), deliverPending(), misconfiguration warnings, and terminal-state skipping.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { MilestoneEmitter } from '../src/milestones/emitter.js';
import { createDefaultState } from '../src/state.js';
import type { OrchestratorConfig, OrchestratorState } from '../src/types.js';
import type { MilestoneEvent } from '../src/milestones/schema.js';

// Hoist before any module resolution so node:fs/promises properties are configurable.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, appendFile: vi.fn().mockResolvedValue(undefined), mkdir: vi.fn().mockResolvedValue(undefined) };
});

const baseConfig: OrchestratorConfig = {
  docsPath: '/tmp/test-docs',
  logsDir: '/tmp/test-logs',
  stateFile: '/tmp/test-state.json',
};

const configWithUrl: OrchestratorConfig = {
  ...baseConfig,
  milestoneIngestUrl: 'http://localhost:9999/internal/milestones/ingest',
};

const validEvent: MilestoneEvent = {
  milestoneId: 'test.milestone.001',
  timestampUtc: '2026-02-27T23:00:00.000Z',
  scope: 'runtime',
  claim: 'Test milestone emitted.',
  evidence: [{ type: 'log', path: '/tmp/test-logs/test.log', summary: 'test log entry' }],
  riskStatus: 'on-track',
  nextAction: 'Verify delivery.',
  source: 'orchestrator',
};

function makeEmitter(config: OrchestratorConfig, state: OrchestratorState) {
  const persistState = vi.fn().mockResolvedValue(undefined);
  const emitter = new MilestoneEmitter(config, () => state, persistState);
  return { emitter, persistState, state };
}

afterEach(() => {
  delete process.env.MILESTONE_SIGNING_SECRET;
  vi.restoreAllMocks();
});

describe('MilestoneEmitter.emit()', () => {
  it('adds a delivery record to state with status pending', async () => {
    const state = createDefaultState();
    const { emitter } = makeEmitter(baseConfig, state);

    await emitter.emit(validEvent);

    expect(state.milestoneDeliveries).toHaveLength(1);
    expect(state.milestoneDeliveries[0].milestoneId).toBe('test.milestone.001');
    expect(state.milestoneDeliveries[0].status).toBe('pending');
    expect(state.milestoneDeliveries[0].attempts).toBe(0);
    expect(state.milestoneDeliveries[0].idempotencyKey).toHaveLength(32);
  });

  it('calls persistState after queuing', async () => {
    const state = createDefaultState();
    const { emitter, persistState } = makeEmitter(baseConfig, state);

    await emitter.emit(validEvent);

    expect(persistState).toHaveBeenCalled();
  });

  it('rejects invalid event silently (no state mutation)', async () => {
    const state = createDefaultState();
    const { emitter } = makeEmitter(baseConfig, state);

    await emitter.emit({ milestoneId: '' } as unknown as MilestoneEvent);

    expect(state.milestoneDeliveries).toHaveLength(0);
  });

  it('warns when milestoneIngestUrl is set but MILESTONE_SIGNING_SECRET is missing', async () => {
    const state = createDefaultState();
    const { emitter } = makeEmitter(configWithUrl, state);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await emitter.emit(validEvent);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[milestones]'),
      expect.stringContaining('MILESTONE_SIGNING_SECRET'),
    );
  });
});

describe('MilestoneEmitter.deliverPending()', () => {
  it('is a no-op when milestoneIngestUrl is not set', async () => {
    const state = createDefaultState();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { emitter } = makeEmitter(baseConfig, state);

    await emitter.deliverPending();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when MILESTONE_SIGNING_SECRET is not set', async () => {
    const state = createDefaultState();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { emitter } = makeEmitter(configWithUrl, state);

    await emitter.deliverPending();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('marks record as delivered on 200 response', async () => {
    const state = createDefaultState();
    process.env.MILESTONE_SIGNING_SECRET = 'test-secret';
    state.milestoneDeliveries.push({
      idempotencyKey: 'abc123abc123abc1', milestoneId: 'test.milestone.001',
      sentAtUtc: '2026-02-27T23:00:00.000Z', event: validEvent, status: 'pending', attempts: 0,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ ok: true, status: 'accepted', milestoneId: 'test.milestone.001' }),
    } as unknown as Response);

    const { emitter, persistState } = makeEmitter(configWithUrl, state);
    await emitter.deliverPending();

    expect(state.milestoneDeliveries[0].status).toBe('delivered');
    expect(state.milestoneDeliveries[0].attempts).toBe(1);
    expect(persistState).toHaveBeenCalled();
  });

  it('marks record as duplicate on 200 with duplicate status', async () => {
    const state = createDefaultState();
    process.env.MILESTONE_SIGNING_SECRET = 'test-secret';
    state.milestoneDeliveries.push({
      idempotencyKey: 'abc123abc123abc1', milestoneId: 'test.milestone.001',
      sentAtUtc: '2026-02-27T23:00:00.000Z', event: validEvent, status: 'pending', attempts: 0,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ ok: true, status: 'duplicate', milestoneId: 'test.milestone.001' }),
    } as unknown as Response);

    const { emitter } = makeEmitter(configWithUrl, state);
    await emitter.deliverPending();

    expect(state.milestoneDeliveries[0].status).toBe('duplicate');
  });

  it('marks record as rejected on 4xx response', async () => {
    const state = createDefaultState();
    process.env.MILESTONE_SIGNING_SECRET = 'test-secret';
    state.milestoneDeliveries.push({
      idempotencyKey: 'abc123abc123abc1', milestoneId: 'test.milestone.001',
      sentAtUtc: '2026-02-27T23:00:00.000Z', event: validEvent, status: 'pending', attempts: 0,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false, status: 401, text: async () => 'invalid signature',
    } as unknown as Response);

    const { emitter } = makeEmitter(configWithUrl, state);
    await emitter.deliverPending();

    expect(state.milestoneDeliveries[0].status).toBe('rejected');
    expect(state.milestoneDeliveries[0].lastError).toMatch(/401/);
  });

  it('marks record as retrying on 5xx (under max attempts)', async () => {
    const state = createDefaultState();
    process.env.MILESTONE_SIGNING_SECRET = 'test-secret';
    state.milestoneDeliveries.push({
      idempotencyKey: 'abc123abc123abc1', milestoneId: 'test.milestone.001',
      sentAtUtc: '2026-02-27T23:00:00.000Z', event: validEvent, status: 'pending', attempts: 0,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as unknown as Response);

    const { emitter } = makeEmitter(configWithUrl, state);
    await emitter.deliverPending();

    expect(state.milestoneDeliveries[0].status).toBe('retrying');
  });

  it('marks record as dead-letter after max attempts', async () => {
    const state = createDefaultState();
    process.env.MILESTONE_SIGNING_SECRET = 'test-secret';
    state.milestoneDeliveries.push({
      idempotencyKey: 'abc123abc123abc1', milestoneId: 'test.milestone.001',
      sentAtUtc: '2026-02-27T23:00:00.000Z', event: validEvent, status: 'retrying', attempts: 3,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as unknown as Response);

    const { emitter } = makeEmitter(configWithUrl, state);
    await emitter.deliverPending();

    expect(state.milestoneDeliveries[0].status).toBe('dead-letter');
  });

  it('skips already-terminal records (delivered/dead-letter/rejected/duplicate)', async () => {
    const state = createDefaultState();
    process.env.MILESTONE_SIGNING_SECRET = 'test-secret';

    for (const status of ['delivered', 'dead-letter', 'rejected', 'duplicate'] as const) {
      state.milestoneDeliveries.push({
        idempotencyKey: `key-${status}`, milestoneId: 'test.milestone.001',
        sentAtUtc: '2026-02-27T23:00:00.000Z', event: validEvent, status, attempts: 1,
      });
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { emitter } = makeEmitter(configWithUrl, state);
    await emitter.deliverPending();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
