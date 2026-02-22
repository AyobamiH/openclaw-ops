# TOOLS - Summarization Agent Development

## Local Development Setup

### Requirements
- Node.js 22.x
- TypeScript 5.5+
- OpenAI API key (for gpt-4o-mini model)

### Installation

```bash
cd agents/summarization-agent
npm install
```

### Environment

Create `.env.local`:
```
OPENAI_API_KEY=sk-...
AGENT_ID=summarization-agent
LOG_LEVEL=debug
```

### Running Locally

```bash
# Test the agent directly
npm run test:local

# Start in watch mode (for development)
npm run dev

# Run specific test
npm run test -- --grep "research_paper"
```

## Test Suite

### Unit Tests
```bash
# Test summarization logic
npm run test:unit

# Expected: 
# ✓ Compresses 10-page doc to ~1 page
# ✓ Preserves key Statistics
# ✓ Handles PDF extraction errors
```

### Integration Tests
```bash
# Test with documentParser + normalizer skills
npm run test:integration

# Expected:
# ✓ Can call documentParser skill (permission check passes)
# ✓ Can call normalizer skill (permission check passes)
# ✓ Compression ratio >= 5:1
```

### E2E Tests
```bash
# Full workflow with real documents
npm run test:e2e

# Test files: public/test-docs/
# - research_paper.pdf (18 pages)
# - earnings_report.pdf (45 pages)
# - transcript.txt (3000 words)
```

## Permission Testing

### Verify Skills Access

```typescript
// Test that we can access documentParser
const agent = loadConfig();
if (!canUseSkill('documentParser')) {
  throw new Error('Permission denied: documentParser');
}

// Test that we cannot access sourceFetch (should be denied)
if (canUseSkill('sourceFetch')) {
  throw new Error('ERROR: Should NOT have access to sourceFetch');
}
```

### Audit Log Inspection

```bash
# View all skill invocations
npm run audit:log

# View denied invocations (should be empty if security working)
npm run audit:denied

# Expected output:
# Allowed invocations: 127
# Denied invocations: 0 ✓ (security working)
```

## Debugging

### Enable Debug Logging

```bash
DEBUG=summarization-agent:* npm run test:local
```

### Common Issues

**Issue: "documentParser skill not found"**
- Check: Is orchestrator/skills/documentParser.ts created?
- Check: Is skill registered in orchestrator/skills/index.ts?
- Fix: Run `npm run orchestrator:init`

**Issue: "Compression ratio below 5:1"**
- Check: Is input document mostly boilerplate?
- Check: Are we extracting key facts correctly?
- Debug: Use `DEBUG=extract:* npm run test`

**Issue: "SLA timeout (>20 sec for research paper)"**
- Check: Is documentParser skill slow?
- Check: Is model busy (quota issue)?
- Measure: `npm run benchmark` to profile

## Credentials (Local Dev Only)

For local testing, create `credentials.local.json`:

```json
{
  "openai": {
    "apiKey": "sk-...",
    "model": "gpt-4o-mini",
    "maxTokens": 2000
  },
  "testDocuments": {
    "basePath": "../../public/test-docs",
    "timeout": 45000
  }
}
```

**⚠️ NEVER commit credentials to git**
- .env.local is in .gitignore
- credentials.local.json is in .gitignore
- Production credentials handled by orchestrator only

## Cost Analysis

### Per-Task Costs

| Task | Input Tokens | Output Tokens | Cost |
|------|--------------|---------------|------|
| 10-page doc | 2,000 | 400 | ~$0.008 |
| 45-page report | 9,000 | 800 | ~$0.028 |
| 20-meeting batch | 15,000 | 1,200 | ~$0.042 |

**Monthly estimate (1K tasks/month):** ~$30

## Monitoring Checklist

Before deploying to production:

- [ ] All tests passing (`npm run test`)
- [ ] All permissions verified (`npm run audit:deniedInvocations === []`)
- [ ] SLA benchmarked (`npm run benchmark` shows <20 sec for all cases)
- [ ] Compression ratio validated (>=5:1 on all test docs)
- [ ] Error handling tested (missing docs, malformed PDFs, timeouts)
- [ ] Cost tracking enabled (`DEBUG=cost:* npm run test`)
- [ ] Heartbeat check manual validated (network, skills, performance)

## Performance Optimization

### Quick Wins
```bash
# Profile task execution
npm run profile

# Identify bottleneck:
# |- documentParser call: 5 sec (major)
# |- text extraction: 2 sec (minor)
# |- summarization model: 10 sec (expected)

# Optimization strategies:
# 1. Parallelize documentParser + normalizer calls
# 2. Add caching layer for duplicate documents
# 3. Use gpt-4o-mini (cheaper/faster model is already set)
```

### Scaling

**Single instance:** 10 concurrent tasks (per SLA)  
**For 100 concurrent:** Use task queue (orchestrator manages)

## References

- [documentParser skill](../../orchestrator/skills/documentParser.ts)
- [normalizer skill](../../orchestrator/skills/normalizer.ts)
- [agent config schema](../../docs/agent-config-schema.json)
- [OpenAI API docs](https://platform.openai.com/docs/api-reference/completions)
