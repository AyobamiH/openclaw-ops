#!/usr/bin/env node

/**
 * QA Verification Agent - Entry Point
 * 
 * Runs tests, validates quality, generates reports.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

type ExecuteSkillFn = (skillId: string, input: any, requestingAgent?: string) => Promise<any>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../agent.config.json');

interface AgentConfig {
  id: string;
  name: string;
  permissions: any;
}

let agentConfig: AgentConfig;
let executeSkillFn: ExecuteSkillFn | null = null;

async function getExecuteSkill(): Promise<ExecuteSkillFn> {
  if (executeSkillFn) return executeSkillFn;

  const skillsModule = await import('../../../skills/index.ts');
  const candidate = (skillsModule as any).executeSkill ?? (skillsModule as any).default?.executeSkill;

  if (typeof candidate !== 'function') {
    throw new Error('skills registry executeSkill export unavailable');
  }

  executeSkillFn = candidate as ExecuteSkillFn;
  return executeSkillFn;
}

async function loadConfig(): Promise<void> {
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    agentConfig = JSON.parse(configContent);
    console.log(`[qa-verification] Configuration loaded`);
  } catch (error: any) {
    console.error('Failed to load agent config:', error.message);
    process.exit(1);
  }
}

function canUseSkill(skillId: string): boolean {
  const skillPerms = agentConfig.permissions.skills[skillId];
  return skillPerms && skillPerms.allowed === true;
}

async function handleTask(task: any): Promise<any> {
  const agentId = agentConfig.id;
  const taskId = task.id || 'unknown';
  const executeSkill = await getExecuteSkill();

  console.log(`[${agentId}] Starting task: ${taskId}`);

  try {
    const input = (task.input && typeof task.input === 'object')
      ? task.input
      : ((task.target || task.suite || task.constraints) ? {
          testCommand: (task.constraints && typeof task.constraints.testCommand === 'string')
            ? task.constraints.testCommand
            : 'echo qa-smoke',
          timeout: (task.constraints && task.constraints.timeout) || 300000,
          collectCoverage: false,
        } : null);

    if (!input || typeof input !== 'object') {
      return {
        taskId,
        success: false,
        error: 'Invalid input format',
      };
    }

    const results: any[] = [];
    const report: any = {
      timestamp: new Date().toISOString(),
      taskId,
      tests: [],
      summary: {
        passed: 0,
        failed: 0,
        skipped: 0,
      },
    };

    // Task: Run test suite
    if (input.testCommand) {
      console.log(`[${agentId}] Running test: ${input.testCommand}`);

      if (!canUseSkill('testRunner')) {
        return {
          taskId,
          success: false,
          error: 'testRunner skill not allowed',
        };
      }

      const testResult = await executeSkill('testRunner', {
        command: input.testCommand,
        timeout: input.timeout || 300000,
        collectCoverage: input.collectCoverage || false,
      }, agentId);

      if (testResult.success) {
        report.tests.push(testResult.data);

        if (testResult.data.summary) {
          report.summary.passed += testResult.data.summary.passed || 0;
          report.summary.failed += testResult.data.summary.failed || 0;
          report.summary.skipped += testResult.data.summary.skipped || 0;
        }

        results.push({
          command: input.testCommand,
          passed: testResult.data.passed,
          exitCode: testResult.data.exitCode,
        });
      } else {
        report.tests.push({
          command: input.testCommand,
          error: testResult.error,
        });

        results.push({
          command: input.testCommand,
          error: testResult.error,
        });
      }
    }

    // Generate report verdict
    const verdict = report.summary.failed === 0 ? 'PASS ✅' : 'FAIL ❌';
    report.verdict = verdict;

    console.log(`[${agentId}] Task completed: ${taskId} - ${verdict}`);
    return {
      taskId,
      success: report.summary.failed === 0,
      agentId,
      testsRun: report.summary.passed + report.summary.failed + report.summary.skipped,
      testsPassed: report.summary.passed,
      report,
      results,
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
  if (taskArg) {
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
        await fs.writeFile(process.env.QA_VERIFICATION_AGENT_RESULT_FILE, JSON.stringify(result, null, 2), 'utf-8');
      } else {
        console.log('Result:', JSON.stringify(result, null, 2));
      }
      process.exit(result.success ? 0 : 1);
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
}

main().catch(console.error);

export { handleTask, loadConfig, canUseSkill };
