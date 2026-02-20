import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile, appendFile, mkdtemp, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
const MAX_REDDIT_QUEUE = 100;
const RSS_SEEN_CAP = 400;
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
        docPaths,
        targetAgents,
        requestedBy,
    };
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
        return JSON.parse(raw);
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
    await writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf-8");
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
        return JSON.parse(raw);
    }
    finally {
        await rm(tmpRoot, { recursive: true, force: true });
    }
}
function stripHtml(value) {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
    const targets = Array.isArray(task.payload.targets)
        ? task.payload.targets
        : ["doc-doctor", "reddit-helper"];
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
const fallbackHandler = async (task) => {
    return `no handler for task type ${task.type}`;
};
export const taskHandlers = {
    startup: startupHandler,
    "doc-change": docChangeHandler,
    "doc-sync": docSyncHandler,
    "drift-repair": driftRepairHandler,
    "reddit-response": redditResponseHandler,
    "rss-sweep": rssSweepHandler,
    heartbeat: heartbeatHandler,
    "agent-deploy": agentDeployHandler,
};
export function resolveTaskHandler(task) {
    return taskHandlers[task.type] ?? fallbackHandler;
}
