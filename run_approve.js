import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const approvalsPath = resolve("/home/oneclickwebsitedesignfactory/.openclaw/workspace/logs/draft-approvals.json");
const digestStatePath = resolve("/home/oneclickwebsitedesignfactory/.openclaw/workspace/logs/draft-digest-state.json");
const draftsPath = resolve("/home/oneclickwebsitedesignfactory/.openclaw/workspace/logs/reddit-drafts.jsonl");
const manualQueuePath = resolve("/home/oneclickwebsitedesignfactory/.openclaw/workspace/logs/manual-post-queue.jsonl");

async function loadJson(path, fallback) {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function loadDrafts() {
  try {
    const raw = await readFile(draftsPath, "utf-8");
    return raw
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
  } catch {
    return [];
  }
}

function parseSelections(arg, max) {
  if (!arg) return [];
  if (arg.trim().toLowerCase() === "all") {
    return Array.from({ length: max }, (_, i) => i + 1);
  }
  return arg
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= max);
}

const selectionArg = process.argv.slice(2).join(" ");
const digestState = await loadJson(digestStatePath, { lastDigestItems: [] });
const items = digestState.lastDigestItems ?? [];

if (!items.length) {
  console.log("No digest items found to approve.");
  process.exit(0);
}

const selections = parseSelections(selectionArg, items.length);
if (!selections.length) {
  console.log("No valid approvals provided.");
  process.exit(1);
}

const approvals = await loadJson(approvalsPath, { approvedIds: [], updatedAt: null });
const approvedSet = new Set(approvals.approvedIds ?? []);
const drafts = await loadDrafts();

await mkdir(dirname(manualQueuePath), { recursive: true });

for (const index of selections) {
  const item = items[index - 1];
  if (!item) continue;
  if (approvedSet.has(item.id)) continue;

  const draft = drafts.find((d) => (d.queueId ?? d.draftId ?? d.id) === item.id);
  const payload = {
    id: item.id,
    subreddit: item.subreddit,
    link: item.link,
    replyText: draft?.replyText ?? item.replyText ?? "",
    approvedAt: new Date().toISOString(),
  };

  await appendFile(manualQueuePath, `${JSON.stringify(payload)}\n`, "utf-8");
  approvedSet.add(item.id);
}

approvals.approvedIds = Array.from(approvedSet);
approvals.updatedAt = new Date().toISOString();
await writeFile(approvalsPath, JSON.stringify(approvals, null, 2), "utf-8");

console.log(`Approved ${selections.length} item(s). Added to manual-post-queue.jsonl`);
