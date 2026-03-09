import { readFile, writeFile, appendFile, mkdir, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Telemetry } from "../../shared/telemetry.js";

interface AgentConfig {
  knowledgePackDir: string;
  draftLogPath: string;
  devvitQueuePath?: string;
  serviceStatePath: string;
  openaiModel?: string;
  openaiMaxTokens?: number;
  openaiTemperature?: number;
  runtimeEngagementOsPath?: string;
}

interface OrchestratorRuntimeDefaults {
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
  qualityScore?: number;
  confidenceBreakdown?: ConfidenceBreakdown;
  ctaVariant?: string;
  devvitPayloadPath?: string;
  packId?: string;
  packPath?: string;
  reasoning?: string;
  draftMode?: "local-only" | "hybrid-polished";
}

interface RedditHelperServiceState {
  lastProcessedAt?: string;
  processedIds?: string[];
  lastSeenCursor?: string;
  budgetDate?: string;
  llmCallsToday?: number;
  tokensToday?: number;
  budgetStatus?: "ok" | "exhausted";
  lastBudgetExceededAt?: string;
  consecutiveFailures?: number;
  backoffUntil?: string | null;
}

interface BudgetConfig {
  maxTokensPerDay: number;
  maxLlmCallsPerDay: number;
  resetTimeZone: string;
}

interface BudgetGuardResult {
  allowed: boolean;
  state: RedditHelperServiceState;
  reason?: string;
}

interface OpenAICompletionClient {
  chat: {
    completions: {
      create: (payload: Record<string, unknown>) => Promise<{
        choices?: Array<{
          message?: {
            content?: string | null;
          };
        }>;
        usage?: {
          total_tokens?: number;
        };
      }>;
    };
  };
}

type OpenAIConstructor = new (options: { apiKey: string }) => OpenAICompletionClient;

const telemetry = new Telemetry({ component: "reddit-helper" });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_MAX_TOKENS_PER_DAY = 12_000;
const DEFAULT_MAX_LLM_CALLS_PER_DAY = 20;
const DEFAULT_BUDGET_RESET_TZ = "UTC";
const SENTENCE_SPLIT_REGEX = /[.!?]+/;
const CTA_REGEX = /\b(share|tell me|let me know|what do you control|is this live|pre-launch)\b/i;
const BANNED_SOLUTIONING_REGEXES = [
  /\byou should implement\b/i,
  /\bset up\b/i,
  /\bdeploy this\b/i,
  /\bstep\s*1\b/i,
  /\bhere'?s how to\b/i,
  /\bfirst,\s+.*second,\s+/i,
] as const;
let openAIConstructorPromise: Promise<OpenAIConstructor> | null = null;

async function getOpenAIConstructor(): Promise<OpenAIConstructor> {
  if (!openAIConstructorPromise) {
    openAIConstructorPromise = (async () => {
      const orchestratorRequire = createRequire(
        resolve(__dirname, "../../../orchestrator/package.json"),
      );
      const openAIEntryPath = orchestratorRequire.resolve("openai");
      const imported = await import(pathToFileURL(openAIEntryPath).href);
      const OpenAI = (imported.default ?? imported) as OpenAIConstructor;

      if (typeof OpenAI !== "function") {
        throw new Error("openai package resolved, but no constructor export was found");
      }

      return OpenAI;
    })();
  }

  return openAIConstructorPromise;
}

async function loadOrchestratorRuntimeDefaults(configDir: string): Promise<OrchestratorRuntimeDefaults> {
  const candidatePaths = [
    resolve(configDir, "../../orchestrator_config.json"),
    resolve(configDir, "../../orchestrator/orchestrator_config.json"),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const raw = await readFile(candidatePath, "utf-8");
      const parsed = JSON.parse(raw) as OrchestratorRuntimeDefaults;
      return {
        openaiModel: parsed.openaiModel,
        openaiMaxTokens: parsed.openaiMaxTokens,
        openaiTemperature: parsed.openaiTemperature,
        runtimeEngagementOsPath: parsed.runtimeEngagementOsPath,
      };
    } catch {
      continue;
    }
  }

  return {};
}

