import { readFile } from "node:fs/promises";
import { Telemetry } from "../../shared/telemetry.js";

interface RedditResponseTask {
  queueId: string;
  subreddit: string;
  question: string;
  link?: string;
  draft?: string;
}

const telemetry = new Telemetry({ component: "reddit-helper" });

async function craftReply(task: RedditResponseTask) {
  await telemetry.info("reply.start", { queueId: task.queueId, subreddit: task.subreddit });
  const body =
    task.draft ??
    `Hi! Pulling the latest OpenClaw docs now. Here's what you need to know about ${task.question.split(" ").slice(0, 8).join(" ")}...`;
  await telemetry.info("reply.generated", { queueId: task.queueId });
  return { body, confidence: 0.84 };
}

async function run() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    throw new Error("Usage: tsx src/index.ts <payload.json>");
  }
  const raw = await readFile(payloadPath, "utf-8");
  const task = JSON.parse(raw) as RedditResponseTask;
  const reply = await craftReply(task);
  await telemetry.info("reply.success", {
    queueId: task.queueId,
    confidence: reply.confidence,
    link: task.link,
  });
}

run().catch(async (error) => {
  await telemetry.error("reply.failed", { message: (error as Error).message });
  process.exit(1);
});
