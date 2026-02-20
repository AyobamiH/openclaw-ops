import { readFile, writeFile, appendFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Telemetry } from "../../shared/telemetry.js";

interface AgentConfig {
  knowledgePackDir: string;
  draftLogPath: string;
  devvitQueuePath?: string;
}

interface RedditQueuePayload {
  id: string;
  subreddit: string;
  question: string;
  link?: string;
  tag?: string;
  pillar?: string;
  entryContent?: string;
  author?: string;
  ctaVariant?: string;
  matchedKeywords?: string[];
  score?: number;
}

interface RssDraftPayload {
  draftId: string;
  suggestedReply: string;
  matchedKeywords: string[];
  scoreBreakdown: Record<string, number>;
  tag: string;
  ctaVariant: string;
}

interface TaskPayload {
  queue: RedditQueuePayload;
  rssDraft?: RssDraftPayload;
  knowledgePackPath?: string;
  knowledgePack?: KnowledgePack;
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

interface AgentResult {
  replyText: string;
  confidence: number;
  ctaVariant?: string;
  devvitPayloadPath?: string;
  packId?: string;
  packPath?: string;
}

const telemetry = new Telemetry({ component: "reddit-helper" });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadConfig(): Promise<AgentConfig> {
  const configPath = resolve(__dirname, "../agent.config.json");
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as AgentConfig;
  if (!parsed.knowledgePackDir || !parsed.draftLogPath) {
    throw new Error("agent.config.json must include knowledgePackDir and draftLogPath");
  }
  return {
    knowledgePackDir: resolve(dirname(configPath), parsed.knowledgePackDir),
    draftLogPath: resolve(dirname(configPath), parsed.draftLogPath),
    devvitQueuePath: parsed.devvitQueuePath
      ? resolve(dirname(configPath), parsed.devvitQueuePath)
      : undefined,
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
  } catch (error) {
    await telemetry.warn("knowledge-pack.load_failed", { message: (error as Error).message });
    return null;
  }
}

function pickDocSnippet(pack?: KnowledgePack, queue?: RedditQueuePayload) {
  if (!pack?.docs?.length) return null;
  if (!queue?.matchedKeywords?.length) return pack.docs[0];
  const keyword = queue.matchedKeywords[0].toLowerCase();
  const match = pack.docs.find((doc) => doc.summary.toLowerCase().includes(keyword));
  return match ?? pack.docs[0];
}

function buildReply(
  queue: RedditQueuePayload,
  draft: RssDraftPayload | undefined,
  doc: KnowledgePackDoc | null,
  ctaVariant?: string,
) {
  const intro = draft?.suggestedReply ?? `Hey there — saw your thread about ${queue.question}.`;
  const docSection = doc
    ? `**Reference → ${doc.firstHeading ?? doc.path}**\n${doc.summary}`
    : undefined;
  const cta = ctaVariant ?? draft?.ctaVariant ?? queue.ctaVariant;
  const ctaBlock = cta ? `_${cta}_` : undefined;
  return [intro, docSection, ctaBlock].filter(Boolean).join("\n\n");
}

function deriveConfidence(tag?: string) {
  if (tag === "priority") return 0.92;
  if (tag === "manual-review") return 0.6;
  return 0.78;
}

async function runTask(task: TaskPayload): Promise<AgentResult> {
  const config = await loadConfig();
  const queue = task.queue;
  const draft = task.rssDraft;

  let pack = task.knowledgePack;
  let packPath = task.knowledgePackPath;
  if (!pack) {
    const latest = await loadKnowledgePackFromDir(config.knowledgePackDir);
    pack = latest?.pack;
    packPath = latest?.path;
  }

  const docSnippet = pack ? pickDocSnippet(pack, queue) : null;
  const replyText = buildReply(queue, draft, docSnippet, queue.ctaVariant);
  const confidence = deriveConfidence(queue.tag ?? draft?.tag);

  const draftRecord = {
    stage: "agent",
    queueId: queue.id,
    subreddit: queue.subreddit,
    replyText,
    cta: queue.ctaVariant ?? draft?.ctaVariant,
    pillar: queue.pillar,
    link: queue.link,
    createdAt: new Date().toISOString(),
  };
  await appendJsonl(config.draftLogPath, draftRecord);

  let devvitPayloadPath: string | undefined;
  if (config.devvitQueuePath) {
    const payload = {
      type: "comment",
      queueId: queue.id,
      subreddit: queue.subreddit,
      link: queue.link,
      body: replyText,
      createdAt: new Date().toISOString(),
      tag: queue.tag,
    };
    await appendJsonl(config.devvitQueuePath, payload);
    devvitPayloadPath = config.devvitQueuePath;
  }

  return {
    replyText,
    confidence,
    ctaVariant: queue.ctaVariant ?? draft?.ctaVariant,
    devvitPayloadPath,
    packId: pack?.id,
    packPath,
  };
}

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    throw new Error("Usage: tsx src/index.ts <payload.json>");
  }

  const raw = await readFile(payloadPath, "utf-8");
  const payload = JSON.parse(raw) as TaskPayload;
  await telemetry.info("task.received", { queueId: payload.queue?.id, subreddit: payload.queue?.subreddit });
  const result = await runTask(payload);
  await telemetry.info("task.success", { queueId: payload.queue?.id, subreddit: payload.queue?.subreddit });

  if (process.env.REDDIT_HELPER_RESULT_FILE) {
    await ensureDir(process.env.REDDIT_HELPER_RESULT_FILE);
    await writeFile(process.env.REDDIT_HELPER_RESULT_FILE, JSON.stringify(result, null, 2), "utf-8");
  }
}

main().catch(async (error) => {
  await telemetry.error("task.failed", { message: (error as Error).message });
  process.exit(1);
});
