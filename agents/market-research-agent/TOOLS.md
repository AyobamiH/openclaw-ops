# TOOLS - Local Development Setup

## Development

```bash
# Install dependencies
npm install

# Run locally with test input
npm start -- '{"input":{"urls":["https://github.com/openai"]}}'

# Debug mode
DEBUG=* npm start

# Test locally
npm test
```

## Credentials (Dev Only)

```yaml
# .env.local (do not commit)
ALLOWED_DOMAINS: github.com,openai.com,anthropic.com,arxiv.org,huggingface.co
FETCH_TIMEOUT: 10000
MAX_CONTENT_SIZE: 10485760  # 10MB
```

## Testing Checklist

- [ ] Can fetch from github.com
- [ ] Can fetch from openai.com
- [ ] Blocks fetch from example.com (not allowlisted)
- [ ] Timeout works (try with 1ms timeout)
- [ ] Error handling works (404, 500, network error)
- [ ] Content is normalized (scripts removed)
