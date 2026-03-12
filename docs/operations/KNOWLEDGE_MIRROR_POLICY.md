---
title: "Knowledge Mirror Policy"
summary: "Policy for OpenClaw docs and OpenAI Cookbook mirrors used as runtime agent knowledge."
---

# Knowledge Mirror Policy

This file defines how the workspace treats the two mirrored upstream knowledge
sources that feed runtime agent knowledge:

- `openclaw-docs/`
- `openai-cookbook/`

These mirrors are not disposable clutter. They are working knowledge sources
for agent behavior, pack generation, and troubleshooting.

## Purpose

The workspace uses mirrored upstream docs so agents can reason from local,
indexed, inspectable knowledge instead of depending on live network fetches.

The mirrors serve different roles:

- `openclaw-docs/`
  - product/runtime truth for OpenClaw installation, operation, recovery, and
    troubleshooting
- `openai-cookbook/`
  - maker-technique truth for OpenAI model usage patterns, tool calling,
    prompting, evaluations, structured outputs, and other implementation clues

## Default Policy

### `openclaw-docs/`

- Keep this mirror available in the workspace by default.
- Treat upstream updates as meaningful runtime knowledge, not accidental churn.
- Version substantial upstream refreshes deliberately in reviewable batches.
- Do not delete the mirror to "clean" the worktree.

### `openai-cookbook/`

- Keep this mirror available in the workspace as a runtime knowledge source.
- The default committed policy is curated text, code, and config clues first.
- Full upstream sync, including notebooks and heavier example assets, is
  allowed locally when needed for richer agent knowledge or corpus work.
- Heavy local sync state should not be treated as garbage just because current
  ingestion is narrower than long-term intent.

## Packaging Modes

### Text / clues mode

The default sync path is intended for:

- committed repo hygiene
- lower clone size
- preserving the most useful text, code, config, and notebook-adjacent clues

This mode is driven by:

- [../..//sync_docs_sources.sh](../../sync_docs_sources.sh)
- [../..//sync_openai_cookbook.sh](../../sync_openai_cookbook.sh)

### Full mode

Full mode is intended for:

- local research
- richer downstream extraction
- notebook-heavy or asset-heavy corpora
- future ingestion improvements where images/audio/video and other artifacts
  matter more directly

Full mode is a supported local state, even when not all of it is committed.

## Commit Policy

Use this rule set:

- commit `openclaw-docs/` updates when they materially improve runtime
  knowledge, installation/fix coverage, or alignment with upstream truth
- commit curated `openai-cookbook/` updates when they materially improve agent
  technique knowledge
- do not blindly commit every heavyweight upstream asset just because it exists
- do not blindly delete local heavyweight assets if they are still useful for
  agent performance, future parsing, or corpus work

## Hygiene Policy

Keep these categories separate:

- **knowledge mirrors**
  - `openclaw-docs/`
  - `openai-cookbook/`
- **generated artifacts**
  - `orchestrator/dist/`
  - `orchestrator/openapi.json`
  - package-manager lock residue inside nested `node_modules/`
- **local runtime state**
  - `openclawdbot/data/`
  - private memory files
  - local screenshots and ad hoc review artifacts

Generated artifacts and local runtime state should be cleaned or ignored
separately. Mirror churn should not be handled with the same policy as build
output.

## Agent Dependency Note

Current runtime evidence already confirms that these mirrors are not optional in
spirit:

- `doc-specialist` builds packs from both `docsPath` and `cookbookPath`
- `reddit-helper` consumes those packs indirectly
- notebook and asset-manifest ingestion paths now exist for richer corpus use

If mirror freshness degrades, agent usefulness degrades with it.

## Review Rule

Before reverting or deleting mirror changes, answer two questions:

1. Does this reduce agent access to current upstream truth?
2. Does this remove local material that may still be useful for richer
   extraction or troubleshooting later?

If either answer is yes, do not treat the change as disposable cleanup.
