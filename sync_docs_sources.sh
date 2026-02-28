#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/sync_openclaw_docs.sh"
"$SCRIPT_DIR/sync_openai_cookbook.sh"

echo "[sync_docs_sources] ✅ OpenClaw docs + OpenAI cookbook sync complete"
