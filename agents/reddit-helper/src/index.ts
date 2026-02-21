import { readFile, writeFile, appendFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Telemetry } from "../../shared/telemetry.js";
import OpenAI from "openai";

interface AgentConfig {
  knowledgePackDir: string;
  draftLogPath: string;
  devvitQueuePath?: string;
  openaiModel?: string;
  openaiMaxTokens?: number;
  openaiTemperature?: number;
  runtimeEngagementOsPath?: string;
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
  selectedForDraft?: boolean;
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
  source: "openclaw" | "openai";
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

interface ConfidenceBreakdown {
  rssScore: number;
  llmScore: number;
  weights: { rss: number; llm: number };
  final: number;
}

interface AgentResult {
  replyText: string;
  confidence: number;
  rssScore?: number;
  llmScore?: number;
  confidenceBreakdown?: ConfidenceBreakdown;
  ctaVariant?: string;
  devvitPayloadPath?: string;
  packId?: string;
  packPath?: string;
  reasoning?: string;
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
    openaiModel: parsed.openaiModel || "gpt-4",
    openaiMaxTokens: parsed.openaiMaxTokens || 300,
    openaiTemperature: parsed.openaiTemperature ?? 0.7,
    runtimeEngagementOsPath: parsed.runtimeEngagementOsPath,
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

async function loadRuntimeEngagementOS(path?: string): Promise<string> {
  if (!path) return "";
  try {
    return await readFile(path, "utf-8");
  } catch (error) {
    await telemetry.warn("engagement-os.load_failed", { path, message: (error as Error).message });
    return "";
  }
}

function pickDocSnippets(pack?: KnowledgePack, queue?: RedditQueuePayload, limit = 3): KnowledgePackDoc[] {
  if (!pack?.docs?.length) return [];
  if (!queue?.matchedKeywords?.length) {
    // Prefer openclaw docs by default (they have more direct guidance)
    const openclaw = pack.docs.filter((d) => d.source === "openclaw").slice(0, limit);
    const openai = pack.docs.filter((d) => d.source === "openai").slice(0, limit - openclaw.length);
    return [...openclaw, ...openai];
  }

  const keyword = queue.matchedKeywords[0].toLowerCase();
  const matching = pack.docs.filter((doc) => doc.summary.toLowerCase().includes(keyword));
  const result = matching.length > 0 ? matching : pack.docs;

  // Balance by source: if we have both, try to include both perspectives
  const openclaw = result.filter((d) => d.source === "openclaw");
  const openai = result.filter((d) => d.source === "openai");
  const openclawSlice = openclaw.slice(0, Math.ceil(limit / 2));
  const openaiSlice = openai.slice(0, limit - openclawSlice.length);
  return [...openclawSlice, ...openaiSlice].slice(0, limit);
}

function buildLLMPrompt(
  queue: RedditQueuePayload,
  docs: KnowledgePackDoc[],
  engagementOS: string,
): { system: string; user: string } {
  const contextBlock = docs.length > 0
    ? `\n\nContext from your work:\n${docs
        .map((d) => {
          const source = d.source === "openclaw" ? "[OpenClaw Automation]" : "[OpenAI Cookbook]";
          return `${source} ${d.firstHeading || d.path}: ${d.summary}`;
        })
        .join("\n")}`
    : "";

  const userMessage = `Reddit Post:
Subreddit: r/${queue.subreddit}
Title: ${queue.question || "(no title)"}
Link: ${queue.link || "(no direct link)"}
Keywords matched: ${queue.matchedKeywords?.join(", ") || "none"}
Author level: ${queue.tag || "unknown"}
${queue.entryContent ? `\nPost content:\n${queue.entryContent.substring(0, 500)}...` : ""}
${contextBlock}

Generate a reply following the doctrine. Remember:
- No more than 5 sentences
- Ask 1-2 qualifying questions
- Do not solve or architect yet
- Show your authority, not your solutions`;

  return {
    system: `You are a senior engineer drafting Reddit replies to potential clients. Follow this doctrine:\n\n${engagementOS}\n\nGenerate YOUR response to the post above.`,
    user: userMessage,
  };
}

async function scoreReplyQualityWithLLM(
  replyText: string,
  queue: RedditQueuePayload,
  engagementOS: string,
  config: AgentConfig,
): Promise<{ score: number; reasoning: string }> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");

    const client = new OpenAI({ apiKey });

    const scoringPrompt = `You just generated this Reddit reply:

${replyText}

Score how well this reply adheres to the following doctrine:

${engagementOS}

Answer with ONLY a JSON object, no markdown:
{"score": 0.75, "reasoning": "brief explanation"}

Consider:
- Does it follow the 4-5 sentence structure?
- Does it ask qualifying questions without solving?
- Is the tone calm and authoritative (not eager, not verbose)?
- Would this convert qualified leads?

If perfect adherence: 0.95+
If good adherence with minor issues: 0.80-0.94
If acceptable but has drift: 0.65-0.79
If poor adherence: <0.65`;

