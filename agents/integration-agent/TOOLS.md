# TOOLS - Integration & Workflow Agent

## Setup
```bash
cd agents/integration-agent
npm install
```

## Testing
```bash
npm run test:local              # Quick tests
npm run test:workflows          # Test workflow execution
npm run test:error-handling     # Test recovery and retries
npm run validate:data-flow      # Verify data passes correctly
```

## Monitoring
```bash
npm run check:performance       # Workflow timing metrics
npm run audit:agent-calls       # Track which agents called
```

## Cost
Per workflow: $0.10-0.30 (depends on which agents called)  
Monthly (20 workflows/day): ~$60
