import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildIncidentPriorityQueue,
  loadRuntimeState,
  type RuntimeStateSubset,
} from "../../shared/runtime-evidence.js";

interface AgentConfig {
  id: string;
  name: string;
  orchestratorStatePath: string;
  permissions: {
    skills?: Record<string, { allowed?: boolean }>;
  };
}

interface SecurityTask {
  id: string;
  type: "scan" | "compliance" | "incident" | "secrets";
  scope: string;
}

interface SecurityFinding {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  cwe?: string;
  cvss?: number;
  exploitability?: "high" | "medium" | "low";
  blastRadius?: "fleet" | "service" | "surface" | "repo";
  description: string;
  location: string;
  remediation: string;
  rollbackConcern?: string;
}

interface SecurityRelationshipOutput {
  from: string;
  to: string;
  relationship: "audits-agent" | "feeds-agent";
  detail: string;
  evidence: string[];
  classification?: "audit" | "remediation-guidance";
}

interface SecurityToolInvocationOutput {
  toolId: string;
  detail: string;
  evidence: string[];
  classification: "required" | "optional";
}

interface SecurityResult {
  success: boolean;
  findings: SecurityFinding[];
  boundedFixes: Array<{
    title: string;
    target: string;
    risk: "low" | "medium" | "high";
    rollbackConcern: string;
  }>;
  riskMatrix: {
    exploitableCount: number;
    fleetWideCount: number;
    serviceScopedCount: number;
  };
  summary: {
    total: number;
    critical: number;
    exploitable: boolean;
    compliance: string;
  };
  auditedAgents: string[];
  relationships: SecurityRelationshipOutput[];
  toolInvocations: SecurityToolInvocationOutput[];
  operationalMaturity: {
    trustBoundaryCoverage: "minimal" | "partial" | "strong";
    auditedAgentCount: number;
    openIncidentCount: number;
    blockerCount: number;
    summary: string;
  };
  remediationPriorities: Array<{
    incidentId: string;
    severity: string;
    owner: string | null;
    recommendedOwner: string | null;
    nextAction: string;
  }>;
  evidence: string[];
  executionTime: number;
}

interface RuntimeState extends RuntimeStateSubset {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = resolve(__dirname, "../agent.config.json");
const workspaceRoot = resolve(__dirname, "../../..");

function loadConfig(): AgentConfig {
  return JSON.parse(readFileSync(configPath, "utf-8")) as AgentConfig;
}

function canUseSkill(skillId: string): boolean {
  const config = loadConfig();
  return config.permissions.skills?.[skillId]?.allowed === true;
}

async function pathTextIfExists(targetPath: string) {
  try {
    return await readFile(targetPath, "utf-8");
  } catch {
    return null;
  }
}

function redactFindingId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

function isPlaceholderValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("change_me") ||
    normalized.includes("example") ||
    normalized.includes("placeholder") ||
    normalized.includes("test-") ||
    normalized.includes("sample")
  );
}

