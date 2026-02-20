import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const manualQueuePath = resolve("/home/oneclickwebsitedesignfactory/.openclaw/workspace/logs/manual-post-queue.jsonl");

try {
  const raw = await readFile(manualQueuePath, "utf-8");
  const items = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (!items.length) {
    console.log("Manual post queue is empty.");
    process.exit(0);
  }

  for (const item of items) {
    console.log(`\nSubreddit: r/${item.subreddit}`);
    console.log(`Post: ${item.link}`);
    console.log(`Reply:\n${item.replyText}`);
  }
} catch {
  console.log("Manual post queue is empty.");
}
