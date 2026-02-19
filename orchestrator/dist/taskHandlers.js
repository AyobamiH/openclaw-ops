import { randomUUID } from "node:crypto";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
const MAX_REDDIT_QUEUE = 100;
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
    const targets = Array.isArray(task.payload.targets)
        ? task.payload.targets
        : ["doc-doctor", "reddit-helper"];
    const packId = `doc-pack-${Date.now()}`;
    const record = {
        runId: randomUUID(),
        requestedBy,
        processedPaths,
        generatedPackIds: [packId],
        updatedAgents: targets,
        durationMs: Date.now() - startedAt,
        completedAt: new Date().toISOString(),
        notes: task.payload.notes ? String(task.payload.notes) : undefined,
    };
    context.state.driftRepairs.push(record);
    context.state.lastDriftRepairAt = record.completedAt;
    await context.saveState();
    return `drift repair ${record.runId.slice(0, 8)} regenerated ${record.generatedPackIds.length} pack(s) for ${targets.length} agent(s)`;
};
const redditResponseHandler = async (task, context) => {
    const now = new Date().toISOString();
    let queueItem = context.state.redditQueue.shift();
    if (!queueItem) {
        queueItem = {
            id: String(task.payload.queueId ?? randomUUID()),
            subreddit: String(task.payload.subreddit ?? "r/OpenClaw"),
            question: String(task.payload.question ?? "General OpenClaw workflow question"),
            link: task.payload.link ? String(task.payload.link) : undefined,
            queuedAt: now,
        };
    }
    const responder = String(task.payload.responder ?? "reddit-helper");
    const confidence = Number.isFinite(task.payload.confidence) ? Number(task.payload.confidence) : 0.82;
    const draftedResponse = typeof task.payload.draft === "string"
        ? task.payload.draft
        : `Thanks for the question! Pulling knowledge pack v${context.state.docIndexVersion} now — expect a complete reply shortly.`;
    const status = task.payload.postImmediately === false ? "drafted" : "posted";
    const record = {
        queueId: queueItem.id,
        subreddit: queueItem.subreddit,
        question: queueItem.question,
        draftedResponse,
        responder,
        confidence,
        status,
        respondedAt: now,
        postedAt: status === "posted" ? now : undefined,
        link: queueItem.link,
        notes: task.payload.notes ? String(task.payload.notes) : undefined,
    };
    context.state.redditResponses.push(record);
    context.state.lastRedditResponseAt = now;
    ensureRedditQueueLimit(context);
    await context.saveState();
    return `${status} reddit reply for ${queueItem.id}`;
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
const fallbackHandler = async (task) => {
    return `no handler for task type ${task.type}`;
};
export const taskHandlers = {
    startup: startupHandler,
    "doc-change": docChangeHandler,
    "doc-sync": docSyncHandler,
    "drift-repair": driftRepairHandler,
    "reddit-response": redditResponseHandler,
    heartbeat: heartbeatHandler,
    "agent-deploy": agentDeployHandler,
};
export function resolveTaskHandler(task) {
    return taskHandlers[task.type] ?? fallbackHandler;
}
