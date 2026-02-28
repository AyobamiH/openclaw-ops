#!/usr/bin/env node

/**
 * Market Research Agent - Entry Point
 * 
 * Fetches and analyzes market information from allowlisted web sources.
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
    console.log(`[market-research] Configuration loaded`);
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
      : ((task.query || task.scope) ? task : null);

    if (!input || typeof input !== 'object') {
      return {
        taskId,
        success: false,
        error: 'Invalid input format',
      };
    }

    const results: any[] = [];

    // Task: Research URLs
    if (input.urls && Array.isArray(input.urls)) {
      console.log(`[${agentId}] Researching ${input.urls.length} URLs`);

      for (const url of input.urls) {
        if (!canUseSkill('sourceFetch')) {
          return {
            taskId,
            success: false,
            error: 'sourceFetch skill not allowed',
          };
        }

        const fetchResult = await executeSkill('sourceFetch', {
          url,
          timeout: agentConfig.permissions.skills.sourceFetch.maxCalls ? 10000 : 10000,
          stripScripts: true,
          normalizeText: true,
        }, agentId);

        if (fetchResult.success) {
          results.push({
            url,
            statusCode: fetchResult.data?.statusCode,
            contentSize: fetchResult.data?.content?.length,
            source: fetchResult.data?.source,
            fetchedAt: fetchResult.data?.fetchedAt,
          });
        } else {
          results.push({
            url,
            error: fetchResult.error,
          });
        }
      }

      console.log(`[${agentId}] Task completed: ${taskId}`);
      return {
        taskId,
        success: true,
        agentId,
        results,
        findings: results,
        confidence: results.length > 0 ? 0.75 : 0.6,
        completedAt: new Date().toISOString(),
      };
    }

    if (typeof input.query === 'string' && input.query.trim().length > 0) {
      return {
        taskId,
        success: true,
        agentId,
        findings: [
          {
            query: input.query,
            scope: input.scope || 'general',
            note: 'Query accepted without URL fetch (offline/local mode)',
          },
        ],
        confidence: 0.6,
        completedAt: new Date().toISOString(),
      };
    }

    return {
      taskId,
      success: false,
      error: 'No valid task input provided',
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
  console.log('[market-research] Agent starting...');

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
      if (process.env.MARKET_RESEARCH_AGENT_RESULT_FILE) {
        const resultDir = path.dirname(process.env.MARKET_RESEARCH_AGENT_RESULT_FILE);
        await fs.mkdir(resultDir, { recursive: true });
        await fs.writeFile(process.env.MARKET_RESEARCH_AGENT_RESULT_FILE, JSON.stringify(result, null, 2), 'utf-8');
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
