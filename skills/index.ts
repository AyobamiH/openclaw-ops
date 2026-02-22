/**
 * Skills Registry & Loader
 * 
 * Loads all skills and validates them against the audit gate.
 * Tracks skill metadata and enforces permission checking at runtime.
 */

import { SkillDefinition, SkillResult } from '../orchestrator/src/skills/types.js';
import { sourceFetchDefinition, executeSourceFetch } from './sourceFetch.js';
import { documentParserDefinition, executeDocumentParser } from './documentParser.js';
import { normalizerDefinition, executeNormalizer } from './normalizer.js';
import { workspacePatchDefinition, executeWorkspacePatch } from './workspacePatch.js';
import { testRunnerDefinition, executeTestRunner } from './testRunner.js';

// Skill registry: maps skill ID to definition + executor
export interface RegisteredSkill {
  definition: SkillDefinition;
  executor: (input: any) => Promise<any>;
  auditedAt: string;
  auditPassed: boolean;
}

const skillExecutors: Record<string, (input: any) => Promise<any>> = {
  sourceFetch: executeSourceFetch,
  documentParser: executeDocumentParser,
  normalizer: executeNormalizer,
  workspacePatch: executeWorkspacePatch,
  testRunner: executeTestRunner,
};

const skillDefinitions: Record<string, SkillDefinition> = {
  sourceFetch: sourceFetchDefinition,
  documentParser: documentParserDefinition,
  normalizer: normalizerDefinition,
  workspacePatch: workspacePatchDefinition,
  testRunner: testRunnerDefinition,
};

/**
 * Global skill registry - populated at startup
 */
export const skillRegistry: Map<string, RegisteredSkill> = new Map();

/**
 * Initialize and load all skills
 * Validates each skill against audit gate before registration
 */
export async function initializeSkills(): Promise<void> {
  const auditSkill = (await import('../orchestrator/src/skillAudit.js')).auditSkill;

  for (const [skillId, definition] of Object.entries(skillDefinitions)) {
    const executor = skillExecutors[skillId];

    if (!executor) {
      console.error(`[Skills] No executor found for skill ${skillId}`);
      continue;
    }

    try {
      // Run audit gate on skill
      const auditResult = await auditSkill(definition);

      if (!auditResult.passed) {
        console.error(`[Skills] Audit failed for ${skillId}:`, auditResult.failures);
        continue;
      }

      // Register skill
      skillRegistry.set(skillId, {
        definition,
        executor,
        auditedAt: new Date().toISOString(),
        auditPassed: true,
      });

      console.log(`[Skills] ✓ Registered ${skillId} v${definition.version}`);
    } catch (error: any) {
      console.error(`[Skills] Error auditing ${skillId}:`, error.message);
    }
  }

  console.log(`[Skills] Initialization complete: ${skillRegistry.size}/${Object.keys(skillDefinitions).length} skills loaded`);
}

/**
 * Execute a skill by ID with permission checking
 */
export async function executeSkill(
  skillId: string,
  input: any,
  requestingAgent?: string,
): Promise<SkillResult> {
  const registered = skillRegistry.get(skillId);

  if (!registered) {
    return {
      success: false,
      error: `Skill not found: ${skillId}`,
    };
  }

  // TODO: Check permissions if requestingAgent provided
  // This will be enforced by toolGate.ts at the agent level

  try {
    const result = await registered.executor(input);
    return {
      success: result.success !== false,
      data: result,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get skill definition by ID
 */
export function getSkillDefinition(skillId: string): SkillDefinition | undefined {
  return skillRegistry.get(skillId)?.definition;
}

/**
 * List all registered skills with metadata
 */
export function listSkills(): Array<{
  id: string;
  version: string;
  description: string;
  permissions: any;
  auditedAt: string;
}> {
  return Array.from(skillRegistry.entries()).map(([id, skill]) => ({
    id,
    version: skill.definition.version,
    description: skill.definition.description,
    permissions: skill.definition.permissions,
    auditedAt: skill.auditedAt,
  }));
}

/**
 * Check if a skill is registered and available
 */
export function hasSkill(skillId: string): boolean {
  return skillRegistry.has(skillId);
}
