# TOOLS — Shared Utilities

## Telemetry Class
```typescript
const telemetry = new Telemetry({ component: "agent-name" });

telemetry.info(event, data)     // Info-level event
telemetry.warn(event, data)     // Warning-level event
telemetry.error(event, data)    // Error-level event
```

**Events follow pattern**: `domain.event`
- `pack.start`, `pack.complete` (doc-specialist)
- `response.start`, `response.composed` (reddit-helper)
- `task.received`, `task.success`, `task.failed` (all agents)

## File Operations
- Atomic writes (write to temp, then rename)
- Directory creation (recursive, safe)
- JSONL appending (atomic per line)
- Safe cleanup on errors

## Type Definitions
See individual agent interfaces in their `src/index.ts`:
- `DriftRepairPayload` — doc-specialist input
- `RedditQueuePayload` — reddit-helper input
- `KnowledgePack` — Shared knowledge format

## Error Handling
- All telemetry captured before throwing
- Agents responsible for try/catch
- Errors logged with context (component, event, message)

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
