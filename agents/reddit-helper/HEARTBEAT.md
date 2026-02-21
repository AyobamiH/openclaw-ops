# HEARTBEAT — Reddit Helper Health Check

**Cadence**: Every 5 minutes (orchestrator heartbeat pulse)
**Critical Window**: 11:00 PM - 8:00 AM (nightly batch window buffer)
**Owner**: reddit-helper agent

---

## NIGHTLY-ONLY DRAFTING MODEL

Reddit-helper drafts replies **only during nightly batch (11pm UTC)**:

- **11:00 PM**: Orchestrator runs `nightly-batch` task
  - RSS items already collected and scored by RSS_SWEEP
  - High-confidence items (score > 0.75) marked for drafting
  - reddit-helper spawned to draft each selected item
  - LLM scores each draft
  - Hybrid confidence calculated (RSS 40% + LLM 60%)
  - Digest compiled and saved

- **6:00 AM**: Orchestrator runs `send-digest` task
  - Morning notification sent with ~100 leads ready

- **All other hours**: No drafting occurs
  - RSS feeds still collected (background)
  - No LLM calls outside 11pm window
  - Lower idle resource usage

---

## HEALTH CHECKS (Every 5-minute heartbeat)

### 1. **LLM API Health** (Critical)
- [ ] Can OpenAI API be reached?
- [ ] OPENAI_API_KEY environment variable set?
- [ ] gpt-4 model accessible?
- [ ] Token budget reasonable (~300 tokens per draft)?

**If failing**: Agent cannot draft tomorrow night; escalate before 11pm

---

### 2. **Knowledge Pack Availability** (Critical)
- [ ] Latest knowledge pack exists and is recent (<2 hours old)?
- [ ] Pack JSON is valid and parseable?
- [ ] Pack contains 50+ docs?
- [ ] Path matches config.knowledgePackDir?

**If old**: doc-specialist may be behind; nightly drafting may fail

**Action**: Check if doc-sync is running. If doc-specialist hasn't run in 24h, alert.

---

### 3. **RUNTIME_ENGAGEMENT_OS.md** (Critical)
- [ ] File exists at configured path?
- [ ] Contains sections: VOICE & IDENTITY, TONE RULES, REPLY STRUCTURE, QUALIFICATION SEQUENCE?
- [ ] File not corrupted (valid Markdown)?

**If missing/corrupt**: LLM will have no doctrine guidance; drafts will drift

**Action**: Verify RUNTIME_ENGAGEMENT_OS.md in workspace root. Re-create if corrupted.

---

### 4. **Draft Log Integrity** (Important)
- [ ] Draft log file appending without errors?
- [ ] Recent drafts have `stage: "agent-llm-hybrid"`?
- [ ] Confidence breakdown present (rssScore, llmScore, final)?
- [ ] No truncated/malformed JSONL entries?

**If failing**: Drafts not being persisted; digest will be empty tomorrow

---

### 5. **Hybrid Confidence Scoring** (Important)
Check latest drafts in log:
- [ ] `rssScore` field populated (0.0-1.0)?
- [ ] `llmScore` field populated (0.0-1.0)?
- [ ] `confidence` = (rssScore × 0.4) + (llmScore × 0.6)?
- [ ] Scores vary per post (not all 0.78, not all 0.92)?

**If all same**: Scoring hardcoded or LLM failing silently

**Sample command**:
```bash
tail -5 logs/reddit-drafts.jsonl | jq '.confidence, .rssScore, .llmScore'
```

---

### 6. **LLM Response Quality** (Important)
Sample last night's drafts:
- [ ] Replies follow REPLY STRUCTURE (acknowledge → clarify → path → invite)?
- [ ] 4-5 sentences max, not verbose?
- [ ] Qualify first, never pre-solve?
- [ ] Tone: calm, authoritative, not eager?
- [ ] No emojis, em dashes, or hype?

**Red flag**: If replies are template-like or repetitive, LLM not personalizing

**Action if failing**: LLM prompt may need refinement. Log samples for review.

---

### 7. **Digest Generation** (Important)
- [ ] Latest digest file exists (logs/digests/digest-YYYY-MM-DD.json)?
- [ ] Contains summary with itemsMarkedForDraft count?
- [ ] Contains array of high-confidence queue items?
- [ ] Timestamp accurate?

**If missing**: Tomorrow's 6am notification will fail

---

### 8. **Runtime Metrics** (Good to know)
- [ ] Average LLM request time < 10 seconds per draft?
- [ ] Token usage per draft < 400 tokens?
- [ ] Daily API cost < $5 (100 drafts × 0.05 average)?

**If slow**: May miss 11pm batch window completion

---

## RED FLAGS 🚨
**Stop and escalate immediately if**:

- LLM API unreachable before 11pm
- Knowledge pack older than 24 hours
- RUNTIME_ENGAGEMENT_OS.md missing
- Draft log not getting new entries after 11pm batch
- Hybrid scoring broken (all scores identical)
- Drafts are identical/templated (personal ization failing)
- Digest file not created by 11:30pm

---

## GREEN LIGHTS ✅
**You're healthy**:

- OpenAI API responding normally
- Latest pack < 1 hour old
- RUNTIME_ENGAGEMENT_OS.md present and valid
- Draft log appending successfully post-11pm
- Confidence scores vary (0.4-0.9 range)
- Hybrid formula applied correctly
- Drafts read different & contextual per post
- Digest compiled by 11:30pm
- Morning notification sent by 6:05am

---

## BEFORE 11 PM EACH NIGHT
⏰ **1 hour before batch (10:00 PM)**:
- [ ] Verify knowledge pack is recent
- [ ] Verify LLM API working
- [ ] Verify RUNTIME_ENGAGEMENT_OS.md loaded
- [ ] Clear any stuck processes

If any failing: **Alert operator immediately**. Batch will fail.

---

## IF NIGHTLY BATCH FAILS
What happened at 11pm?

**Check logs**:
```bash
grep "nightly-batch" logs/orchestrator.log | tail -5
grep "reddit-response" logs/orchestrator.log | tail -5
grep "send-digest" logs/orchestrator.log | tail -5
```

**Retry digest generation**:
- Manually re-run nightly-batch task
- Check if digest file now created
- Check digest summary counts

**If LLM failed**:
- Verify OPENAI_API_KEY set
- Check OpenAI API status
- Verify gpt-4 model available
- Check token quota

**If knowledge pack missing**:
- Trigger doc-sync task manually
- Run doc-specialist drift-repair
- Verify pack generation completes

---

## OPERATIONAL NOTES

- **Drafting is centralized at 11pm**. No drafting happens outside this window.
- **LLM scores its own work**. Quality improves when scoring is honest; logs if broken.
- **Digest is immutable once created**. Don't edit. Re-run if needs update.
- **Morning notification is best-effort**. If digest exists, 6am task sends it.
- **Performance scales linearly**: 100 drafts = ~100 × 10sec = 15 min batch window. Budget accordingly.

---
