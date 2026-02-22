# TOOLS - Security Audit Agent

## Development Setup
```bash
cd agents/security-agent
npm install
```

## Environment
```
ANTHROPIC_API_KEY=sk-ant-...
THREAT_FEED_URL=https://cve.mitre.org/data/feeds/
```

## Testing
```bash
npm run test:local          # Quick tests
npm run test:security       # Scan test codebase for vulns
npm run audit:known-vulns   # Check against known vulnerabilities
```

## Monitoring
```bash
npm run check:threat-feeds  # Verify threat intelligence up-to-date
npm run validate:cve-db     # Validate CVE database freshness
```

## Cost Analysis
Per-scan: $0.20-0.50 depending on codebase size  
Monthly (10 scans): ~$50
