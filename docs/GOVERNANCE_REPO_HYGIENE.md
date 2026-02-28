# Repository Hygiene Governance

## Purpose

This document defines the mandatory, evidence-first policy for classifying repository paths as:

* `PROTECTED`
* `PROTECTED-BUT-PRUNABLE`
* `CANDIDATE`
* `DRIFT-RISK`

No deletion recommendation is valid unless the **Protected Path Derivation flow** below has executed and produced an evidence-backed allowlist.

This policy is authoritative. Other documents must reference this file and must not duplicate or reinterpret its rules.

---

## Protected Path Derivation (Required Order)

The allowlist must be derived in this exact sequence:

### 1. Runtime Configuration Roots

Collect all configured paths from:

* `workspace/orchestrator_config.json`

This file is canonical for runtime path policy.

Keys including (but not limited to):

* `docsPath`
* `cookbookPath`
* `knowledgePackDir`
* `logsDir`
* `stateFile`
* any other declared filesystem root

All configured paths are **PROTECTED by default** unless explicitly proven unused by runtime code.

---

### 2. Agent Path IO Expansion

Enumerate:

* `workspace/agents/*/agent.config.json`
* corresponding runtime files (`src/index.ts`, `src/service.ts`)

Any declared read/write path expands the protected surface.

Protection is transitive:
If Agent A writes to a directory and Agent B consumes from it, that directory is PROTECTED.

---

### 3. Trigger Surfaces

Enumerate:

* `workspace/systemd/*.service`
* `cron/jobs.json`
* `workspace/.github/workflows/*`
* documented manual operational commands currently used by operators

If a trigger references a script, binary, or path, that path becomes PROTECTED unless proven otherwise.

Documented examples without active runtime trigger must be labeled `Documented-only`.

---

### 4. Sync / Fetch / Mirror Scripts

Enumerate all scripts matching:

* `sync_*`
* scripts invoking `git clone`, `sparse-checkout`, `rsync`, `pull`, `fetch`, `curl`, `wget`

Mirror destinations are PROTECTED inputs.

---

### 5. Runtime Consumption Paths

Scan runtime source:

* config loaders
* indexers
* watchers
* task handlers
* ingestion logic
* knowledge-pack consumers
* API exposure paths

Any path read, watched, indexed, written, or served by runtime code is PROTECTED.

---

### 6. Construct Protected Allowlist

Only after steps 1–5 are complete may classification begin.

The allowlist must include:

* Path
* Role (input/output/substrate)
* Evidence file(s)
* Trigger status (`Confirmed`, `Documented-only`, `Not found`)
* Confidence

---

## Evidence Requirements

A path may only be marked non-protected if **no evidence** exists in:

* runtime configuration
* agent configuration or runtime code
* systemd/cron/workflows
* sync scripts
* orchestrator indexing or ingestion code
* currently used manual workflows

If evidence is absent but removal risk is historically high or intent is ambiguous, classify as `DRIFT-RISK`.

Zero-hit proof must be generated via deterministic scanning (scripted), not editor search.

---

## Classification Definitions

### PROTECTED

Path participates in an active or documented runtime/update/ingestion chain.

### PROTECTED-BUT-PRUNABLE

Path is required at a root level, but a specific subpath is safely regenerable from deterministic sources and not required for runtime continuity.

Example:
Source maps inside `dist/` when deployment does not require them and rebuild is guaranteed.

Removal requires:

* deterministic regeneration path
* verification step

### CANDIDATE

No evidence of required usage and low operational risk.

### DRIFT-RISK

No direct evidence of active use, but:

* historical/audit value exists
* mirror intent unclear
* removal impact ambiguous

Requires explicit operator intent before removal.

---

## Mandatory Audit Flow

1. Generate Protected Allowlist (evidence-backed).
2. Re-score junk inventory against allowlist.
3. Produce “Not Found” section for expected but missing triggers/primitives.
4. Separate:

   * Low-risk `CANDIDATE`
   * `DRIFT-RISK` requiring operator intent

Deletion recommendations without steps 1–4 are invalid.

---

## Tooling Requirement

Audits must be deterministic and script-assisted (Python or equivalent).

Editor search is not sufficient.

Audit output must include:

* path
* evidence source file(s)
* trigger status
* confidence level
* zero-hit proof when claiming non-usage

---

## Path Categories (Conceptual Model)

### Mirror Inputs

* `openclaw-docs/`
* `openai-cookbook/`

These are sync destinations and are PROTECTED if configured or indexed.

### Runtime Outputs

* `logs/knowledge-packs/`
* state files declared in config

If produced and consumed, they are PROTECTED.

### Long-Memory Substrate

Defaults to `DRIFT-RISK` unless proven safe:

* `logs/`
* session histories
* memory snapshots
* archives
* adjacent generated records

If configured or consumed by runtime, they escalate to PROTECTED.

---

## Mirror Repository Rule

Nested `.git` directories inside mirrored sources are not automatically junk.

If sync scripts exclude `.git` (for example `rsync --exclude='.git'`), nested `.git` directories must be classified as `DRIFT-RISK` unless explicit non-usage is proven.

---

## Expansion Rules for Future Changes

This policy automatically scales.

The protected surface expands when:

* A new agent adds path IO in `agent.config.json`
* A new `.service`, cron job, or workflow is introduced
* `orchestrator_config.json` adds or modifies path roots
* Runtime code begins indexing or consuming new directories

`workspace/orchestrator_config.json` remains the canonical runtime root authority.

---

## Example Classification

| Path                             | Evidence                               | Classification |
| -------------------------------- | -------------------------------------- | -------------- |
| `openclaw-docs/`                 | Configured + indexed                   | `PROTECTED`    |
| `logs/knowledge-packs/`          | Produced + consumed                    | `PROTECTED`    |
| Mirror nested `.git`             | Script excludes `.git`, intent unclear | `DRIFT-RISK`   |
| Backup `.bak` with no references | Zero-hit proof, low risk               | `CANDIDATE`    |

---

## Linking Rule

All documentation discussing:

* cleanup
* drift-repair
* indexing
* mirrors
* knowledge packs
* CI hygiene

must reference this document rather than redefining policy.

File paths referenced in documentation must be full repository-relative paths.

---

## Agent Primitive Requirements

All agent directories under `workspace/agents/*` must contain:

* `README.md`
* `ROLE.md`
* `SCOPE.md`
* `POLICY.md`
* `TOOLS.md`

Requirements:

* `ROLE.md` must define purpose, done criteria, and never-do boundaries.
* `SCOPE.md` must define inputs, outputs, file I/O expectations, allowed actions, and explicit out-of-scope boundaries.
* `POLICY.md` must reference this governance file and enforce evidence-first + protected-path derivation rules.
* `README.md` must include mission, I/O contract, run instructions, and links to `ROLE.md`, `SCOPE.md`, `POLICY.md`, and `TOOLS.md`.

Governance note: CI should fail when any required primitive file is missing. This is a documentation requirement; CI implementation is tracked separately.

-