function parseEnvLines(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

async function scanTrackedFilesForSecrets(): Promise<SecurityFinding[]> {
  const candidateRoots = [
    "README.md",
    "docs",
    "orchestrator/src",
    "openclawdbot/src",
    "systemd",
  ];
  const findings: SecurityFinding[] = [];
  const tokenPatterns: Array<{ pattern: RegExp; description: string }> = [
    {
      pattern: /Bearer\s+[A-Za-z0-9\-_]{24,}/,
      description: "bearer token-like literal",
    },
    {
      pattern: /cloudflared\s+tunnel\s+run\s+--token\s+[A-Za-z0-9._-]{20,}/,
      description: "cloudflared tunnel token literal",
    },
    {
      pattern: /\bsk-[A-Za-z0-9]{20,}\b/,
      description: "OpenAI-style API key literal",
    },
  ];

  async function walk(target: string): Promise<void> {
    const absolutePath = resolve(workspaceRoot, target);
    let entries;
    try {
      entries = await readdir(absolutePath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".git")) continue;
      const child = resolve(absolutePath, entry.name);
      const relativePath = relative(workspaceRoot, child);
      if (entry.isDirectory()) {
        await walk(relativePath);
        continue;
      }
      if (!/\.(md|ts|tsx|js|cjs|mjs|json|service|sh|txt|yml|yaml)$/i.test(entry.name)) {
        continue;
      }
      const raw = await pathTextIfExists(child);
      if (!raw) continue;
      for (const { pattern, description } of tokenPatterns) {
        if (pattern.test(raw)) {
          findings.push({
            id: redactFindingId("tracked-secret"),
            severity: "CRITICAL",
            exploitability: "high",
            blastRadius: "fleet",
            description: `Tracked ${description} detected in repository content.`,
            location: relativePath,
            remediation: "Remove the literal from tracked content and rotate the secret.",
            rollbackConcern: "Rotation and rollout must be coordinated so dependent services do not lose access.",
          });
          break;
        }
      }
    }
  }

  for (const root of candidateRoots) {
    const absoluteRoot = resolve(workspaceRoot, root);
    const raw = await pathTextIfExists(absoluteRoot);
    if (raw !== null) {
      for (const { pattern, description } of tokenPatterns) {
        if (pattern.test(raw)) {
          findings.push({
            id: redactFindingId("tracked-secret"),
            severity: "CRITICAL",
            exploitability: "high",
            blastRadius: "fleet",
            description: `Tracked ${description} detected in repository content.`,
            location: root,
            remediation: "Remove the literal from tracked content and rotate the secret.",
            rollbackConcern: "Rotation and rollout must be coordinated so dependent services do not lose access.",
          });
          break;
        }
      }
      continue;
    }
    await walk(root);
  }

  return findings;
}

async function buildFindings(task: SecurityTask, state: RuntimeState): Promise<{
  findings: SecurityFinding[];
  auditedAgents: string[];
  evidence: string[];
}> {
  const findings: SecurityFinding[] = [];
  const evidence: string[] = [];

  const envExamplePath = resolve(workspaceRoot, "orchestrator/.env.example");
  const envExampleRaw = await pathTextIfExists(envExamplePath);
  if (envExampleRaw) {
    const envLines = parseEnvLines(envExampleRaw);
    for (const line of envLines) {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) continue;
      const key = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1);
      if (!value || isPlaceholderValue(value)) {
        continue;
      }
      findings.push({
        id: redactFindingId("env-example"),
        severity: "HIGH",
        exploitability: "medium",
        blastRadius: "fleet",
        description: `${key} in orchestrator/.env.example is not a placeholder value.`,
        location: "orchestrator/.env.example",
        remediation:
          "Replace the committed example value with a placeholder and rotate the real credential if it was ever used.",
        rollbackConcern: "Example/env consumers may depend on the current placeholder contract.",
      });
    }
    evidence.push(`env-example-lines:${envLines.length}`);
  }

  const orchestratorConfigRaw = await pathTextIfExists(
    resolve(workspaceRoot, "orchestrator_config.json"),
  );
  if (orchestratorConfigRaw) {
    try {
      const orchestratorConfig = JSON.parse(orchestratorConfigRaw) as {
        corsAllowedOrigins?: string[];
      };
      if (
        Array.isArray(orchestratorConfig.corsAllowedOrigins) &&
        orchestratorConfig.corsAllowedOrigins.includes("*")
      ) {
        findings.push({
          id: redactFindingId("cors"),
          severity: "HIGH",
          exploitability: "medium",
          blastRadius: "surface",
          description: "Wildcard CORS origin detected in orchestrator_config.json.",
          location: "orchestrator_config.json",
          remediation: "Replace wildcard origins with an explicit allowlist.",
          rollbackConcern: "A hard cutover to explicit origins can break previously tolerated browser clients.",
        });
      }
    } catch {
      findings.push({
        id: redactFindingId("config-parse"),
        severity: "LOW",
        exploitability: "low",
        blastRadius: "repo",
        description: "Unable to parse orchestrator_config.json during security audit.",
        location: "orchestrator_config.json",
        remediation: "Repair JSON syntax so runtime policy can be audited deterministically.",
        rollbackConcern: "None; this is a deterministic repo repair.",
      });
    }
  }

  const openclawbotFiles = [
    "openclawdbot/src/server/routes/forms.ts",
    "openclawdbot/src/server/routes/menu.ts",
    "openclawdbot/src/server/routes/scheduler.ts",
    "openclawdbot/src/server/routes/triggers.ts",
    "openclawdbot/src/server/index.ts",
  ];
  for (const file of openclawbotFiles) {
    const raw = await pathTextIfExists(resolve(workspaceRoot, file));
    if (!raw) continue;
    if (/default-secret|dev-secret|fallback-secret/i.test(raw)) {
      findings.push({
        id: redactFindingId("default-secret"),
        severity: "CRITICAL",
        exploitability: "high",
        blastRadius: "surface",
        description: "Code-known signing secret fallback detected in proof boundary code.",
        location: file,
        remediation: "Remove the fallback and require explicit secret configuration.",
        rollbackConcern: "A hard cutover requires all environments to provide explicit signing configuration.",
      });
    }
  }

  findings.push(...(await scanTrackedFilesForSecrets()));

  const auditedAgents = Array.from(
    new Set(
      (state.relationshipObservations ?? [])
        .map((entry) => entry.to)
        .filter((entry): entry is string => typeof entry === "string")
        .filter((entry) => entry.startsWith("agent:"))
        .map((entry) => entry.slice("agent:".length)),
    ),
  );

  if (task.type === "incident") {
    const openIncidents = (state.incidentLedger ?? []).filter(
      (incident) => incident.status !== "resolved",
    );
    if (openIncidents.some((incident) => incident.classification === "service-runtime")) {
      findings.push({
        id: redactFindingId("service-runtime"),
        severity: "MEDIUM",
        exploitability: "low",
        blastRadius: "service",
        description: "Open service-runtime incident(s) indicate degraded trust boundaries or missing host service coverage.",
        location: "orchestrator_state.json",
        remediation: "Restore the affected service runtime and verify the related incident resolves.",
        rollbackConcern: "Restarting or replacing service units can interrupt in-flight work.",
      });
    }
    evidence.push(`open-incidents:${openIncidents.length}`);
  }

  if ((state.taskExecutions ?? []).some((entry) => entry.type === "security-audit")) {
    evidence.push(
      `tracked-security-runs:${
        (state.taskExecutions ?? []).filter((entry) => entry.type === "security-audit").length
      }`,
    );
  }

  return { findings, auditedAgents, evidence };
}