async function loadConfig(): Promise<AgentConfig> {
  const configPath = resolve(__dirname, "../agent.config.json");
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as AgentConfig;
  if (!parsed.knowledgePackDir || !parsed.draftLogPath) {
    throw new Error("agent.config.json must include knowledgePackDir and draftLogPath");
  }
  const configDir = dirname(configPath);
  const orchestratorDefaults = await loadOrchestratorRuntimeDefaults(configDir);
  return {
    knowledgePackDir: resolve(configDir, parsed.knowledgePackDir),
    draftLogPath: resolve(configDir, parsed.draftLogPath),
    devvitQueuePath: parsed.devvitQueuePath
      ? resolve(configDir, parsed.devvitQueuePath)
      : undefined,
    serviceStatePath: resolve(configDir, parsed.serviceStatePath),
    openaiModel:
      orchestratorDefaults.openaiModel ?? parsed.openaiModel ?? "gpt-4",
    openaiMaxTokens:
      orchestratorDefaults.openaiMaxTokens ?? parsed.openaiMaxTokens ?? 300,
    openaiTemperature:
      orchestratorDefaults.openaiTemperature ?? parsed.openaiTemperature ?? 0.7,
    runtimeEngagementOsPath:
      orchestratorDefaults.runtimeEngagementOsPath ??
      parsed.runtimeEngagementOsPath,
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

function buildQueueTerms(queue?: RedditQueuePayload): string[] {
  if (!queue) return [];

  const rawTerms = [
    queue.subreddit,
    queue.tag,
    queue.pillar,
    ...(queue.matchedKeywords ?? []),
    ...`${queue.question ?? ""} ${queue.entryContent ?? ""}`
      .split(/[^a-zA-Z0-9_-]+/)
      .map((term) => term.trim()),
  ];

  return Array.from(
    new Set(
      rawTerms
        .filter((term): term is string => typeof term === "string" && term.length > 0)
        .map((term) => term.toLowerCase())
        .filter((term) => term.length >= 3),
    ),
  );
}

function scoreDocSnippet(doc: KnowledgePackDoc, terms: string[]): number {
  const heading = (doc.firstHeading ?? "").toLowerCase();
  const path = doc.path.toLowerCase();
  const summary = doc.summary.toLowerCase();

  let score = doc.source === "openclaw" ? 2 : 1;

  for (const term of terms) {
    if (heading.includes(term)) score += 6;
    if (path.includes(term)) score += 4;
    if (summary.includes(term)) score += 3;
  }

  if (terms.length === 0 && doc.source === "openclaw") {
    score += 2;
  }

  return score;
}

export function pickDocSnippets(pack?: KnowledgePack, queue?: RedditQueuePayload, limit = 12): KnowledgePackDoc[] {
  if (!pack?.docs?.length) return [];
  const terms = buildQueueTerms(queue);
  const scoredDocs = pack.docs
    .map((doc, index) => ({
      doc,
      index,
      score: scoreDocSnippet(doc, terms),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    });

  const openclawDocs = scoredDocs
    .filter((entry) => entry.doc.source === "openclaw")
    .map((entry) => entry.doc);
  const openaiDocs = scoredDocs
    .filter((entry) => entry.doc.source === "openai")
    .map((entry) => entry.doc);

  const selected: KnowledgePackDoc[] = [];
  const preferredSourceQuota = Math.ceil(Math.min(limit, pack.docs.length) / 2);

  selected.push(...openclawDocs.slice(0, preferredSourceQuota));
  selected.push(...openaiDocs.slice(0, preferredSourceQuota));

  for (const entry of scoredDocs) {
    if (selected.length >= Math.min(limit, pack.docs.length)) break;
    if (selected.includes(entry.doc)) continue;
    selected.push(entry.doc);
  }

  return selected;
}

function parsePositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getBudgetConfig(): BudgetConfig {
  return {
    maxTokensPerDay: parsePositiveIntEnv(
      "REDDIT_HELPER_MAX_TOKENS_PER_DAY",
      DEFAULT_MAX_TOKENS_PER_DAY,
    ),
    maxLlmCallsPerDay: parsePositiveIntEnv(
      "REDDIT_HELPER_MAX_LLM_CALLS_PER_DAY",
      DEFAULT_MAX_LLM_CALLS_PER_DAY,
    ),
    resetTimeZone:
      process.env.REDDIT_HELPER_BUDGET_RESET_TZ?.trim() ||
      DEFAULT_BUDGET_RESET_TZ,
  };
}

function resolveBudgetDate(
  at: Date,
  timeZone: string,
) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function normalizeServiceStateBudget(
  state: RedditHelperServiceState,
  config: BudgetConfig,
  now: Date = new Date(),
): RedditHelperServiceState {
  const nextBudgetDate = resolveBudgetDate(now, config.resetTimeZone);
  if (state.budgetDate === nextBudgetDate) {
    return {
      ...state,
      llmCallsToday: state.llmCallsToday ?? 0,
      tokensToday: state.tokensToday ?? 0,
      processedIds: state.processedIds ?? [],
    };
  }

  return {
    ...state,
    budgetDate: nextBudgetDate,
    llmCallsToday: 0,
    tokensToday: 0,
    budgetStatus: "ok",
    processedIds: state.processedIds ?? [],
  };
}

async function loadServiceState(path: string): Promise<RedditHelperServiceState> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as RedditHelperServiceState;
  } catch {
    return {};
  }
}

async function saveServiceState(
  path: string,
  state: RedditHelperServiceState,
) {
  await ensureDir(path);
  await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
}

async function checkBudget(
  serviceStatePath: string,
  config: BudgetConfig,
): Promise<BudgetGuardResult> {
  const state = normalizeServiceStateBudget(
    await loadServiceState(serviceStatePath),
    config,
  );

  if ((state.llmCallsToday ?? 0) >= config.maxLlmCallsPerDay) {
    const exhaustedState = {
      ...state,
      budgetStatus: "exhausted" as const,
      lastBudgetExceededAt: new Date().toISOString(),
    };
    await saveServiceState(serviceStatePath, exhaustedState);
    return {
      allowed: false,
      state: exhaustedState,
      reason: "daily llm call budget exhausted",
    };
  }

  if ((state.tokensToday ?? 0) >= config.maxTokensPerDay) {
    const exhaustedState = {
      ...state,
      budgetStatus: "exhausted" as const,
      lastBudgetExceededAt: new Date().toISOString(),
    };
    await saveServiceState(serviceStatePath, exhaustedState);
    return {
      allowed: false,
      state: exhaustedState,
      reason: "daily token budget exhausted",
    };
  }

  return { allowed: true, state };
}

async function recordBudgetUsage(
  serviceStatePath: string,
  config: BudgetConfig,
  tokenUsage: number,
) {
  const state = normalizeServiceStateBudget(
    await loadServiceState(serviceStatePath),
    config,
  );
  state.llmCallsToday = (state.llmCallsToday ?? 0) + 1;
  state.tokensToday = (state.tokensToday ?? 0) + Math.max(0, tokenUsage);
  state.budgetStatus =
    state.llmCallsToday >= config.maxLlmCallsPerDay ||
    state.tokensToday >= config.maxTokensPerDay
      ? "exhausted"
      : "ok";
  if (state.budgetStatus === "exhausted") {
    state.lastBudgetExceededAt = new Date().toISOString();
  }
  await saveServiceState(serviceStatePath, state);
}

function deriveDocTerms(docs: KnowledgePackDoc[]) {
  return Array.from(
    new Set(
      docs
        .flatMap((doc) =>
          `${doc.firstHeading ?? ""} ${doc.summary}`
            .split(/[^a-zA-Z0-9_-]+/)
            .map((term) => term.trim().toLowerCase()),
        )
        .filter((term) => term.length >= 4),
    ),
  );
}

function deriveDoctrineSignals(engagementOS: string) {
  const lower = engagementOS.toLowerCase();
  return {
    expectsQuestions:
      lower.includes("qualifying question") || lower.includes("ask"),
    expectsBrevity:
      lower.includes("5 sentence") ||
      lower.includes("4-5 sentence") ||
      lower.includes("no more than"),
    expectsAuthority:
      lower.includes("authoritative") || lower.includes("calm"),
    forbidsSolutioning:
      lower.includes("do not solve") ||
      lower.includes("don't solve") ||
      lower.includes("do not architect"),
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function scoreReplyQualityDeterministically(
  replyText: string,
  queue: RedditQueuePayload,
  docs: KnowledgePackDoc[],
  engagementOS: string,
): { score: number; reasoning: string } {
  const trimmed = replyText.trim();
  if (!trimmed) {
    return { score: 0.1, reasoning: "empty reply" };
  }

  const sentences = trimmed
    .split(SENTENCE_SPLIT_REGEX)
    .map((part) => part.trim())
    .filter(Boolean);
  const sentenceCount = sentences.length;
  const questionCount = (trimmed.match(/\?/g) ?? []).length;
  const doctrine = deriveDoctrineSignals(engagementOS);
  const queueTerms = buildQueueTerms(queue);
  const docTerms = deriveDocTerms(docs);
  const allContextTerms = new Set([...queueTerms, ...docTerms]);
  const matchedContextTerms = [...allContextTerms].filter((term) =>
    trimmed.toLowerCase().includes(term),
  );

  let score = 0.5;
  const reasons: string[] = [];

  if (sentenceCount >= 3 && sentenceCount <= 5) {
    score += 0.2;
    reasons.push("good structure");
  } else {
    score -= 0.12;
    reasons.push("structure drift");
  }

  if (questionCount >= 1) {
    score += 0.18;
    reasons.push("asks qualifying question");
  } else if (doctrine.expectsQuestions) {
    score -= 0.2;
    reasons.push("missing qualifying question");
  }

  if (CTA_REGEX.test(trimmed)) {
    score += 0.12;
    reasons.push("clear CTA");
  } else {
    score -= 0.08;
    reasons.push("weak CTA");
  }

  if (matchedContextTerms.length > 0) {
    score += Math.min(0.15, matchedContextTerms.length * 0.03);
    reasons.push("uses local context");
  } else {
    score -= 0.08;
    reasons.push("thin local context");
  }

  const solutioningHits = BANNED_SOLUTIONING_REGEXES.filter((pattern) =>
    pattern.test(trimmed),
  ).length;
  if (solutioningHits > 0 || (doctrine.forbidsSolutioning && sentenceCount > 5)) {
    score -= 0.18 + solutioningHits * 0.04;
    reasons.push("premature solutioning");
  }

  if (
    doctrine.expectsAuthority &&
    /\b(glad to help|super excited|absolutely!|definitely!)\b/i.test(trimmed)
  ) {
    score -= 0.08;
    reasons.push("tone too eager");
  }

  if (doctrine.expectsBrevity && sentenceCount > 5) {
    score -= 0.1;
    reasons.push("too long");
  }

  return {
    score: clampScore(score),
    reasoning: reasons.join("; "),
  };
}

export function buildDeterministicDraft(
  queue: RedditQueuePayload,
  docs: KnowledgePackDoc[],
): string {
  const primaryDoc = docs[0];
  const secondaryDoc = docs[1];
  const primaryContext =
    primaryDoc?.firstHeading ?? primaryDoc?.path ?? queue.pillar ?? "scope";
  const secondaryContext =
    secondaryDoc?.firstHeading ?? secondaryDoc?.path ?? queue.matchedKeywords?.[0];

  const lines = [
    `Good question. The main risk usually sits in ${primaryContext}.`,
    secondaryContext
      ? `The first thing I would clarify is how ${secondaryContext} shows up in your setup.`
      : "The first thing I would clarify is where the friction shows up in your setup.",
    "Is this live or pre-launch, and what do you control right now (repo, hosting, DNS)?",
    "Share that plus the exact blocker and I can narrow the cleanest path without guessing.",
  ];

  return lines.join(" ");
}

function buildLLMPrompt(
  queue: RedditQueuePayload,
  docs: KnowledgePackDoc[],
  engagementOS: string,
  deterministicDraft: string,
): { system: string; user: string } {
  const sourceCounts = docs.reduce(
    (counts, doc) => {
      counts[doc.source] += 1;
      return counts;
    },
    { openclaw: 0, openai: 0 },
  );
  const contextBlock = docs.length > 0
    ? `\n\nContext from your work (${sourceCounts.openclaw} OpenClaw docs, ${sourceCounts.openai} OpenAI Cookbook docs):\n${docs
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

Candidate draft built from local doctrine and docs:
${deterministicDraft}

Polish that draft following the doctrine. Remember:
- No more than 5 sentences
- Ask 1-2 qualifying questions
- Do not solve or architect yet
- Show your authority, not your solutions
- Preserve any specific local-context references that are already useful`;

  return {
    system: `You are a senior engineer drafting Reddit replies to potential clients. Follow this doctrine:\n\n${engagementOS}\n\nGenerate YOUR response to the post above.`,
    user: userMessage,
  };
}

function isProviderBackoffError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: number }).status;
  return status === 429 || (status !== undefined && status >= 500);
}

