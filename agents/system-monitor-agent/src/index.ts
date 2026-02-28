import * as fs from 'fs';
import * as path from 'path';

interface Task { id: string; type: string; agents?: string[]; }
interface Result {
  success: boolean;
  metrics: {
    timestamp: string;
    agentHealth: Record<string, any>;
    systemMetrics: any;
    alerts: string[];
  };
  executionTime: number;
}

function loadConfig(): any {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../agent.config.json'), 'utf-8'));
}

function canUseSkill(skillId: string): boolean {
  const config = loadConfig();
  return config.permissions.skills[skillId]?.allowed === true;
}

async function handleTask(task: Task): Promise<Result> {
  const startTime = Date.now();

  if (!canUseSkill('documentParser')) {
    return { success: false, metrics: { timestamp: new Date().toISOString(), agentHealth: {}, systemMetrics: {}, alerts: [] }, executionTime: Date.now() - startTime };
  }

  try {
    const alerts: string[] = [];
    const agentHealth: Record<string, any> = {};

    // Simulate agent health collection
    const agents = task.agents || ['market-research-agent', 'security-agent', 'qa-verification-agent'];
    for (const agent of agents) {
      const healthStatus = Math.random() > 0.05 ? 'OK' : 'DEGRADED';
      agentHealth[agent] = {
        status: healthStatus,
        uptime: Math.floor(Math.random() * 10000000),
        tasksCompleted: Math.floor(Math.random() * 1000),
        errorRate: (Math.random() * 5).toFixed(2) + '%',
      };

      if (healthStatus === 'DEGRADED') {
        alerts.push(`⚠️ ${agent} health degraded`);
      }
    }

    return {
      success: true,
      metrics: {
        timestamp: new Date().toISOString(),
        agentHealth,
        systemMetrics: {
          apiCosts: '$' + (Math.random() * 5).toFixed(2),
          totalTasks: Math.floor(Math.random() * 5000),
          avgLatency: Math.floor(Math.random() * 2000) + 'ms',
          errorRate: (Math.random() * 2).toFixed(2) + '%',
        },
        alerts,
      },
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return { success: false, metrics: { timestamp: new Date().toISOString(), agentHealth: {}, systemMetrics: {}, alerts: [(error as Error).message] }, executionTime: Date.now() - startTime };
  }
}

export { handleTask, loadConfig, canUseSkill };

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    return;
  }

  const raw = fs.readFileSync(payloadPath, 'utf-8');
  const payload = JSON.parse(raw) as Task;
  const result = await handleTask(payload);

  const resultFile = process.env.SYSTEM_MONITOR_AGENT_RESULT_FILE;
  if (resultFile) {
    fs.mkdirSync(path.dirname(resultFile), { recursive: true });
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf-8');
  } else {
    process.stdout.write(JSON.stringify(result));
  }
}

void main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
