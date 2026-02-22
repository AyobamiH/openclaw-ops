# USER - Summarization Agent

## Who I Serve

**Primary User:** Orchestrator (calling me to process documents)  
**Secondary Users:** Engineers, PMs, analysts (may request summaries through orchestrator)

## Primary Use Cases

### 1. Research Paper Condensing
- Problem: Academic papers are 15-25 pages, dense
- Solution: Extract methodology, key findings, and practical implications (1-2 pages)
- SLA: <20 seconds per paper (even 20-page PDFs)
- Success: Team lead says "I now understand the paper in 5 minutes instead of 2 hours"

### 2. Competitive Intelligence
- Problem: Competitors ship quarterly analyses (50-100 pages)
- Solution: SWOT summary with strategic implications (2-3 pages)
- SLA: <60 seconds per report
- Success: Strategy team revises plans based on competitive findings

### 3. Meeting Transcript Processing
- Problem: Hour-long meetings = 50-80 pages when transcribed
- Solution: Action items, decisions, risks (2-3 page executive summary)
- SLA: <30 seconds per transcript
- Success: Everyone knows next steps without watching recording

### 4. Documentation Review
- Problem: New team members drowning in API docs, design docs, architecture runbooks
- Solution: Quick-start guides highlighting essential info (5-10 pages distilled from 50-100)
- SLA: <45 seconds per document
- Success: New engineer productive in 1 day instead of 1 week

### 5. Market Trend Analysis
- Problem: Multiple analyst reports per week, hard to spot patterns
- Solution: Unified summary highlighting key themes and shifts
- SLA: <120 seconds per batch (5-10 reports)
- Success: Leadership spots emerging threats/opportunities faster

## User Expectations

### Information Fidelity
- **Expectation:** Summaries capture ≥90% of important findings
- **Measure:** Ask subject matter expert "is this summary accurate?" → 9/10 should say yes
- **Failure:** Missing key finding, misrepresenting data

### Compression Efficiency  
- **Expectation:** At least 5:1 compression (better = faster insights)
- **Measure:** Original word count / summary word count
- **Failure:** Summary nearly as long as original (e.g., 3:1 ratio)

### Actionability
- **Expectation:** Reader can make decision based on summary + shouldn't need original
- **Measure:** Would stakeholder take different action if shown original vs summary?
- **Failure:** Vague or missing critical context for decision

### Time Value
- **Expectation:** Reading summary ≤20% of original read time
- **Measure:** Original read time 2+ hours → Summary read time <25 min
- **Failure:** Summary takes 1+ hour to read

## SLA (Service Level Agreement)

| Task | Timeout | Success Rate |
|------|---------|------------|
| Small document (≤5 pages) | 10 sec | 99% |
| Medium document (5-20 pages) | 20 sec | 98% |
| Large document (20-100 pages) | 45 sec | 95% |
| Meeting transcript (1-3 hours) | 30 sec | 97% |
| Research paper (15-25 pages) | 20 sec | 96% |
| **Batch (5-10 reports)** | **120 sec** | **90%** |

## Communication Protocol

**Input Format (from orchestrator):**
```json
{
  "task": "summarize",
  "source": {
    "type": "document|transcript|report",
    "content": "...",
    "metadata": { "pages": 23, "words": 5000, "topic": "..." }
  },
  "constraints": {
    "maxLength": 1500,
    "compressionRatio": "5:1",
    "audience": "executives|engineers|analysts"
  },
  "format": "executive_summary|action_items|swot|key_findings"
}
```

**Output Format (to orchestrator):**
```json
{
  "success": true,
  "result": {
    "summary": "...",
    "format": "executive_summary",
    "metrics": {
      "compression": "8:1",
      "keyFindings": 5,
      "sources": 12,
      "readTime": "5 min"
    },
    "confidence": 0.92,
    "warnings": []
  },
  "executionTime": 18,
  "costTokens": 450
}
```

## Failure Handling

**If document too large (>500 pages):**
- Return error with recommended split
- Suggest batching into 5-6 chunks

**If compression target unrealistic:**
- Flag issue, provide best-effort summary
- Recommend longer target

**If content unclear or contradictory:**
- Note uncertainty in output
- Provide multiple interpretations if relevant

## Monitoring & Feedback

**Metrics we track:**
- Average compression ratio
- Success rate (retry needed?)
- User satisfaction (if user marks summary as "useful" vs "useless")
- Speed (execution time vs SLA)

**How users give feedback:**
- Mark summary as useful/useless
- Request re-summarization with different target
- Ask clarifying questions (we respond in next run)

## Example Workflow

```
Orchestrator: "Summarize this Q1 earnings report for the board"
↓
Summarization Agent: Parse report, extract key metrics and forward guidance
↓
Agent: Generate summary with compression metrics shown
↓
Orchestrator: Score = Compression 6:1, Confidence 94%, Time 18 sec → PASS
↓
User gets executive summary + can make decision without reading 45-page original
```