async function draftReplyWithLLM(
  queue: RedditQueuePayload,
  docs: KnowledgePackDoc[],
  engagementOS: string,
  config: AgentConfig,
  deterministicDraft: string,
): Promise<{ replyText: string; usedLlm: boolean; reasoning: string }> {
  const budgetConfig = getBudgetConfig();
  try {
    const budgetGuard = await checkBudget(config.serviceStatePath, budgetConfig);
    if (!budgetGuard.allowed) {
      await telemetry.warn("llm.budget_exhausted", {
        reason: budgetGuard.reason,
        llmCallsToday: budgetGuard.state.llmCallsToday ?? 0,
        tokensToday: budgetGuard.state.tokensToday ?? 0,
      });
      return {
        replyText: deterministicDraft,
        usedLlm: false,
        reasoning: budgetGuard.reason ?? "budget exhausted",
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not set in environment");
    }

    const OpenAI = await getOpenAIConstructor();
    const client = new OpenAI({ apiKey });
    const { system, user } = buildLLMPrompt(
      queue,
      docs,
      engagementOS,
      deterministicDraft,
    );

    const response = await client.chat.completions.create({
      model: config.openaiModel || "gpt-4",
      max_tokens: config.openaiMaxTokens || 300,
      temperature: config.openaiTemperature ?? 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const replyText =
      response.choices[0]?.message?.content?.trim() || deterministicDraft;
    await recordBudgetUsage(
      config.serviceStatePath,
      budgetConfig,
      response.usage?.total_tokens || 0,
    );

    await telemetry.info("llm.draft_success", {
      queueId: queue.id,
      subreddit: queue.subreddit,
      tokenUsage: response.usage?.total_tokens || 0,
    });

    return { replyText, usedLlm: true, reasoning: "draft polished with local-context-guided LLM pass" };
  } catch (error) {
    await telemetry.error("llm.draft_failed", {
      queueId: queue.id,
      message: (error as Error).message,
      retryable: isProviderBackoffError(error),
    });
    return {
      replyText: deterministicDraft,
      usedLlm: false,
      reasoning: isProviderBackoffError(error)
        ? "provider unavailable or rate limited; using deterministic draft"
        : "LLM failed, using deterministic draft",
    };
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
  const docSnippets = pack ? pickDocSnippets(pack, queue) : [];
  const deterministicDraft = buildDeterministicDraft(queue, docSnippets);

  // Draft reply with local-context-first hybrid policy.
  const { replyText, usedLlm, reasoning: draftReasoning } = await draftReplyWithLLM(
    queue,
    docSnippets,
    engagementOS,
    config,
    deterministicDraft,
  );
  const { score: qualityScore, reasoning: qualityReasoning } =
    scoreReplyQualityDeterministically(replyText, queue, docSnippets, engagementOS);

  // Get RSS score from queue (initial relevance score from RSS_SWEEP)
  const rssScore = queue.score ?? 0.65;

  const weights = { rss: 0.4, llm: 0.6 };
  const finalConfidence = rssScore * weights.rss + qualityScore * weights.llm;

  const confidenceBreakdown: ConfidenceBreakdown = {
    rssScore,
    llmScore: qualityScore,
    weights,
    final: finalConfidence,
  };

  const draftRecord = {
    stage: usedLlm ? "agent-hybrid-polished" : "agent-local-fallback",
    queueId: queue.id,
    subreddit: queue.subreddit,
    replyText,
    confidence: finalConfidence,
    rssScore,
    qualityScore,
    llmUsed: usedLlm,
    confidenceBreakdown,
    reasoning: `${draftReasoning}; ${qualityReasoning}`,
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
    qualityScore,
    confidenceBreakdown,
    ctaVariant: queue.ctaVariant ?? draft?.ctaVariant,
    devvitPayloadPath,
    packId: pack?.id,
    packPath,
    reasoning: `${draftReasoning}; ${qualityReasoning}`,
    draftMode: usedLlm ? "hybrid-polished" : "local-only",
  };
}

async function main() {
  if (
    process.env.ALLOW_ORCHESTRATOR_TASK_RUN !== "true" &&
    process.env.ALLOW_DIRECT_TASK_RUN !== "true"
  ) {
    throw new Error(
      "Direct task execution is disabled. Use the orchestrator spawn path or set ALLOW_DIRECT_TASK_RUN=true for a reviewed manual run."
    );
  }

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

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch(async (error) => {
    await telemetry.error("task.failed", { message: (error as Error).message });
    process.exit(1);
  });
}
