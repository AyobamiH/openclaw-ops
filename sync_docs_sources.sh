#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="text"

if [[ $# -gt 1 ]]; then
  echo "Usage: ./sync_docs_sources.sh [--mode=text|full]" >&2
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
      cat <<'EOF'
Usage: ./sync_docs_sources.sh [--mode=text|full]

Modes:
  text  Sync OpenClaw docs and a curated text/code/config OpenAI Cookbook mirror.
  full  Sync OpenClaw docs and the broader upstream OpenAI Cookbook mirror.
EOF
      exit 0
      ;;
    *)
      echo "[sync_docs_sources] unknown argument: $1" >&2
      exit 1
      ;;
  esac
fi

"$SCRIPT_DIR/sync_openclaw_docs.sh"
"$SCRIPT_DIR/sync_openai_cookbook.sh" "--mode=$MODE"

echo "[sync_docs_sources] ✅ OpenClaw docs + OpenAI cookbook sync complete (mode=$MODE)"
