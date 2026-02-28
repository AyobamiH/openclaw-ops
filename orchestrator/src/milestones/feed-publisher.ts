import { createHmac } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { MilestoneEvent } from './schema.js';

const execAsync = promisify(exec);

const MAX_FEED_ENTRIES = 50;

export type FeedEntry = {
  idempotencyKey: string;
  sentAtUtc: string;
  event: MilestoneEvent;
  signature: string;
};

export type MilestoneFeed = {
  lastUpdated: string;
  entries: FeedEntry[];
};

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj as object).sort()) {
      sorted[k] = sortObjectKeys((obj as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return obj;
}

function signEntry(entry: Omit<FeedEntry, 'signature'>, secret: string): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify(sortObjectKeys(entry)))
    .digest('hex');
}

/**
 * Appends a new milestone to the JSON feed file and optionally git-pushes it.
 * The feed file is always written; the git push only runs if:
 *   - milestoneFeedPath is set in config
 *   - A git remote named 'origin' exists in the workspace root
 *   - gitPushOnMilestone is true
 */
export async function publishToFeed(opts: {
  idempotencyKey: string;
  sentAtUtc: string;
  event: MilestoneEvent;
  feedPath: string;
  secret: string;
  gitPush: boolean;
  workspaceRoot: string;
}): Promise<void> {
  const { idempotencyKey, sentAtUtc, event, feedPath, secret, gitPush, workspaceRoot } = opts;

  const payload = { idempotencyKey, sentAtUtc, event };
  const signature = signEntry(payload, secret);
  const newEntry: FeedEntry = { idempotencyKey, sentAtUtc, event, signature };

  // Read existing feed or start fresh
  let feed: MilestoneFeed = { lastUpdated: sentAtUtc, entries: [] };
  try {
    const raw = await readFile(feedPath, 'utf-8');
    feed = JSON.parse(raw) as MilestoneFeed;
  } catch {
    // File doesn't exist yet — start fresh
  }

  // Deduplicate by idempotencyKey, append, cap at MAX_FEED_ENTRIES
  const exists = feed.entries.some((e) => e.idempotencyKey === idempotencyKey);
  if (!exists) {
    feed.entries.push(newEntry);
    if (feed.entries.length > MAX_FEED_ENTRIES) {
      feed.entries = feed.entries.slice(-MAX_FEED_ENTRIES);
    }
  }
  feed.lastUpdated = sentAtUtc;

  await mkdir(dirname(feedPath), { recursive: true });
  await writeFile(feedPath, JSON.stringify(feed, null, 2) + '\n', 'utf-8');

  if (gitPush) {
    await gitPushFeed(feedPath, workspaceRoot, idempotencyKey);
  }
}

async function gitPushFeed(
  feedPath: string,
  workspaceRoot: string,
  idempotencyKey: string,
): Promise<void> {
  try {
    // Verify git remote exists before attempting push
    const { stdout } = await execAsync('git remote get-url origin', { cwd: workspaceRoot });
    if (!stdout.trim()) return;

    await execAsync(`git add "${feedPath}"`, { cwd: workspaceRoot });

    // Check if there's actually a staged change
    const { stdout: diffStat } = await execAsync('git diff --cached --stat', { cwd: workspaceRoot });
    if (!diffStat.trim()) return; // Nothing to commit (already up to date)

    await execAsync(
      `git commit -m "milestone: publish feed [${idempotencyKey.slice(0, 8)}]"`,
      { cwd: workspaceRoot },
    );
    await execAsync('git push origin HEAD', { cwd: workspaceRoot });
    console.log('[milestones] feed pushed to git remote');
  } catch (err) {
    // Non-fatal — log and continue
    console.warn('[milestones] git push failed (non-fatal):', (err as Error).message);
  }
}
