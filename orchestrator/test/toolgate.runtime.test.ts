import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditSkill, getSkillAuditGate } from '../src/skillAudit.js';
import { getToolGate, ToolGate } from '../src/toolGate.js';
import {
  createDefaultState,
  getRetryRecoveryDelayMs,
  reconcileTaskRetryRecoveryState,
  summarizeGovernanceVisibility,
} from '../src/state.js';
import {
  approveGovernedSkill,
  executeSkill as executeRegisteredSkill,
  hasSkill,
  initializeSkills,
  listGovernedSkillIntake,
  registerGovernedSkill,
  resetSkillRuntimeForTest,
  setGovernedSkillStateStoreForTest,
} from '../../skills/index.js';
import { sourceFetchDefinition } from '../../skills/sourceFetch.js';
import { normalizerDefinition, executeNormalizer } from '../../skills/normalizer.js';
import type { ToolInvocation } from '../src/types.js';

async function runAgentEntryPointWithDeniedSkill(args: {
  agentId: string;
  resultEnvVar: string;
  deniedSkillId: string;
  payload: Record<string, unknown>;
}) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), `${args.agentId}-fixture-`));
  const sourceRoot = join(process.cwd(), '..', 'agents', args.agentId);
  const sharedSourceRoot = join(process.cwd(), '..', 'agents', 'shared');
  const stagedRoot = join(fixtureRoot, args.agentId);
  const stagedSharedRoot = join(fixtureRoot, 'shared');
  const payloadPath = join(fixtureRoot, 'payload.json');
  const resultPath = join(fixtureRoot, 'result.json');
  const configPath = join(stagedRoot, 'agent.config.json');
  const tsxLoaderPath = join(
    process.cwd(),
    '..',
    'node_modules',
    'tsx',
    'dist',
    'loader.mjs',
  );

  try {
    await cp(sourceRoot, stagedRoot, { recursive: true });
    await cp(sharedSourceRoot, stagedSharedRoot, { recursive: true });
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    config.permissions.skills[args.deniedSkillId].allowed = false;
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    await writeFile(payloadPath, JSON.stringify(args.payload, null, 2), 'utf-8');

    const execution = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import', tsxLoaderPath, 'src/index.ts', payloadPath],
        {
          cwd: stagedRoot,
          env: {
            ...process.env,
            [args.resultEnvVar]: resultPath,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
    });

    const resultExists = await readFile(resultPath, 'utf-8').catch(() => null);
    if (!resultExists) {
      throw new Error(
        `agent entrypoint did not write a result file (exit=${execution.exitCode})\n` +
          `stdout:\n${execution.stdout.trim() || '<empty>'}\n` +
          `stderr:\n${execution.stderr.trim() || '<empty>'}`,
      );
    }

    const result = JSON.parse(resultExists);
    return {
      exitCode: execution.exitCode,
      result,
    };
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

async function loadOrchestratorIndexHelpers() {
  const previous = process.env.OPENCLAW_SKIP_BOOTSTRAP;
  process.env.OPENCLAW_SKIP_BOOTSTRAP = "true";
  try {
    return await import("../src/index.js");
  } finally {
    if (previous === undefined) {
      delete process.env.OPENCLAW_SKIP_BOOTSTRAP;
    } else {
      process.env.OPENCLAW_SKIP_BOOTSTRAP = previous;
    }
  }
}

async function runRedditHelperTaskFixture(args?: {
  serviceState?: Record<string, unknown>;
  env?: Record<string, string>;
  payload?: Record<string, unknown>;
}) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'reddit-helper-fixture-'));
  const sourceRoot = join(process.cwd(), '..', 'agents', 'reddit-helper');
  const sharedSourceRoot = join(process.cwd(), '..', 'agents', 'shared');
  const stagedRoot = join(fixtureRoot, 'reddit-helper');
  const stagedSharedRoot = join(fixtureRoot, 'shared');
  const logsRoot = join(fixtureRoot, 'logs');
  const knowledgePackDir = join(logsRoot, 'knowledge-packs');
  const resultPath = join(fixtureRoot, 'result.json');
  const payloadPath = join(fixtureRoot, 'payload.json');
  const configPath = join(stagedRoot, 'agent.config.json');
  const serviceStatePath = join(logsRoot, 'reddit-helper-service.json');
  const draftLogPath = join(logsRoot, 'reddit-drafts.jsonl');
  const engagementOsPath = join(fixtureRoot, 'ENGAGEMENT_OS.md');
  const tsxLoaderPath = join(
    process.cwd(),
    '..',
    'node_modules',
    'tsx',
    'dist',
    'loader.mjs',
  );

  try {
    await cp(sourceRoot, stagedRoot, { recursive: true });
    await cp(sharedSourceRoot, stagedSharedRoot, { recursive: true });
    await mkdir(knowledgePackDir, { recursive: true });

    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    config.knowledgePackDir = '../logs/knowledge-packs';
    config.draftLogPath = '../logs/reddit-drafts.jsonl';
    config.devvitQueuePath = '../logs/devvit-submissions.jsonl';
    config.serviceStatePath = '../logs/reddit-helper-service.json';
    config.runtimeEngagementOsPath = '../ENGAGEMENT_OS.md';
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    await writeFile(
      engagementOsPath,
      [
        'Ask qualifying questions before solutioning.',
        'Keep replies concise and authoritative.',
        'Use local documentation and doctrine before any model polish.',
      ].join('\n'),
      'utf-8',
    );

    await writeFile(
      join(knowledgePackDir, 'knowledge-pack-test.json'),
      JSON.stringify(
        {
          id: 'pack-test-1',
          generatedAt: '2026-03-08T12:00:00.000Z',
          docs: [
            {
              source: 'openclaw',
              path: 'docs/operators/reddit.md',
              summary:
                'OpenClaw operator replies should stay concise, ask qualifying questions, and avoid public implementation plans.',
              wordCount: 18,
              bytes: 156,
              firstHeading: 'Operator reply doctrine',
            },
            {
              source: 'openai',
              path: 'cookbook/examples/retrieval.md',
              summary:
                'Ground replies in retrieved local documentation before asking a model to polish final phrasing.',
              wordCount: 16,
              bytes: 148,
              firstHeading: 'Retrieval grounding',
            },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );

    if (args?.serviceState) {
      await writeFile(
        serviceStatePath,
        JSON.stringify(args.serviceState, null, 2),
        'utf-8',
      );
    }

    await writeFile(
      payloadPath,
      JSON.stringify(
        args?.payload ?? {
          queue: {
            id: 'queue-test-1',
            subreddit: 'openclaw',
            question: 'How should OpenClaw handle operator replies before proposing fixes?',
            matchedKeywords: ['openclaw', 'operator', 'reply'],
            selectedForDraft: true,
            score: 0.82,
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const execution = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import', tsxLoaderPath, 'src/index.ts', payloadPath],
        {
          cwd: stagedRoot,
          env: {
            ...process.env,
            ALLOW_ORCHESTRATOR_TASK_RUN: 'true',
            REDDIT_HELPER_RESULT_FILE: resultPath,
            NODE_PATH: join(process.cwd(), 'node_modules'),
            ...(args?.env ?? {}),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
    });

    const resultRaw = await readFile(resultPath, 'utf-8').catch(() => null);
    if (!resultRaw) {
      throw new Error(
        `reddit-helper entrypoint did not write a result file (exit=${execution.exitCode})\n` +
          `stdout:\n${execution.stdout.trim() || '<empty>'}\n` +
          `stderr:\n${execution.stderr.trim() || '<empty>'}`,
      );
    }

    const result = JSON.parse(resultRaw);
    const persistedServiceState = JSON.parse(
      await readFile(serviceStatePath, 'utf-8'),
    );
    const draftLog = await readFile(draftLogPath, 'utf-8');

    return {
      ...execution,
      result,
      persistedServiceState,
      draftLog,
    };
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

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

  it('allows permitted skill preflight from agent config', async () => {
    const result = await gate.preflightSkillAccess('market-research-agent', 'sourceFetch', {
      mode: 'test',
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      authorized: true,
      mode: 'preflight',
      skillId: 'sourceFetch',
    });
  });

  it('denies forbidden skill preflight from agent config', async () => {
    const result = await gate.preflightSkillAccess('market-research-agent', 'workspacePatch', {
      mode: 'test',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('allowlist');
  });

  it('keeps executeSkill as a backward-compatible preflight alias', async () => {
    const result = await gate.executeSkill('market-research-agent', 'sourceFetch', {
      mode: 'test',
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      authorized: true,
      mode: 'preflight',
      skillId: 'sourceFetch',
    });
  });
});

describe('Task retry recovery durability', () => {
  it('keeps retrying executions replayable when a persisted recovery record exists', () => {
    const state = createDefaultState();
    state.taskExecutions.push({
      taskId: 'task-retry-1',
      idempotencyKey: 'idem-retry-1',
      type: 'rss-sweep',
      status: 'retrying',
      attempt: 1,
      maxRetries: 2,
      lastHandledAt: new Date().toISOString(),
      lastError: 'transient failure',
    });
    state.taskRetryRecoveries.push({
      sourceTaskId: 'task-retry-1',
      idempotencyKey: 'idem-retry-1',
      type: 'rss-sweep',
      payload: {
        reason: 'scheduled',
        __attempt: 2,
        maxRetries: 2,
        idempotencyKey: 'idem-retry-1',
      },
      attempt: 2,
      maxRetries: 2,
      retryAt: new Date().toISOString(),
      scheduledAt: new Date().toISOString(),
    });

    const result = reconcileTaskRetryRecoveryState(state, '2026-03-02T12:00:00.000Z');

    expect(result).toMatchObject({
      recoveredRetryCount: 0,
      staleRecoveryCount: 0,
    });
    expect(state.taskExecutions[0]?.status).toBe('retrying');
    expect(state.taskRetryRecoveries).toHaveLength(1);
    expect(getRetryRecoveryDelayMs(state.taskRetryRecoveries[0]!, Date.now())).toBeGreaterThanOrEqual(0);
  });

  it('marks orphaned retrying executions failed when no persisted recovery record exists', () => {
    const state = createDefaultState();
    state.taskExecutions.push({
      taskId: 'task-retry-2',
      idempotencyKey: 'idem-retry-2',
      type: 'nightly-batch',
      status: 'retrying',
      attempt: 2,
      maxRetries: 2,
      lastHandledAt: new Date().toISOString(),
      lastError: 'retry interrupted before requeue',
    });

    const result = reconcileTaskRetryRecoveryState(state, '2026-03-02T12:00:00.000Z');

    expect(result).toMatchObject({
      recoveredRetryCount: 1,
      staleRecoveryCount: 0,
    });
    expect(state.taskExecutions[0]?.status).toBe('failed');
    expect(state.taskExecutions[0]?.lastError).toContain('orchestrator restarted before retry dispatch');
    expect(state.taskHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'task-retry-2',
          type: 'nightly-batch',
          result: 'error',
        }),
      ]),
    );
  });
});

describe('Operator governance visibility summary', () => {
  it('summarizes real governance state from orchestrator runtime state', () => {
    const state = createDefaultState();
    state.approvals.push({
      taskId: 'approval-1',
      type: 'build-refactor',
      payload: {},
      requestedAt: '2026-03-02T12:00:00.000Z',
      status: 'pending',
    });
    state.taskRetryRecoveries.push({
      sourceTaskId: 'task-retry-3',
      idempotencyKey: 'idem-retry-3',
      type: 'rss-sweep',
      payload: {
        __attempt: 2,
        maxRetries: 2,
        idempotencyKey: 'idem-retry-3',
      },
      attempt: 2,
      maxRetries: 2,
      retryAt: '2026-03-02T12:05:00.000Z',
      scheduledAt: '2026-03-02T12:00:00.000Z',
    });
    state.milestoneDeliveries.push({
      idempotencyKey: 'milestone-1',
      milestoneId: 'milestone-1',
      sentAtUtc: '2026-03-02T12:00:00.000Z',
      event: {
        milestoneId: 'milestone-1',
        timestampUtc: '2026-03-02T12:00:00.000Z',
        scope: 'governance',
        claim: 'Approval requested.',
        evidence: [],
        riskStatus: 'at-risk',
        nextAction: 'Review the approval.',
        source: 'orchestrator',
      },
      status: 'retrying',
      attempts: 1,
    });
    state.demandSummaryDeliveries.push({
      idempotencyKey: 'demand-1',
      summaryId: 'demand-1',
      sentAtUtc: '2026-03-02T12:00:00.000Z',
      snapshot: {
        summaryId: 'demand-1',
        generatedAtUtc: '2026-03-02T12:00:00.000Z',
        source: 'orchestrator',
        queueTotal: 1,
        draftTotal: 1,
        selectedForDraftTotal: 0,
        tagCounts: {
          draft: 1,
          priority: 0,
          manualReview: 0,
        },
        topPillars: [],
        topKeywordClusters: [],
        segments: [],
      },
      status: 'dead-letter',
      attempts: 3,
    });
    state.governedSkillState.push(
      {
        skillId: 'generated-safe-skill',
        definition: {
          ...sourceFetchDefinition,
          id: 'generated-safe-skill',
        },
        auditedAt: '2026-03-02T12:00:00.000Z',
        intakeSource: 'generated',
        registeredBy: 'operator',
        trustStatus: 'review-approved',
        reviewedBy: 'reviewer',
        reviewedAt: '2026-03-02T12:10:00.000Z',
        provenanceSnapshot: {
          author: 'operator',
          source: 'generated',
          version: '1.0.0',
        },
        persistenceMode: 'restart-safe',
        executorBinding: {
          type: 'builtin-skill',
          skillId: 'sourceFetch',
        },
      },
      {
        skillId: 'generated-pending-skill',
        definition: {
          ...sourceFetchDefinition,
          id: 'generated-pending-skill',
        },
        auditedAt: '2026-03-02T12:00:00.000Z',
        intakeSource: 'manual',
        registeredBy: 'operator',
        trustStatus: 'pending-review',
        provenanceSnapshot: {
          author: 'operator',
          source: 'manual',
          version: '1.0.0',
        },
        persistenceMode: 'metadata-only',
      },
    );
    state.repairRecords.push({
      repairId: 'repair-doc-drift-1',
      classification: 'doc-drift',
      trigger: 'pending-doc-threshold',
      sourceTaskId: 'doc-change-1',
      sourceTaskType: 'doc-change',
      repairTaskType: 'drift-repair',
      repairTaskId: 'drift-repair-1',
      verificationMode: 'knowledge-pack',
      status: 'verified',
      detectedAt: '2026-03-02T11:59:00.000Z',
      queuedAt: '2026-03-02T11:59:01.000Z',
      completedAt: '2026-03-02T12:01:00.000Z',
      verifiedAt: '2026-03-02T12:01:00.000Z',
      verificationSummary: 'knowledge pack verified',
      evidence: ['pack:workspace/logs/knowledge-packs/test.json'],
    });

    const summary = summarizeGovernanceVisibility(state);

    expect(summary).toMatchObject({
      approvals: {
        pendingCount: 1,
      },
      repairs: {
        totalCount: 1,
        activeCount: 0,
        verifiedCount: 1,
        failedCount: 0,
        lastDetectedAt: '2026-03-02T11:59:00.000Z',
        lastVerifiedAt: '2026-03-02T12:01:00.000Z',
        lastFailedAt: null,
      },
      taskRetryRecoveries: {
        count: 1,
        nextRetryAt: '2026-03-02T12:05:00.000Z',
      },
      milestoneDeliveries: {
        pendingCount: 0,
        retryingCount: 1,
        deadLetterCount: 0,
      },
      demandSummaryDeliveries: {
        pendingCount: 0,
        retryingCount: 0,
        deadLetterCount: 1,
      },
      governedSkills: {
        totalCount: 2,
        pendingReviewCount: 1,
        approvedCount: 1,
        restartSafeCount: 1,
        restartSafeApprovedCount: 1,
        metadataOnlyCount: 1,
        metadataOnlyApprovedCount: 0,
      },
    });
  });
});

describe('Spawned worker contract fixes', () => {
  it('runs skill-audit against the orchestrator payload shape', async () => {
    const { handleTask } = await import('../../agents/skill-audit-agent/src/index.ts');

    const result = await handleTask({
      id: 'skill-audit-task-1',
      skillIds: ['testRunner'],
      depth: 'standard',
      checks: ['schemas', 'provenance'],
    });

    expect(result.success).toBe(true);
    expect(result.skillsAudited).toBe(1);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: 'testRunner',
          audited: true,
        }),
      ]),
    );
  });

  it('keeps qa-verification honest: dry-run must be explicit and invalid commands fail', async () => {
    const { handleTask } = await import('../../agents/qa-verification-agent/src/index.ts');
    const runtimeGate = await getToolGate();
    runtimeGate.clearLog();

    const dryRun = await handleTask({
      id: 'qa-dry-run-1',
      mode: 'dry-run',
      target: 'workspace',
    });
    expect(dryRun.success).toBe(true);
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.testsRun).toBe(0);
    expect(dryRun.outcomeKind).toBe('dry-run');
    expect(dryRun.executedCommand).toBe('build-verify');

    const dryRunLog = runtimeGate.getLogForAgent('qa-verification-agent');
    expect(dryRunLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: 'testRunner',
          mode: 'execute',
          allowed: true,
        }),
      ]),
    );

    const invalid = await handleTask({
      id: 'qa-invalid-1',
      constraints: {
        testCommand: 'echo qa-smoke',
      },
    });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toContain('Command not whitelisted');
  });

  it('auto-enqueues drift repair when pending doc drift crosses the threshold', async () => {
    const { resolveTaskHandler } = await import('../src/taskHandlers.ts');
    const state = createDefaultState();
    const queued: Array<{ type: string; payload: Record<string, unknown> }> = [];

    for (let index = 0; index < 24; index += 1) {
      state.pendingDocChanges.push(`nodes/doc-${index}.md`);
    }

    const message = await resolveTaskHandler({
      id: 'doc-change-threshold-1',
      type: 'doc-change',
      payload: { path: 'nodes/trigger.md' },
      createdAt: Date.now(),
    })(
      {
        id: 'doc-change-threshold-1',
        type: 'doc-change',
        payload: { path: 'nodes/trigger.md' },
        createdAt: Date.now(),
      },
      {
        config: {} as any,
        state,
        saveState: async () => {},
        enqueueTask: (type, payload) => {
          queued.push({ type, payload });
          return {
            id: 'auto-drift-repair-task-1',
            type,
            payload,
            createdAt: Date.now(),
          };
        },
        logger: console,
      },
    );

    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      type: 'drift-repair',
    });
    expect(state.repairRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: 'doc-drift',
          repairTaskType: 'drift-repair',
          status: 'queued',
          verificationMode: 'knowledge-pack',
        }),
      ]),
    );
    expect(message).toContain('auto-enqueued drift repair');
  });

  it('blocks duplicate auto-enqueue for the same pending doc set during cooldown', async () => {
    const { resolveTaskHandler } = await import('../src/taskHandlers.ts');
    const state = createDefaultState();
    const queued: Array<{ type: string; payload: Record<string, unknown> }> = [];

    for (let index = 0; index < 24; index += 1) {
      state.pendingDocChanges.push(`nodes/doc-${index}.md`);
    }

    const handler = resolveTaskHandler({
      id: 'doc-change-threshold-cooldown-1',
      type: 'doc-change',
      payload: { path: 'nodes/trigger.md' },
      createdAt: Date.now(),
    });

    await handler(
      {
        id: 'doc-change-threshold-cooldown-1',
        type: 'doc-change',
        payload: { path: 'nodes/trigger.md' },
        createdAt: Date.now(),
      },
      {
        config: {} as any,
        state,
        saveState: async () => {},
        enqueueTask: (type, payload) => {
          queued.push({ type, payload });
          return {
            id: 'auto-drift-repair-task-1',
            type,
            payload,
            createdAt: Date.now(),
          };
        },
        logger: console,
      },
    );

    const secondMessage = await handler(
      {
        id: 'doc-change-threshold-cooldown-2',
        type: 'doc-change',
        payload: { path: 'nodes/trigger.md' },
        createdAt: Date.now(),
      },
      {
        config: {} as any,
        state,
        saveState: async () => {},
        enqueueTask: (type, payload) => {
          queued.push({ type, payload });
          return {
            id: 'auto-drift-repair-task-2',
            type,
            payload,
            createdAt: Date.now(),
          };
        },
        logger: console,
      },
    );

    expect(queued).toHaveLength(1);
    expect(secondMessage).toContain('cooling down');
  });

  it('derives reddit draft selection from priority routing tags only', async () => {
    const { shouldSelectQueueItemForDraft } = await import('../src/taskHandlers.ts');

    expect(shouldSelectQueueItemForDraft({ tag: 'priority' })).toBe(true);
    expect(shouldSelectQueueItemForDraft({ tag: 'draft' })).toBe(false);
    expect(shouldSelectQueueItemForDraft({ tag: 'manual-review' })).toBe(false);
    expect(shouldSelectQueueItemForDraft({})).toBe(false);
    expect(shouldSelectQueueItemForDraft(null)).toBe(false);
  });

  it('passes orchestrator node_modules to spawned child env', async () => {
    const { buildAllowlistedChildEnv } = await import('../src/taskHandlers.ts');

    const env = buildAllowlistedChildEnv({});

    expect(env.ALLOW_ORCHESTRATOR_TASK_RUN).toBe('true');
    expect(env.NODE_PATH).toContain(join(process.cwd(), 'node_modules'));
  });

  it('creates explicit approvals for manual-review leads during nightly batch', async () => {
    const { buildManualReviewApprovalTaskId, resolveTaskHandler } = await import('../src/taskHandlers.ts');
    const state = createDefaultState();
    const digestDir = await mkdtemp(join(tmpdir(), 'nightly-batch-digest-'));

    try {
      state.redditQueue.push(
        {
          id: 'priority-lead-1',
          subreddit: 'openclaw',
          question: 'Priority lead',
          queuedAt: '2026-03-08T12:00:00.000Z',
          tag: 'priority',
        },
        {
          id: 'manual-lead-1',
          subreddit: 'openclaw',
          question: 'Manual review lead',
          queuedAt: '2026-03-08T12:00:00.000Z',
          tag: 'manual-review',
          score: 9.4,
        },
      );

      const handler = resolveTaskHandler({
        id: 'nightly-batch-approval-test',
        type: 'nightly-batch',
        payload: {},
        createdAt: Date.now(),
      });

      const message = await handler(
        {
          id: 'nightly-batch-approval-test',
          type: 'nightly-batch',
          payload: {},
          createdAt: Date.now(),
        },
        {
          config: {
            digestDir,
          } as any,
          state,
          saveState: async () => {},
          enqueueTask: () => {
            throw new Error('nightly-batch should not enqueue tasks directly in this test');
          },
          logger: console,
        },
      );

      expect(message).toContain('requested 1 manual-review approvals');
      expect(state.redditQueue.find((item) => item.id === 'priority-lead-1')?.selectedForDraft).toBe(true);
      expect(state.redditQueue.find((item) => item.id === 'manual-lead-1')?.selectedForDraft).toBe(false);
      expect(state.approvals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            taskId: buildManualReviewApprovalTaskId('manual-lead-1'),
            type: 'reddit-response',
            status: 'pending',
            payload: expect.objectContaining({
              queue: expect.objectContaining({
                id: 'manual-lead-1',
                selectedForDraft: true,
                reviewSource: 'manual-review',
              }),
            }),
          }),
        ]),
      );
    } finally {
      await rm(digestDir, { recursive: true, force: true });
    }
  });

  it('consumes review-gated queue items when an approval decision is applied', async () => {
    const { consumeReviewQueueItemForApprovalDecision } = await import('../src/taskHandlers.ts');
    const redditQueue = [
      {
        id: 'manual-lead-2',
        subreddit: 'openclaw',
        question: 'Needs approval',
        queuedAt: '2026-03-08T12:00:00.000Z',
        tag: 'manual-review',
      },
    ];

    const removed = consumeReviewQueueItemForApprovalDecision(redditQueue as any, {
      taskId: 'reddit-manual-review:manual-lead-2',
      type: 'reddit-response',
      payload: {
        queue: {
          id: 'manual-lead-2',
          selectedForDraft: true,
          reviewSource: 'manual-review',
        },
      },
      requestedAt: '2026-03-08T12:00:00.000Z',
      status: 'approved',
    });

    expect(removed).toMatchObject({
      id: 'manual-lead-2',
      tag: 'manual-review',
    });
    expect(redditQueue).toHaveLength(0);
  });

  it('creates bounded draft-promotion approvals for top-scoring draft leads during nightly batch', async () => {
    const { buildDraftReviewApprovalTaskId, resolveTaskHandler } = await import('../src/taskHandlers.ts');
    const state = createDefaultState();
    const digestDir = await mkdtemp(join(tmpdir(), 'nightly-batch-draft-promotion-'));

    try {
      state.redditQueue.push(
        {
          id: 'draft-lead-a',
          subreddit: 'openclaw',
          question: 'Draft A',
          queuedAt: '2026-03-08T12:00:00.000Z',
          tag: 'draft',
          score: 8.1,
        },
        {
          id: 'draft-lead-b',
          subreddit: 'openclaw',
          question: 'Draft B',
          queuedAt: '2026-03-08T12:00:01.000Z',
          tag: 'draft',
          score: 7.4,
        },
        {
          id: 'draft-lead-c',
          subreddit: 'openclaw',
          question: 'Draft C',
          queuedAt: '2026-03-08T12:00:02.000Z',
          tag: 'draft',
          score: 7.2,
        },
        {
          id: 'draft-lead-d',
          subreddit: 'openclaw',
          question: 'Draft D',
          queuedAt: '2026-03-08T12:00:03.000Z',
          tag: 'draft',
          score: 6.9,
        },
        {
          id: 'draft-lead-e',
          subreddit: 'openclaw',
          question: 'Draft E',
          queuedAt: '2026-03-08T12:00:04.000Z',
          tag: 'draft',
          score: 6.8,
        },
        {
          id: 'draft-lead-f',
          subreddit: 'openclaw',
          question: 'Draft F',
          queuedAt: '2026-03-08T12:00:05.000Z',
          tag: 'draft',
          score: 6.7,
        },
        {
          id: 'draft-lead-g',
          subreddit: 'openclaw',
          question: 'Draft G',
          queuedAt: '2026-03-08T12:00:06.000Z',
          tag: 'draft',
          score: 6.6,
        },
        {
          id: 'draft-lead-h',
          subreddit: 'openclaw',
          question: 'Draft H',
          queuedAt: '2026-03-08T12:00:07.000Z',
          tag: 'draft',
          score: 6.5,
        },
        {
          id: 'draft-lead-i',
          subreddit: 'openclaw',
          question: 'Draft I',
          queuedAt: '2026-03-08T12:00:08.000Z',
          tag: 'draft',
          score: 6.4,
        },
        {
          id: 'draft-lead-j',
          subreddit: 'openclaw',
          question: 'Draft J',
          queuedAt: '2026-03-08T12:00:09.000Z',
          tag: 'draft',
          score: 6.3,
        },
        {
          id: 'draft-lead-k',
          subreddit: 'openclaw',
          question: 'Draft K',
          queuedAt: '2026-03-08T12:00:10.000Z',
          tag: 'draft',
          score: 6.2,
        },
        {
          id: 'draft-lead-l',
          subreddit: 'openclaw',
          question: 'Draft L',
          queuedAt: '2026-03-08T12:00:11.000Z',
          tag: 'draft',
          score: 6.1,
        },
        {
          id: 'draft-lead-m',
          subreddit: 'openclaw',
          question: 'Draft M',
          queuedAt: '2026-03-08T12:00:12.000Z',
          tag: 'draft',
          score: 6.0,
        },
        {
          id: 'draft-lead-n',
          subreddit: 'openclaw',
          question: 'Draft N',
          queuedAt: '2026-03-08T12:00:13.000Z',
          tag: 'draft',
          score: 5.9,
        },
      );

      const handler = resolveTaskHandler({
        id: 'nightly-batch-draft-promotion-test',
        type: 'nightly-batch',
        payload: {},
        createdAt: Date.now(),
      });

      const message = await handler(
        {
          id: 'nightly-batch-draft-promotion-test',
          type: 'nightly-batch',
          payload: {},
          createdAt: Date.now(),
        },
        {
          config: {
            digestDir,
          } as any,
          state,
          saveState: async () => {},
          enqueueTask: () => {
            throw new Error('nightly-batch should not enqueue tasks directly in this test');
          },
          logger: console,
        },
      );

      expect(message).toContain('requested 10 draft promotion approvals');
      expect(state.approvals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            taskId: buildDraftReviewApprovalTaskId('draft-lead-a'),
            payload: expect.objectContaining({
              queue: expect.objectContaining({
                id: 'draft-lead-a',
                selectedForDraft: true,
                reviewSource: 'draft-review',
              }),
            }),
          }),
          expect.objectContaining({
            taskId: buildDraftReviewApprovalTaskId('draft-lead-b'),
          }),
          expect.objectContaining({
            taskId: buildDraftReviewApprovalTaskId('draft-lead-c'),
          }),
          expect.objectContaining({
            taskId: buildDraftReviewApprovalTaskId('draft-lead-j'),
          }),
        ]),
      );
      expect(
        state.approvals.some(
          (approval) =>
            approval.taskId === buildDraftReviewApprovalTaskId('draft-lead-n'),
        ),
      ).toBe(false);
    } finally {
      await rm(digestDir, { recursive: true, force: true });
    }
  });

  it('consumes only selected reddit queue items for reddit-response', async () => {
    const { consumeNextSelectedQueueItem } = await import('../src/taskHandlers.ts');
    const redditQueue = [
      {
        id: 'draft-lead-1',
        subreddit: 'openclaw',
        question: 'Draft lead',
        queuedAt: '2026-03-08T12:00:00.000Z',
        tag: 'draft',
        selectedForDraft: false,
      },
      {
        id: 'manual-lead-3',
        subreddit: 'openclaw',
        question: 'Manual review lead',
        queuedAt: '2026-03-08T12:00:00.000Z',
        tag: 'manual-review',
        selectedForDraft: false,
      },
      {
        id: 'priority-lead-2',
        subreddit: 'openclaw',
        question: 'Priority lead',
        queuedAt: '2026-03-08T12:00:00.000Z',
        tag: 'priority',
        selectedForDraft: true,
      },
    ];

    const selected = consumeNextSelectedQueueItem(redditQueue as any);

    expect(selected).toMatchObject({
      id: 'priority-lead-2',
      selectedForDraft: true,
    });
    expect(redditQueue.map((item) => item.id)).toEqual([
      'draft-lead-1',
      'manual-lead-3',
    ]);
  });

  it('prefers an explicitly approved manual-review payload over selected backlog items', async () => {
    const { resolveRedditResponseQueueItem } = await import('../src/taskHandlers.ts');
    const redditQueue = [
      {
        id: 'priority-lead-live',
        subreddit: 'openclaw',
        question: 'Priority lead waiting in backlog',
        queuedAt: '2026-03-08T12:00:00.000Z',
        tag: 'priority',
        selectedForDraft: true,
      },
    ];

    const selected = resolveRedditResponseQueueItem(
      redditQueue as any,
      {
        id: 'manual-approval-live',
        subreddit: 'openclaw',
        question: 'Approved manual review lead',
        queuedAt: '2026-03-08T12:05:00.000Z',
        tag: 'manual-review',
        selectedForDraft: true,
        reviewSource: 'manual-review',
      },
      '2026-03-08T12:06:00.000Z',
    );

    expect(selected).toMatchObject({
      id: 'manual-approval-live',
      tag: 'manual-review',
      selectedForDraft: true,
    });
    expect(redditQueue).toHaveLength(1);
    expect(redditQueue[0]).toMatchObject({
      id: 'priority-lead-live',
      selectedForDraft: true,
    });
  });

  it('handler-side honesty guard rejects unsuccessful agent results after a green exit', async () => {
    const { assertSpawnedAgentReportedSuccess } = await import('../src/taskHandlers.ts');

    expect(() =>
      assertSpawnedAgentReportedSuccess(
        {
          success: false,
          warnings: ['permission denied'],
        },
        'summarization',
      ),
    ).toThrow(/reported unsuccessful result/);

    expect(() =>
      assertSpawnedAgentReportedSuccess({ success: true }, 'summarization'),
    ).not.toThrow();
  });

  it('security-agent entrypoint exits non-zero when the logical result is unsuccessful', async () => {
    const execution = await runAgentEntryPointWithDeniedSkill({
      agentId: 'security-agent',
      resultEnvVar: 'SECURITY_AGENT_RESULT_FILE',
      deniedSkillId: 'documentParser',
      payload: {
        id: 'security-negative-1',
        type: 'scan',
        scope: 'workspace',
      },
    });

    expect(execution.result.success).toBe(false);
    expect(execution.exitCode).toBe(1);
  });

  it('summarization-agent entrypoint exits non-zero when the logical result is unsuccessful', async () => {
    const execution = await runAgentEntryPointWithDeniedSkill({
      agentId: 'summarization-agent',
      resultEnvVar: 'SUMMARIZATION_AGENT_RESULT_FILE',
      deniedSkillId: 'documentParser',
      payload: {
        id: 'summarization-negative-1',
        source: {
          type: 'document',
          content: 'OpenClaw operator truth should stay aligned to runtime.',
        },
        format: 'executive_summary',
      },
    });

    expect(execution.result.success).toBe(false);
    expect(execution.exitCode).toBe(1);
  });

  it('system-monitor-agent entrypoint exits non-zero when the logical result is unsuccessful', async () => {
    const execution = await runAgentEntryPointWithDeniedSkill({
      agentId: 'system-monitor-agent',
      resultEnvVar: 'SYSTEM_MONITOR_AGENT_RESULT_FILE',
      deniedSkillId: 'documentParser',
      payload: {
        id: 'system-monitor-negative-1',
        type: 'health',
        agents: ['security-agent'],
      },
    });

    expect(execution.result.success).toBe(false);
    expect(execution.exitCode).toBe(1);
  });

  it('derives confirmed worker status from live evidence inputs', async () => {
    process.env.OPENCLAW_SKIP_BOOTSTRAP = 'true';
    const { deriveWorkerEvidenceSummary } = await import('../src/index.ts');

    const toolInvocations: ToolInvocation[] = [
      {
        id: 'tool-1',
        agentId: 'summarization-agent',
        skillId: 'documentParser',
        args: { mode: 'preflight', taskType: 'summarize-content' },
        timestamp: '2026-03-07T18:36:47.000Z',
        mode: 'preflight',
        taskType: 'summarize-content',
        allowed: true,
      },
      {
        id: 'tool-2',
        agentId: 'summarization-agent',
        skillId: 'documentParser',
        args: { mode: 'execute' },
        timestamp: '2026-03-07T18:36:48.000Z',
        mode: 'execute',
        allowed: true,
      },
    ];

    const summary = deriveWorkerEvidenceSummary({
      agentId: 'summarization-agent',
      spawnedWorkerCapable: true,
      orchestratorTask: 'summarize-content',
      memory: {
        lastRunAt: '2026-03-07T18:36:48.013Z',
        lastStatus: 'success',
        totalRuns: 1,
        successCount: 1,
        errorCount: 0,
      },
      taskExecutions: [
        {
          taskId: 'task-1',
          idempotencyKey: 'run-1',
          type: 'summarize-content',
          status: 'success',
          attempt: 1,
          maxRetries: 0,
          lastHandledAt: '2026-03-07T18:36:48.013Z',
        },
      ],
      toolInvocations,
    });

    expect(summary.workerValidationStatus).toBe('confirmed-worker');
    expect(summary.evidenceSources).toEqual(
      expect.arrayContaining([
        'task-run-success',
        'agent-memory-success',
        'toolgate-preflight',
        'toolgate-execute',
      ]),
    );
    expect(summary.lastSuccessfulRunId).toBe('run-1');
    expect(summary.lastEvidenceAt).toBe('2026-03-07T18:36:48.013Z');
  });
});

