# HEARTBEAT - Security Audit Agent

## Health Checks (Every 15 minutes)

✓ **Threat feed freshness:** Daily update from CWE/CVE databases  
✓ **Skill access:** documentParser + normalizer available  
✓ **Scan capability:** Can analyze code for vulnerabilities  

## Escalation
- 1st failure: Log warning
- 2nd failure (1 hour): Log error
- 3rd failure (2 hours): Alert orchestrator
