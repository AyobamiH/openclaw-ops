import { readFile, writeFile, appendFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Telemetry } from "../../shared/telemetry.js";

interface AgentConfig {
  knowledgePackDir: string;
  draftLogPath: string;
  devvitQueuePath?: string;
  orchestratorStatePath: string;
  serviceStatePath: string;
}

interface RssDraftRecord {
  draftId: string;
  pillar: string;
  feedId: string;
  subreddit: string;
  title: string;
  content: string;
  link: string;
  author?: string;
  matchedKeywords: string[];
  scoreBreakdown: Record<string, number>;
  totalScore: number;
  suggestedReply: string;
  ctaVariant: string;
  tag: "draft" | "priority" | "manual-review";
  queuedAt: string;
}

interface RedditReplyRecord {
  queueId: string;
  subreddit: string;
  question: string;
  draftedResponse: string;
  responder: string;
  confidence: number;
  status: "drafted" | "posted" | "error";
  respondedAt: string;
  postedAt?: string;
  link?: string;
  notes?: string;
  rssDraftId?: string;
  devvitPayloadPath?: string;
  packId?: string;
  packPath?: string;
}

interface OrchestratorState {
  rssDrafts?: RssDraftRecord[];
  redditResponses?: RedditReplyRecord[];
  lastRedditResponseAt?: string | null;
}

interface KnowledgePackDoc {
  path: string;
  summary: string;
  wordCount: number;
  bytes: number;
  firstHeading?: string;
}

interface KnowledgePack {
  id: string;
  generatedAt: string;
  docs: KnowledgePackDoc[];
}

const telemetry = new Telemetry({ component: "reddit-helper-service" });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadConfig(): Promise<AgentConfig> {
  const configPath = resolve(__dirname, "../agent.config.json");
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as AgentConfig;
  return {
    knowledgePackDir: resolve(dirname(configPath), parsed.knowledgePackDir),
    draftLogPath: resolve(dirname(configPath), parsed.draftLogPath),
    devvitQueuePath: parsed.devvitQueuePath
      ? resolve(dirname(configPath), parsed.devvitQueuePath)
      : undefined,
    orchestratorStatePath: resolve(dirname(configPath), parsed.orchestratorStatePath),
    serviceStatePath: resolve(dirname(configPath), parsed.serviceStatePath),
  };
}

async function ensureDir(path: string) {
  await mkdir(dirname(path), { recursive: true });
}

async function appendJsonl(path: string, data: Record<string, unknown>) {
  await ensureDir(path);
  await appendFile(path, `${JSON.stringify(data)}\n`, "utf-8");
}

async function loadKnowledgePackFromDir(dir: string): Promise<{ pack: KnowledgePack; path: string } | null> {
  try {
    const files = await readdir(dir);
    const candidates = files.filter((file) => file.endsWith(".json"));
    if (!candidates.length) return null;
    const sorted = await Promise.all(
      candidates.map(async (file) => {
        const fullPath = resolve(dir, file);
        const stats = await stat(fullPath);
        return { fullPath, mtime: stats.mtimeMs };
      }),
    );
    sorted.sort((a, b) => b.mtime - a.mtime);
    const latest = sorted[0];
    const raw = await readFile(latest.fullPath, "utf-8");
    return { pack: JSON.parse(raw) as KnowledgePack, path: latest.fullPath };
  } catch {
    return null;
  }
}

function pickDocSnippet(pack?: KnowledgePack, draft?: RssDraftRecord) {
  if (!pack?.docs?.length) return null;
  const keyword = draft?.matchedKeywords?.[0]?.toLowerCase();
  if (!keyword) return pack.docs[0];
  return pack.docs.find((doc) => doc.summary.toLowerCase().includes(keyword)) ?? pack.docs[0];
}

function buildReply(draft: RssDraftRecord, doc?: KnowledgePackDoc | null) {
  const title = draft.title || "Your post";
  const context = doc?.firstHeading ?? doc?.path;
  const line1 = `Good question. ${title}`.replace(/—/g, "-");
  const line2 = doc
    ? `The risk is usually in ${context}.`
    : "The risk is usually in the handoff between build and production.";
  const line3 = "Share whether this is live or pre‑launch and what you control (repo + hosting), and I can outline the cleanest path.";
  const line4 = "Is this live or pre‑launch?";
  return [line1, line2, line3, line4].filter(Boolean).join("\n\n");
}

function deriveConfidence(tag?: string) {
  if (tag === "priority") return 0.92;
  if (tag === "manual-review") return 0.6;
  return 0.78;
}

async function loadState(path: string): Promise<OrchestratorState> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as OrchestratorState;
}

async function saveState(path: string, state: OrchestratorState) {
  await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
}

async function loadServiceState(path: string): Promise<{ lastProcessedAt?: string }>
{
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as { lastProcessedAt?: string };
  } catch {
    return {};
  }
}

async function saveServiceState(path: string, state: { lastProcessedAt?: string }) {
  await ensureDir(path);
  await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
}

async function runOnce(config: AgentConfig) {
  const state = await loadState(config.orchestratorStatePath);
  const serviceState = await loadServiceState(config.serviceStatePath);
  const lastProcessed = serviceState.lastProcessedAt ? new Date(serviceState.lastProcessedAt).getTime() : 0;

  const drafts = (state.rssDrafts ?? []).filter((draft) => new Date(draft.queuedAt).getTime() > lastProcessed);
  if (!drafts.length) return;

  const latestPack = await loadKnowledgePackFromDir(config.knowledgePackDir);

  for (const draft of drafts) {
    const docSnippet = pickDocSnippet(latestPack?.pack, draft);
    const replyText = buildReply(draft, docSnippet);
    const confidence = deriveConfidence(draft.tag);

    const record: RedditReplyRecord = {
      queueId: draft.draftId,
      subreddit: draft.subreddit,
      question: draft.title,
      draftedResponse: replyText,
      responder: "reddit-helper-service",
      confidence,
      status: "drafted",
      respondedAt: new Date().toISOString(),
      link: draft.link,
      notes: `rssDraft:${draft.draftId}`,
      rssDraftId: draft.draftId,
      devvitPayloadPath: config.devvitQueuePath,
      packId: latestPack?.pack.id,
      packPath: latestPack?.path,
    };

    state.redditResponses = [...(state.redditResponses ?? []), record];
    state.lastRedditResponseAt = new Date().toISOString();
    await appendJsonl(config.draftLogPath, {
      stage: "service",
      queueId: draft.draftId,
      subreddit: draft.subreddit,
      replyText,
      cta: null,
      pillar: draft.pillar,
      link: draft.link,
      createdAt: new Date().toISOString(),
    });

    if (config.devvitQueuePath) {
      await appendJsonl(config.devvitQueuePath, {
        type: "comment",
        queueId: draft.draftId,
        subreddit: draft.subreddit,
        link: draft.link,
        body: replyText,
        createdAt: new Date().toISOString(),
        tag: draft.tag,
      });
    }

    await telemetry.info("draft.generated", { queueId: draft.draftId, subreddit: draft.subreddit });
  }

  await saveState(config.orchestratorStatePath, state);
  await saveServiceState(config.serviceStatePath, { lastProcessedAt: new Date().toISOString() });
}

async function loop() {
  const config = await loadConfig();
  while (true) {
    try {
      await runOnce(config);
    } catch (error) {
      await telemetry.error("service.error", { message: (error as Error).message });
    }
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}

loop().catch(async (error) => {
  await telemetry.error("service.fatal", { message: (error as Error).message });
  process.exit(1);
});
