import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile, appendFile, mkdtemp, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { sendNotification, buildNotifierConfig } from "./notifier.js";
import { getAgentRegistry } from "./agentRegistry.js";
import { getToolGate } from "./toolGate.js";
// Central task allowlist (deny-by-default enforcement)
export const ALLOWED_TASK_TYPES = [
    'startup',
    'doc-change',
    'doc-sync',
    'drift-repair',
    'reddit-response',
    'security-audit',
    'summarize-content',
    'system-monitor',
    'build-refactor',
    'content-generate',
    'integration-workflow',
    'normalize-data',
    'market-research',
    'data-extraction',
    'qa-verification',
    'skill-audit',
    'rss-sweep',
    'nightly-batch',
    'send-digest',
    'heartbeat',
    'agent-deploy',
];
const SPAWNED_AGENT_PERMISSION_REQUIREMENTS = {
    'security-audit': { agentId: 'security-agent', skillId: 'documentParser' },
    'summarize-content': { agentId: 'summarization-agent', skillId: 'documentParser' },
    'system-monitor': { agentId: 'system-monitor-agent', skillId: 'documentParser' },
    'build-refactor': { agentId: 'build-refactor-agent', skillId: 'workspacePatch' },
    'content-generate': { agentId: 'content-agent', skillId: 'documentParser' },
    'integration-workflow': { agentId: 'integration-agent', skillId: 'documentParser' },
    'normalize-data': { agentId: 'normalization-agent', skillId: 'normalizer' },
    'market-research': { agentId: 'market-research-agent', skillId: 'sourceFetch' },
    'data-extraction': { agentId: 'data-extraction-agent', skillId: 'documentParser' },
    'qa-verification': { agentId: 'qa-verification-agent', skillId: 'testRunner' },
    'skill-audit': { agentId: 'skill-audit-agent', skillId: 'testRunner' },
};
/**
 * Validate task type against allowlist
 * @throws Error if task type is not allowed
 */
