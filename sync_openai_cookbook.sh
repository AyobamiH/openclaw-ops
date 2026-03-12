#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/openai/openai-cookbook.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COOKBOOK_DIR="$SCRIPT_DIR/openai-cookbook"
TMP_DIR="$(mktemp -d)"
MODE="text"

usage() {
  cat <<'EOF'
Usage: ./sync_openai_cookbook.sh [--mode=text|full]

Modes:
  text  Sync a curated text/code/config mirror for runtime knowledge use.
  full  Sync the broader upstream mirror, including images and notebooks.
EOF
}

if [[ $# -gt 1 ]]; then
  usage
  exit 1
fi

if [[ $# -eq 1 ]]; then
  case "$1" in
    --mode=text)
      MODE="text"
      ;;
    --mode=full)
      MODE="full"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[sync_openai_cookbook] unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
fi

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$COOKBOOK_DIR"

echo "[sync_openai_cookbook] Fetching cookbook from $REPO_URL (mode=$MODE)"
git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TMP_DIR/cookbook" >/dev/null 2>&1
pushd "$TMP_DIR/cookbook" >/dev/null
if [[ "$MODE" == "full" ]]; then
  git sparse-checkout set \
    examples \
    articles \
    images \
    README.md \
    LICENSE \
    CONTRIBUTING.md \
    AGENTS.md \
    registry.yaml \
    authors.yaml >/dev/null 2>&1
else
  git sparse-checkout set \
    examples \
    articles \
    README.md \
    LICENSE \
    CONTRIBUTING.md \
    AGENTS.md \
    registry.yaml \
    authors.yaml >/dev/null 2>&1
fi
popd >/dev/null

if [[ "$MODE" == "full" ]]; then
  rsync -a --delete --exclude='.git' "$TMP_DIR/cookbook/" "$COOKBOOK_DIR/"
else
  rsync -a --delete --prune-empty-dirs \
    --exclude='.git' \
    --exclude='*/data/***' \
    --exclude='*/datasets/***' \
    --exclude='*/images/***' \
    --exclude='*/image/***' \
    --exclude='*/input_images/***' \
    --exclude='*/output_images/***' \
    --exclude='*/outputs/***' \
    --exclude='*/results/***' \
    --exclude='*/results_*/***' \
    --include='*/' \
    --include='README.md' \
    --include='LICENSE' \
    --include='CONTRIBUTING.md' \
    --include='AGENTS.md' \
    --include='registry.yaml' \
    --include='authors.yaml' \
    --include='.funcignore' \
    --include='.gitignore' \
    --include='Dockerfile' \
    --include='dockerfile' \
    --include='Makefile' \
    --include='makefile' \
    --include='Justfile' \
    --include='justfile' \
    --include='Procfile' \
    --include='procfile' \
    --include='requirements*.txt' \
    --include='*.md' \
    --include='*.mdx' \
    --include='*.txt' \
    --include='*.json' \
    --include='*.yaml' \
    --include='*.yml' \
    --include='*.py' \
    --include='*.js' \
    --include='*.cjs' \
    --include='*.mjs' \
    --include='*.ts' \
    --include='*.tsx' \
    --include='*.html' \
    --include='*.css' \
    --include='*.scss' \
    --include='*.toml' \
    --include='*.ini' \
    --include='*.cfg' \
    --include='*.conf' \
    --include='*.sh' \
    --include='*.sql' \
    --exclude='*' \
    "$TMP_DIR/cookbook/" "$COOKBOOK_DIR/"
fi

FILE_COUNT=$(find "$COOKBOOK_DIR" -type f | wc -l)
SIZE=$(du -sh "$COOKBOOK_DIR" | awk '{print $1}')
echo "[sync_openai_cookbook] ✅ Cookbook synced to $COOKBOOK_DIR ($FILE_COUNT files, $SIZE, mode=$MODE)"
