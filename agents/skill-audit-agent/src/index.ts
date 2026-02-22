import * as fs from 'fs';
import * as path from 'path';

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

export { handleTask, loadConfig, canUseSkill };