    const response = await client.chat.completions.create({
      model: config.openaiModel || "gpt-4",
      max_tokens: 100,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: scoringPrompt,
        },
      ],
    });

    const scoreText = response.choices[0]?.message?.content || "";
    const scoreJson = JSON.parse(scoreText) as { score: number; reasoning: string };

    await telemetry.info("llm.score_success", {
      score: scoreJson.score,
      tokenUsage: response.usage?.total_tokens || 0,
    });

    return { score: Math.max(0, Math.min(1, scoreJson.score)), reasoning: scoreJson.reasoning };
  } catch (error) {
    await telemetry.error("llm.score_failed", { message: (error as Error).message });
    return { score: 0.65, reasoning: "Scoring failed, using baseline" };
  }
}

async function draftReplyWithLLM(
  queue: RedditQueuePayload,
  docs: KnowledgePackDoc[],
  engagementOS: string,
  config: AgentConfig,
): Promise<{ replyText: string; llmScore: number; reasoning: string }> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not set in environment");
    }

    const client = new OpenAI({ apiKey });
    const { system, user } = buildLLMPrompt(queue, docs, engagementOS);

    const response = await client.chat.completions.create({
      model: config.openaiModel || "gpt-4",
      max_tokens: config.openaiMaxTokens || 300,
      temperature: config.openaiTemperature ?? 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const replyText = response.choices[0]?.message?.content || "";

    // Get LLM's own quality assessment of the draft
    const { score: llmScore, reasoning: scoreReasoning } = await scoreReplyQualityWithLLM(
      replyText,
      queue,
      engagementOS,
      config,
    );

    await telemetry.info("llm.draft_success", {
      queueId: queue.id,
      subreddit: queue.subreddit,
      tokenUsage: response.usage?.total_tokens || 0,
      llmScore,
    });

    return { replyText, llmScore, reasoning: scoreReasoning };
  } catch (error) {
    await telemetry.error("llm.draft_failed", {
      queueId: queue.id,
      message: (error as Error).message,
    });

    // Fallback: if LLM fails, use simple template response
    const fallbackReply =
      `Good question. The main considerations for ${queue.question?.substring(0, 30) || "your case"} usually involve scope and environment. ` +
      `Is this live or pre-launch? And what do you control—repo, hosting, DNS? Once I see that, I can outline the path.`;

    return { replyText: fallbackReply, llmScore: 0.5, reasoning: "LLM failed, using fallback template" };
  }
}

async function runTask(task: TaskPayload, config: AgentConfig): Promise<AgentResult> {
  const queue = task.queue;
  const draft = task.rssDraft;

  // Skip if not manually selected
  if (!queue.selectedForDraft) {
    await telemetry.info("task.skipped", { queueId: queue.id, reason: "not_selected_for_draft" });
    return {
      replyText: "",
      confidence: 0,
      devvitPayloadPath: undefined,
    };
  }

  let pack = task.knowledgePack;
  let packPath = task.knowledgePackPath;
  if (!pack) {
    const latest = await loadKnowledgePackFromDir(config.knowledgePackDir);
    pack = latest?.pack;
    packPath = latest?.path;
  }

  // Load ENGAGEMENT_OS and knowledge context
  const engagementOS = await loadRuntimeEngagementOS(config.runtimeEngagementOsPath);
  const docSnippets = packPath ? pickDocSnippets(pack, queue, 3) : [];

  // Draft reply with LLM
  const { replyText, llmScore, reasoning: llmReasoning } = await draftReplyWithLLM(
    queue,
    docSnippets,
    engagementOS,
    config,
  );

  // Get RSS score from queue (initial relevance score from RSS_SWEEP)
  const rssScore = queue.score ?? 0.65;

  // Hybrid confidence: 40% RSS relevance + 60% LLM draft quality
  // This combines: whether the post matches your work (RSS) + quality of the reply (LLM)
  const weights = { rss: 0.4, llm: 0.6 };
  const finalConfidence = rssScore * weights.rss + llmScore * weights.llm;

  const confidenceBreakdown: ConfidenceBreakdown = {
    rssScore,
    llmScore,
    weights,
    final: finalConfidence,
  };

  const draftRecord = {
    stage: "agent-llm-hybrid",
    queueId: queue.id,
    subreddit: queue.subreddit,
    replyText,
    confidence: finalConfidence,
    rssScore,
    llmScore,
    confidenceBreakdown,
    reasoning: llmReasoning,
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
      confidence: finalConfidence,
      createdAt: new Date().toISOString(),
      tag: queue.tag,
    };
    await appendJsonl(config.devvitQueuePath, payload);
    devvitPayloadPath = config.devvitQueuePath;
  }

  return {
    replyText,
    confidence: finalConfidence,
    rssScore,
    llmScore,
    confidenceBreakdown,
    ctaVariant: queue.ctaVariant ?? draft?.ctaVariant,
    devvitPayloadPath,
    packId: pack?.id,
    packPath,
    reasoning: llmReasoning,
  };
}

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    throw new Error("Usage: tsx src/index.ts <payload.json>");
  }

  const config = await loadConfig();
  const raw = await readFile(payloadPath, "utf-8");
  const payload = JSON.parse(raw) as TaskPayload;
  await telemetry.info("task.received", { queueId: payload.queue?.id, subreddit: payload.queue?.subreddit });
  const result = await runTask(payload, config);
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