async function handleTask(task: SecurityTask): Promise<SecurityResult> {
  const startTime = Date.now();

  try {
    if (!canUseSkill("documentParser")) {
      return {
        success: false,
        findings: [],
        boundedFixes: [],
        riskMatrix: {
          exploitableCount: 0,
          fleetWideCount: 0,
          serviceScopedCount: 0,
        },
        summary: { total: 0, critical: 0, exploitable: false, compliance: "UNKNOWN" },
        auditedAgents: [],
        relationships: [],
        toolInvocations: [],
        remediationPriorities: [],
        operationalMaturity: {
          trustBoundaryCoverage: "minimal",
          auditedAgentCount: 0,
          openIncidentCount: 0,
          blockerCount: 1,
          summary: "Security agent cannot audit runtime trust boundaries without documentParser skill access.",
        },
        evidence: [],
        executionTime: Date.now() - startTime,
      };
    }

    const config = loadConfig();
    const state = await loadRuntimeState<RuntimeState>(
      configPath,
      config.orchestratorStatePath,
    );
    const { findings, auditedAgents, evidence } = await buildFindings(task, state);
    const remediationPriorities = buildIncidentPriorityQueue(state.incidentLedger ?? [])
      .filter((incident) =>
        incident.classification === "service-runtime" ||
        incident.classification === "proof-delivery" ||
        incident.severity === "critical",
      )
      .slice(0, 6)
      .map((incident) => ({
        incidentId: incident.incidentId,
        severity: incident.severity,
        owner: incident.owner,
        recommendedOwner: incident.recommendedOwner,
        nextAction: incident.nextAction,
      }));
    const boundedFixes: SecurityResult["boundedFixes"] = findings.slice(0, 8).map((finding) => ({
      title: finding.description,
      target: finding.location,
      risk:
        finding.severity === "CRITICAL" || finding.severity === "HIGH"
          ? "high"
          : finding.severity === "MEDIUM"
            ? "medium"
            : "low",
      rollbackConcern:
        finding.rollbackConcern ??
        "Review the affected service or config boundary before cutover.",
    }));
    const relationships: SecurityRelationshipOutput[] = Array.from(
      new Set(auditedAgents),
    ).map((agentId) => ({
      from: "agent:security-agent",
      to: `agent:${agentId}`,
      relationship: "audits-agent",
      detail: `security-agent audited ${agentId} against repo policy, credential, and runtime trust-boundary evidence.`,
      evidence: [
        `audit-scope:${task.scope}`,
        `findings:${findings.length}`,
        ...evidence.slice(0, 3),
      ],
      classification: "audit",
    }));
    const toolInvocations: SecurityToolInvocationOutput[] = [
      {
        toolId: "documentParser",
        detail: "security-agent parsed tracked contracts, env examples, and proof-boundary code to derive findings.",
        evidence: [
          `scope:${task.scope}`,
          `tracked-roots:README.md,docs,orchestrator/src,openclawdbot/src,systemd`,
        ],
        classification: "required",
      },
    ];
    const openIncidentCount = (state.incidentLedger ?? []).filter(
      (incident) => incident.status !== "resolved",
    ).length;
    const criticalOrHighCount = findings.filter(
      (finding) => finding.severity === "CRITICAL" || finding.severity === "HIGH",
    ).length;
    const operationalMaturity: SecurityResult["operationalMaturity"] = {
      trustBoundaryCoverage:
        criticalOrHighCount === 0 && auditedAgents.length > 0
          ? "strong"
          : auditedAgents.length > 0 || findings.length > 0
            ? "partial"
            : "minimal",
      auditedAgentCount: auditedAgents.length,
      openIncidentCount,
      blockerCount: criticalOrHighCount,
      summary:
        auditedAgents.length > 0
          ? `Security audit covered ${auditedAgents.length} observed agent surface(s) with ${criticalOrHighCount} critical/high blocker(s).`
          : `Security audit produced ${findings.length} finding(s) but no agent-specific audit relationships were observed yet.`,
    };

    return {
      success: true,
      findings,
      boundedFixes,
      riskMatrix: {
        exploitableCount: findings.filter((finding) => finding.exploitability === "high").length,
        fleetWideCount: findings.filter((finding) => finding.blastRadius === "fleet").length,
        serviceScopedCount: findings.filter((finding) => finding.blastRadius === "service").length,
      },
      summary: {
        total: findings.length,
        critical: findings.filter((finding) => finding.severity === "CRITICAL").length,
        exploitable: findings.some(
          (finding) => finding.severity === "CRITICAL" || (finding.cvss ?? 0) >= 8,
        ),
        compliance: findings.length === 0 ? "PASS" : "REVIEW_REQUIRED",
      },
      auditedAgents,
      relationships,
      toolInvocations,
      operationalMaturity,
      remediationPriorities,
      evidence,
      executionTime: Date.now() - startTime,
    };
  } catch {
    return {
      success: false,
      findings: [],
      boundedFixes: [],
      riskMatrix: {
        exploitableCount: 0,
        fleetWideCount: 0,
        serviceScopedCount: 0,
      },
      summary: { total: 0, critical: 0, exploitable: false, compliance: "ERROR" },
      auditedAgents: [],
      relationships: [],
      toolInvocations: [],
      operationalMaturity: {
        trustBoundaryCoverage: "minimal",
        auditedAgentCount: 0,
        openIncidentCount: 0,
        blockerCount: 1,
        summary: "Security audit execution failed before trust-boundary coverage could be established.",
      },
      remediationPriorities: [],
      evidence: [],
      executionTime: Date.now() - startTime,
    };
  }
}

export { handleTask, loadConfig, canUseSkill };

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    return;
  }

  const raw = await readFile(payloadPath, "utf-8");
  const payload = JSON.parse(raw) as SecurityTask;
  const result = await handleTask(payload);

  const resultFile = process.env.SECURITY_AGENT_RESULT_FILE;
  if (resultFile) {
    await mkdir(dirname(resultFile), { recursive: true });
    await writeFile(resultFile, JSON.stringify(result, null, 2), "utf-8");
  } else {
    process.stdout.write(JSON.stringify(result));
  }

  if (result.success !== true) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