describe('SkillAudit contract wiring', () => {
  function createInMemoryGovernedSkillStateStore() {
    let records: any[] = [];

    return {
      store: {
        async load() {
          return JSON.parse(JSON.stringify(records));
        },
        async save(nextRecords: any[]) {
          records = JSON.parse(JSON.stringify(nextRecords));
        },
      },
      snapshot() {
        return JSON.parse(JSON.stringify(records));
      },
    };
  }

  beforeEach(() => {
    const persistence = createInMemoryGovernedSkillStateStore();
    setGovernedSkillStateStoreForTest(persistence.store);
    resetSkillRuntimeForTest();
  });

  it('exposes a coherent named auditSkill bootstrap contract', () => {
    const result = auditSkill(sourceFetchDefinition);
    expect(result.passed).toBe(true);
    expect(result.runAt).toBeTypeOf('string');
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it('keeps the singleton audit gate accessible for deferred bootstrap paths', () => {
    const gate = getSkillAuditGate();
    expect(gate.getAuditHistory().length).toBeGreaterThan(0);
  });

  it('keeps the explicit skill bootstrap path coherent without implying auto-wiring', async () => {
    await initializeSkills();
    expect(hasSkill('sourceFetch')).toBe(true);
  });

  it('lazily bootstraps the registry on first executeSkill call', async () => {
    resetSkillRuntimeForTest();

    const result = await executeRegisteredSkill(
      'normalizer',
      {
        data: { amount: '$ 1,234.56' },
        schema: {
          amount: { type: 'currency', currency: 'USD' },
        },
        strict: false,
      },
      'data-extraction-agent',
    );

    expect(hasSkill('normalizer')).toBe(true);
    expect(result.success).toBe(true);
  });

  it('enforces manifest file read paths on file-based skill calls', async () => {
    const result = await executeRegisteredSkill(
      'documentParser',
      {
        filePath: 'artifacts/private.csv',
        format: 'csv',
      },
      'data-extraction-agent',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('read allowlist');
  });

  it('does not execute generated skills on the normal path before governed registration', async () => {
    resetSkillRuntimeForTest();

    const result = await executeRegisteredSkill(
      'generatedTestSkill',
      {
        payload: { value: 1 },
      },
      'data-extraction-agent',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Skill not found');
  });

  it('requires explicit review approval before governed skills become executable', async () => {
    resetSkillRuntimeForTest();

    const registration = await registerGovernedSkill(
      {
        ...sourceFetchDefinition,
        id: 'generatedTestSkill',
        description: 'Generated test skill intake contract',
      },
      async (input: any) => ({
        success: true,
        echoed: input.payload ?? null,
      }),
      {
        intakeSource: 'generated',
        registeredBy: 'toolgate-runtime-test',
        reviewNote: 'awaiting runtime review',
      },
    );

    expect(registration.success).toBe(true);
    expect(registration.data).toMatchObject({
      skillId: 'generatedTestSkill',
      trustStatus: 'pending-review',
      executable: false,
    });
    expect(hasSkill('generatedTestSkill')).toBe(false);
    expect(listGovernedSkillIntake()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'generatedTestSkill',
          trustStatus: 'pending-review',
          executable: false,
          intakeSource: 'generated',
        }),
      ]),
    );

    const beforeApproval = await executeRegisteredSkill(
      'generatedTestSkill',
      {
        payload: { value: 7 },
      },
    );

    expect(beforeApproval.success).toBe(false);
    expect(beforeApproval.error).toContain('Skill not found');

    const approval = await approveGovernedSkill(
      'generatedTestSkill',
      'toolgate-runtime-reviewer',
      'approved for runtime test',
    );

    expect(approval.success).toBe(true);
    expect(approval.data).toMatchObject({
      skillId: 'generatedTestSkill',
      trustStatus: 'review-approved',
      executable: true,
    });
    expect(hasSkill('generatedTestSkill')).toBe(true);
    expect(listGovernedSkillIntake()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'generatedTestSkill',
          trustStatus: 'review-approved',
          executable: true,
          reviewedBy: 'toolgate-runtime-reviewer',
        }),
      ]),
    );

    const result = await executeRegisteredSkill(
      'generatedTestSkill',
      {
        payload: { value: 42 },
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      success: true,
      echoed: { value: 42 },
    });
  });

  it('keeps pending-review governed skills non-executable after restart rehydration', async () => {
    const persistence = createInMemoryGovernedSkillStateStore();
    setGovernedSkillStateStoreForTest(persistence.store);

    try {
      resetSkillRuntimeForTest();

      const registration = await registerGovernedSkill(
        {
          ...normalizerDefinition,
          id: 'pendingDurableSkill',
          description: 'Pending governed skill restart test',
        },
        executeNormalizer,
        {
          intakeSource: 'generated',
          registeredBy: 'toolgate-runtime-test',
        },
      );

      expect(registration.success).toBe(true);
      expect(persistence.snapshot()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            skillId: 'pendingDurableSkill',
            trustStatus: 'pending-review',
            persistenceMode: 'restart-safe',
          }),
        ]),
      );

      resetSkillRuntimeForTest();

      const result = await executeRegisteredSkill(
        'pendingDurableSkill',
        {
          data: { amount: '$ 100.00' },
          schema: {
            amount: { type: 'currency', currency: 'USD' },
          },
          strict: false,
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Skill not found');
      expect(listGovernedSkillIntake()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'pendingDurableSkill',
            trustStatus: 'pending-review',
            executable: false,
            persistenceMode: 'restart-safe',
          }),
        ]),
      );
    } finally {
      setGovernedSkillStateStoreForTest(null);
      resetSkillRuntimeForTest();
    }
  });

  it('rehydrates approved restart-safe governed skills after restart', async () => {
    const persistence = createInMemoryGovernedSkillStateStore();
    setGovernedSkillStateStoreForTest(persistence.store);

    try {
      resetSkillRuntimeForTest();

      const registration = await registerGovernedSkill(
        {
          ...normalizerDefinition,
          id: 'durableGovernedSkill',
          description: 'Durable governed skill restart test',
        },
        executeNormalizer,
        {
          intakeSource: 'generated',
          registeredBy: 'toolgate-runtime-test',
        },
      );

      expect(registration.success).toBe(true);

      const approval = await approveGovernedSkill(
        'durableGovernedSkill',
        'toolgate-runtime-reviewer',
        'approved for durable restart test',
      );

      expect(approval.success).toBe(true);
      expect(persistence.snapshot()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            skillId: 'durableGovernedSkill',
            trustStatus: 'review-approved',
            persistenceMode: 'restart-safe',
            executorBinding: {
              type: 'builtin-skill',
              skillId: 'normalizer',
            },
          }),
        ]),
      );

      resetSkillRuntimeForTest();

      const result = await executeRegisteredSkill(
        'durableGovernedSkill',
        {
          data: { amount: '$ 250.50' },
          schema: {
            amount: { type: 'currency', currency: 'USD' },
          },
          strict: false,
        },
      );

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        success: true,
        normalized: {
          amount: {
            amount: 250.5,
          },
        },
      });
      expect(listGovernedSkillIntake()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'durableGovernedSkill',
            trustStatus: 'review-approved',
            executable: true,
            persistenceMode: 'restart-safe',
          }),
        ]),
      );
    } finally {
      setGovernedSkillStateStoreForTest(null);
      resetSkillRuntimeForTest();
    }
  });
});

