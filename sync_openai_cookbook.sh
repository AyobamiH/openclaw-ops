#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/openai/openai-cookbook.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COOKBOOK_DIR="$SCRIPT_DIR/openai-cookbook"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$COOKBOOK_DIR"

echo "[sync_openai_cookbook] Fetching cookbook from $REPO_URL"
git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMP_DIR/cookbook" >/dev/null 2>&1
pushd "$TMP_DIR/cookbook" >/dev/null
git sparse-checkout set \
  examples \
  articles \
  images >/dev/null 2>&1
popd >/dev/null

rsync -a --delete --exclude='.git' "$TMP_DIR/cookbook/" "$COOKBOOK_DIR/"

FILE_COUNT=$(find "$COOKBOOK_DIR" -type f | wc -l)
echo "[sync_openai_cookbook] ✅ Cookbook synced to $COOKBOOK_DIR ($FILE_COUNT files)"
