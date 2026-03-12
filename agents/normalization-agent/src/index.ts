import * as fs from 'fs';
import * as path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';

interface Task { id: string; type: string; input: any; schema: any; }
interface Result { success: boolean; normalized: any[]; errors: any[]; metrics: any; executionTime: number; }

function loadConfig(): any {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../agent.config.json'), 'utf-8'));
}

function canUseSkill(skillId: string): boolean {
  const config = loadConfig();
  return config.permissions.skills[skillId]?.allowed === true;
}

async function handleTask(task: Task): Promise<Result> {
  const startTime = Date.now();

  if (!canUseSkill('normalizer')) {
    return { success: false, normalized: [], errors: ['Permission denied: normalizer skill'], metrics: {}, executionTime: Date.now() - startTime };
  }

  try {
    const input = Array.isArray(task.input) ? task.input : [task.input];
    const normalized = input.map((record: any) => normalizeRecord(record, task.schema));
    const errors = normalized.filter((r: any) => r.hasOwnProperty('_error')).map((r: any) => r._error);
    const clean = normalized.filter((r: any) => !r.hasOwnProperty('_error'));

    return {
      success: errors.length < input.length * 0.01, // <1% error rate
      normalized: clean,
      errors,
      metrics: {
        inputRecords: input.length,
        outputRecords: clean.length,
        errorRate: ((errors.length / input.length) * 100).toFixed(2) + '%',
        fieldsConsolidated: task.schema ? Math.max(0, Object.keys(input[0] || {}).length - Object.keys(task.schema).length) : 0,
      },
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return { success: false, normalized: [], errors: [(error as Error).message], metrics: {}, executionTime: Date.now() - startTime };
  }
}

function normalizeRecord(record: any, schema: any): any {
  try {
    if (!schema || Object.keys(schema).length === 0) {
      return canonicalizeValue(record);
    }

    const normalized: any = {};
    for (const [key, type] of Object.entries(schema || {})) {
      const value = record[key];
      normalized[key] = convertType(value, type as string | Record<string, unknown>);
    }
    return normalized;
  } catch (error) {
    return { _error: `Failed to normalize: ${(error as Error).message}` };
  }
}

function canonicalizeValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, canonicalizeValue(entry)]),
    );
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return value;
}

function convertType(value: any, type: string | Record<string, unknown>): any {
  if (value === null || value === undefined) return null;
  if (typeof type === 'object' && type !== null) {
    if ((type as any).type === 'array') {
      return Array.isArray(value) ? value.map((entry) => canonicalizeValue(entry)) : [canonicalizeValue(value)];
    }

    if ((type as any).type === 'object') {
      const shape = ((type as any).shape ?? {}) as Record<string, string | Record<string, unknown>>;
      return normalizeRecord(value, shape);
    }

    if (typeof (type as any).type === 'string') {
      return convertType(value, String((type as any).type));
    }
  }

  switch (type) {
    case 'string': return String(value);
    case 'number': return parseInt(value) || 0;
    case 'boolean': return value === true || value === 'true' || value === 1;
    case 'date': return new Date(value).toISOString();
    default: return value;
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

    const resultFile = process.env.NORMALIZATION_AGENT_RESULT_FILE;
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