describe('Local context wiring', () => {
  it('selects a broader dual-source knowledge context for reddit-helper', async () => {
    const { pickDocSnippets } = await import('../../agents/reddit-helper/src/index.ts');

    const snippets = pickDocSnippets(
      {
        id: 'knowledge-pack-context-1',
        generatedAt: '2026-03-08T10:00:00.000Z',
        docs: [
          {
            source: 'openclaw',
            path: 'docs/operators/reddit.md',
            summary: 'OpenClaw operator replies should stay concise, ask qualifying questions, and avoid implementation plans in public threads.',
            wordCount: 20,
            bytes: 180,
            firstHeading: 'Operator reply doctrine',
          },
          {
            source: 'openclaw',
            path: 'docs/runtime/knowledge-packs.md',
            summary: 'Knowledge packs are generated from local OpenClaw docs and mirrored cookbook sources for downstream responders.',
            wordCount: 18,
            bytes: 170,
            firstHeading: 'Knowledge packs',
          },
          {
            source: 'openclaw',
            path: 'docs/runtime/engagement-os.md',
            summary: 'The engagement doctrine tells responders to qualify first, scope second, and keep answers grounded in local context.',
            wordCount: 19,
            bytes: 176,
            firstHeading: 'Engagement OS',
          },
          {
            source: 'openai',
            path: 'cookbook/examples/retrieval.md',
            summary: 'Use retrieved local documentation to ground answers before asking a model to polish the final response.',
            wordCount: 18,
            bytes: 164,
            firstHeading: 'Retrieval grounding',
          },
          {
            source: 'openai',
            path: 'cookbook/examples/prompting.md',
            summary: 'Prompt construction should inject the most relevant local snippets instead of relying on generic answers.',
            wordCount: 17,
            bytes: 158,
            firstHeading: 'Prompt construction',
          },
          {
            source: 'openai',
            path: 'cookbook/examples/token-control.md',
            summary: 'Reduce model spend by ranking local context and limiting calls to the final synthesis step.',
            wordCount: 17,
            bytes: 152,
            firstHeading: 'Token control',
          },
        ],
      },
      {
        id: 'queue-1',
        subreddit: 'openclaw',
        question: 'How should reddit-helper use local docs and the cookbook before it drafts a reply?',
        matchedKeywords: ['knowledge', 'cookbook', 'reply'],
        selectedForDraft: true,
      },
    );

    expect(snippets.length).toBeGreaterThan(3);
    expect(snippets.some((entry) => entry.source === 'openclaw')).toBe(true);
    expect(snippets.some((entry) => entry.source === 'openai')).toBe(true);
    expect(
      snippets
        .filter((entry) => entry.source === 'openclaw')
        .map((entry) => entry.firstHeading),
    ).toEqual(
      expect.arrayContaining([
        'Operator reply doctrine',
        'Knowledge packs',
      ]),
    );
  });

  it('keeps targeted doc-specialist repairs dual-source', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'doc-specialist-pack-'));
    const sourceRoot = join(process.cwd(), '..', 'agents', 'doc-specialist');
    const sharedSourceRoot = join(process.cwd(), '..', 'agents', 'shared');
    const stagedRoot = join(fixtureRoot, 'doc-specialist');
    const stagedSharedRoot = join(fixtureRoot, 'shared');
    const docsRoot = join(fixtureRoot, 'openclaw-docs');
    const cookbookRoot = join(fixtureRoot, 'openai-cookbook');
    const logsRoot = join(fixtureRoot, 'logs');
    const payloadPath = join(fixtureRoot, 'payload.json');
    const resultPath = join(fixtureRoot, 'result.json');
    const configPath = join(stagedRoot, 'agent.config.json');
    const tsxLoaderPath = join(
      process.cwd(),
      '..',
      'node_modules',
      'tsx',
      'dist',
      'loader.mjs',
    );

    try {
      await cp(sourceRoot, stagedRoot, { recursive: true });
      await cp(sharedSourceRoot, stagedSharedRoot, { recursive: true });
      await mkdir(docsRoot, { recursive: true });
      await mkdir(cookbookRoot, { recursive: true });
      await mkdir(logsRoot, { recursive: true });

      await writeFile(
        join(docsRoot, 'operators.md'),
        '# Operators\nOpenClaw operators use local docs to answer questions with grounded context.\n',
        'utf-8',
      );
      await writeFile(
        join(cookbookRoot, 'retrieval.md'),
        '# Retrieval\nThe cookbook mirror explains how to ground answers with local documentation before model synthesis.\n',
        'utf-8',
      );

      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      config.docsPath = '../openclaw-docs';
      config.cookbookPath = '../openai-cookbook';
      config.knowledgePackDir = '../logs/knowledge-packs';
      config.agentsRootPath = '../agents';
      config.orchestratorConfigPath = '../orchestrator_config.json';
      await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      await writeFile(
        payloadPath,
        JSON.stringify(
          {
            id: 'drift-repair-pack-1',
            docPaths: ['operators.md'],
            targetAgents: ['reddit-helper'],
            requestedBy: 'test',
          },
          null,
          2,
        ),
        'utf-8',
      );

      const execution = await new Promise<{ exitCode: number | null; stderr: string }>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['--import', tsxLoaderPath, 'src/index.ts', payloadPath],
          {
            cwd: stagedRoot,
            env: {
              ...process.env,
              ALLOW_ORCHESTRATOR_TASK_RUN: 'true',
              DOC_SPECIALIST_RESULT_FILE: resultPath,
            },
            stdio: ['ignore', 'ignore', 'pipe'],
          },
        );

        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({ exitCode: code, stderr }));
      });

      expect(execution.exitCode).toBe(0);

      const result = JSON.parse(await readFile(resultPath, 'utf-8'));
      expect(result.sourceBreakdown).toMatchObject({
        openclaw: 1,
        openai: 1,
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});

