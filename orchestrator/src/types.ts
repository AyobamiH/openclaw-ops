export interface OrchestratorConfig {
  docsPath: string;
  logsDir: string;
  stateFile: string;
  deployBaseDir?: string;
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
  lastDriftRepairAt: string | null;
  lastRedditResponseAt: string | null;
  lastAgentDeployAt: string | null;
}

export interface TaskHandlerContext {
  config: OrchestratorConfig;
  state: OrchestratorState;
  saveState: () => Promise<void>;
  logger: Console;
}

export type TaskHandler = (task: Task, context: TaskHandlerContext) => Promise<string | void>;
