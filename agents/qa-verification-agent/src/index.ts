#!/usr/bin/env node

/**
 * QA Verification Agent - Entry Point
 *
 * Runs bounded QA checks, supports explicit dry-run mode, and refuses to
 * report a green execution unless a real whitelisted runner command executed.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  countByStatus,
  loadRuntimeState,
  normalizeAgentIdFromNode,
  summarizeRelationshipObservations,
  type RuntimeIncidentLedgerRecord,
  type RuntimeRelationshipObservation,
  type RuntimeRepairRecord,
  type RuntimeStateSubset,
  type RuntimeWorkflowEvent,
} from '../../shared/runtime-evidence.js';

type ExecuteSkillFn = (
  skillId: string,
  input: any,
  requestingAgent?: string,
) => Promise<any>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../agent.config.json');
const orchestratorWorkingDir = path.resolve(__dirname, '../../../orchestrator');
const DEFAULT_DRY_RUN_COMMAND = 'build-verify';

interface AgentConfig {
  id: string;
  name: string;
  orchestratorStatePath?: string;
  permissions: any;
}

interface QaRequest {
  mode: 'dry-run' | 'execute';
  testCommand?: string;
  timeout: number;
  collectCoverage: boolean;
}

interface RuntimeState extends RuntimeStateSubset {}

interface VerificationContext {
  incident: {
    incidentId: string;
    classification: string | null;
    severity: string | null;
    status: string | null;
    owner: string | null;
    remediationStatus: string | null;
    remediationTaskStatuses: Record<string, number>;
    summary: string | null;
  } | null;
  repairs: {
    total: number;
    byStatus: Record<string, number>;
    latestCompletedAt: string | null;
    latestVerifiedAt: string | null;
  };
  workflow: {
    totalEvents: number;
    latestEventAt: string | null;
    byStage: Record<string, number>;
    stopCodes: string[];
  };
  relationships: {
    total: number;
    lastObservedAt: string | null;
    byRelationship: Record<string, number>;
    targetAgentId: string | null;
  };
  affectedSurfaces: string[];
  serviceIds: string[];
  verificationSignals: string[];
  evidence: string[];
}

interface VerificationRelationshipOutput {
  from: string;
  to: string;
  relationship: 'verifies-agent' | 'depends-on-run';
  detail: string;
  evidence: string[];
  targetRunId?: string;
}

interface VerificationToolInvocationOutput {
  toolId: string;
  detail: string;
  evidence: string[];
  classification: 'required' | 'optional';
}

interface ClosureRecommendation {
  decision: 'close-incident' | 'keep-open' | 'escalate';
  allowClosure: boolean;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  nextActions: string[];
}

let agentConfig: AgentConfig;
let executeSkillFn: ExecuteSkillFn | null = null;

async function getExecuteSkill(): Promise<ExecuteSkillFn> {
  if (executeSkillFn) return executeSkillFn;

  const skillsModule = await import('../../../skills/index.ts');
  const candidate =
    (skillsModule as any).executeSkill ??
    (skillsModule as any).default?.executeSkill;

  if (typeof candidate !== 'function') {
    throw new Error('skills registry executeSkill export unavailable');
  }

  executeSkillFn = candidate as ExecuteSkillFn;
  return executeSkillFn;
}

async function loadConfig(): Promise<void> {
  const configContent = await fs.readFile(configPath, 'utf-8');
  agentConfig = JSON.parse(configContent);
}

function ensureConfigLoaded(): void {
  if (!agentConfig) {
    throw new Error('Agent config not loaded');
  }
}

function canUseSkill(skillId: string): boolean {
  ensureConfigLoaded();
  const skillPerms = agentConfig.permissions.skills[skillId];
  return skillPerms && skillPerms.allowed === true;
}

function normalizeMode(value: unknown): 'dry-run' | 'execute' | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'dry-run' || normalized === 'dryrun') return 'dry-run';
  if (normalized === 'execute' || normalized === 'run') return 'execute';
  return null;
}

function mapSuiteToCommand(suite: unknown): string | undefined {
  if (typeof suite !== 'string') return undefined;
  switch (suite.trim().toLowerCase()) {
    case 'smoke':
    case 'build':
      return 'build-verify';
    case 'unit':
    case 'unit-tests':
      return 'unit-tests';
    case 'integration':
    case 'integration-tests':
      return 'integration-tests';
    case 'e2e':
    case 'e2e-tests':
      return 'e2e-tests';
    case 'lint':
      return 'lint';
    case 'type-check':
    case 'types':
      return 'type-check';
    case 'security':
    case 'security-audit':
      return 'security-audit';
    default:
      return undefined;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveTargetAgentId(task: any): string | null {
  const input =
    task.input && typeof task.input === 'object' ? task.input : {};
  const constraints =
    task.constraints && typeof task.constraints === 'object'
      ? task.constraints
      : {};

  const explicitCandidate = [
    input.targetAgentId,
    task.targetAgentId,
    constraints.targetAgentId,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  if (typeof explicitCandidate === 'string') {
    return explicitCandidate.trim();
  }

  const targetCandidate = [input.target, task.target, constraints.target].find(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  if (typeof targetCandidate === 'string' && targetCandidate.endsWith('-agent')) {
    return targetCandidate.trim();
  }

  return null;
}

function sortIsoDescending(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
}

function collectIncidentContext(
  task: any,
  state: RuntimeState,
): {
  incident: VerificationContext['incident'];
  repairIds: string[];
  runIds: string[];
  serviceIds: string[];
  affectedSurfaces: string[];
} {
  const incidentId =
    typeof task.incidentId === 'string'
      ? task.incidentId
      : typeof task.input?.incidentId === 'string'
        ? task.input.incidentId
        : null;
  const repairIds = [
    ...asStringArray(task.repairIds),
    ...asStringArray(task.input?.repairIds),
  ];
  const runIds = [
    ...asStringArray(task.runIds),
    ...asStringArray(task.input?.runIds),
  ];
  const serviceIds = [
    ...asStringArray(task.serviceIds),
    ...asStringArray(task.input?.serviceIds),
  ];
  const affectedSurfaces = [
    ...asStringArray(task.affectedSurfaces),
    ...asStringArray(task.input?.affectedSurfaces),
  ];

  const incidentRecord =
    incidentId && Array.isArray(state.incidentLedger)
      ? state.incidentLedger.find((incident) => incident.incidentId === incidentId) ?? null
      : null;

  if (!incidentRecord) {
    return {
      incident: incidentId
        ? {
            incidentId,
            classification: null,
            severity: null,
            status: 'resolved-or-missing',
            owner: null,
            remediationStatus: null,
            remediationTaskStatuses: {},
            summary: 'Referenced incident is not currently active in runtime state.',
          }
        : null,
      repairIds,
      runIds,
      serviceIds,
      affectedSurfaces,
    };
  }

  const remediationTaskStatuses = countByStatus(
    (incidentRecord.remediationTasks ?? []).map((taskRecord) => ({
      status: taskRecord.status,
    })),
  );

  return {
    incident: {
      incidentId,
      classification:
        typeof incidentRecord.classification === 'string'
          ? incidentRecord.classification
          : null,
      severity:
        typeof incidentRecord.severity === 'string' ? incidentRecord.severity : null,
      status:
        typeof incidentRecord.status === 'string' ? incidentRecord.status : null,
      owner:
        typeof incidentRecord.owner === 'string' ? incidentRecord.owner : null,
      remediationStatus:
        typeof incidentRecord.remediation?.status === 'string'
          ? incidentRecord.remediation.status
          : null,
      remediationTaskStatuses,
      summary:
        typeof incidentRecord.summary === 'string' ? incidentRecord.summary : null,
    },
    repairIds: repairIds.length > 0 ? repairIds : [],
    runIds:
      runIds.length > 0
        ? runIds
        : Array.isArray(incidentRecord.remediationTasks)
          ? incidentRecord.remediationTasks
              .map((taskRecord) =>
                typeof taskRecord.runId === 'string' ? taskRecord.runId : null,
              )
              .filter((value): value is string => Boolean(value))
          : [],
    serviceIds:
      serviceIds.length > 0
        ? serviceIds
        : Array.isArray(task.serviceIds)
          ? asStringArray(task.serviceIds)
          : [],
    affectedSurfaces:
      affectedSurfaces.length > 0
        ? affectedSurfaces
        : Array.isArray(task.affectedSurfaces)
          ? asStringArray(task.affectedSurfaces)
          : [],
  };
}

function buildVerificationContext(task: any, state: RuntimeState): VerificationContext {
  const targetAgentId = resolveTargetAgentId(task);
  const incidentContext = collectIncidentContext(task, state);
  const relatedRepairs = (state.repairRecords ?? []).filter((repair) => {
    if (
      incidentContext.repairIds.length > 0 &&
      typeof repair.repairId === 'string' &&
      incidentContext.repairIds.includes(repair.repairId)
    ) {
      return true;
    }
    if (
      incidentContext.runIds.length > 0 &&
      typeof repair.repairRunId === 'string' &&
      incidentContext.runIds.includes(repair.repairRunId)
    ) {
      return true;
    }
    return false;
  });
  const relatedWorkflowEvents = (state.workflowEvents ?? []).filter((event) => {
    if (
      incidentContext.runIds.length > 0 &&
      typeof event.runId === 'string' &&
      incidentContext.runIds.includes(event.runId)
    ) {
      return true;
    }
    if (
      typeof task.id === 'string' &&
      typeof event.taskId === 'string' &&
      event.taskId === task.id
    ) {
      return true;
    }
    return false;
  });
  const relatedRelationships = (state.relationshipObservations ?? []).filter((observation) => {
    if (
      targetAgentId &&
      observation.relationship === 'verifies-agent' &&
      normalizeAgentIdFromNode(observation.to) === targetAgentId
    ) {
      return true;
    }
    if (
      incidentContext.runIds.length > 0 &&
      typeof observation.runId === 'string' &&
      incidentContext.runIds.includes(observation.runId)
    ) {
      return true;
    }
    return false;
  });

  const workflowByStage = relatedWorkflowEvents.reduce<Record<string, number>>(
    (acc, event) => {
      const stage = typeof event.stage === 'string' ? event.stage : 'unknown';
      acc[stage] = (acc[stage] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const stopCodes = Array.from(
    new Set(
      relatedWorkflowEvents
        .map((event) =>
          typeof event.stopCode === 'string' && event.stopCode.length > 0
            ? event.stopCode
            : null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const relationshipSummary = summarizeRelationshipObservations(relatedRelationships);
  const verificationSignals: string[] = [];
  const evidence: string[] = [];

  if (incidentContext.incident?.status === 'active') {
    verificationSignals.push('Referenced incident remains active.');
  }
  if (incidentContext.incident?.severity === 'critical') {
    verificationSignals.push('Referenced incident severity is critical.');
  }
  if ((relationshipSummary.total ?? 0) === 0 && targetAgentId) {
    verificationSignals.push(
      `No runtime verification relationship observed yet for ${targetAgentId}.`,
    );
  }
  if (relatedWorkflowEvents.length === 0 && incidentContext.runIds.length > 0) {
    verificationSignals.push('No workflow evidence matched the referenced run IDs.');
  }
  if (
    relatedRepairs.some(
      (repair) => repair.status === 'failed' || typeof repair.lastError === 'string',
    )
  ) {
    verificationSignals.push('One or more related repairs remain failed or error-marked.');
  }

  if (incidentContext.incident?.incidentId) {
    evidence.push(`incident:${incidentContext.incident.incidentId}`);
  }
  if (targetAgentId) {
    evidence.push(`target-agent:${targetAgentId}`);
  }
  if (incidentContext.serviceIds.length > 0) {
    evidence.push(`services:${incidentContext.serviceIds.join(',')}`);
  }
  if (incidentContext.affectedSurfaces.length > 0) {
    evidence.push(`surfaces:${incidentContext.affectedSurfaces.join(',')}`);
  }
  if (stopCodes.length > 0) {
    evidence.push(`workflow-stop-codes:${stopCodes.join(',')}`);
  }

  return {
    incident: incidentContext.incident,
    repairs: {
      total: relatedRepairs.length,
      byStatus: countByStatus(relatedRepairs),
      latestCompletedAt:
        sortIsoDescending(relatedRepairs.map((repair) => repair.completedAt)).at(0) ?? null,
      latestVerifiedAt:
        sortIsoDescending(relatedRepairs.map((repair) => repair.verifiedAt)).at(0) ?? null,
    },
    workflow: {
      totalEvents: relatedWorkflowEvents.length,
      latestEventAt:
        sortIsoDescending(relatedWorkflowEvents.map((event) => event.timestamp)).at(0) ??
        null,
      byStage: workflowByStage,
      stopCodes,
    },
    relationships: {
      total: relationshipSummary.total,
      lastObservedAt: relationshipSummary.lastObservedAt,
      byRelationship: relationshipSummary.byRelationship,
      targetAgentId,
    },
    affectedSurfaces: incidentContext.affectedSurfaces,
    serviceIds: incidentContext.serviceIds,
    verificationSignals,
    evidence,
  };
}

function buildRequest(task: any): QaRequest {
  const input =
    task.input && typeof task.input === 'object' ? task.input : {};
  const constraints =
    task.constraints && typeof task.constraints === 'object'
      ? task.constraints
      : {};

  const explicitMode =
    normalizeMode(input.mode) ??
    normalizeMode(task.mode) ??
    normalizeMode(constraints.mode);
  const dryRun =
    explicitMode === 'dry-run' ||
    input.dryRun === true ||
    task.dryRun === true ||
    constraints.dryRun === true;

  const requestedCommand =
    (typeof input.testCommand === 'string' && input.testCommand.trim()) ||
    (typeof input.command === 'string' && input.command.trim()) ||
    (typeof task.testCommand === 'string' && task.testCommand.trim()) ||
    (typeof constraints.testCommand === 'string' &&
      constraints.testCommand.trim()) ||
    mapSuiteToCommand(task.suite);

  return {
    mode: dryRun ? 'dry-run' : 'execute',
    testCommand: requestedCommand || (dryRun ? DEFAULT_DRY_RUN_COMMAND : undefined),
    timeout: Number(
      input.timeout ?? constraints.timeout ?? agentConfig?.constraints?.timeout,
    ) || 300000,
    collectCoverage: Boolean(
      input.collectCoverage ?? constraints.collectCoverage ?? false,
    ),
  };
}

async function withWorkingDirectory<T>(
  targetDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previousDir = process.cwd();
  process.chdir(targetDir);
  try {
    return await fn();
  } finally {
    process.chdir(previousDir);
  }
}

function buildDryRunResult(
  taskId: string,
  agentId: string,
  request: QaRequest,
  runnerData: Record<string, any> = {},
) {
  return {
    taskId,
    success: true,
    dryRun: true,
    executionMode: 'dry-run',
    outcomeKind: 'dry-run',
    outcomeSummary:
      typeof runnerData.outcomeSummary === 'string' && runnerData.outcomeSummary.length > 0
        ? runnerData.outcomeSummary
        : request.testCommand && request.testCommand.length > 0
          ? `dry-run accepted for ${request.testCommand}`
          : 'dry-run accepted with no runner command executed',
    executedCommand:
      typeof runnerData.command === 'string' && runnerData.command.length > 0
        ? runnerData.command
        : request.testCommand ?? null,
    testsRun: 0,
    testsPassed: 0,
    totalChecks: 0,
    passedChecks: 0,
    agentId,
    report: {
      timestamp: new Date().toISOString(),
      taskId,
      dryRun: true,
      verdict: 'DRY RUN',
      summary: {
        passed: 0,
        failed: 0,
        skipped: 0,
      },
      notes: [
        typeof runnerData.command === 'string' && runnerData.command.length > 0
          ? `testRunner validated ${runnerData.command} without executing it.`
          : 'No testRunner command executed in dry-run mode.',
      ],
    },
    results: [],
    completedAt: new Date().toISOString(),
  };
}

async function runTestRunner(
  executeSkill: ExecuteSkillFn,
  agentId: string,
  request: QaRequest,
) {
  const validationInput = {
    command: request.testCommand,
    timeout: request.timeout,
    collectCoverage: request.collectCoverage,
    mode: 'dry-run',
    dryRun: true,
  };

  const validationResult = await executeSkill(
    'testRunner',
    validationInput,
    agentId,
  );

  if (request.mode === 'dry-run' || !validationResult.success || !validationResult.data) {
    return validationResult;
  }

  const executionInput = {
    command: request.testCommand,
    timeout: request.timeout,
    collectCoverage: request.collectCoverage,
    mode: 'execute',
    dryRun: false,
  };

  return withWorkingDirectory(orchestratorWorkingDir, () =>
    executeSkill('testRunner', executionInput, agentId),
  );
}

function buildClosureRecommendation(args: {
  context: VerificationContext;
  passed: boolean;
  evidenceQuality: 'strong' | 'partial' | 'minimal';
  reproducibility: 'verified' | 'failed' | 'unproven';
  dryRun?: boolean;
}): ClosureRecommendation {
  const { context, passed, evidenceQuality, reproducibility, dryRun } = args;

  if (dryRun) {
    return {
      decision: 'keep-open',
      allowClosure: false,
      confidence: 'low',
      summary: 'Dry-run validation cannot close an incident or certify a remediation outcome.',
      nextActions: [
        'Run execute mode for bounded verification.',
        'Capture runtime evidence after remediation completes.',
      ],
    };
  }

  if (!passed || reproducibility === 'failed') {
    return {
      decision: 'escalate',
      allowClosure: false,
      confidence: 'high',
      summary: 'Verification failed; incident closure is not permitted.',
      nextActions: [
        'Inspect the failing command output.',
        'Review remediation blockers and rerun verification after repair.',
      ],
    };
  }

  if (context.verificationSignals.length > 0 || evidenceQuality === 'minimal') {
    return {
      decision: 'keep-open',
      allowClosure: false,
      confidence: evidenceQuality === 'minimal' ? 'medium' : 'high',
      summary:
        context.verificationSignals[0] ??
        'Runtime evidence is still too weak to support closure.',
      nextActions: [
        'Reconcile runtime truth and relationship evidence.',
        'Run another verifier pass after missing evidence appears.',
      ],
    };
  }

  return {
    decision: 'close-incident',
    allowClosure: true,
    confidence: evidenceQuality === 'strong' ? 'high' : 'medium',
    summary: 'Verification passed with enough runtime evidence to support closure.',
    nextActions: [
      'Mark the incident resolved if runtime reconciliation also agrees.',
      'Keep the incident on watch for recurrence.',
    ],
  };
}

async function handleTask(task: any): Promise<any> {
  if (!agentConfig) {
    await loadConfig();
  }

  const agentId = agentConfig.id;
  const taskId = task.id || 'unknown';
  const request = buildRequest(task);
  const runtimeState = await loadRuntimeState<RuntimeState>(
    configPath,
    agentConfig.orchestratorStatePath,
  );
  const initialVerificationContext = buildVerificationContext(task, runtimeState);
  const targetAgentId = resolveTargetAgentId(task);

  console.log(`[${agentId}] Starting task: ${taskId}`);

  try {
    if (request.mode === 'dry-run') {
      if (!request.testCommand) {
        return {
          taskId,
          success: false,
          error:
            'No QA command resolved for dry-run validation; provide a supported suite or testCommand alias.',
          agentId,
        };
      }
    }

    if (!canUseSkill('testRunner')) {
      return {
        taskId,
        success: false,
        error: 'testRunner skill not allowed',
        agentId,
      };
    }

    const executeSkill = await getExecuteSkill();
    const dryRunLabel = request.mode === 'dry-run' ? ' (dry-run)' : '';
    console.log(
      `[${agentId}] Running QA command: ${request.testCommand ?? 'none'}${dryRunLabel} in ${orchestratorWorkingDir}`,
    );

    const testResult = await runTestRunner(executeSkill, agentId, request);

    if (!testResult.success || !testResult.data) {
      return {
        taskId,
        success: false,
        error:
          testResult.error ||
          (testResult.data &&
          typeof testResult.data === 'object' &&
          typeof (testResult.data as Record<string, unknown>).error === 'string'
            ? ((testResult.data as Record<string, unknown>).error as string)
            : undefined) ||
          'testRunner execution failed',
        agentId,
      };
    }

    const runnerData = testResult.data;
    if (runnerData.dryRun === true || request.mode === 'dry-run') {
      const closureRecommendation = buildClosureRecommendation({
        context: initialVerificationContext,
        passed: true,
        evidenceQuality: 'minimal',
        reproducibility: 'unproven',
        dryRun: true,
      });
      return {
        ...buildDryRunResult(taskId, agentId, request, runnerData),
        runtimeContext: initialVerificationContext,
        verificationSignals: initialVerificationContext.verificationSignals,
        relationships:
          targetAgentId
            ? [
                {
                  from: 'agent:qa-verification-agent',
                  to: `agent:${targetAgentId}`,
                  relationship: 'verifies-agent',
                  detail: `qa-verification-agent prepared dry-run coverage for ${targetAgentId}.`,
                  evidence: initialVerificationContext.evidence,
                },
              ]
            : [],
        toolInvocations: [
          {
            toolId: 'testRunner',
            detail: `qa-verification-agent validated ${request.testCommand ?? 'qa alias'} in dry-run mode.`,
            evidence: initialVerificationContext.evidence,
            classification: 'required',
          },
        ],
        closureRecommendation,
        evidence: initialVerificationContext.evidence,
      };
    }

    const summary =
      runnerData.summary && typeof runnerData.summary === 'object'
        ? runnerData.summary
        : {};
    const summaryTotal =
      Number(summary.passed ?? 0) +
      Number(summary.failed ?? 0) +
      Number(summary.skipped ?? 0);
    const totalChecks = summaryTotal > 0 ? summaryTotal : 1;
    const passedChecks =
      summaryTotal > 0
        ? Number(summary.passed ?? 0)
        : runnerData.passed === true
          ? 1
          : 0;
    const outcomeKind = summaryTotal > 0 ? 'tests' : 'checks';

    if (totalChecks <= 0) {
      return {
        taskId,
        success: false,
        error: 'QA execution completed without any checks being recorded',
        agentId,
      };
    }

    const postExecutionState = await loadRuntimeState<RuntimeState>(
      configPath,
      agentConfig.orchestratorStatePath,
    );
    const verificationContext = buildVerificationContext(task, postExecutionState);
    const evidenceQuality =
      verificationContext.workflow.totalEvents > 0 &&
      verificationContext.relationships.total > 0
        ? 'strong'
        : verificationContext.workflow.totalEvents > 0 ||
            verificationContext.repairs.total > 0
          ? 'partial'
          : 'minimal';
    const reproducibility =
      totalChecks > 0 && runnerData.passed === true
        ? 'verified'
        : totalChecks > 0
          ? 'failed'
          : 'unproven';
    const closureRecommendation = buildClosureRecommendation({
      context: verificationContext,
      passed: runnerData.passed === true,
      evidenceQuality,
      reproducibility,
    });
    const relationships: VerificationRelationshipOutput[] = [];
    if (targetAgentId) {
      relationships.push({
        from: 'agent:qa-verification-agent',
        to: `agent:${targetAgentId}`,
        relationship: 'verifies-agent',
        detail: `qa-verification-agent verified ${targetAgentId} with ${request.testCommand ?? 'bounded verification'}.`,
        evidence: verificationContext.evidence,
      });
    }
    for (const runId of asStringArray(task.runIds ?? task.input?.runIds)) {
      relationships.push({
        from: 'agent:qa-verification-agent',
        to: `task:${task.type}`,
        relationship: 'depends-on-run',
        detail: `qa-verification-agent relied on workflow evidence from ${runId}.`,
        evidence: [`run:${runId}`],
        targetRunId: runId,
      });
    }

    return {
      taskId,
      success: runnerData.passed === true,
      dryRun: false,
      executionMode: 'execute',
      outcomeKind,
      outcomeSummary:
        outcomeKind === 'tests'
          ? `${passedChecks}/${totalChecks} tests passed`
          : `${passedChecks}/${totalChecks} checks passed`,
      executedCommand: request.testCommand,
      testsRun: totalChecks,
      testsPassed: passedChecks,
      totalChecks,
      passedChecks,
      agentId,
      runtimeContext: verificationContext,
      verificationSignals: verificationContext.verificationSignals,
      verification: {
        evidenceQuality,
        reproducibility,
        policyFit: 'bounded-test-runner',
      },
      relationships,
      toolInvocations: [
        {
          toolId: 'testRunner',
          detail: `qa-verification-agent executed ${request.testCommand ?? 'qa alias'} against the orchestrator workspace.`,
          evidence: [
            `checks:${totalChecks}`,
            `passed:${passedChecks}`,
            ...verificationContext.evidence.slice(0, 4),
          ],
          classification: 'required',
        },
      ],
      closureRecommendation,
      report: {
        timestamp: new Date().toISOString(),
        taskId,
        verdict: runnerData.passed === true ? 'PASS ✅' : 'FAIL ❌',
        summary: {
          passed: passedChecks,
          failed: totalChecks - passedChecks,
          skipped: Number(summary.skipped ?? 0),
        },
        outcomeKind,
        runtimeContext: {
          incidentStatus: verificationContext.incident?.status ?? null,
          repairCount: verificationContext.repairs.total,
          workflowEvents: verificationContext.workflow.totalEvents,
          relationshipEvents: verificationContext.relationships.total,
        },
        closureRecommendation,
      },
      results: [
        {
          command: request.testCommand,
          passed: runnerData.passed,
          exitCode: runnerData.exitCode,
          duration: runnerData.duration,
        },
      ],
      evidence: verificationContext.evidence,
      completedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`[${agentId}] Error in task ${taskId}:`, error.message);
    return {
      taskId,
      success: false,
      error: error.message,
      agentId,
    };
  }
}

async function main(): Promise<void> {
  console.log('[qa-verification] Agent starting...');

  await loadConfig();
  console.log(`[${agentConfig.id}] Ready to accept tasks`);

  const taskArg = process.argv[2];
  if (!taskArg) {
    return;
  }

  try {
    let taskInput: any;
    try {
      const payloadRaw = await fs.readFile(taskArg, 'utf-8');
      taskInput = JSON.parse(payloadRaw);
    } catch {
      taskInput = JSON.parse(taskArg);
    }

    const result = await handleTask(taskInput);
    if (process.env.QA_VERIFICATION_AGENT_RESULT_FILE) {
      const resultDir = path.dirname(process.env.QA_VERIFICATION_AGENT_RESULT_FILE);
      await fs.mkdir(resultDir, { recursive: true });
      await fs.writeFile(
        process.env.QA_VERIFICATION_AGENT_RESULT_FILE,
        JSON.stringify(result, null, 2),
        'utf-8',
      );
    } else {
      console.log('Result:', JSON.stringify(result, null, 2));
    }

    process.exit(result.success ? 0 : 1);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

const directEntryHref = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (directEntryHref === import.meta.url) {
  main().catch(console.error);
}

export { handleTask, loadConfig, canUseSkill };
