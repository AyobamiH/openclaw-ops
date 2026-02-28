/**
 * Sprint C: Milestone Pipeline End-to-End Test
 *
 * Tests the full contract: orchestrator emitter signs an envelope,
 * posts it to an HTTP server that verifies the HMAC signature using
 * the same algorithm as the openclawdbot ingest route.
 *
 * Covers:
 *  - emit → deliverPending → real HTTP POST → signature verified
 *  - wrong secret → signature rejected → record status 'rejected'
 *  - idempotency: same idempotencyKey received twice → second is duplicate
 *  - dead-letter: server consistently 503s → hits MAX_DELIVERY_ATTEMPTS
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestoneEmitter } from '../src/milestones/emitter.js';
import { createDefaultState } from '../src/state.js';
import type { OrchestratorConfig, OrchestratorState } from '../src/types.js';
import type { MilestoneEvent } from '../src/milestones/schema.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, appendFile: vi.fn().mockResolvedValue(undefined), mkdir: vi.fn().mockResolvedValue(undefined) };
});

// ── helpers ──────────────────────────────────────────────────────────────────

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj as object).sort()) {
      sorted[k] = sortObjectKeys((obj as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return obj;
}

function verifySignature(payload: unknown, secret: string, provided: string): boolean {
  const expected = createHmac('sha256', secret)
    .update(JSON.stringify(sortObjectKeys(payload)))
    .digest('hex');
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

type IngestRequest = { idempotencyKey: string; sentAtUtc: string; event: MilestoneEvent };

/** Spin up a minimal ingest server on a random port. */
function startIngestServer(opts: {
  secret: string;
  seen?: Set<string>;
  forceStatus?: number;
}): Promise<{ url: string; received: IngestRequest[]; close: () => Promise<void> }> {
  const received: IngestRequest[] = [];
  const seen = opts.seen ?? new Set<string>();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (opts.forceStatus) {
      res.writeHead(opts.forceStatus);
      res.end(JSON.stringify({ ok: false, status: 'error' }));
      return;
    }

    const rawBody = await readBody(req);
    const sig = (req.headers['x-openclaw-signature'] as string) ?? '';
    const body = JSON.parse(rawBody) as IngestRequest;

    if (!verifySignature(body, opts.secret, sig)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, status: 'rejected', reason: 'invalid signature' }));
      return;
    }

    if (seen.has(body.idempotencyKey)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, status: 'duplicate', milestoneId: body.event.milestoneId }));
      return;
    }

    seen.add(body.idempotencyKey);
    received.push(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, status: 'accepted', milestoneId: body.event.milestoneId }));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}/internal/milestones/ingest`,
        received,
        close: () => new Promise<void>((ok, fail) => server.close((e) => (e ? fail(e) : ok()))),
      });
    });
  });
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const TEST_SECRET = 'e2e-test-secret-abc123';

const validEvent: MilestoneEvent = {
  milestoneId: 'e2e.milestone.001',
  timestampUtc: '2026-02-28T00:00:00.000Z',
  scope: 'runtime',
  claim: 'E2E: orchestrator started.',
  evidence: [{ type: 'log', path: '/tmp/state.json', summary: 'state written' }],
  riskStatus: 'on-track',
  nextAction: 'Monitor task queue.',
  source: 'orchestrator',
};

function makeEmitter(config: OrchestratorConfig, state: OrchestratorState) {
  const persistState = vi.fn().mockResolvedValue(undefined);
  return { emitter: new MilestoneEmitter(config, () => state, persistState), persistState };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('Milestone pipeline e2e: emit → deliver → ingest', () => {
  beforeEach(() => {
    process.env.MILESTONE_SIGNING_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env.MILESTONE_SIGNING_SECRET;
    vi.restoreAllMocks();
  });

  it('emits an event and delivers it with a verified HMAC signature', async () => {
    const srv = await startIngestServer({ secret: TEST_SECRET });
    const state = createDefaultState();
    const config: OrchestratorConfig = { docsPath: '/tmp', logsDir: '/tmp', stateFile: '/tmp/state.json', milestoneIngestUrl: srv.url };
    const { emitter } = makeEmitter(config, state);

    await emitter.emit(validEvent);
    // emit() fires deliverPending() as a background task — wait for it to settle
    await new Promise<void>((r) => setTimeout(r, 100));

    expect(srv.received).toHaveLength(1);
    expect(srv.received[0]!.event.milestoneId).toBe('e2e.milestone.001');
    expect(state.milestoneDeliveries[0]!.status).toBe('delivered');
    await srv.close();
  });

  it('rejects delivery when secret is wrong — record becomes rejected', async () => {
    const srv = await startIngestServer({ secret: 'wrong-secret' });
    const state = createDefaultState();
    const config: OrchestratorConfig = { docsPath: '/tmp', logsDir: '/tmp', stateFile: '/tmp/state.json', milestoneIngestUrl: srv.url };
    const { emitter } = makeEmitter(config, state);

    await emitter.emit(validEvent);
    await emitter.deliverPending();

    expect(srv.received).toHaveLength(0);
    expect(state.milestoneDeliveries[0]!.status).toBe('rejected');
    await srv.close();
  });

  it('handles duplicate idempotencyKey — record becomes duplicate', async () => {
    const seen = new Set<string>();
    const srv = await startIngestServer({ secret: TEST_SECRET, seen });
    const state = createDefaultState();
    const config: OrchestratorConfig = { docsPath: '/tmp', logsDir: '/tmp', stateFile: '/tmp/state.json', milestoneIngestUrl: srv.url };

    // Pre-populate the seen set with the same key we'll use
    const { emitter } = makeEmitter(config, state);
    await emitter.emit(validEvent);
    const key = state.milestoneDeliveries[0]!.idempotencyKey;
    seen.add(key); // simulate server already saw this key

    // Reset record to pending so deliverPending will retry
    state.milestoneDeliveries[0]!.status = 'pending';
    state.milestoneDeliveries[0]!.attempts = 0;

    await emitter.deliverPending();

    expect(state.milestoneDeliveries[0]!.status).toBe('duplicate');
    await srv.close();
  });

  it('exhausts retries and reaches dead-letter after 3 × 503', async () => {
    const srv = await startIngestServer({ secret: TEST_SECRET, forceStatus: 503 });
    const state = createDefaultState();
    const config: OrchestratorConfig = { docsPath: '/tmp', logsDir: '/tmp', stateFile: '/tmp/state.json', milestoneIngestUrl: srv.url };
    const { emitter } = makeEmitter(config, state);

    await emitter.emit(validEvent);

    // Three delivery attempts to hit MAX_DELIVERY_ATTEMPTS
    await emitter.deliverPending(); // retrying (1)
    await emitter.deliverPending(); // retrying (2)
    await emitter.deliverPending(); // dead-letter (3)

    expect(state.milestoneDeliveries[0]!.status).toBe('dead-letter');
    expect(state.milestoneDeliveries[0]!.attempts).toBe(3);
    await srv.close();
  });

  it('signed envelope key order is deterministic regardless of emit order', async () => {
    // Verify sortObjectKeys produces canonical output — the foundation of HMAC stability
    const envelope = {
      event: { milestoneId: 'x', scope: 'a', claim: 'b', timestampUtc: 'c', evidence: [], riskStatus: 'on-track' as const, nextAction: 'd' },
      sentAtUtc: '2026-01-01T00:00:00.000Z',
      idempotencyKey: 'key',
    };
    const sig1 = createHmac('sha256', TEST_SECRET).update(JSON.stringify(sortObjectKeys(envelope))).digest('hex');
    // Re-build envelope with fields in different order
    const envelopeShuffled = {
      sentAtUtc: envelope.sentAtUtc,
      idempotencyKey: envelope.idempotencyKey,
      event: { riskStatus: envelope.event.riskStatus, milestoneId: envelope.event.milestoneId, claim: envelope.event.claim, scope: envelope.event.scope, timestampUtc: envelope.event.timestampUtc, evidence: [], nextAction: envelope.event.nextAction },
    };
    const sig2 = createHmac('sha256', TEST_SECRET).update(JSON.stringify(sortObjectKeys(envelopeShuffled))).digest('hex');

    expect(sig1).toBe(sig2);
  });
});
