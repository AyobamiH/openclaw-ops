# MEMORY.md — Long-Term Strategy & Context

This is your curated memory. It contains decisions made, strategy, and how to extend the system.
Read this before each session to understand where things stand.

---

## 🤖 12-Agent Swarm System (Feb 22, 2024 - COMPLETE)

### What Was Built
✅ **Complete agent infrastructure** (AgentRegistry, ToolGate, 5 core skills)  
✅ **11 specialized worker agents** (fully implemented with identity, behavior, documentation)  
✅ **Deny-by-default permissions** (enforced at runtime, audit-logged)  
✅ **Cost-optimized tiering** (gpt-4o-mini cheap tier + Claude 3.5 Sonnet balanced tier = $23/day)

### The 11 Agents
1. **market-research-agent** — Web research, competitive intelligence (sourceFetch skill)
2. **data-extraction-agent** — Document parsing, structured extraction (documentParser + normalizer)
3. **qa-verification-agent** — Testing, validation, quality assurance (testRunner skill)
4. **summarization-agent** — Text condensing, executive summaries (documentParser + normalizer)
5. **build-refactor-agent** — Code refactoring, optimization, security (workspacePatch + testRunner)
6. **security-agent** — Vulnerability scanning, compliance auditing (documentParser + normalizer)
7. **normalization-agent** — ETL, data schema mapping, validation (normalizer + documentParser)
8. **content-agent** — Documentation, README, API specs (documentParser)
9. **integration-agent** — Workflow orchestration, multi-agent coordination (documentParser + normalizer)
10. **skill-audit-agent** — Quality validation, testing, compliance (testRunner + documentParser)
11. **system-monitor-agent** — Health checks, metrics, alerting, observability (documentParser)

### Key Architectural Decisions
- **Deny-by-default**: Every agent has explicit skill allowlist (enforced by ToolGate)
- **Model tiering**: Cheap agents (gpt-4o-mini) for high-throughput, balanced (Claude 3.5 Sonnet) for reasoning
- **Behavioral docs**: Every agent has SOUL.md (identity) + IDENTITY.md (patterns) + USER.md (expectations)
- **Heartbeat monitoring**: Each agent has periodic health checks (1m-30m intervals based on workload)
- **Complete lifecycle**: Discovery → Validation → Permission enforcement → State tracking → Escalation

### Next Steps
1. Run integration tests (full swarm startup validation)
2. Test permission enforcement (forbidden skill access attempts)
3. Validate cost tracking (sum of agent costs)
4. Deploy to Docker/Kubernetes
5. Build monitoring dashboard

**Status**: Code complete, ready for integration testing

---

---

## Core Mission

**Goal**: Find leads automatically, review once daily (morning), minimize manual work.

**How it works:**
- **11:00 PM UTC**: Nightly batch job collects RSS feeds + Reddit posts → scores each one → mark high-confidence (>0.75) → create digest JSON
- **reddit-helper**: Uses gpt-4 to draft personalized replies (contextual, not templates)
- **Confidence scoring**: Hybrid formula combining RSS relevance (40%) + LLM self-assessment (60%)
- **6:00 AM UTC**: Morning digest compiled, delivered to email (or Slack/Discord if configured)
- **You**: Review digest in morning, approve/reject drafts, move on

**Why this matters:**
- Token cost: ~$1.65/day (batched, not continuous polling)
- UX: All work ready at 6am, not scattered throughout day
- Quality: Personalized replies with honest confidence, grounded in ENGAGEMENT_OS.md doctrine
- Simplicity: No new tech — just email (what you already use)

---

## Key Strategy Decisions

### 1. Nightly Batched (Not Continuous Polling)

**Decision**: 11pm batch + 6am digest, not polling every 10-15 minutes

**Was**: 4 setInterval timers (1m, 5m, 10m, 15m) = ~4-5 API calls/hour = expensive & fragmented
**Now**: 2 cron jobs (11pm batch, 6am notify) = ~2-3 API calls/day = negligible cost

**Trade-off**: Replies ready in morning, not immediately
**Worth it**: Better UX, lower cost, single morning digest

---

### 2. LLM Personalization (Not Templates)

**Decision**: gpt-4 drafts contextual replies per post, not fill-in-blanks templates

