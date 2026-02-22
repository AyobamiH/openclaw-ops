import * as fs from 'fs';
import * as path from 'path';

interface Task { id: string; type: string; steps: any[]; }
interface Result { success: boolean; steps: any[]; totalTime: number; executionTime: number; }

function loadConfig(): any {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../agent.config.json'), 'utf-8'));
}

function canUseSkill(skillId: string): boolean {
  const config = loadConfig();
  return config.permissions.skills[skillId]?.allowed === true;
}

async function handleTask(task: Task): Promise<Result> {
  const startTime = Date.now();
  const executedSteps: any[] = [];
  let totalTime = 0;

  try {
    for (const step of task.steps) {
      const stepStart = Date.now();
      const result = await executeStep(step);
      const stepTime = Date.now() - stepStart;
      totalTime += stepTime;

      executedSteps.push({
        name: step.name,
        agent: step.agent,
        success: result.success,
        duration: stepTime,
        output: result.output,
      });

      if (!result.success && !step.optional) {
        return {
          success: false,
          steps: executedSteps,
          totalTime,
          executionTime: Date.now() - startTime,
        };
      }
    }

    return {
      success: true,
      steps: executedSteps,
      totalTime,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      steps: executedSteps,
      totalTime,
      executionTime: Date.now() - startTime,
    };
  }
}

async function executeStep(step: any): Promise<any> {
  // Simulate agent execution
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, output: `Executed ${step.agent}` });
    }, Math.random() * 100);
  });
}

export { handleTask, loadConfig, canUseSkill };
