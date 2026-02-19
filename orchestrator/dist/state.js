import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
const HISTORY_LIMIT = 50;
const DRIFT_LOG_LIMIT = 25;
const REDDIT_RESPONSE_LIMIT = 100;
const AGENT_DEPLOYMENT_LIMIT = 50;
export async function loadState(path) {
    if (!existsSync(path)) {
        return createDefaultState();
    }
    const raw = await readFile(path, "utf-8");
    try {
        const parsed = JSON.parse(raw);
        return {
            ...createDefaultState(),
            ...parsed,
            taskHistory: parsed.taskHistory?.slice(-HISTORY_LIMIT) ?? [],
            pendingDocChanges: parsed.pendingDocChanges ?? [],
            driftRepairs: parsed.driftRepairs ?? [],
            redditQueue: parsed.redditQueue ?? [],
            redditResponses: parsed.redditResponses ?? [],
            agentDeployments: parsed.agentDeployments ?? [],
        };
    }
    catch (error) {
        console.warn(`[state] Failed to parse state file, starting fresh: ${error.message}`);
        return createDefaultState();
    }
}
export async function saveState(path, state) {
    await mkdir(dirname(path), { recursive: true });
    const prepared = {
        ...state,
        taskHistory: state.taskHistory.slice(-HISTORY_LIMIT),
        pendingDocChanges: state.pendingDocChanges.slice(0, 200),
        driftRepairs: state.driftRepairs.slice(-DRIFT_LOG_LIMIT),
        redditResponses: state.redditResponses.slice(-REDDIT_RESPONSE_LIMIT),
        agentDeployments: state.agentDeployments.slice(-AGENT_DEPLOYMENT_LIMIT),
        updatedAt: new Date().toISOString(),
    };
    await writeFile(path, JSON.stringify(prepared, null, 2), "utf-8");
}
export function createDefaultState() {
    return {
        lastStartedAt: null,
        updatedAt: null,
        indexedDocs: 0,
        docIndexVersion: 0,
        pendingDocChanges: [],
        taskHistory: [],
        driftRepairs: [],
        redditQueue: [],
        redditResponses: [],
        agentDeployments: [],
        lastDriftRepairAt: null,
        lastRedditResponseAt: null,
        lastAgentDeployAt: null,
    };
}
