#!/bin/bash
# Host-side script to git-push milestones-feed.json when it changes.
# Runs every 2 minutes via cron:
#   */2 * * * * /home/oneclickwebsitedesignfactory/.openclaw/workspace/orchestrator/scripts/push-feed.sh >> /tmp/push-feed.log 2>&1

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FEED_FILE="$REPO_DIR/data/milestones-feed.json"

cd "$REPO_DIR"

# Exit silently if feed file doesn't exist yet
[ -f "$FEED_FILE" ] || exit 0

# Check if there are uncommitted changes to the feed file
if git diff --quiet -- "$FEED_FILE" && git diff --cached --quiet -- "$FEED_FILE"; then
  exit 0
fi

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
git add "$FEED_FILE"
git commit -m "milestone: auto-push feed [$TIMESTAMP]"
git push origin HEAD
echo "[$TIMESTAMP] pushed milestones-feed.json"