**Was**: Hardcoded template ("Great question! Here's what I know...") repeated identically
**Now**: Each reply contextual to specific post, shows authority, asks right qualifying questions

**Cost**: ~$1.65/day for 100 drafts (150-300 tokens per reply, gpt-4 pricing $0.06/1k)
**Worth it**: Each reply unique, not spam-like, matches ENGAGEMENT_OS.md doctrine

---

### 3. Hybrid Confidence Scoring

**Decision**: `(rssScore * 0.4) + (llmScore * 0.6)` — two signals, not guessing

**Was**: Arbitrary hardcoding ("if tag=='priority' → 0.92, else if score>0.8 → 0.85, else 0.78")
**Now**: Transparent, auditable, matches actual signals
  - rssScore = keyword relevance from RSS sweep (0-1 scale)
  - llmScore = gpt-4 self-evaluation ("How confident is this reply on-brand?") (0-1 scale)

**Why**: Both signals matter. RSS catches relevance, LLM catches quality.
**Result**: Confidence varies per post (0.3-0.9 range), trustworthy

---

### 4. Email-Native Notifications (Not Slack)

**Decision**: Notifications route to email, not Slack

**Why**: No new tools required. Single inbox. Archive-friendly.
**How**: notifier.ts supports Slack/Discord/Email/Log — pick what you want
**Configuration**: Set `digestNotificationChannel` in orchestrator_config.json

**Trade-off**: Email less "real-time" than Slack, but you check email anyway

---

### 5. System Self-Documentation (Git + CHANGELOG + Daily Notes)

**Decision**: System remembers itself through Git + curated memory files

**How it works:**
- Git automatically tracks every code change (what changed, when, who)
- CHANGELOG.md documents WHY (in human words, for understanding)
- memory/YYYY-MM-DD.md captures raw session notes
- MEMORY.md (this file) holds long-term strategy

**Result**: Future-you can understand what was decided and why, without guessing

---

## System Architecture Overview

```
NIGHTLY ORCHESTRATION (11pm UTC)
│
├─ doc-sync: Flush pending document changes
├─ Mark items: Filter reddit queue where score > 0.75
└─ Compile digest: JSON with summary + all marked items
   └─ Save to: /logs/digests/digest-YYYY-MM-DD.json

REDDIT REPLY DRAFTING (Inside nightly batch)
│
├─ Load knowledge pack (from doc-specialist)
├─ For each high-confidence item:
│  ├─ Call gpt-4 with RUNTIME_ENGAGEMENT_OS.md as doctrine
│  ├─ gpt-4 drafts contextual reply
│  ├─ gpt-4 self-scores draft quality (0-1)
│  └─ Calculate hybrid confidence: (rss*0.4) + (llm*0.6)
└─ Log: /logs/reddit-drafts.jsonl (every draft recorded)

MORNING NOTIFICATION (6am UTC)
│
├─ Find latest digest: /logs/digests/digest-YYYY-MM-DD.json
├─ Format message: "X leads ready (score > 0.75)"
├─ Send via notifier:
│  ├─ Email: HTML body with digest summary
│  ├─ Slack: Rich embed with button link
│  ├─ Discord: Colored embed with metadata
│  └─ Log: Console output (fallback)
└─ Update state: lastDigestNotificationAt timestamp

ERROR ALERTING (Continuous)
│
├─ Track each task result (success/failure)
├─ Consecutive failures counter per task type
├─ Alert after 3 failures: send Slack/email
├─ Heartbeat watch-dog: Check if orchestrator hung (>15 min no pulse)
└─ Cleanup: Keep 48 hours of alert history
```

---

## Important Configuration

**orchestrator_config.json** — What controls behavior:

| Field | Current | What It Does |
|-------|---------|--------------|
| `openaiModel` | gpt-4 | Which LLM for reply drafting |
| `openaiMaxTokens` | 300 | Max length per reply (250-300 recommended) |
| `runtimeEngagementOsPath` | ./RUNTIME_ENGAGEMENT_OS.md | LLM's doctrine for tone/style |
| `nightlyBatchSchedule` | 0 23 * * * | When to run batch (11pm UTC) |
| `morningNotificationSchedule` | 0 6 * * * | When to send digest (6am UTC) |
| `digestNotificationChannel` | email | How to deliver (email/slack/discord/log) |
| `digestNotificationTarget` | your-email@... | Where digest goes |
| `digestDir` | ./logs/digests | Where digest JSON files saved |

