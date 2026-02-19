import { loadConfig } from "./config.js";
import { DocIndexer } from "./docIndexer.js";
import { TaskQueue } from "./taskQueue.js";
import { loadState, saveState as persistState } from "./state.js";
import { resolveTaskHandler } from "./taskHandlers.js";
import { OrchestratorState, Task } from "./types.js";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const DOC_SYNC_INTERVAL_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
const REDDIT_SWEEP_INTERVAL_MS = 10 * 60_000;

async function bootstrap() {
  const config = await loadConfig();
  await mkdir(config.logsDir, { recursive: true });
  await mkdir(dirname(config.stateFile), { recursive: true });

  console.log("[orchestrator] config loaded", config);

  const indexer = new DocIndexer(config.docsPath);
  await indexer.buildInitialIndex();
  console.log(`[orchestrator] indexed ${indexer.getIndex().size} docs`);

  const state = await loadState(config.stateFile);
  state.indexedDocs = indexer.getIndex().size;
  state.docIndexVersion += 1;

  const flushState = async () => {
    await persistState(config.stateFile, state);
  };
  await flushState();

  const recordTaskResult = (task: Task, result: "ok" | "error", message?: string) => {
    state.taskHistory.push({
      id: task.id,
      type: task.type,
      handledAt: new Date().toISOString(),
      result,
      message,
    });
    if (state.taskHistory.length > 50) {
      state.taskHistory.shift();
    }
  };

  const queue = new TaskQueue();
  const handlerContext = {
    config,
    state,
    saveState: flushState,
    logger: console,
  };

  queue.onProcess(async (task) => {
    const handler = resolveTaskHandler(task);
    try {
      const message = await handler(task, handlerContext);
      recordTaskResult(task, "ok", typeof message === "string" ? message : undefined);
    } catch (error) {
      const err = error as Error;
      console.error(`[task] failed ${task.type}:`, err);
      recordTaskResult(task, "error", err.message);
    } finally {
      await flushState();
    }
  });

  indexer.watch((doc) => {
    queue.enqueue("doc-change", {
      path: doc.path,
      lastModified: doc.lastModified,
    });
  });

  setInterval(() => {
    if (state.pendingDocChanges.length > 0) {
      queue.enqueue("doc-sync", { reason: "interval" });
    }
  }, DOC_SYNC_INTERVAL_MS);

  setInterval(() => {
    queue.enqueue("heartbeat", { reason: "periodic" });
  }, HEARTBEAT_INTERVAL_MS);

  setInterval(() => {
    queue.enqueue("reddit-response", { reason: "reddit-queue-sweep", responder: "reddit-helper", postImmediately: false });
  }, REDDIT_SWEEP_INTERVAL_MS);

  queue.enqueue("startup", { reason: "orchestrator boot" });
}

bootstrap().catch((err) => {
  console.error("[orchestrator] fatal", err);
  process.exit(1);
});
