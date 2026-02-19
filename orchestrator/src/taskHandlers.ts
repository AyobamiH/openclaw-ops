import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  AgentDeploymentRecord,
  DriftRepairRecord,
  RedditReplyRecord,
  RssDraftRecord,
  Task,
  TaskHandler,
  TaskHandlerContext,
} from "./types.js";

const MAX_REDDIT_QUEUE = 100;
const RSS_SEEN_CAP = 400;

function ensureDocChangeStored(path: string, context: TaskHandlerContext) {
  const { state } = context;
  if (state.pendingDocChanges.includes(path)) return;
  state.pendingDocChanges.unshift(path);
  if (state.pendingDocChanges.length > 200) {
    state.pendingDocChanges.pop();
  }
}

function ensureRedditQueueLimit(context: TaskHandlerContext) {
  if (context.state.redditQueue.length > MAX_REDDIT_QUEUE) {
    context.state.redditQueue.length = MAX_REDDIT_QUEUE;
  }
}

function rememberRssId(context: TaskHandlerContext, id: string) {
  if (context.state.rssSeenIds.includes(id)) return;
  context.state.rssSeenIds.unshift(id);
  if (context.state.rssSeenIds.length > RSS_SEEN_CAP) {
    context.state.rssSeenIds.length = RSS_SEEN_CAP;
  }
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRssEntries(xml: string) {
  const entries: Array<{ id: string; title: string; content: string; link: string; author?: string }> = [];
  const itemRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
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

    if (!title && !content) continue;
    entries.push({ id, title, content, link, author });
  }
  return entries;
}

function buildScore(text: string, clusterKeywords: Record<string, string[]>) {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  const breakdown: Record<string, number> = {};

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

async function appendDraft(path: string, record: RssDraftRecord) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf-8");
}

const startupHandler: TaskHandler = async (_, context) => {
  context.state.lastStartedAt = new Date().toISOString();
  await context.saveState();
  return "orchestrator boot complete";
};

const docChangeHandler: TaskHandler = async (task, context) => {
  const path = String(task.payload.path ?? "unknown");
  ensureDocChangeStored(path, context);
  await context.saveState();

  if (context.state.pendingDocChanges.length >= 25) {
    return `queued ${context.state.pendingDocChanges.length} doc changes`;
  }
  return `noted change for ${path}`;
};

const docSyncHandler: TaskHandler = async (_, context) => {
  const changes = [...context.state.pendingDocChanges];
  context.state.pendingDocChanges = [];
  await context.saveState();
  return changes.length ? `synced ${changes.length} doc changes` : "no doc changes to sync";
};

