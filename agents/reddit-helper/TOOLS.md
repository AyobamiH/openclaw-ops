# TOOLS — Community Helper Toolkit

## Knowledge Pack Loading
- `loadKnowledgePackFromDir()` — Find latest pack JSON
- Parse docs array, extract summaries and metadata
- Source: `src/index.ts`

## Response Composition
- Build context string from relevant docs
- Match question keywords to doc content
- Compose response using knowledge as source
- Format with markdown for Reddit
- Source: `src/service.ts`

## Draft Logging
```javascript
appendJsonl(draftLogPath, {
  timestamp: new Date().toISOString(),
  subreddit: task.queue.subreddit,
  author: task.queue.author,
  question: task.queue.question,
  draftReply: result.replyText,
  confidence: result.confidence,
  ctaVariant: result.ctaVariant,
  packId: result.packId,
  approved: false
})
```

## Confidence Scoring (0-1)
- **0.9-1.0**: Docs directly address the question with code/examples
- **0.7-0.9**: Docs cover the topic, clear guidance provided
- **0.5-0.7**: Docs partially relevant, some inference needed
- **0.2-0.5**: Docs touch on topic but incomplete
- **0.0-0.2**: Docs don't really cover this, answer is weak

## CTA Variants
- `learn-more`: Link to relevant doc
- `code-example`: Provide code snippet from docs
- `ask-specialist`: Suggest they file issue/ask expert
- `point-to-docs`: "See docs for details"

## Telemetry
```
telemetry.info('response.start', { subreddit, author })
telemetry.info('response.composed', { confidence, ctaVariant })
telemetry.warn('pack.missing', { reason })
telemetry.info('draft.logged', { subreddit, path })
telemetry.error('response.failed', { message })
```

## Configuration
File: `agent.config.json`
```json
{
  "knowledgePackDir": "../logs/knowledge-packs",
  "draftLogPath": "../logs/reddit-drafts.jsonl",
  "devvitQueuePath": "../logs/devvit-queue.jsonl"
}
```

# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
