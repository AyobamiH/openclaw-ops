---
title: "OpenClaw System Architecture Prompt"
description: "Prompt to generate Mermaid diagram of full 12-agent swarm architecture"
---

# Prompt: Generate System Architecture Diagram

**Use this prompt with Claude, GPT-4, or feed directly to `renderMermaidDiagram` tool:**

---

## System Architecture Diagram Prompt

Create a **colorful Mermaid diagram** of an intelligent agent swarm with these elements:

### Core Components

1. **Central Orchestrator** (main router)
   - Color: Red/crimson (highlight as critical)
   - Functions: Task routing, error escalation, state management

2. **Five Core Skills** (audited, reusable capabilities)
   - **SourceFetch**: HTTP fetching + allowlist enforcement
   - **DocumentParser**: Multi-format extraction (PDF/HTML/CSV)
   - **Normalizer**: Schema-driven data validation
   - **WorkspacePatch**: Safe code modifications with dry-run mode
   - **TestRunner**: Whitelisted test execution
   - **Audit Gate**: Permission checking & enforcement
   - Color: Teal/cyan (trusted capabilities)

3. **Eleven Specialized Worker Agents**
   - Market Research (uses: SourceFetch, tier: cheap)
   - Data Extraction (uses: DocumentParser, tier: cheap)
   - Summarization (read-only, tier: cheap)
   - Build & Refactor (uses: WorkspacePatch+TestRunner, tier: heavy)
   - QA Verification (uses: TestRunner, tier: balanced)
   - Operations (uses: WorkspacePatch+TestRunner, tier: heavy)
   - Security Hardening (audit-only, tier: balanced)
   - Data Normalization (uses: Normalizer, tier: cheap)
   - Content Generation (draft-only, tier: cheap)
   - Integration & Automation (uses: SourceFetch+Normalizer, tier: balanced)
   - Skill Discovery & Supply Chain Audit (audits other skills, tier: balanced)
   - Colors: Green (data agents), Purple (code agents), Orange (QA), Red (security)

4. **Model Tier System**
   - Tier 1 (Cheap): Haiku / gpt-4o-mini (~$1.40/day)
   - Tier 2 (Balanced): Claude 3.5 Sonnet (~$9.00/day)
   - Tier 3 (Heavy): gpt-4 / Opus (~$11.00/day)
   - Tier 4 (Strategic): Opus selective (~$2.00/day)
   - Colors: Orange, Green, Red, Purple respectively

### Diagram Structure

- **Show connections**: Orchestrator → all agents
- **Show skill calls**: Agents → which skills they use
- **Show model usage**: Agents → which tier they run on
- **Show audit layer**: Audit Gate enforces on all skills
- Use **thick borders** and **emoji icons** for visual interest
- Use **subgraphs** to organize skills, agents, and models

### Output Format

Generate a valid Mermaid flowchart (graph TB) with:
- Color-coded nodes by type/function
- Clear directional arrows with labels
- Readable node text with emoji for quick scanning
- Emojis: 🎯 orchestrator, 🛠️ skills, 👥 agents, 🧠 models, 🔐 security

---

## Alternative: Text-Based Prompt for LLM

If feeding to an LLM without Mermaid support:

"Create a detailed ASCII art or text diagram showing:
1. A central orchestrator node
2. 11 agents arranged in a circle around it
3. 5-6 skill boxes below
4. Color-coded by function: green=data, purple=code, orange=testing, red=security
5. Arrows showing which agents call which skills
6. A legend explaining the color coding and model tiers

Make it visually interesting with Unicode box-drawing characters and emojis.
Include the full 12-agent swarm with all agent names and primary skills."

---

## Using This Diagram

**In documentation:**
```markdown
![System Architecture](docs/system-architecture.svg)

The diagram above shows:
- Red center: Single orchestrator (mission control)
- Teal boxes: 5 core skills (reusable, audited)
- Colored agents: 11 specialized workers, color-coded by function
- Model tiers: Each agent uses one of 4 model cost tiers
- Total cost: ~$23/day for full swarm, never ships broken code
```

**In presentations:**
- Use the Mermaid diagram directly in slides
- Highlight the color-coding scheme
- Point out skill reuse (multiple agents use same skill)
- Show cost breakdown by agent tier

**In proposals:**
- Demonstrates architecture sophistication
- Shows security (audit gate enforcement)
- Illustrates scalability (11 agents, but more can be added)
- Cost-justified (tiered modeling)

---

## Customization Ideas

**Add more agents:**
- Replace A11 with another agent
- Update the skill connections
- Add new skills to the Skills subgraph

**Change colors:**
- Adjust `fill:` and `stroke:` values in Mermaid styling
- Or ask LLM: "Use a different color scheme (e.g., Slack-inspired)"

**Add data flow:**
- Include sample data flowing through pipeline
- Show state transitions (pending → processing → completed)

**Add SLAs:**
- Add timeout values on agent boxes
- Show resource limits (memory, CPU)

---

_Generated for OpenClaw Orchestrator | 12-Agent Swarm Architecture_
_Use with: Mermaid, Graphviz, or feed to Claude/GPT-4 for customization_
