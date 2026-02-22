# TOOLS - Local Development & Credentials

> ⚠️ **DEVELOPMENT ONLY** - Do not commit credentials to git. This file is in .gitignore.

## Local Configuration

Place development-only secrets and tools here:

```yaml
# API Keys (development only)
openai_key: sk-proj-...
anthropic_key: sk-ant-...

# Database connections
postgres: postgresql://user:pass@localhost:5432/dbname

# Test fixtures
test_data: /workspace/fixtures/test-data.json

# Mock server
mock_server_url: http://localhost:3001
```

## Development Tools

### Running the Agent Locally

```bash
# Install dependencies
npm install

# Run with test input
npm start -- '{"input": {"url": "https://example.com"}}'

# Run in watch mode
npm run dev

# Run tests
npm test

# Debug with logging
DEBUG=* npm start
```

### Testing Skills Locally

```bash
# Load skill registry
npm run test:skills

# Test individual skill
npm run test:skill sourceFetch -- '{"url": "https://example.com"}'
```

### Monitoring

```bash
# View live logs
tail -f logs/agents/[agent-id].log

# Check agent status
curl http://localhost:3000/api/agents/[agent-id]/status

# View skill invocations
curl http://localhost:3000/api/agents/[agent-id]/invocations?limit=10
```

## CI/CD Credentials

These are injected by GitHub Actions (see .github/workflows):

- `OPENAI_API_KEY` - Set in GitHub Secrets
- `ANTHROPIC_API_KEY` - Set in GitHub Secrets
- `POSTGRES_URL` - Set in GitHub Secrets

Never copy/paste these into this file.

## Port Allocations

- Agent HTTP server: [port]
- Local skills server: 3001
- Orchestrator: 3000
- PostgreSQL: 5432

## Local Testing Checklist

- [ ] Config file loads without errors
- [ ] All required skills are accessible
- [ ] Network requests hit [domain] correctly
- [ ] Errors are logged with full trace
- [ ] Timeout handling works (<5 sec for mock)
- [ ] Heartbeat monitor starts
