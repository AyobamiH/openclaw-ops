# TOOLS - Local Development Setup

## Development

```bash
# Install dependencies
npm install

# Run unit tests
npm start -- '{"input":{"testCommand":"unit-tests"}}'

# Run integration tests
npm start -- '{"input":{"testCommand":"integration-tests"}}'

# Debug mode
DEBUG=* npm start

# Test locally
npm test
```

## Credentials (Dev Only)

```yaml
# .env.local (do not commit)
TEST_TIMEOUT: 300000
COVERAGE_THRESHOLD: 80
WORKSPACE_PATH: ./workspace
```

## Testing Checklist

- [ ] Unit tests run and parse results
- [ ] Integration tests run successfully
- [ ] E2E tests run and report results
- [ ] Coverage collection works (--coverage flag)
- [ ] Test failures are detected correctly
- [ ] Reports are generated in artifacts/qa-reports/
