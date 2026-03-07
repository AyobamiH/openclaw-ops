import * as path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { pathToFileURL } from 'url';
import { auditSkill } from '../../../orchestrator/src/skillAudit.ts';

interface Task {
  id: string;
  skillIds?: string[];
  depth?: string;
  checks?: string[];
}

interface SkillAuditRecord {
  skillId: string;
  audited: boolean;
  passed: boolean;
  failures: string[];
  warnings: string[];
  riskFlags: string[];
  recommendations: string[];
}

interface Result {
  success: boolean;
  depth: string;
  checksRequested: string[];
  skillsAudited: number;
  issuesFound: number;
  missingSkills: number;
  verdict: 'APPROVED' | 'ATTENTION' | 'ERROR';
  results: SkillAuditRecord[];
  executionTime: number;
  error?: string;
}

type SkillRuntimeModule = {
  initializeSkills: () => Promise<void>;
  getSkillDefinition: (skillId: string) => any;
  listSkills: () => Array<{ id: string }>;
};

function normalizeCheckName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

async function getSkillRuntime(): Promise<SkillRuntimeModule> {
  const runtime = await import('../../../skills/index.ts');
  return {
    initializeSkills: runtime.initializeSkills,
    getSkillDefinition: runtime.getSkillDefinition,
    listSkills: runtime.listSkills,
  };
}

async function handleTask(task: Task): Promise<Result> {
  const startTime = Date.now();

  try {
    const runtime = await getSkillRuntime();
    await runtime.initializeSkills();

    const requestedSkillIds = Array.isArray(task.skillIds) && task.skillIds.length > 0
      ? Array.from(new Set(task.skillIds.map((value) => String(value).trim()).filter(Boolean)))
      : runtime.listSkills().map((entry) => entry.id);
    const requestedChecks = Array.isArray(task.checks)
      ? Array.from(new Set(task.checks.map((value) => normalizeCheckName(String(value)))))
      : [];
    const depth = typeof task.depth === 'string' && task.depth.trim().length > 0
      ? task.depth.trim()
      : 'standard';

    if (requestedSkillIds.length === 0) {
      return {
        success: false,
        depth,
        checksRequested: requestedChecks,
        skillsAudited: 0,
        issuesFound: 1,
        missingSkills: 0,
        verdict: 'ERROR',
        results: [],
        executionTime: Date.now() - startTime,
        error: 'No skill ids supplied and no registered skills available to audit',
      };
    }

    const results: SkillAuditRecord[] = [];
    let issuesFound = 0;
    let missingSkills = 0;

    for (const skillId of requestedSkillIds) {
      const definition = runtime.getSkillDefinition(skillId);
      if (!definition) {
        missingSkills += 1;
        issuesFound += 1;
        results.push({
          skillId,
          audited: false,
          passed: false,
          failures: [`Skill not found: ${skillId}`],
          warnings: [],
          riskFlags: [],
          recommendations: ['Check the requested skill id and retry the audit.'],
        });
        continue;
      }

      const auditResult = auditSkill(definition);
      const relevantChecks = requestedChecks.length > 0
        ? auditResult.checks.filter((check) =>
            requestedChecks.includes(normalizeCheckName(check.name)),
          )
        : auditResult.checks;

      const failures = relevantChecks
        .filter((check) => check.status === 'fail')
        .map((check) => `${check.name}: ${check.message}`);
      const warnings = relevantChecks
        .filter((check) => check.status === 'warn')
        .map((check) => `${check.name}: ${check.message}`);
      const riskFlags = requestedChecks.length > 0
        ? auditResult.riskFlags.filter((flag) =>
            requestedChecks.some((checkName) => flag.includes(checkName)),
          )
        : auditResult.riskFlags;

      issuesFound += failures.length + riskFlags.length;

      results.push({
        skillId,
        audited: true,
        passed: failures.length === 0 && riskFlags.length === 0,
        failures,
        warnings,
        riskFlags,
        recommendations: auditResult.recommendations.slice(0, 5),
      });
    }

    const skillsAudited = results.filter((entry) => entry.audited).length;

    return {
      success: skillsAudited > 0,
      depth,
      checksRequested: requestedChecks,
      skillsAudited,
      issuesFound,
      missingSkills,
      verdict: issuesFound === 0 && missingSkills === 0 ? 'APPROVED' : 'ATTENTION',
      results,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      depth: typeof task.depth === 'string' ? task.depth : 'standard',
      checksRequested: Array.isArray(task.checks) ? task.checks : [],
      skillsAudited: 0,
      issuesFound: 1,
      missingSkills: 0,
      verdict: 'ERROR',
      results: [],
      executionTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
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

const directEntryHref = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (directEntryHref === import.meta.url) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}

export { handleTask };
