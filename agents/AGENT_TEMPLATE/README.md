# Agent Template - Copy and Customize

This is the boilerplate for creating new agents in the OpenClaw swarm.

## Required Governance Primitives

Every agent folder must include:

- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `README.md`

Policy authority: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Quick Start

1. **Copy this directory:**
   ```bash
   cp -r agents/AGENT_TEMPLATE agents/my-new-agent
   ```

2. **Update `agent.config.json`:**
   - Set `id`, `name`, `description`
   - Keep `orchestratorStatePath` and `serviceStatePath` (mandatory memory contract)
   - Configure allowed `skills`
   - Set `model` tier (cheap/balanced/heavy/strategic)

3. **Customize `SOUL.md`:**
   - Your agent's purpose and values
   - Core capabilities
   - Behavioral boundaries

4. **Update `src/index.ts`:**
   - Implement your main logic
   - Import allowed skills from skill registry
   - Follow the pattern in the example

5. **Test locally:**
   ```bash
   cd agents/my-new-agent
   npm install
   npm test
   ```

6. **Add to orchestrator:**
   - Add handler in `orchestrator/src/taskHandlers.ts`
   - Update `agentRegistry.ts` to register new agent
   - Restart orchestrator service

## File Structure

- `agent.config.json` - Agent configuration + permissions
- `ROLE.md` - Why the agent exists, done criteria, never-do rules
- `SCOPE.md` - Inputs/outputs, allowed actions, boundaries
- `POLICY.md` - Enforcement rules and governance constraints
- `SOUL.md` - Agent identity + values
- `IDENTITY.md` - Behavioral patterns + examples
- `TOOLS.md` - Local tools + credentials (dev only)
- `USER.md` - Who the agent serves
- `HEARTBEAT.md` - Periodic checks during execution
- `src/index.ts` - Entry point
- `src/service.ts` - Core implementation
- `package.json` - Dependencies

## Agent Config Schema

```json
{
  "id": "my-agent",
  "name": "My Agent",
   "orchestratorStatePath": "../../orchestrator_state.json",
   "serviceStatePath": "../../logs/my-agent-service.json",
  "description": "What this agent does",
  "version": "1.0.0",
  "model": {
    "primary": "claude-3-5-sonnet",
    "fallback": "gpt-4o-mini",
    "tier": "balanced"
  },
  "skills": {
    "sourceFetch": { "allowed": true },
    "documentParser": { "allowed": true },
    "normalizer": { "allowed": false }
  },
  "constraints": {
    "timeout": 60000,
    "maxRetries": 3,
    "memory": "512M"
  },
  "heartbeat": {
    "interval": 300000,
    "checks": ["liveness", "resource-usage"]
  }
}
```

## Memory Standard (Richer Specialized Mode)

- Baseline memory is mandatory for every agent via `orchestratorStatePath` + `serviceStatePath`.
- Orchestrator persists cross-run memory for spawned agents into `serviceStatePath` (status, counters, and recent timeline).
- If your agent has domain-specific memory artifacts, add explicit paths (for example `knowledgePackDir`, `draftLogPath`, `devvitQueuePath`) in addition to the baseline keys.

## Skill Usage Pattern

```typescript
import { executeSkill } from '../../skills/index.js';

async function myAgentLogic(input: any) {
  // Call allowed skill
  const fetchResult = await executeSkill('sourceFetch', {
    url: 'https://example.com',
    allowlist: ['example.com']
  }, 'my-agent');
  
  if (!fetchResult.success) {
    console.error('Fetch failed:', fetchResult.error);
    return;
  }
  
  const content = fetchResult.data.content;
  // ... process content
}
```

## Testing Checklist

- [ ] Config validates against schema
- [ ] All required skills are accessible
- [ ] Agent respects timeout limits
- [ ] Error handling works (network failures, timeouts)
- [ ] Logs include execution trace
- [ ] Heartbeat checks pass

## Deployment

1. **Build:**
   ```bash
   npm run build
   ```

2. **Test in production setup:**
   ```bash
   docker-compose up orchestrator
   ```

3. **Monitor logs:**
   ```bash
   tail -f logs/agents/my-agent.log
   ```

4. **Verify in orchestrator:**
   ```bash
   curl http://localhost:3000/api/agents/my-agent/status
   ```
