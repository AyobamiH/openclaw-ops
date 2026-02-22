# TOOLS - System Monitor & Observability Agent

## Setup
```bash
cd agents/system-monitor-agent
npm install
```

## Testing
```bash
npm run test:local              # Quick tests
npm run test:metrics            # Metrics collection
npm run test:alerts             # Alert generation
```

## Monitoring
```bash
npm run start:dashboard         # Live web dashboard
npm run export:metrics          # Export to monitoring system
npm run check:overhead          # Monitor agent's own resource usage
```

## Cost
Almost free — runs only on monitoring only, minimal overhead  
Estimated: <$1/month
