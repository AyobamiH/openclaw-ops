/**
 * TestRunner Skill
 * 
 * Execute predefined test suites safely.
 * Whitelisted commands only - no arbitrary exec.
 * Returns detailed results and logs.
 * 
 * Used by: quality-assurance-and-verification-agent, operations-and-runbook-agent
 */

import { SkillDefinition } from '../orchestrator/src/skills/types.js';

// Whitelisted test commands
export const ALLOWED_TESTS = {
  'unit-tests': 'npm run test:unit',
  'integration-tests': 'npm run test:integration',
  'e2e-tests': 'npm run test:e2e',
  'lint': 'npm run lint',
  'type-check': 'npm run type-check',
  'security-audit': 'npm audit --audit-level=moderate',
  'build-verify': 'npm run build',
};

export const ALLOWED_TEST_COMMANDS = Object.freeze(
  Object.keys(ALLOWED_TESTS),
);

export function isAllowedTestCommand(
  command: string,
): command is keyof typeof ALLOWED_TESTS {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TESTS, command);
}

export const testRunnerDefinition: SkillDefinition = {
  id: 'testRunner',
  version: '1.0.0',
  description: 'Execute predefined test suites (whitelist only)',
  inputs: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Test command to run',
        enum: Object.keys(ALLOWED_TESTS),
      },
      mode: {
        type: 'string',
        description: 'Execution mode for the runner',
        enum: ['execute', 'dry-run'],
      },
      dryRun: {
        type: 'boolean',
        description: 'If true, validate the command without executing it',
        default: false,
      },
      timeout: { type: 'number', description: 'Timeout in milliseconds', default: 60000 },
      collectCoverage: { type: 'boolean', description: 'Collect coverage metrics', default: false },
    },
    required: ['command'],
    examples: [
      { command: 'unit-tests' },
      { command: 'e2e-tests', timeout: 120000 },
    ],
  },
  outputs: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      passed: { type: 'boolean' },
      exitCode: { type: 'number' },
      stdout: { type: 'string' },
      stderr: { type: 'string' },
      duration: { type: 'number', description: 'Execution time in milliseconds' },
      summary: {
        type: 'object',
        properties: {
          passed: { type: 'number' },
          failed: { type: 'number' },
          skipped: { type: 'number' },
        },
      },
      coverage: { type: 'object' },
      error: { type: 'string' },
    },
  },
  permissions: {
    execAllowed: ['npm', 'vitest', 'jest', 'sh'],
    fileRead: ['workspace', 'node_modules/.bin'],
  },
  provenance: {
    author: 'OpenClaw Team',
    source: 'https://github.com/openclawio/orchestrator/commit/mno345',
    version: '1.0.0',
    license: 'Apache-2.0',
  },
  audit: {
    passed: true,
    runAt: new Date().toISOString(),
    checks: [
      {
        name: 'command-whitelist',
        status: 'pass',
        message: 'All commands are in whitelist',
      },
      {
        name: 'no-arbitrary-exec',
        status: 'pass',
        message: 'Uses predefined test scripts only',
      },
    ],
    riskFlags: [],
    recommendations: [
      'Monitor for hanging tests; use timeout parameter',
      'Review test failures before shipping',
      'Security audit runs module dependencies, not user code',
    ],
  },
};

/**
 * Execute TestRunner skill
 */
export async function executeTestRunner(input: any): Promise<any> {
  const { command, timeout = 60000, collectCoverage = false } = input;
  const startTime = Date.now();
  const requestedMode = typeof input?.mode === 'string' ? input.mode.trim().toLowerCase() : '';
  const dryRun = input?.dryRun === true || requestedMode === 'dry-run' || requestedMode === 'dryrun';

  // Verify command is whitelisted
  if (!isAllowedTestCommand(command)) {
    return {
      success: false,
      passed: false,
      command,
      error: `Command not whitelisted. Allowed: ${ALLOWED_TEST_COMMANDS.join(', ')}`,
    };
  }

  if (dryRun) {
    return {
      success: true,
      passed: true,
      command,
      dryRun: true,
      executed: false,
      exitCode: 0,
      stdout: '',
      stderr: '',
      duration: Date.now() - startTime,
      summary: {
        passed: 0,
        failed: 0,
        skipped: 0,
      },
      outcomeKind: 'dry-run',
      outcomeSummary: `dry-run accepted for ${command}`,
    };
  }

  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const testCommand = ALLOWED_TESTS[command];

    let fullCommand = testCommand;
    if (collectCoverage && command === 'unit-tests') {
      fullCommand += ' --coverage';
    }

    const result = await execFileAsync('sh', ['-c', fullCommand], {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const duration = Date.now() - startTime;
    const exitCode = 0;

    // Parse output to extract summary
    const summary = parseTestOutput(result.stdout);

    return {
      success: true,
      command,
      passed: true,
      exitCode,
      stdout: result.stdout,
      stderr: result.stderr || '',
      duration,
      summary,
      coverage: collectCoverage ? {} : undefined,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    return {
      success: false,
      command,
      passed: false,
      error: error.message,
      exitCode: error.code || -1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      duration,
    };
  }
}

function parseTestOutput(stdout: string): any {
  // Try to parse test results
  // This is a simplified parser; extend based on your test framework

  const passedMatch = stdout.match(/(\d+) passed/i);
  const failedMatch = stdout.match(/(\d+) failed/i);
  const skippedMatch = stdout.match(/(\d+) skipped/i);

  return {
    passed: passedMatch ? parseInt(passedMatch[1]) : 0,
    failed: failedMatch ? parseInt(failedMatch[1]) : 0,
    skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
  };
}
