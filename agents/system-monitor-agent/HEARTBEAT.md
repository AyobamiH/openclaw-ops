# HEARTBEAT - System Monitor & Observability Agent

## Health Checks (Every 1 minute)

✓ **Data collection:** Metrics flowing from all agents  
✓ **Logging:** Event logs being written  
✓ **Alert system:** Can generate and send alerts  

## Escalation
- 1st failure: Log warning
- 2nd failure (5 min): Log error
- 3rd failure (10 min): Alert manually (self-monitoring is broken)
