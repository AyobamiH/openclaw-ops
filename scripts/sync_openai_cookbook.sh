#!/bin/bash

# Sync OpenAI cookbook from GitHub
# Pattern: git sparse checkout + rsync (same as sync_openclaw_docs.sh)

set -e

WORKSPACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMP_DIR="/tmp/openai-cookbook-sync-$$"
TARGET_DIR="$WORKSPACE_DIR/openai-cookbook"

echo "📚 Syncing OpenAI Cookbook..."
echo "  Workspace: $WORKSPACE_DIR"
echo "  Target: $TARGET_DIR"

# Clone with sparse checkout
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

git clone --sparse https://github.com/openai/openai-cookbook.git . 2>&1 | tail -5
git sparse-checkout set examples/ >/dev/null 2>&1

# Sync to workspace (using rsync to preserve timestamps and permissions)
mkdir -p "$TARGET_DIR"
rsync -a --delete examples/ "$TARGET_DIR/" >/dev/null 2>&1

# Cleanup
rm -rf "$TEMP_DIR"

# Report
file_count=$(find "$TARGET_DIR" -type f | wc -l)
echo "✅ Sync complete: $file_count files in $TARGET_DIR"