**To change behavior:**
- Faster replies? Lower maxTokens (200)
- Longer replies? Raise maxTokens (400)
- Different tone? Edit RUNTIME_ENGAGEMENT_OS.md
- Different time? Update cron expressions
- Different channel? Change digestNotificationChannel

---

## System Health Indicators

**🟢 Green (all working):**
- Digest file appears daily: `ls -la logs/digests/ | tail -1`
- Nightly batch completes <30 sec: `grep nightly-batch logs/orchestrator.log | grep "complete\|success"`
- Confidence scores vary (0.3-0.9 range):
  ```bash
  jq '.confidence' logs/reddit-drafts.jsonl | sort | uniq -c
  ```
- No errors in last 24h: `grep ERROR logs/orchestrator.log | wc -l`

**🟡 Yellow (watch it):**
- LLM API rate limiting: Check logs for `openai.*429`
- Missing ENGAGEMENT_OS.md: Check exists + readable
- Digest file stale (>24h old): Batch job might have crashed
- Alert history growing: Check `grep CRITICAL logs/orchestrator.log`

**🔴 Red (fix now):**
- Orchestrator not running: `ps aux | grep orchestrator`
- Git repo corrupted: `git fsck --full`
- Config fields missing: Check orchestrator_config.json against schema
- LLM API key invalid: Test with `curl` to OpenAI endpoint

---

## How to Extend

**Add a new Reddit community:**
1. Edit `rss_filter_config.json` — add subreddit + keywords
2. Next 11pm batch picks it up automatically
3. Drafts appear in morning digest

