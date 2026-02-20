#!/usr/bin/env bash
set -euo pipefail

cd /home/oneclickwebsitedesignfactory/.openclaw/workspace

node --input-type=module <<'EOF'
import { loadConfig } from './orchestrator/dist/config.js';
import { loadState, saveState } from './orchestrator/dist/state.js';
import { resolveTaskHandler } from './orchestrator/dist/taskHandlers.js';
import { randomUUID } from 'node:crypto';

const config = await loadConfig();
const state = await loadState(config.stateFile);

const task = {
  id: randomUUID(),
  type: 'drift-repair',
  payload: { requestedBy: 'manual-validate', paths: ['start/getting-started.md'], targets: ['doc-doctor'] },
  createdAt: Date.now(),
};

const handler = resolveTaskHandler(task);
const ctx = { config, state, saveState: () => saveState(config.stateFile, state), logger: console };
const res = await handler(task, ctx);

await saveState(config.stateFile, state);
console.log('Drift result:', res);
EOF

echo "--- Latest knowledge packs ---"
ls -lt /home/oneclickwebsitedesignfactory/.openclaw/workspace/logs/knowledge-packs | head
