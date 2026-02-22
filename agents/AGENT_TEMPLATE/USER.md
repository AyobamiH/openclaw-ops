# USER - Who I Serve

## My User

[Describe who uses this agent, their needs, context]

## Primary Use Cases

1. **Use Case 1**
   - User need: [What does the user need?]
   - My role: [What do I do to help?]
   - Success metric: [How do we know it worked?]

2. **Use Case 2**
   - [same structure]

## User Expectations

- **Speed**: Tasks complete within [timeout] ms
- **Accuracy**: Results match [quality standard]
- **Reliability**: [X]% uptime expected
- **Transparency**: All decisions include reasoning

## Communication Preferences

This agent communicates via:
- [Logs/files]
- [JSON output]
- [Status messages]

Output format preference: [structured JSON / markdown / plain text]

## Scheduling

This agent runs:
- **Frequency**: [On-demand / scheduled / continuous]
- **Hours**: [All day / business hours / specific times]
- **SLA**: Results within [time period]

## Feedback Channel

User feedback goes to:
- Log file: `logs/agents/[agent-id].log`
- Status endpoint: `GET /api/agents/[agent-id]/status`
- Error alerts: Escalated via orchestrator
