#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AUDIT_DIR="$REPO_ROOT/logs/audits/context-anchor"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_PATH="$AUDIT_DIR/context-anchor-recon-$STAMP.txt"
LATEST_PATH="$AUDIT_DIR/LATEST.txt"
# Canonical anchor lives one level above the repo root (in .openclaw/)
CANONICAL_ANCHOR="$(cd "$REPO_ROOT/.." && pwd)/OPENCLAW_CONTEXT_ANCHOR.md"

# In CI or read-only environments, fall back to a temp dir for the report
if ! mkdir -p "$AUDIT_DIR" 2>/dev/null; then
  AUDIT_DIR="$(mktemp -d)"
  REPORT_PATH="$AUDIT_DIR/context-anchor-recon-$STAMP.txt"
  LATEST_PATH="$AUDIT_DIR/LATEST.txt"
fi

run_cmd() {
  local cmd="$1"
  echo "\$ $cmd" >> "$REPORT_PATH"
  if ! bash -lc "$cmd" >> "$REPORT_PATH" 2>&1; then
    echo "[WARN] command failed (non-fatal): $cmd" >> "$REPORT_PATH"
  fi
  echo >> "$REPORT_PATH"
}

echo "OpenClaw Context Anchor Recon Report" > "$REPORT_PATH"
echo "GeneratedAt: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$REPORT_PATH"
echo "RepoRoot: $REPO_ROOT" >> "$REPORT_PATH"
echo >> "$REPORT_PATH"

cd "$REPO_ROOT"

echo "STEP 0: anchors" >> "$REPORT_PATH"
echo >> "$REPORT_PATH"
run_cmd 'find . -name "OPENCLAW_CONTEXT_ANCHOR.md" -print'
run_cmd 'for f in ./OPENCLAW_CONTEXT_ANCHOR.md; do
  [ -f "$f" ] || continue
  echo "== $f =="; sha256sum "$f" | awk '\''{print $1}'\'' | cut -c1-16
  echo "-- headings --"; grep -nE '\''^(#|##) '\'' "$f" || true; echo
done'

echo "STEP 1: directory inventory" >> "$REPORT_PATH"
echo >> "$REPORT_PATH"
run_cmd 'echo "== ROOT DIRS =="; find . -maxdepth 1 -mindepth 1 -type d | sed '\''s#^\./##'\'' | sort'
run_cmd 'echo "== REPO DIRS =="; find . -maxdepth 1 -mindepth 1 -type d | sed '\''s#^\./##'\'' | sort'

echo "STEP 2: evidence scans" >> "$REPORT_PATH"
echo >> "$REPORT_PATH"
run_cmd 'cat orchestrator_config.json'
run_cmd 'ls -1 systemd'
run_cmd 'grep -nE '\''WorkingDirectory=|ExecStart=|Environment='\'' systemd/*.service'
run_cmd 'ls -1 .github/workflows'
run_cmd 'grep -nE '\''^(on:|\s*schedule:|\s*workflow_dispatch:|\s*push:|\s*pull_request:) '\'' .github/workflows/*.yml'
run_cmd 'ls -l cron/jobs.json && sed -n '\''1,220p'\'' cron/jobs.json'
run_cmd 'ls -l openclaw.json && sed -n '\''1,220p'\'' openclaw.json'

echo "STEP 3: path usage in code/config" >> "$REPORT_PATH"
echo >> "$REPORT_PATH"
run_cmd 'grep -RInE '\''docsPath|cookbookPath|logsDir|stateFile|knowledgePackDir|redditDraftsPath|rssConfigPath|digestDir|indexRoots|findLatestKnowledgePack|orchestratorStatePath|serviceStatePath'\'' \
  orchestrator/src agents/*/src agents/*/agent.config.json | sed -n '\''1,260p'\'''

echo "STEP 4: existence checks for anchor referenced paths" >> "$REPORT_PATH"
echo >> "$REPORT_PATH"
for p in \
  systemd/orchestrator.service \
  systemd/doc-specialist.service \
  systemd/reddit-helper.service \
  sync_docs_sources.sh \
  sync_openclaw_docs.sh \
  sync_openai_cookbook.sh \
  orchestrator_config.json \
  orchestrator/src/index.ts \
  orchestrator/src/taskHandlers.ts \
  docs/GOVERNANCE_REPO_HYGIENE.md \
  orchestrator_state.json \
  logs/knowledge-packs \
  logs/reddit-drafts.jsonl \
  logs/devvit-submissions.jsonl \
  rss_filter_config.json \
  logs/digests \
  openclaw.json \
  memory/main.sqlite \
  .openclaw/memory/main.sqlite; do
  if [ -e "$p" ]; then
    echo "EXISTS $p" >> "$REPORT_PATH"
  else
    echo "MISSING $p" >> "$REPORT_PATH"
  fi
done
echo >> "$REPORT_PATH"

echo "STEP 5: MISMATCH HINTS for OPENCLAW_CONTEXT_ANCHOR" >> "$REPORT_PATH"
echo >> "$REPORT_PATH"
if [ -f "$CANONICAL_ANCHOR" ]; then
  echo "Anchor path scan (missing paths only):" >> "$REPORT_PATH"
  grep -oE '`[^`]+`' "$CANONICAL_ANCHOR" \
    | tr -d '`' \
    | grep -E '/' \
    | sort -u \
    | while IFS= read -r path; do
        [ -n "$path" ] || continue
        if [ ! -e "$path" ]; then
          echo "ANCHOR_PATH_MISSING $path" >> "$REPORT_PATH"
        fi
      done
  echo >> "$REPORT_PATH"
fi

if [ -e "memory/main.sqlite" ] && [ ! -e ".openclaw/memory/main.sqlite" ]; then
  echo "HINT: memory sqlite path exists at memory/main.sqlite but .openclaw/memory/main.sqlite is missing" >> "$REPORT_PATH"
fi

if [ -e "openclaw.json" ] && [ ! -e ".openclaw/openclaw.json" ]; then
  echo "HINT: openclaw.json exists (and .openclaw/openclaw.json is missing)" >> "$REPORT_PATH"
fi

if grep -q '"digestDir"' orchestrator_config.json && [ ! -e "logs/digests" ]; then
  echo "HINT: digestDir is configured but logs/digests may be missing until first write" >> "$REPORT_PATH"
fi

if grep -RInq 'workspace/node_modules/tsx' systemd/*.service; then
  echo "HINT: systemd ExecStart uses tsx under workspace/node_modules (dependency surface)" >> "$REPORT_PATH"
fi

echo "$REPORT_PATH" > "$LATEST_PATH"

echo "REPORT_PATH=$REPORT_PATH"
echo "code -r \"$REPORT_PATH\""
