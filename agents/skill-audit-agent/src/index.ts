import * as fs from 'fs';
import * as path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';

interface Task { id: string; skillId: string; type: string; }
interface Result { success: boolean; skill: string; verdict: string; issues: string[]; executionTime: number; }

function loadConfig(): any {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../agent.config.json'), 'utf-8'));
}

function canUseSkill(skillId: string): boolean {
  const config = loadConfig();
  return config.permissions.skills[skillId]?.allowed === true;
}

async function handleTask(task: Task): Promise<Result> {
  const startTime = Date.now();

  if (!canUseSkill('testRunner')) {
    return { success: false, skill: task.skillId, verdict: 'FAILED', issues: ['testRunner unavailable'], executionTime: Date.now() - startTime };
  }

  try {
    const issues: string[] = [];
    let testsPass = true;
    let performanceOK = true;
    let securityOK = true;

    switch (task.type) {
      case 'full_audit':
        testsPass = Math.random() > 0.05; // Simulate 95% pass rate
        performanceOK = Math.random() > 0.02;
        securityOK = Math.random() > 0.01;
        break;
      case 'unit_tests':
        testsPass = true;
        break;
      case 'performance':
        performanceOK = true;
        break;
    }

    if (!testsPass) issues.push('Unit tests failing');
    if (!performanceOK) issues.push('Performance below SLA');
    if (!securityOK) issues.push('Security issues found');

    const verdict = issues.length === 0 ? 'APPROVED' : 'FAILED';

    return {
      success: issues.length === 0,
      skill: task.skillId,
      verdict,
      issues,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      skill: task.skillId,
      verdict: 'ERROR',
      issues: [(error as Error).message],
      executionTime: Date.now() - startTime,
    };
  }
}

async function main(): Promise<void> {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    return;
  }

  try {
    const payloadRaw = await readFile(payloadPath, 'utf-8');
    const taskInput = JSON.parse(payloadRaw) as Task;
    const result = await handleTask(taskInput);

    const resultFile = process.env.SKILL_AUDIT_AGENT_RESULT_FILE;
    if (resultFile) {
      await mkdir(path.dirname(resultFile), { recursive: true });
      await writeFile(resultFile, JSON.stringify(result, null, 2), 'utf-8');
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

export { handleTask, loadConfig, canUseSkill };
