#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/openclaw/openclaw.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$SCRIPT_DIR/openclaw-docs"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$DOCS_DIR"

echo "[sync_openclaw_docs] Fetching docs from $REPO_URL"
git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMP_DIR/openclaw" >/dev/null 2>&1
pushd "$TMP_DIR/openclaw" >/dev/null
# Limit checkout to docs directory only
git sparse-checkout set docs >/dev/null 2>&1
popd >/dev/null

rsync -a --delete "$TMP_DIR/openclaw/docs/" "$DOCS_DIR/"

echo "[sync_openclaw_docs] Docs synced to $DOCS_DIR"