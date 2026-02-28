#!/usr/bin/env node

/**
 * Data Extraction Agent - Entry Point
 * 
 * Extracts structured data from documents (PDF, HTML, CSV).
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
    console.log(`[data-extraction] Configuration loaded`);
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
      : ((task.source && typeof task.source === 'object') ? task : null);

    if (!input || typeof input !== 'object') {
      return {
        taskId,
        success: false,
        error: 'Invalid input format',
      };
    }

    const results: any[] = [];

    // Task: Parse documents
    if (input.files && Array.isArray(input.files)) {
      console.log(`[${agentId}] Parsing ${input.files.length} files`);

      for (const file of input.files) {
        if (!canUseSkill('documentParser')) {
          return {
            taskId,
            success: false,
            error: 'documentParser skill not allowed',
          };
        }

        const parseResult = await executeSkill('documentParser', {
          filePath: file.path,
          format: file.format || 'pdf',
          extractTables: true,
          extractEntities: true,
        }, agentId);

        if (parseResult.success) {
          // Optionally normalize extracted data
          if (canUseSkill('normalizer') && input.normalize) {
            const normalizeResult = await executeSkill('normalizer', {
              data: parseResult.data,
              schema: input.schema || {},
              strict: false,
            }, agentId);

            results.push({
              file: file.path,
              parsed: parseResult.data,
              normalized: normalizeResult.data,
              success: normalizeResult.success,
            });
          } else {
            results.push({
              file: file.path,
              parsed: parseResult.data,
              success: true,
            });
          }
        } else {
          results.push({
            file: file.path,
            error: parseResult.error,
            success: false,
          });
        }
      }

      console.log(`[${agentId}] Task completed: ${taskId}`);
      return {
        taskId,
        success: true,
        agentId,
        results,
        recordsExtracted: results.length,
        entitiesFound: 0,
        completedAt: new Date().toISOString(),
      };
    }

    if (input.source && typeof input.source === 'object') {
      const source = input.source as { type?: string; content?: string };
      const content = String(source.content ?? '');
      const pairs = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.includes(':'))
        .map((line) => {
          const [key, ...rest] = line.split(':');
          return [key.trim(), rest.join(':').trim()];
        });

      const extracted = Object.fromEntries(pairs);
      return {
        taskId,
        success: true,
        agentId,
        results: [{ sourceType: source.type ?? 'inline', extracted }],
        recordsExtracted: Object.keys(extracted).length > 0 ? 1 : 0,
        entitiesFound: Object.keys(extracted).length,
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
  console.log('[data-extraction] Agent starting...');

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
      if (process.env.DATA_EXTRACTION_AGENT_RESULT_FILE) {
        const resultDir = path.dirname(process.env.DATA_EXTRACTION_AGENT_RESULT_FILE);
        await fs.mkdir(resultDir, { recursive: true });
        await fs.writeFile(process.env.DATA_EXTRACTION_AGENT_RESULT_FILE, JSON.stringify(result, null, 2), 'utf-8');
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
