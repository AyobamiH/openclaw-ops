import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const DEFAULT_CONFIG_URL = new URL("../../orchestrator_config.json", import.meta.url);
export async function loadConfig(customPath) {
    const path = customPath ??
        process.env.ORCHESTRATOR_CONFIG ??
        fileURLToPath(DEFAULT_CONFIG_URL);
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    // Allow env-var overrides for local dev (config bakes in Docker paths)
    if (process.env.STATE_FILE)
        parsed.stateFile = process.env.STATE_FILE;
    if (process.env.MILESTONE_FEED_PATH)
        parsed.milestoneFeedPath = process.env.MILESTONE_FEED_PATH;
    if (process.env.DEMAND_SUMMARY_INGEST_URL) {
        parsed.demandSummaryIngestUrl = process.env.DEMAND_SUMMARY_INGEST_URL;
    }
    if (!parsed.docsPath) {
        throw new Error("orchestrator_config.json is missing docsPath");
    }
    if (!parsed.logsDir) {
        throw new Error("orchestrator_config.json is missing logsDir");
    }
    if (!parsed.stateFile) {
        throw new Error("orchestrator_config.json is missing stateFile");
    }
    return parsed;
}
