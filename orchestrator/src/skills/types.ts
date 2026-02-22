/**
 * Skill Type Definitions
 * 
 * A skill is an audited, bounded capability an agent can call.
 * Skills wrap low-level tools with permission gates.
 */

export interface SkillDefinition {
  id: string;                    // unique skill ID (e.g., "sourceFetch")
  version: string;               // semver (e.g., "1.0.0")
  description: string;           // what it does
  inputs: SkillInputSchema;       // what it accepts
  outputs: SkillOutputSchema;     // what it returns
  permissions: SkillPermissions;  // what it can do
  provenance: SkillProvenance;    // where it came from
  audit: SkillAuditResults;       // safety analysis
}

export interface SkillInputSchema {
  type: string;                  // 'object', 'string', etc.
  properties: Record<string, any>;
  required: string[];
  examples?: Record<string, any>[];
}

export interface SkillOutputSchema {
  type: string;
  properties: Record<string, any>;
  examples?: Record<string, any>[];
}

export interface SkillPermissions {
  fileRead?: boolean | string[];  // true = all workspace, array = specific paths
  fileWrite?: boolean | string[]; // true = artifacts only, array = specific paths
  execAllowed?: boolean | string[]; // false = none, true = all (bad!), array = commands
  networkAllowed?: boolean | string[]; // false = none, array = domains/APIs
  secrets?: boolean;              // can read env/credentials?
  eval?: boolean;                 // dangerous!
  spawn?: boolean;                // child_process allowed?
}

export interface SkillProvenance {
  author: string;                // who wrote it
  source: string;                // where hosted (github URL, internal, etc.)
  license?: string;              // MIT, Apache, etc.
  version: string;               // pinned commit/tag
  maintainedAt?: string;         // last update date
}

export interface SkillAuditResults {
  passed: boolean;               // overall pass/fail
  runAt: string;                 // ISO timestamp
  checks: SkillAuditCheck[];
  riskFlags: string[];           // ["exfiltration-risk", "credential-access", etc.]
  recommendations?: string[];    // suggestions for safer use
}

export interface SkillAuditCheck {
  name: string;                  // which check ran
  status: 'pass' | 'fail' | 'warn';
  message: string;
  detail?: string;
}

export interface SkillInvocation {
  id: string;                    // unique invocation ID
  skillId: string;               // which skill
  agentId: string;               // who called it
  input: Record<string, any>;    // exact input
  output?: Record<string, any>;  // exact output (after execution)
  error?: string;                // error message if failed
  executedAt: string;            // ISO timestamp
  duration: number;              // milliseconds
  approved: boolean;             // did this invocation pass audit gate?
}

export interface SkillRegistry {
  [skillId: string]: SkillDefinition;
}

export interface SkillExecutionContext {
  skill: SkillDefinition;
  agent: string;                 // agent ID requesting execution
  input: Record<string, any>;
  workspace: string;             // allowed workspace path
  dryRun?: boolean;              // if applicable
}

export interface SkillExecutionResult {
  success: boolean;
  data?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    detail?: string;
  };
  logs: string[];                // audit trail
  warnings?: string[];
}

export interface SkillResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}
