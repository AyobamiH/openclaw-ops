import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const draftsPath = resolve("/home/oneclickwebsitedesignfactory/.openclaw/workspace/logs/reddit-drafts.jsonl");
const approvalsPath = resolve("/home/oneclickwebsitedesignfactory/.openclaw/workspace/logs/draft-approvals.json");
const digestStatePath = resolve("/home/oneclickwebsitedesignfactory/.openclaw/workspace/logs/draft-digest-state.json");

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

const approvals = await loadJson(approvalsPath, { approvedIds: [], updatedAt: null });
const digestState = await loadJson(digestStatePath, { lastSentAt: null, lastSentIds: [], lastDigestItems: [] });
const approved = new Set(approvals.approvedIds ?? []);
const alreadySent = new Set(digestState.lastSentIds ?? []);

const drafts = await loadDrafts();
const unapproved = drafts.filter((draft) => {
  const id = draft.queueId ?? draft.draftId ?? draft.id;
  if (!id) return false;
  if (approved.has(id)) return false;
  if (alreadySent.has(id)) return false;
  return true;
});

if (unapproved.length < 4) {
  process.exit(0);
}

const digestItems = unapproved.slice(0, 10).map((draft, index) => {
  const id = draft.queueId ?? draft.draftId ?? draft.id;
  return {
    index: index + 1,
    id,
    subreddit: draft.subreddit ?? "unknown",
    link: draft.link ?? "",
    replyText: draft.replyText ?? draft.draftedResponse ?? draft.suggested_reply ?? "",
    tag: draft.tag ?? "draft",
  };
});

const lines = [
  `Auto‑digest: ${digestItems.length} unapproved drafts ready (showing up to 10).`,
  "Reply with: approve 1,3 (or approve all).",
  "",
];

for (const item of digestItems) {
  lines.push(
    `${item.index}) r/${item.subreddit} — ${item.tag}`,
    item.link,
    item.replyText,
    "",
  );
}

const output = lines.join("\n");
process.stdout.write(output);

digestState.lastSentAt = new Date().toISOString();
digestState.lastSentIds = [...(digestState.lastSentIds ?? []), ...digestItems.map((item) => item.id)];
digestState.lastDigestItems = digestItems;

await writeFile(digestStatePath, JSON.stringify(digestState, null, 2), "utf-8");
