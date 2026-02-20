export interface OrchestratorConfig {
  docsPath: string;
  logsDir: string;
  stateFile: string;
  deployBaseDir?: string;
  rssConfigPath?: string;
  redditDraftsPath?: string;
  knowledgePackDir?: string;
  notes?: string;
}

export interface DocRecord {
  path: string;
  content: string;
  lastModified: number;
}

export interface Task {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface TaskRecord {
  id: string;
  type: string;
  handledAt: string;
  result: "ok" | "error";
  message?: string;
}

export interface DriftRepairRecord {
  runId: string;
  requestedBy: string;
  processedPaths: string[];
  generatedPackIds: string[];
  packPaths?: string[];
  docsProcessed?: number;
  updatedAgents: string[];
  durationMs: number;
  completedAt: string;
  notes?: string;
}

export interface RedditQueueItem {
  id: string;
  subreddit: string;
  question: string;
  link?: string;
  queuedAt: string;
  tag?: string;
  pillar?: string;
  feedId?: string;
  entryContent?: string;
  author?: string;
  ctaVariant?: string;
  matchedKeywords?: string[];
  score?: number;
  draftRecordId?: string;
  suggestedReply?: string;
}

export interface RedditReplyRecord {
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

export interface AgentDeploymentRecord {
  deploymentId: string;
  agentName: string;
  template: string;
  repoPath: string;
  config: Record<string, unknown>;
  status: "planned" | "deploying" | "deployed" | "retired";
  deployedAt: string;
  notes?: string;
}

export interface RssDraftRecord {
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

export interface OrchestratorState {
  lastStartedAt: string | null;
  updatedAt: string | null;
  indexedDocs: number;
  docIndexVersion: number;
  pendingDocChanges: string[];
  taskHistory: TaskRecord[];
  driftRepairs: DriftRepairRecord[];
  redditQueue: RedditQueueItem[];
  redditResponses: RedditReplyRecord[];
  agentDeployments: AgentDeploymentRecord[];
  rssDrafts: RssDraftRecord[];
  rssSeenIds: string[];
  lastDriftRepairAt: string | null;
  lastRedditResponseAt: string | null;
  lastAgentDeployAt: string | null;
  lastRssSweepAt: string | null;
}

export interface TaskHandlerContext {
  config: OrchestratorConfig;
  state: OrchestratorState;
  saveState: () => Promise<void>;
  logger: Console;
}

export type TaskHandler = (task: Task, context: TaskHandlerContext) => Promise<string | void>;