describe('Reddit helper token safety', () => {
  it('scores replies deterministically using doctrine and local context', async () => {
    const { scoreReplyQualityDeterministically } = await import(
      '../../agents/reddit-helper/src/index.ts'
    );

    const queue = {
      id: 'queue-score-1',
      subreddit: 'openclaw',
      question:
        'How should OpenClaw answer operator questions before proposing fixes?',
      matchedKeywords: ['operator', 'reply', 'openclaw'],
      selectedForDraft: true,
    };
    const docs = [
      {
        source: 'openclaw',
        path: 'docs/operators/reply.md',
        summary:
          'Ask a qualifying question, stay concise, and avoid implementation detail in public replies.',
        wordCount: 15,
        bytes: 120,
        firstHeading: 'Operator reply doctrine',
      },
      {
        source: 'openai',
        path: 'cookbook/examples/retrieval.md',
        summary:
          'Use retrieved local documentation before letting a model polish a response.',
        wordCount: 14,
        bytes: 112,
        firstHeading: 'Retrieval grounding',
      },
    ];
    const engagementOS = [
      'Ask a qualifying question before solutioning.',
      'Stay calm and authoritative.',
      'No more than 5 sentences.',
      'Do not solve or architect yet.',
    ].join(' ');

    const good = scoreReplyQualityDeterministically(
      'Good question. The main risk usually sits in operator reply doctrine. Is this live or pre-launch, and what do you control right now? Share that and I can narrow the cleanest path without guessing.',
      queue,
      docs,
      engagementOS,
    );
    const bad = scoreReplyQualityDeterministically(
      'You should implement a new orchestration layer, set up Redis immediately, then deploy this in several steps across the stack.',
      queue,
      docs,
      engagementOS,
    );

    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.reasoning).toContain('asks qualifying question');
    expect(good.reasoning).toContain('uses local context');
    expect(bad.reasoning).toContain('premature solutioning');
  });

  it('dedupes processed drafts and enforces max jobs per cycle', async () => {
    const { selectEligibleDrafts } = await import(
      '../../agents/reddit-helper/src/service.ts'
    );

    const eligible = selectEligibleDrafts(
      [
        {
          draftId: 'draft-1',
          queuedAt: '2026-03-08T10:00:00.000Z',
        },
        {
          draftId: 'draft-2',
          queuedAt: '2026-03-08T10:05:00.000Z',
        },
        {
          draftId: 'draft-3',
          queuedAt: '2026-03-08T10:10:00.000Z',
        },
        {
          draftId: 'draft-4',
          queuedAt: '2026-03-08T10:15:00.000Z',
        },
      ] as any,
      {
        processedIds: ['draft-2'],
      },
      2,
    );

    expect(eligible.map((draft: { draftId: string }) => draft.draftId)).toEqual([
      'draft-1',
      'draft-3',
    ]);
  });

  it('falls back locally when the llm budget is exhausted before provider access', async () => {
    const budgetDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const execution = await runRedditHelperTaskFixture({
      serviceState: {
        budgetDate,
        llmCallsToday: 1,
        tokensToday: 0,
        processedIds: [],
      },
      env: {
        REDDIT_HELPER_MAX_LLM_CALLS_PER_DAY: '1',
        REDDIT_HELPER_MAX_TOKENS_PER_DAY: '12000',
        REDDIT_HELPER_BUDGET_RESET_TZ: 'UTC',
        OPENAI_API_KEY: '',
      },
    });

    expect(execution.exitCode).toBe(0);
    expect(execution.result.draftMode).toBe('local-only');
    expect(execution.result.reasoning).toContain('daily llm call budget exhausted');
    expect(execution.result.qualityScore).toBeGreaterThan(0);
    expect(execution.persistedServiceState.budgetStatus).toBe('exhausted');
    expect(execution.persistedServiceState.llmCallsToday).toBe(1);
    expect(execution.draftLog).toContain('"stage":"agent-local-fallback"');
  });

  it('parses host systemd unit states for installed and missing services', async () => {
    const {
      parseSystemctlShowOutput,
      resolveServiceInstalledState,
      resolveServiceRunningState,
    } = await loadOrchestratorIndexHelpers();

    const states = parseSystemctlShowOutput(
      [
        'Id=doc-specialist.service',
        'LoadState=not-found',
        'ActiveState=inactive',
        'SubState=dead',
        'UnitFileState=',
        '',
        'Id=reddit-helper.service',
        'LoadState=loaded',
        'ActiveState=active',
        'SubState=running',
        'UnitFileState=enabled',
      ].join('\n'),
    );

    const missingState = states.get('doc-specialist.service');
    const activeState = states.get('reddit-helper.service');

    expect(resolveServiceInstalledState(missingState)).toBe(false);
    expect(resolveServiceRunningState(missingState)).toBe(false);
    expect(resolveServiceInstalledState(activeState)).toBe(true);
    expect(resolveServiceRunningState(activeState)).toBe(true);
  });
});
