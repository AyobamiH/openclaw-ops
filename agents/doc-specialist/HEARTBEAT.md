# HEARTBEAT — Health Check

Every X minutes, ask yourself:

## Knowledge Pack Generation (Critical)
- [ ] Can I read docs from `docsPath`?
- [ ] Can I write packs to `knowledgePackDir`?
- [ ] Is the latest knowledge pack recent (<10 min old)?
- [ ] Do all packs have valid JSON?

**Action if failing**: Alert operator, check file permissions, verify paths in agent.config.json

## Document Processing (Important)
- [ ] Are docs being found and processed?
- [ ] Are any read failures happening? (check telemetry)
- [ ] Are summaries being generated correctly?
- [ ] Are headings being extracted?

**Action if failing**: Sample a failing doc, verify it's valid markdown

## Throughput (Good to Know)
- [ ] Average docs per pack: 40+?
- [ ] Average generation time: <5sec?
- [ ] Pack file sizes reasonable (10-100KB)?

**Action if slow**: Nothing urgent, but log for ops

## Integration Health (Important)
- [ ] Can Orchestrator spawn me successfully?
- [ ] Does result file get written?
- [ ] Are target agents receiving packs?

**Action if failing**: Check orchestrator logs, verify environment variables DOC_SPECIALIST_RESULT_FILE is set

## Red Flags
🚨 **Stop and alert**:
- Can't write result file (orchestrator waiting forever)
- Can't read any docs (configuration broken)
- JSON parse errors in payload
- Out of disk space

## Green Lights  
✅ **You're healthy**:
- Latest pack <5min old
- All recent tasks successful
- Docs being processed 50+ per day
- Zero unhandled read failures
