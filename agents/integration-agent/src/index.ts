import * as fs from 'fs';
import * as path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';

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
  if (step?.simulateFailure === true) {
    return { success: false, output: `Simulated failure for ${step?.agent ?? 'unknown-agent'}` };
  }

  // Simulate agent execution
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, output: `Executed ${step.agent}` });
    }, Math.random() * 100);
  });
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

    const resultFile = process.env.INTEGRATION_AGENT_RESULT_FILE;
    if (resultFile) {
      await mkdir(path.dirname(resultFile), { recursive: true });
      await writeFile(resultFile, JSON.stringify(result, null, 2), 'utf-8');
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

    process.exit(0);
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
