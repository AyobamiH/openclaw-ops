# TOOLS - Local Development Setup

## Development

```bash
# Install dependencies
npm install

# Test with local file
npm start -- '{
  "input": {
    "files": [
      {"path":"workspace/test.pdf", "format":"pdf"},
      {"path":"workspace/test.csv", "format":"csv"}
    ]
  }
}'

# Debug mode
DEBUG=* npm start

# Test locally
npm test
```

## Credentials (Dev Only)

```yaml
# .env.local (do not commit)
PARSER_TIMEOUT: 90000
MAX_FILE_SIZE: 104857600  # 100MB
WORKSPACE_PATH: ./workspace
```

## Testing Checklist

- [ ] Can parse PDF to blocks
- [ ] Can extract tables from HTML
- [ ] Can parse CSV to JSON
- [ ] Entity extraction works (dates, emails, amounts)
- [ ] Schema normalization validates
- [ ] File write restricted to artifacts/
