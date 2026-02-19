import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const DEFAULT_CONFIG_URL = new URL("../../orchestrator_config.json", import.meta.url);
export async function loadConfig(customPath) {
    const path = customPath ?? process.env.ORCHESTRATOR_CONFIG ?? fileURLToPath(DEFAULT_CONFIG_URL);
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
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