**Change reply style:**
1. Edit `RUNTIME_ENGAGEMENT_OS.md` (gpt-4's doctrine)
2. Redeploy orchestrator or wait for next 11pm batch to reload
3. Next batch of replies use new doctrine

**Tighten/loosen filtering:**
1. Change score threshold in nightly-batch handler (currently 0.75)
   - Lower (0.65) = more leads, noisier
   - Higher (0.85) = fewer leads, cleaner
2. Test with 1-2 nights before finalizing
3. Update config: `nightlyBatchScore` field (add if needed)

**Add approval workflow:**
1. Before sending digest, filter for `approved == false`
2. Show pending drafts to John via email/Telegram
3. Wait for approval before marking `selectedForDraft = true`
4. Next batch sends only approved replies

**Monitor trending topics:**
1. Parse digest summaries weekly
2. Extract top keywords from high-confidence drafts
3. Update rss_filter_config.json to focus on trending topics
4. Fine-tune which communities/keywords to monitor

---

## 11-Agent Swarm Infrastructure (NEW — Feb 22, 2026)

### Decision: Skills as Bounded Tool Wrappers (Option B)

**Strategic Choice**: Skills are NOT prompt-level instructions. They are audited, pinned TypeScript modules with strict permission gates.

**Why this matters:**
- ✅ Auditable (every call logged with args + returns)
- ✅ Enforceable (permissions enforced in code, not prompt advisory)
- ✅ Reusable (one skill, many agents)
- ✅ Supply-chain safe (pinned to commit hash, reviewed before install)
- ✅ Deterministic (same input → same output, no hallucination in execution)

**vs. Prompt-Level Procedures:**
- ❌ No audit trail (what did LLM actually do?)
- ❌ Can be bypassed (agent ignores safety prompt instructions)
- ❌ Repeated logic (copy/paste skill across agents)
- ❌ Fails silently (unstructured error handling)

### Core Skill Pack v1 (Week 1 Target)

These 5 skills unblock the highest-value agents:

| Skill | Used By | Purpose | Enforcement |
|-------|---------|---------|-------------|
| **SourceFetch** | market-research, integration | Fetch from allowlisted domains only | Whitelist gate + strip scripts |
| **DocumentParser** | extraction | PDF/HTML/CSV → structured blocks | Workspace-only reads |
| **Normalizer** | data-modeling, extraction | Data schema enforcement | Schema validation before output |
| **WorkspacePatch** | build, ops | Safe code modifications on diffs | Dry-run mode default, no outside-workspace writes |
| **TestRunner** | QA, ops | Predefined test commands only | Allowlist of permitted test commands, no arbitrary exec |

### Agent-Skill Mapping

```
mission-control-orchestrator: (routes, doesn't execute skills directly)
market-and-web-research-agent: SourceFetch, EvidenceExtractor
document-and-data-extraction-agent: DocumentParser, Normalizer
summarization-and-briefing-agent: (read-only, uses extracted data)
software-build-and-refactor-agent: WorkspacePatch, TestRunner
quality-assurance-and-verification-agent: TestRunner (read-only), ArtifactValidator
operations-and-runbook-agent: WorkspacePatch (ops scope), TestRunner (ops commands)
security-and-hardening-agent: (audit only, no execution)
data-modeling-and-normalization-agent: Normalizer
content-and-distribution-agent: (draft only, no posting)
integration-and-automation-agent: SourceFetch (APIs), Normalizer
skill-discovery-and-supply-chain-audit-agent: (audit gate, proposes skills)
```

### Skill Audit Gate (Day 1, All Skills)

Every skill passes before runtime:
- **Provenance**: Who wrote it, where hosted, version pinned?
- **Permissions**: What tools does it wrap? (network, exec, file)
- **Data flows**: Can it read secrets, env, credentials?
- **Runtime**: Does it eval, spawn shell, download code?
- **Determinism**: Same input → same output?
- **Observability**: Logs + artifacts for audit trail?

Location: `orchestrator/src/skillAudit.ts`

### Phased Rollout

| Week | Target | Agents Unblocked |
|------|--------|------------------|
| 1 | Core 5 skills (SourceFetch, Parser, Normalizer, Patch, TestRunner) | market-research, extraction, build, QA |
| 2 | Integration with 5 highest-value agents + testing | Full pipeline validation |
| 3 | Extended skills (EvidenceExtractor, Validator, Digest, TaskRouter, Alert) | Remaining 6 agents |
| 4 | Full swarm + supply-chain audit pipeline | All 12 agents live |

### Status: Core Skill Pack v1 COMPLETED ✅

**What was built (Feb 22, 2026):**

✅ **5 Core Skills** — All implemented with full logic:
- `sourceFetch.ts`: HTTP fetch with allowlist enforcement, content normalization, timeout handling
- `documentParser.ts`: PDF/HTML/CSV parsing to structured blocks, tables, entity extraction
- `normalizer.ts`: Schema-driven data normalization (dates, currencies, numbers, emails)
- `workspacePatch.ts`: Safe file modification with dry-run mode, diff generation, risk detection
- `testRunner.ts`: Whitelisted test command execution (no arbitrary exec), result parsing

✅ **Skills Registry** (`skills/index.ts`):
- Loads all skills at startup
- Validates each skill through audit gate before registration
- Provides `executeSkill(skillId, input, agentId)` interface
- Tracks skill metadata (version, permissions, auditedAt)
- Lists registered skills for discovery

✅ **Skill Types** (`orchestrator/src/skills/types.ts`):
- SkillDefinition, SkillInputSchema, SkillOutputSchema
- SkillPermissions, SkillProvenance, SkillAuditResults
- SkillInvocation, SkillRegistry, SkillExecutionContext, SkillResult

✅ **AGENT_TEMPLATE** — Boilerplate for rapid agent creation:
- `agent.config.json`: Permission matrix, skill allowlist, model tier selection
- `SOUL.md`: Agent identity, values, core purpose
- `IDENTITY.md`: Behavioral patterns, error handling, decision making
- `USER.md`: Who the agent serves, use cases, expectations
- `TOOLS.md`: Development tools, local testing, credentials
- `HEARTBEAT.md`: Periodic health checks, failure escalation
- `src/index.ts`: Entry point with skill access pattern
- `package.json`: Dependencies and scripts

**Commit**: `080bc59 - feat: complete core skill pack v1 and agent template framework`

**Next steps:**
1. Create `orchestrator/src/agentRegistry.ts` to manage agent lifecycle
2. Create `orchestrator/src/toolGate.ts` to enforce permissions at runtime
3. Update `orchestrator/src/taskHandlers.ts` with 11 new agents
4. Create integration tests (e2e skills × agents)
5. Deploy and validate permission enforcement

---

## Session Checklist

**Start of session:**
- [ ] Read SOUL.md (who you are)
- [ ] Read USER.md (who I'm helping)
- [ ] Read MEMORY.md (this file — long-term strategy)
- [ ] Read memory/YYYY-MM-DD.md (today's context)
- [ ] Check `git status` (what's modified?)
- [ ] Check `ls -la logs/digests/ | tail -1` (system healthy?)

**During session:**
- [ ] Make changes to code
- [ ] Test locally: `npm run dev`
- [ ] Run manual tests: `npx tsx test-*.ts`
- [ ] Check for errors: `npm run build`

**End of session:**
- [ ] Review what changed: `git status`
- [ ] Commit with message: `git commit -m "..."`
- [ ] Update CHANGELOG.md with what was built
- [ ] Update memory/YYYY-MM-DD.md with learnings
- [ ] Update MEMORY.md if strategy changed

---

## Known Limitations & Trade-offs

| Limitation | Why | Workaround |
|-----------|-----|-----------|
| Drafts ready 6am, not immediate | Batched system | Acceptable trade-off for cost savings |
| Need EMAIL_API_KEY for email | Requires email service | Fallback to log channel (logs to console) |
| Reddit posts must be RSS-able | Limited to RSS feeds | Manually add high-value communities |
| LLM cost scales with volume | 100 drafts = $1.65/day | Monitor budget, adjust maxTokens |
| No reply approval workflow yet | System auto-drafts | Manual: review drafts before posting |

---

## What Works Well Right Now

✅ **Nightly batch** — Consolidates all leads into single 11pm job
✅ **Hybrid scoring** — Combines RSS + LLM signals transparently
✅ **LLM personalization** — Each reply contextual, not templated
✅ **Email delivery** — No new tech, uses what you already have
✅ **Error tracking** — Knows when things break, escalates after 3 failures
✅ **Self-documentation** — Git + CHANGELOG + daily notes = perfect memory

---

## What's In Progress / Future

⏳ **Production deployment** — All code ready, just needs env vars set
⏳ **Real 11pm batch** — Not yet run on live schedule (can test manually)
⏳ **Trending analysis** — Track topics over time (optional enhancement)
⏳ **Approval workflow** — Human reviews before posting (optional enhancement)

---

## Critical Files & Locations

**System:**
- Orchestrator: `/orchestrator/` (cron scheduling, task handlers)
- reddit-helper: `/agents/reddit-helper/` (LLM drafting)
- Config: `orchestrator_config.json` (behavior settings)
- State: `orchestrator_state.json` (runtime state, restored on crash)

**Data:**
- Digests: `logs/digests/digest-YYYY-MM-DD.json`
- Drafts: `logs/reddit-drafts.jsonl` (one line = one draft)
- Logs: `logs/orchestrator.log`

**Documentation:**
- SOUL.md (who you are)
- USER.md (who John is)
- MEMORY.md (this file)
- CHANGELOG.md (what was built)
- memory/YYYY-MM-DD.md (daily notes)

---

## Emergency Recovery

**Orchestrator crashed?**
```bash
cd orchestrator
npm run dev  # Restart
git log -1  # See last change
```

**Digest not created?**
```bash
# Manual test
npx tsx test-nightly-batch.ts
# Check error in output
```

**Lost state?**
```bash
# Restore from git
git checkout orchestrator_state.json
# Or start fresh (loses history of last task)
```

**Notifications not sending?**
```bash
# Check config
cat orchestrator_config.json | jq '.digestNotificationChannel'
# Test manually
npx tsx test-send-digest.ts
```

---

## Next Big Decision (When You're Ready)

**Should we set up actual Slack webhook for alerts?**

Currently: Email-native (no new tech)
Option: Add Slack for real-time alerts to `#alerts` channel

Trade-off:
- ✅ Faster alert visibility
- ✅ Channel organization
- ❌ One more tool to check

Your call when ready.

---

_Last curated: 2026-02-21_
_Next review: After major implementation or significant bugs found_