export function validateTaskType(taskType) {
    return ALLOWED_TASK_TYPES.includes(taskType);
}
const MAX_REDDIT_QUEUE = 100;
const RSS_SEEN_CAP = 400;
const AGENT_MEMORY_TIMELINE_LIMIT = 120;
function ensureDocChangeStored(path, context) {
    const { state } = context;
    if (state.pendingDocChanges.includes(path))
        return;
    state.pendingDocChanges.unshift(path);
    if (state.pendingDocChanges.length > 200) {
        state.pendingDocChanges.pop();
    }
}
function ensureRedditQueueLimit(context) {
    if (context.state.redditQueue.length > MAX_REDDIT_QUEUE) {
        context.state.redditQueue.length = MAX_REDDIT_QUEUE;
    }
}
function rememberRssId(context, id) {
    if (context.state.rssSeenIds.includes(id))
        return;
    context.state.rssSeenIds.unshift(id);
    if (context.state.rssSeenIds.length > RSS_SEEN_CAP) {
        context.state.rssSeenIds.length = RSS_SEEN_CAP;
    }
}
async function runDocSpecialistJob(docPaths, targetAgents, requestedBy, logger) {
    const agentRoot = join(process.cwd(), "..", "agents", "doc-specialist");
    const tmpRoot = await mkdtemp(join(tmpdir(), "docspec-"));
    const payloadPath = join(tmpRoot, "payload.json");
    const resultPath = join(tmpRoot, "result.json");
    const payload = {
        id: randomUUID(),
        type: "drift-repair",
        docPaths,
        targetAgents,
        requestedBy,
    };
    const startedAt = new Date().toISOString();
    await writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf-8");
    try {
        await new Promise((resolve, reject) => {
            const tsxPath = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
            const child = spawn(process.execPath, [tsxPath, "src/index.ts", payloadPath], {
                cwd: agentRoot,
                env: {
                    ...process.env,
                    DOC_SPECIALIST_RESULT_FILE: resultPath,
                },
                stdio: ["ignore", "pipe", "pipe"],
                timeout: 5 * 60 * 1000, // 5 minutes
            });
            let stderr = "";
            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });
            child.stdout.on("data", (chunk) => {
                logger.log(`[doc-specialist] ${chunk.toString().trim()}`);
            });
            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error(stderr.trim() || `doc-specialist exited with code ${code}`));
                }
            });
        });
        const raw = await readFile(resultPath, "utf-8");
        const parsed = JSON.parse(raw);
        await persistSpawnedAgentServiceState("doc-specialist", payload, "success", parsed, undefined, startedAt);
        return parsed;
    }
    catch (error) {
        await persistSpawnedAgentServiceState("doc-specialist", payload, "error", undefined, toErrorMessage(error), startedAt);
        throw error;
    }
    finally {
        await rm(tmpRoot, { recursive: true, force: true });
    }
}
async function findLatestKnowledgePack(dir) {
    const targetDir = dir ?? join(process.cwd(), "..", "logs", "knowledge-packs");
    try {
        const files = await readdir(targetDir);
        const packFiles = files.filter((file) => file.endsWith(".json"));
        if (!packFiles.length)
            return null;
        const sorted = await Promise.all(packFiles.map(async (file) => {
            const fullPath = join(targetDir, file);
            const stats = await stat(fullPath);
            return { path: fullPath, mtime: stats.mtimeMs };
        }));
        sorted.sort((a, b) => b.mtime - a.mtime);
        const latest = sorted[0];
        const raw = await readFile(latest.path, "utf-8");
        const parsed = JSON.parse(raw);
        return { path: latest.path, pack: parsed };
    }
    catch (error) {
        return null;
    }
}
async function runRedditHelperJob(payload, logger) {
    const agentRoot = join(process.cwd(), "..", "agents", "reddit-helper");
    const tmpRoot = await mkdtemp(join(tmpdir(), "reddithelper-"));
    const payloadPath = join(tmpRoot, "payload.json");
    const resultPath = join(tmpRoot, "result.json");
    const enrichedPayload = {
        type: "reddit-response",
        ...payload,
    };
    const startedAt = new Date().toISOString();
    await writeFile(payloadPath, JSON.stringify(enrichedPayload, null, 2), "utf-8");
    try {
        await new Promise((resolve, reject) => {
            const tsxPath = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
            const child = spawn(process.execPath, [tsxPath, "src/index.ts", payloadPath], {
                cwd: agentRoot,
                env: {
                    ...process.env,
                    REDDIT_HELPER_RESULT_FILE: resultPath,
                },
                stdio: ["ignore", "pipe", "pipe"],
                timeout: 5 * 60 * 1000, // 5 minutes
            });
            let stderr = "";
            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });
            child.stdout.on("data", (chunk) => {
                logger.log(`[reddit-helper] ${chunk.toString().trim()}`);
            });
            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error(stderr.trim() || `reddit-helper exited with code ${code}`));
                }
            });
        });
        const raw = await readFile(resultPath, "utf-8");
        const parsed = JSON.parse(raw);
        await persistSpawnedAgentServiceState("reddit-helper", enrichedPayload, "success", parsed, undefined, startedAt);
        return parsed;
    }
    catch (error) {
        await persistSpawnedAgentServiceState("reddit-helper", enrichedPayload, "error", undefined, toErrorMessage(error), startedAt);
        throw error;
    }
    finally {
        await rm(tmpRoot, { recursive: true, force: true });
    }
}
async function runSpawnedAgentJob(agentId, payload, resultEnvVar, logger) {
    const agentRoot = join(process.cwd(), "..", "agents", agentId);
    const tmpRoot = await mkdtemp(join(tmpdir(), `${agentId}-`));
    const payloadPath = join(tmpRoot, "payload.json");
    const resultPath = join(tmpRoot, "result.json");
    const startedAt = new Date().toISOString();
    await writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf-8");
    try {
        await new Promise((resolve, reject) => {
            const tsxPath = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
            const child = spawn(process.execPath, [tsxPath, "src/index.ts", payloadPath], {
                cwd: agentRoot,
                env: {
                    ...process.env,
                    [resultEnvVar]: resultPath,
                },
                stdio: ["ignore", "pipe", "pipe"],
                timeout: 5 * 60 * 1000,
            });
            let stderr = "";
            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });
            child.stdout.on("data", (chunk) => {
                logger.log(`[${agentId}] ${chunk.toString().trim()}`);
            });
            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error(stderr.trim() || `${agentId} exited with code ${code}`));
                }
            });
        });
        const raw = await readFile(resultPath, "utf-8");
        const parsed = JSON.parse(raw);
        await persistSpawnedAgentServiceState(agentId, payload, "success", parsed, undefined, startedAt);
        return parsed;
    }
    catch (error) {
        await persistSpawnedAgentServiceState(agentId, payload, "error", undefined, toErrorMessage(error), startedAt);
        throw error;
    }
    finally {
        await rm(tmpRoot, { recursive: true, force: true });
    }
}
async function loadSpawnedAgentMemoryConfig(agentId) {
    const configPath = join(process.cwd(), "..", "agents", agentId, "agent.config.json");
    try {
        const raw = await readFile(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch {
        return {};
    }
}
async function persistSpawnedAgentServiceState(agentId, payload, status, result, errorMessage, startedAt) {
    const config = await loadSpawnedAgentMemoryConfig(agentId);
    if (!config.serviceStatePath)
        return;
    const serviceStatePath = join(process.cwd(), "..", "agents", agentId, config.serviceStatePath);
    let existing = {};
    try {
        const current = await readFile(serviceStatePath, "utf-8");
        existing = JSON.parse(current);
    }
    catch {
        existing = {};
    }
    const completedAt = new Date().toISOString();
    const runStartedAt = startedAt ?? completedAt;
    const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(runStartedAt).getTime());
    const timeline = Array.isArray(existing.taskTimeline)
        ? existing.taskTimeline
        : [];
    const timelineEntry = {
        taskId: typeof payload.id === "string" ? payload.id : null,
        taskType: typeof payload.type === "string" ? payload.type : null,
        status,
        startedAt: runStartedAt,
        completedAt,
        durationMs,
        error: status === "error" ? errorMessage ?? null : null,
        resultSummary: status === "success"
            ? {
                success: result?.success ?? true,
                keys: result ? Object.keys(result).slice(0, 12) : [],
            }
            : undefined,
    };
    const nextTimeline = [timelineEntry, ...timeline].slice(0, AGENT_MEMORY_TIMELINE_LIMIT);
    const successCount = Number(existing.successCount ?? 0) + (status === "success" ? 1 : 0);
    const errorCount = Number(existing.errorCount ?? 0) + (status === "error" ? 1 : 0);
    const nextState = {
        ...existing,
        memoryVersion: 2,
        agentId,
        orchestratorStatePath: config.orchestratorStatePath,
        lastRunAt: completedAt,
        lastStatus: status,
        lastTaskId: typeof payload.id === "string" ? payload.id : null,
        lastTaskType: typeof payload.type === "string" ? payload.type : null,
        lastError: status === "error" ? errorMessage ?? null : null,
        successCount,
        errorCount,
        totalRuns: successCount + errorCount,
        taskTimeline: nextTimeline,
    };
    if (status === "success") {
        nextState.lastResultSummary = {
            success: result?.success ?? true,
            keys: result ? Object.keys(result).slice(0, 12) : [],
        };
    }
    await mkdir(dirname(serviceStatePath), { recursive: true });
    await writeFile(serviceStatePath, JSON.stringify(nextState, null, 2), "utf-8");
}
function stripHtml(value) {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function throwTaskFailure(taskLabel, error) {
    throw new Error(`${taskLabel} failed: ${toErrorMessage(error)}`);
}
async function assertToolGatePermission(taskType) {
    const requirement = SPAWNED_AGENT_PERMISSION_REQUIREMENTS[taskType];
    if (!requirement)
        return;
    const gate = await getToolGate();
    const taskAuthorization = gate.canExecuteTask(requirement.agentId, taskType);
    if (!taskAuthorization.allowed) {
        throw new Error(`toolgate denied task ${taskType}: ${taskAuthorization.reason}`);
    }
    const permissionResult = await gate.executeSkill(requirement.agentId, requirement.skillId, {
        mode: 'preflight',
        taskType,
    });
    if (!permissionResult.success) {
        throw new Error(`toolgate denied ${requirement.agentId} for skill ${requirement.skillId}: ${permissionResult.error}`);
    }
}
function parseRssEntries(xml) {
    const entries = [];
    const itemRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const idMatch = block.match(/<id>([\s\S]*?)<\/id>/i);
        const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
        const contentMatch = block.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
        const linkMatch = block.match(/<link[^>]*href="([^"]+)"/i);
        const authorMatch = block.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i);
        const id = idMatch ? stripHtml(idMatch[1]) : randomUUID();
        const title = titleMatch ? stripHtml(titleMatch[1]) : "";
        const content = contentMatch ? stripHtml(contentMatch[1]) : "";
        const link = linkMatch ? linkMatch[1] : "";
        const author = authorMatch ? stripHtml(authorMatch[1]) : undefined;
        if (!title && !content)
            continue;
        entries.push({ id, title, content, link, author });
    }
    return entries;
}
function buildScore(text, clusterKeywords) {
    const lower = text.toLowerCase();
    const matched = [];
    const breakdown = {};
    Object.entries(clusterKeywords).forEach(([cluster, keywords]) => {
        let count = 0;
        for (const keyword of keywords) {
            if (lower.includes(keyword.toLowerCase())) {
                matched.push(keyword);
                count += 1;
            }
        }
        if (count > 0) {
            breakdown[cluster] = count;
        }
    });
    return { matched, breakdown };
}
async function appendDraft(path, record) {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, "utf-8");
}
const startupHandler = async (_, context) => {
    context.state.lastStartedAt = new Date().toISOString();
    await context.saveState();
    return "orchestrator boot complete";
};
const docChangeHandler = async (task, context) => {
    const path = String(task.payload.path ?? "unknown");
    ensureDocChangeStored(path, context);
    await context.saveState();
    if (context.state.pendingDocChanges.length >= 25) {
        return `queued ${context.state.pendingDocChanges.length} doc changes`;
    }
    return `noted change for ${path}`;
};
const docSyncHandler = async (_, context) => {
    const changes = [...context.state.pendingDocChanges];
    context.state.pendingDocChanges = [];
    await context.saveState();
    return changes.length ? `synced ${changes.length} doc changes` : "no doc changes to sync";
};
const driftRepairHandler = async (task, context) => {
    const startedAt = Date.now();
    const requestedBy = String(task.payload.requestedBy ?? "scheduler");
    const extractedPaths = context.state.pendingDocChanges.splice(0);
    const extraPaths = Array.isArray(task.payload.paths) ? task.payload.paths : [];
    const processedPaths = extractedPaths.length ? extractedPaths : extraPaths;
    if (processedPaths.length === 0) {
        return "no drift to repair";
    }
    let targets = Array.isArray(task.payload.targets)
        ? task.payload.targets
        : ["doc-specialist", "reddit-helper"];
    if (!Array.isArray(task.payload.targets)) {
        try {
            const registry = await getAgentRegistry();
            const discovered = registry.listAgents().map((agent) => agent.id);
            if (discovered.length > 0) {
                targets = discovered;
            }
        }
        catch {
            // Keep fallback defaults if registry is unavailable
        }
    }
    let docSpecResult = null;
    try {
        docSpecResult = await runDocSpecialistJob(processedPaths, targets, requestedBy, context.logger);
    }
    catch (error) {
        context.logger.warn(`[drift-repair] doc specialist failed: ${error.message}`);
    }
    const record = {
        runId: randomUUID(),
        requestedBy,
        processedPaths,
        generatedPackIds: docSpecResult?.packId ? [docSpecResult.packId] : [],
        packPaths: docSpecResult?.packPath ? [docSpecResult.packPath] : undefined,
        docsProcessed: docSpecResult?.docsProcessed,
        updatedAgents: targets,
        durationMs: Date.now() - startedAt,
        completedAt: new Date().toISOString(),
        notes: [
            docSpecResult?.packPath ? `pack:${docSpecResult.packPath}` : null,
            task.payload.notes ? String(task.payload.notes) : null,
        ]
            .filter(Boolean)
            .join(" | ") || undefined,
    };
    context.state.driftRepairs.push(record);
    context.state.lastDriftRepairAt = record.completedAt;
    await context.saveState();
    if (docSpecResult) {
        return `drift repair ${record.runId.slice(0, 8)} generated ${docSpecResult.packId}`;
    }
    return `drift repair ${record.runId.slice(0, 8)} completed without pack generation`;
};
const redditResponseHandler = async (task, context) => {
    const now = new Date().toISOString();
    let queueItem = context.state.redditQueue.shift();
    if (!queueItem && task.payload.queue) {
        const manualQueue = task.payload.queue;
        queueItem = {
            id: String(manualQueue.id ?? randomUUID()),
            subreddit: String(manualQueue.subreddit ?? "r/OpenClaw"),
            question: String(manualQueue.question ?? "General OpenClaw workflow question"),
            link: manualQueue.link ? String(manualQueue.link) : undefined,
            queuedAt: now,
            draftRecordId: manualQueue.draftRecordId ? String(manualQueue.draftRecordId) : undefined,
        };
    }
    if (!queueItem) {
        await context.saveState();
        return "no reddit queue items";
    }
    const responder = String(task.payload.responder ?? "reddit-helper");
    const matchingDraft = context.state.rssDrafts.find((draft) => draft.draftId === (queueItem?.draftRecordId ?? queueItem.id));
    const latestPack = await findLatestKnowledgePack(context.config.knowledgePackDir);
    let agentResult = null;
    try {
        agentResult = await runRedditHelperJob({
            queue: queueItem,
            rssDraft: matchingDraft,
            knowledgePackPath: latestPack?.path,
            knowledgePack: latestPack?.pack,
        }, context.logger);
    }
    catch (error) {
        context.logger.warn(`[reddit-response] helper failed: ${error.message}`);
    }
    const draftedResponse = agentResult?.replyText ?? queueItem.suggestedReply ?? queueItem.question;
    const confidence = agentResult?.confidence ?? 0.75;
    const status = "drafted";
    const record = {
        queueId: queueItem.id,
        subreddit: queueItem.subreddit,
        question: queueItem.question,
        draftedResponse,
        responder,
        confidence,
        status,
        respondedAt: now,
        link: queueItem.link,
        notes: matchingDraft ? `rssDraft:${matchingDraft.draftId}` : undefined,
        rssDraftId: matchingDraft?.draftId,
        devvitPayloadPath: agentResult?.devvitPayloadPath,
        packId: agentResult?.packId ?? (latestPack?.pack?.id ?? undefined),
        packPath: agentResult?.packPath ?? latestPack?.path,
    };
    context.state.redditResponses.push(record);
    context.state.lastRedditResponseAt = now;
    await context.saveState();
    return `drafted reddit reply for ${queueItem.subreddit} (${queueItem.id})`;
};
const securityAuditHandler = async (task, context) => {
    await assertToolGatePermission('security-audit');
    const payload = {
        id: randomUUID(),
        type: String(task.payload.type ?? "scan"),
        scope: String(task.payload.scope ?? "workspace"),
    };
    try {
        const result = await runSpawnedAgentJob("security-agent", payload, "SECURITY_AGENT_RESULT_FILE", context.logger);
        const summary = result.summary ?? {};
        const critical = Number(summary.critical ?? 0);
        const total = Number(summary.total ?? 0);
        return `security audit complete (${critical} critical, ${total} findings)`;
    }
    catch (error) {
        throwTaskFailure("security audit", error);
    }
};
const summarizeContentHandler = async (task, context) => {
    await assertToolGatePermission('summarize-content');
    const sourceType = String(task.payload.sourceType ?? "document");
    const payload = {
        id: randomUUID(),
        source: {
            type: sourceType,
            content: String(task.payload.content ?? ""),
            metadata: typeof task.payload.metadata === "object" && task.payload.metadata !== null
                ? task.payload.metadata
                : undefined,
        },
        constraints: typeof task.payload.constraints === "object" && task.payload.constraints !== null
            ? task.payload.constraints
            : undefined,
        format: task.payload.format ? String(task.payload.format) : "executive_summary",
    };
    try {
        const result = await runSpawnedAgentJob("summarization-agent", payload, "SUMMARIZATION_AGENT_RESULT_FILE", context.logger);
        const confidence = Number(result.confidence ?? 0);
        const format = String(result.format ?? payload.format);
        return `summarization complete (${format}, confidence ${confidence.toFixed(2)})`;
    }
    catch (error) {
        throwTaskFailure("summarization", error);
    }
};
const systemMonitorHandler = async (task, context) => {
    await assertToolGatePermission('system-monitor');
    const payload = {
        id: randomUUID(),
        type: String(task.payload.type ?? "health"),
        agents: Array.isArray(task.payload.agents)
            ? task.payload.agents
            : undefined,
    };
    try {
        const result = await runSpawnedAgentJob("system-monitor-agent", payload, "SYSTEM_MONITOR_AGENT_RESULT_FILE", context.logger);
        const metrics = result.metrics ?? {};
        const alerts = Array.isArray(metrics.alerts) ? metrics.alerts.length : 0;
        return `system monitor complete (${alerts} alerts)`;
    }
    catch (error) {
        throwTaskFailure("system monitor", error);
    }
};
const buildRefactorHandler = async (task, context) => {
    await assertToolGatePermission('build-refactor');
    const payload = {
        id: randomUUID(),
        type: String(task.payload.type ?? "refactor"),
        scope: String(task.payload.scope ?? "src"),
        constraints: typeof task.payload.constraints === "object" && task.payload.constraints !== null
            ? task.payload.constraints
            : undefined,
    };
    try {
        const result = await runSpawnedAgentJob("build-refactor-agent", payload, "BUILD_REFACTOR_AGENT_RESULT_FILE", context.logger);
        const summary = result.summary ?? {};
        const filesChanged = Number(summary.filesChanged ?? 0);
        const confidence = Number(summary.confidence ?? 0);
        return `build-refactor complete (${filesChanged} files, confidence ${confidence.toFixed(2)})`;
    }
    catch (error) {
        throwTaskFailure("build-refactor", error);
    }
};
const contentGenerateHandler = async (task, context) => {
    await assertToolGatePermission('content-generate');
    const payload = {
        id: randomUUID(),
        type: String(task.payload.type ?? "readme"),
        source: typeof task.payload.source === "object" && task.payload.source !== null
            ? task.payload.source
            : { name: "Project", description: "Generated content" },
        style: task.payload.style ? String(task.payload.style) : undefined,
        length: task.payload.length ? String(task.payload.length) : undefined,
    };
    try {
        const result = await runSpawnedAgentJob("content-agent", payload, "CONTENT_AGENT_RESULT_FILE", context.logger);
        const metrics = result.metrics ?? {};
        const wordCount = Number(metrics.wordCount ?? 0);
        const generatedType = String(metrics.generatedType ?? payload.type);
        return `content generation complete (${generatedType}, ${wordCount} words)`;
    }
    catch (error) {
        throwTaskFailure("content generation", error);
    }
};
const integrationWorkflowHandler = async (task, context) => {
    await assertToolGatePermission('integration-workflow');
    const payload = {
        id: randomUUID(),
        type: String(task.payload.type ?? "workflow"),
        steps: Array.isArray(task.payload.steps)
            ? task.payload.steps
            : [],
    };
    try {
        const result = await runSpawnedAgentJob("integration-agent", payload, "INTEGRATION_AGENT_RESULT_FILE", context.logger);
        const steps = Array.isArray(result.steps) ? result.steps.length : 0;
        if (result.success !== true) {
            const reason = typeof result.error === "string" ? result.error : "agent returned unsuccessful result";
            throw new Error(`integration workflow failed: ${reason}`);
        }
        return `integration workflow complete (${steps} steps)`;
    }
    catch (error) {
        throwTaskFailure("integration workflow", error);
    }
};
const normalizeDataHandler = async (task, context) => {
    await assertToolGatePermission('normalize-data');
    const payload = {
        id: randomUUID(),
        type: String(task.payload.type ?? "normalize"),
        input: task.payload.input !== undefined
            ? task.payload.input
            : [],
        schema: typeof task.payload.schema === "object" && task.payload.schema !== null
            ? task.payload.schema
            : {},
    };
    try {
        const result = await runSpawnedAgentJob("normalization-agent", payload, "NORMALIZATION_AGENT_RESULT_FILE", context.logger);
        const metrics = result.metrics ?? {};
        const inputRecords = Number(metrics.inputRecords ?? 0);
        const outputRecords = Number(metrics.outputRecords ?? 0);
        return `normalize-data complete (${outputRecords}/${inputRecords} records normalized)`;
    }
    catch (error) {
        throwTaskFailure("normalize-data", error);
    }
};
const marketResearchHandler = async (task, context) => {
    await assertToolGatePermission('market-research');
    const payload = {
        id: randomUUID(),
        query: String(task.payload.query ?? "market research"),
        scope: String(task.payload.scope ?? "general"),
        constraints: typeof task.payload.constraints === "object" && task.payload.constraints !== null
            ? task.payload.constraints
            : undefined,
    };
    try {
        const result = await runSpawnedAgentJob("market-research-agent", payload, "MARKET_RESEARCH_AGENT_RESULT_FILE", context.logger);
        const findings = Array.isArray(result.findings) ? result.findings.length : 0;
        const confidence = Number(result.confidence ?? 0);
        return `market research complete (${findings} findings, confidence ${confidence.toFixed(2)})`;
    }
    catch (error) {
        throwTaskFailure("market research", error);
    }
};
const dataExtractionHandler = async (task, context) => {
    await assertToolGatePermission('data-extraction');
    const payload = {
        id: randomUUID(),
        source: typeof task.payload.source === "object" && task.payload.source !== null
            ? task.payload.source
            : { type: "inline", content: String(task.payload.content ?? "") },
        schema: typeof task.payload.schema === "object" && task.payload.schema !== null
            ? task.payload.schema
            : undefined,
    };
    try {
        const result = await runSpawnedAgentJob("data-extraction-agent", payload, "DATA_EXTRACTION_AGENT_RESULT_FILE", context.logger);
        const recordsExtracted = Number(result.recordsExtracted ?? 0);
        const entitiesFound = Number(result.entitiesFound ?? 0);
        return `data extraction complete (${recordsExtracted} records, ${entitiesFound} entities)`;
    }
    catch (error) {
        throwTaskFailure("data extraction", error);
    }
};
const qaVerificationHandler = async (task, context) => {
    await assertToolGatePermission('qa-verification');
    const payload = {
        id: randomUUID(),
        target: String(task.payload.target ?? "workspace"),
        suite: String(task.payload.suite ?? "smoke"),
        constraints: typeof task.payload.constraints === "object" && task.payload.constraints !== null
            ? task.payload.constraints
            : undefined,
    };
    try {
        const result = await runSpawnedAgentJob("qa-verification-agent", payload, "QA_VERIFICATION_AGENT_RESULT_FILE", context.logger);
        const testsRun = Number(result.testsRun ?? 0);
        const testsPassed = Number(result.testsPassed ?? 0);
        return `qa verification complete (${testsPassed}/${testsRun} tests passed)`;
    }
    catch (error) {
        throwTaskFailure("qa verification", error);
    }
};
const skillAuditHandler = async (task, context) => {
    await assertToolGatePermission('skill-audit');
    const payload = {
        id: randomUUID(),
        skillIds: Array.isArray(task.payload.skillIds)
            ? task.payload.skillIds
            : undefined,
        depth: String(task.payload.depth ?? "standard"),
        checks: Array.isArray(task.payload.checks)
            ? task.payload.checks
            : undefined,
    };
    try {
        const result = await runSpawnedAgentJob("skill-audit-agent", payload, "SKILL_AUDIT_AGENT_RESULT_FILE", context.logger);
        const audited = Number(result.skillsAudited ?? 0);
        const issues = Number(result.issuesFound ?? 0);
        return `skill audit complete (${audited} skills, ${issues} issues)`;
    }
    catch (error) {
        throwTaskFailure("skill audit", error);
    }
};
const rssSweepHandler = async (task, context) => {
    const configPath = typeof task.payload.configPath === "string"
        ? task.payload.configPath
        : context.config.rssConfigPath ?? join(process.cwd(), "..", "rss_filter_config.json");
    const draftsPath = typeof task.payload.draftsPath === "string"
        ? task.payload.draftsPath
        : context.config.redditDraftsPath ?? join(process.cwd(), "..", "logs", "reddit-drafts.jsonl");
    const rawConfig = await readFile(configPath, "utf-8");
    const rssConfig = JSON.parse(rawConfig);
    const now = new Date().toISOString();
    let drafted = 0;
    const pillars = Object.entries(rssConfig.pillars ?? {});
    for (const [pillarKey, pillar] of pillars) {
        const feeds = pillar.feeds ?? [];
        for (const feed of feeds) {
            const response = await fetch(feed.url, { headers: { "User-Agent": "openclaw-orchestrator" } });
            if (!response.ok) {
                context.logger.warn(`[rss] failed ${feed.url}: ${response.status}`);
                continue;
            }
            const xml = await response.text();
            const entries = parseRssEntries(xml);
            for (const entry of entries) {
                const seenId = `${feed.id}:${entry.id}`;
                if (context.state.rssSeenIds.includes(seenId))
                    continue;
                const textBlob = `${entry.title}\n${entry.content}\n${entry.author ?? ""}\n${feed.subreddit}\n${entry.link}`;
                const clusterScore = buildScore(textBlob, pillar.keyword_clusters ?? {});
                const crossTriggers = rssConfig.cross_pillar?.high_intent_triggers ?? [];
                const crossMatches = crossTriggers.filter((trigger) => textBlob.toLowerCase().includes(trigger.toLowerCase()));
                const scoreBreakdown = {};
                let totalScore = 0;
                Object.entries(clusterScore.breakdown).forEach(([cluster, count]) => {
                    let weight = 1;
                    if (["emotional_identity_pain"].includes(cluster))
                        weight = rssConfig.scoring.weights.emotional_pain_match;
                    if (["core_instability", "debug_blindness", "preview_vs_production", "export_quality_shock", "autonomy_collapse", "migration_and_rebrand_brittleness"].includes(cluster)) {
                        weight = rssConfig.scoring.weights.execution_failure_match;
                    }
                    if (["security_exposure", "skills_supply_chain"].includes(cluster))
                        weight = rssConfig.scoring.weights.security_exposure_match;
                    if (["payments_and_backend"].includes(cluster))
                        weight = rssConfig.scoring.weights.payments_backend_match;
                    if (["hardening_and_runtime"].includes(cluster))
                        weight = rssConfig.scoring.weights.infra_hardening_match;
                    const weighted = count * weight;
                    scoreBreakdown[cluster] = weighted;
                    totalScore += weighted;
                });
                if (crossMatches.length > 0) {
                    const bonus = rssConfig.scoring.weights.cross_pillar_trigger_match * crossMatches.length;
                    scoreBreakdown.cross_pillar_trigger_match = bonus;
                    totalScore += bonus;
                }
                const thresholds = rssConfig.scoring.thresholds;
                if (totalScore < thresholds.draft_if_score_gte) {
                    rememberRssId(context, seenId);
                    continue;
                }
                let tag = "draft";
                if (totalScore >= thresholds.manual_review_if_score_gte)
                    tag = "manual-review";
                else if (totalScore >= thresholds.priority_draft_if_score_gte)
                    tag = "priority";
                const ctas = rssConfig.drafting?.cta_variants?.[pillarKey] ?? [];
                const ctaVariant = ctas[0] ?? "If you want, share more context and I’ll suggest the next move.";
                const suggestedReply = `Saw your post about ${entry.title}. ${ctaVariant}`;
                const record = {
                    draftId: randomUUID(),
                    pillar: pillarKey,
                    feedId: feed.id,
                    subreddit: feed.subreddit,
                    title: entry.title,
                    content: entry.content,
                    link: entry.link,
                    author: entry.author,
                    matchedKeywords: [...clusterScore.matched, ...crossMatches],
                    scoreBreakdown,
                    totalScore,
                    suggestedReply,
                    ctaVariant,
                    tag,
                    queuedAt: now,
                };
                context.state.rssDrafts.push(record);
                context.state.redditQueue.push({
                    id: record.draftId,
                    subreddit: feed.subreddit,
                    question: entry.title,
                    link: entry.link,
                    queuedAt: now,
                    tag,
                    pillar: pillarKey,
                    feedId: feed.id,
                    entryContent: entry.content,
                    author: entry.author,
                    ctaVariant,
                    matchedKeywords: record.matchedKeywords,
                    score: totalScore,
                    draftRecordId: record.draftId,
                    suggestedReply,
                });
                ensureRedditQueueLimit(context);
                await appendDraft(draftsPath, record);
                rememberRssId(context, seenId);
                drafted += 1;
            }
        }
    }
    context.state.lastRssSweepAt = now;
    await context.saveState();
    return drafted > 0 ? `rss sweep drafted ${drafted} replies` : "rss sweep complete (no drafts)";
};
const heartbeatHandler = async (task) => {
    return `heartbeat (${task.payload.reason ?? "interval"})`;
};
const agentDeployHandler = async (task, context) => {
    const deploymentId = randomUUID();
    const agentName = String(task.payload.agentName ?? `agent-${deploymentId.slice(0, 6)}`);
    const template = String(task.payload.template ?? "doc-specialist");
    const templatePath = String(task.payload.templatePath ?? join(process.cwd(), "..", "agents", template));
    const deployBase = context.config.deployBaseDir ?? join(process.cwd(), "..", "agents-deployed");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const repoPath = String(task.payload.repoPath ?? join(deployBase, `${agentName}-${timestamp}`));
    const config = typeof task.payload.config === "object" && task.payload.config !== null ? task.payload.config : {};
    await mkdir(deployBase, { recursive: true });
    await cp(templatePath, repoPath, { recursive: true });
    const deploymentNotes = {
        deploymentId,
        agentName,
        template,
        templatePath: basename(templatePath),
        deployedAt: new Date().toISOString(),
        runHint: "npm install && npm run dev -- <payload.json>",
        payload: task.payload,
    };
    await writeFile(join(repoPath, "DEPLOYMENT.json"), JSON.stringify(deploymentNotes, null, 2), "utf-8");
    const record = {
        deploymentId,
        agentName,
        template,
        repoPath,
        config,
        status: "deployed",
        deployedAt: new Date().toISOString(),
        notes: task.payload.notes ? String(task.payload.notes) : undefined,
    };
    context.state.agentDeployments.push(record);
    context.state.lastAgentDeployAt = record.deployedAt;
    await context.saveState();
    return `deployed ${agentName} via ${template} template to ${repoPath}`;
};
const nightlyBatchHandler = async (task, context) => {
    const { state, config, logger } = context;
    const now = new Date().toISOString();
    const digestDir = config.digestDir ?? join(process.cwd(), "..", "logs", "digests");
    await mkdir(digestDir, { recursive: true });
    // Nightly batch orchestrates: doc-sync, mark high-confidence items for drafting
    let docsSynced = 0;
    let itemsMarked = 0;
    if (state.pendingDocChanges.length > 0) {
        docsSynced = state.pendingDocChanges.length;
        state.pendingDocChanges = [];
    }
    // Mark high-confidence items (score > 0.75) for reddit-helper drafting
    for (let i = 0; i < state.redditQueue.length; i++) {
        const item = state.redditQueue[i];
        if (item.score && item.score > 0.75) {
            item.selectedForDraft = true;
            itemsMarked += 1;
        }
    }
    // Compile digest
    const digest = {
        generatedAt: now,
        batchId: randomUUID(),
        summary: {
            docsProcessed: docsSynced,
            queueTotal: state.redditQueue.length,
            markedForDraft: itemsMarked,
        },
        redditQueue: state.redditQueue.filter((q) => q.selectedForDraft),
    };
    const dateTag = new Date(now).toISOString().split("T")[0];
    const digestPath = join(digestDir, `digest-${dateTag}.json`);
    await writeFile(digestPath, JSON.stringify(digest, null, 2), "utf-8");
    state.lastNightlyBatchAt = now;
    await context.saveState();
    return `nightly batch: synced ${docsSynced} docs, marked ${itemsMarked} for draft`;
};
const sendDigestHandler = async (task, context) => {
    const { config, logger } = context;
    const digestDir = config.digestDir ?? join(process.cwd(), "..", "logs", "digests");
    try {
        const files = await readdir(digestDir);
        const digests = files.filter((f) => f.startsWith("digest-") && f.endsWith(".json")).sort().reverse();
        if (!digests.length)
            return "no digests to send";
        const latestPath = join(digestDir, digests[0]);
        const raw = await readFile(latestPath, "utf-8");
        const digest = JSON.parse(raw);
        const summary = digest.summary;
        const itemCount = summary.markedForDraft ?? 0;
        // Build and send notification
        const notifierConfig = buildNotifierConfig(config);
        if (notifierConfig) {
            await sendNotification(notifierConfig, {
                title: `🚀 ${itemCount} Reddit Leads Ready for Review`,
                summary: `Your nightly RSS sweep collected ${summary.queueTotal} leads.\n${itemCount} high-confidence items (score > 0.75) are ready for drafting.`,
                count: itemCount,
                digest: summary,
                url: `${process.env.APP_URL || "http://localhost:3000"}/digests/${digests[0]}`,
            }, logger);
        }
        else {
            logger.log(`[send-digest] ${itemCount} leads ready (no notification channel configured; use log fallback)`);
        }
        context.state.lastDigestNotificationAt = new Date().toISOString();
        await context.saveState();
        return `digest notification sent (${itemCount} leads)`;
    }
    catch (error) {
        throwTaskFailure("send-digest", error);
    }
};
const unknownTaskHandler = async (task, context) => {
    const allowed = ALLOWED_TASK_TYPES.join(", ");
    throw new Error(`Invalid task type: ${task.type}. Allowed: ${allowed}`);
};
export const taskHandlers = {
    startup: startupHandler,
    "doc-change": docChangeHandler,
    "doc-sync": docSyncHandler,
    "drift-repair": driftRepairHandler,
    "reddit-response": redditResponseHandler,
    "security-audit": securityAuditHandler,
    "summarize-content": summarizeContentHandler,
    "system-monitor": systemMonitorHandler,
    "build-refactor": buildRefactorHandler,
    "content-generate": contentGenerateHandler,
    "integration-workflow": integrationWorkflowHandler,
    "normalize-data": normalizeDataHandler,
    "market-research": marketResearchHandler,
    "data-extraction": dataExtractionHandler,
    "qa-verification": qaVerificationHandler,
    "skill-audit": skillAuditHandler,
    "rss-sweep": rssSweepHandler,
    "nightly-batch": nightlyBatchHandler,
    "send-digest": sendDigestHandler,
    heartbeat: heartbeatHandler,
    "agent-deploy": agentDeployHandler,
};
export function resolveTaskHandler(task) {
    // Strict task type validation
    if (!validateTaskType(task.type)) {
        return unknownTaskHandler;
    }
    return taskHandlers[task.type] ?? unknownTaskHandler;
}
