# Orchestrator Documentation

## 1. Overview
The Orchestrator serves as the control center for managing OpenClaw agents, ensuring configurations are maintained, and facilitating the deployment of new agents.

## 2. Key Features
- **Configuration Management**: Maintains the state of configurations and documents.
- **Agent Deployment**: Creates and deploys new agents based on requirements.
- **Drift Repair**: Monitors for configuration drift and applies necessary repairs after updates.
- **Task Scheduling**: Coordinates and schedules agent tasks to ensure efficient operation.

## 3. Installation
### Prerequisites
Ensure you have Node.js and npm installed on your machine.

### Installation Steps
```bash
# Example installation commands
mkdir -p ~/openclaw-docs
rsync -av /path/to/openclaw/docs/ ~/openclaw-docs/
```

### Local Documentation Sync
The Orchestrator only needs the documentation set stored in `openclaw-docs/`. Keep this directory in sync with <https://docs.openclaw.ai> by periodically updating it (for example, via `rsync` or by downloading the docs bundle). This avoids cloning the entire repository while still giving the Orchestrator the Single Source of Truth it requires.

## 4. Configuration
- **Configuration File**: The Orchestrator reads `/home/oneclickwebsitedesignfactory/.openclaw/workspace/orchestrator_config.json`. The `docsPath` entry is already pointed at `/home/oneclickwebsitedesignfactory/.openclaw/workspace/openclaw-docs`; update other fields (logsDir, stateFile, deployBaseDir, rssConfigPath, redditDraftsPath, etc.) as needed for your deployment.
- **Environment Variables**:
  - `ORCHESTRATOR_CONFIG`: override the config file path if you need to run the Orchestrator from a different working directory.

## 5. Usage
### Install dependencies and build
```bash
cd orchestrator
npm install
npm run build
```

### Start the runtime
```bash
npm start        # runs the compiled orchestrator from dist/
# or
npm run dev      # runs via tsx with live TypeScript sources
```

The runtime watches the docs mirror, enqueues tasks, and persists state to the configured `stateFile`.

## 6. Runtime Behavior
- **Document indexer**: Builds an in-memory index of every file under `docsPath` and watches for changes using `chokidar`-style semantics.
- **Task queue**: Uses a lightweight `p-queue` wrapper so that every event is turned into a `Task` object with an ID, payload, and processing metadata.
- **State persistence**: `stateFile` is updated after every task so the Orchestrator can resume with historical context (pending doc changes, task history, doc index version, etc.).
- **Intervals**:
  - Every minute the runtime enqueues a `doc-sync` task if there are pending doc changes.
  - Every 10 minutes the runtime enqueues a `reddit-response` sweep.
  - Every 15 minutes the runtime enqueues an `rss-sweep` task to draft replies.
  - Every five minutes a `heartbeat` task is enqueued so downstream tooling can verify liveness.

### Task types
| Task type    | Description |
|--------------|-------------|
| `startup`    | Marks the current boot cycle and records the start timestamp. |
| `doc-change` | Fired by the doc watcher; queues the changed path so a later sync can reconcile it. |
| `doc-sync`   | Flushes the pending doc-change buffer (either after 25 events or on the interval). |
| `rss-sweep`  | Pulls RSS feeds, filters posts by niche keywords, and drafts replies to `logs/reddit-drafts.jsonl`. |
| `heartbeat`  | Periodic keep-alive used for monitoring. |

Task handlers live in `src/taskHandlers.ts` and can be extended as new workflows (agent deployment, drift repair, Reddit helper, etc.) come online.

## 7. State file layout
`stateFile` is JSON with the following fields:
- `lastStartedAt` / `updatedAt`: ISO timestamps for the most recent boot and write.
- `indexedDocs`: Count of docs seen during the latest index build.
- `docIndexVersion`: Incremented every boot so downstream consumers can detect refreshes.
- `pendingDocChanges`: Up to 200 doc paths waiting on the next `doc-sync` run.
- `taskHistory`: Rolling window (50 entries) of recently processed tasks, including success/error status.

## 8. Troubleshooting
Common issues and their solutions, such as:
- If the agents don't deploy: Check the logs for errors in the configuration.

## 9. FAQ
- **What does drift repair do?**
- **How can I customize agent tasks?**

## 10. Contribution
Guidelines for contributing to the Orchestrator’s development.

## 11. License
Information on the licensing of the Orchestrator and its codebase.

## 12. Documentation Sync Automation
- **Sync Script**: `sync_openclaw_docs.sh` (workspace root) performs a sparse clone of the official OpenClaw repository and mirrors only the `docs/` subtree into `openclaw-docs/`.
- **Cron Job**: The following entry (installed via `crontab`) runs the sync every six hours and captures logs:
  ```
  0 */6 * * * /home/oneclickwebsitedesignfactory/.openclaw/workspace/sync_openclaw_docs.sh >> /home/oneclickwebsitedesignfactory/.openclaw/workspace/logs/sync_openclaw_docs.log 2>&1
  ```
  Adjust timing or log paths as needed.

## 13. Repository Hygiene & Protected Path Policy
- Canonical policy: `docs/GOVERNANCE_REPO_HYGIENE.md`.
- Any cleanup review must build the protected allowlist first from:
  - `orchestrator_config.json` path roots,
  - agent configs/runtime path IO,
  - systemd/cron/workflow triggers,
  - sync scripts and orchestrator indexing/consumption code.
- `sync_openclaw_docs.sh` + `sync_openai_cookbook.sh` + runtime indexing (`docsPath`/`cookbookPath`) form a protected update chain.
- `logs/knowledge-packs/` is a protected output because it is produced during drift repair and consumed downstream.
- Cron snippets shown in documentation are examples/documented workflows and must not be treated as active triggers unless confirmed in runtime scheduler configuration.

## Official Documentation
For more detailed information, refer to the official OpenClaw documentation: [OpenClaw Docs](https://docs.openclaw.ai/)
