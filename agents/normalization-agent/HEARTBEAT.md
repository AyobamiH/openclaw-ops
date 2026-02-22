# HEARTBEAT - Normalization Agent

## Health Checks (Every 5 minutes)

✓ **Skill access:** normalizer + documentParser available  
✓ **Performance:** Normalization time <2 sec per 100K records  
✓ **Error rate:** <1% of records failing validation  

## Escalation
- 1st failure: Log warning
- 2nd failure (30 min): Log error
- 3rd failure (1 hour): Alert orchestrator