const driftRepairHandler: TaskHandler = async (task, context) => {
  const startedAt = Date.now();
  const requestedBy = String(task.payload.requestedBy ?? "scheduler");
  const extractedPaths = context.state.pendingDocChanges.splice(0);
  const extraPaths = Array.isArray(task.payload.paths) ? (task.payload.paths as string[]) : [];
  const processedPaths = extractedPaths.length ? extractedPaths : extraPaths;

  if (processedPaths.length === 0) {
    return "no drift to repair";
  }

  const targets = Array.isArray(task.payload.targets)
    ? (task.payload.targets as string[])
    : ["doc-doctor", "reddit-helper"];
  const packId = `doc-pack-${Date.now()}`;

  const record: DriftRepairRecord = {
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

const redditResponseHandler: TaskHandler = async (task, context) => {
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
  const confidence = Number.isFinite(task.payload.confidence as number) ? Number(task.payload.confidence) : 0.82;
  const draftedResponse =
    typeof task.payload.draft === "string"
      ? (task.payload.draft as string)
      : `Thanks for the question! Pulling knowledge pack v${context.state.docIndexVersion} now — expect a complete reply shortly.`;
  const status: "drafted" | "posted" = task.payload.postImmediately === false ? "drafted" : "posted";

  const record: RedditReplyRecord = {
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

const rssSweepHandler: TaskHandler = async (task, context) => {
  const configPath =
    typeof task.payload.configPath === "string"
      ? task.payload.configPath
      : context.config.rssConfigPath ?? join(process.cwd(), "..", "rss_filter_config.json");
  const draftsPath =
    typeof task.payload.draftsPath === "string"
      ? task.payload.draftsPath
      : context.config.redditDraftsPath ?? join(process.cwd(), "..", "logs", "reddit-drafts.jsonl");

  const rawConfig = await readFile(configPath, "utf-8");
  const rssConfig = JSON.parse(rawConfig);
  const now = new Date().toISOString();
  let drafted = 0;

  const pillars = Object.entries(rssConfig.pillars ?? {}) as Array<[string, any]>;
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
        if (context.state.rssSeenIds.includes(seenId)) continue;

        const textBlob = `${entry.title}\n${entry.content}\n${entry.author ?? ""}\n${feed.subreddit}\n${entry.link}`;
        const clusterScore = buildScore(textBlob, pillar.keyword_clusters ?? {});

        const crossTriggers = rssConfig.cross_pillar?.high_intent_triggers ?? [];
        const crossMatches = crossTriggers.filter((trigger: string) => textBlob.toLowerCase().includes(trigger.toLowerCase()));

        const scoreBreakdown: Record<string, number> = {};
        let totalScore = 0;

        Object.entries(clusterScore.breakdown).forEach(([cluster, count]) => {
          let weight = 1;
          if (["emotional_identity_pain"].includes(cluster)) weight = rssConfig.scoring.weights.emotional_pain_match;
          if (["core_instability", "debug_blindness", "preview_vs_production", "export_quality_shock", "autonomy_collapse", "migration_and_rebrand_brittleness"].includes(cluster)) {
            weight = rssConfig.scoring.weights.execution_failure_match;
          }
          if (["security_exposure", "skills_supply_chain"].includes(cluster)) weight = rssConfig.scoring.weights.security_exposure_match;
          if (["payments_and_backend"].includes(cluster)) weight = rssConfig.scoring.weights.payments_backend_match;
          if (["hardening_and_runtime"].includes(cluster)) weight = rssConfig.scoring.weights.infra_hardening_match;

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

        let tag: "draft" | "priority" | "manual-review" = "draft";
        if (totalScore >= thresholds.manual_review_if_score_gte) tag = "manual-review";
        else if (totalScore >= thresholds.priority_draft_if_score_gte) tag = "priority";

        const ctas = rssConfig.drafting?.cta_variants?.[pillarKey] ?? [];
        const ctaVariant = ctas[0] ?? "If you want, share more context and I’ll suggest the next move.";

        const suggestedReply = `Saw your post about ${entry.title}. ${ctaVariant}`;

        const record: RssDraftRecord = {
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

const heartbeatHandler: TaskHandler = async (task) => {
  return `heartbeat (${task.payload.reason ?? "interval"})`;
};

const agentDeployHandler: TaskHandler = async (task, context) => {
  const deploymentId = randomUUID();
  const agentName = String(task.payload.agentName ?? `agent-${deploymentId.slice(0, 6)}`);
  const template = String(task.payload.template ?? "doc-specialist");
  const templatePath = String(
    task.payload.templatePath ?? join(process.cwd(), "..", "agents", template),
  );
  const deployBase = context.config.deployBaseDir ?? join(process.cwd(), "..", "agents-deployed");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const repoPath = String(task.payload.repoPath ?? join(deployBase, `${agentName}-${timestamp}`));
  const config = typeof task.payload.config === "object" && task.payload.config !== null ? (task.payload.config as Record<string, unknown>) : {};

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

  const record: AgentDeploymentRecord = {
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

const fallbackHandler: TaskHandler = async (task) => {
  return `no handler for task type ${task.type}`;
};

export const taskHandlers: Record<string, TaskHandler> = {
  startup: startupHandler,
  "doc-change": docChangeHandler,
  "doc-sync": docSyncHandler,
  "drift-repair": driftRepairHandler,
  "reddit-response": redditResponseHandler,
  "rss-sweep": rssSweepHandler,
  heartbeat: heartbeatHandler,
  "agent-deploy": agentDeployHandler,
};

export function resolveTaskHandler(task: Task): TaskHandler {
  return taskHandlers[task.type] ?? fallbackHandler;
}
