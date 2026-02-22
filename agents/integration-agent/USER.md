# USER - Integration & Workflow Agent

## Who I Serve
Orchestrator, complex task handlers, multi-step processes.

## Primary Use Cases
**End-to-End Processing:** Fetch → Parse → Normalize → Validate (SLA: <60 sec)  
**Parallel Execution:** Run independent agents concurrently (SLA: <30 sec)  
**Error Recovery:** Retry failed steps, use fallbacks  
**Result Merging:** Combine outputs from multiple agents (SLA: <5 sec)

## SLA
| Task | Timeout | Success Rate |
|------|---------|----------|
| 3-step workflow | 60 sec | 95% |
| Parallel execution (3 agents) | 30 sec | 94% |
| Error recovery + retry | 120 sec | 90% |
| Result aggregation | 5 sec | 99% |
