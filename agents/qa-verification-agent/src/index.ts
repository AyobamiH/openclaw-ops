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
  permissions: any;
}

interface QaRequest {
  mode: 'dry-run' | 'execute';
  testCommand?: string;
  timeout: number;
  collectCoverage: boolean;
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

async function handleTask(task: any): Promise<any> {
  if (!agentConfig) {
    await loadConfig();
  }

  const agentId = agentConfig.id;
  const taskId = task.id || 'unknown';
  const request = buildRequest(task);

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
      return buildDryRunResult(taskId, agentId, request, runnerData);
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
      },
      results: [
        {
          command: request.testCommand,
          passed: runnerData.passed,
          exitCode: runnerData.exitCode,
          duration: runnerData.duration,
        },
      ],
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
