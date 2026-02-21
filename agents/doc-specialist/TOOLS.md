# TOOLS — Knowledge Engineer Toolkit

## File I/O
- `readFile()` — Load markdown from disk
- `writeFile()` — Write knowledge pack JSON
- `mkdir()` — Ensure directories exist

## Parsing & Extraction
- `normalizeDocPath()` — Resolve relative paths to absolute
- `extractHeading()` — Find first H1 or H2 in markdown
- `summarize()` — Truncate content to 600 chars
- Source: `src/index.ts`

## Metadata Collection
- Word count: `content.split(/\s+/).filter(Boolean).length`
- Byte size: `Buffer.byteLength(content, 'utf-8')`
- Path tracking: relative path from docs root

## Knowledge Pack Format
```json
{
  "id": "knowledge-pack-1705416768000",
  "generatedAt": "2025-01-10T14:32:48.123Z",
  "taskId": "...",
  "requestedBy": "scheduler",
  "targetAgents": ["reddit-helper"],
  "docs": [
    {
      "path": "concepts/architecture.md",
      "absolutePath": "/full/path/concepts/architecture.md",
      "summary": "...",
      "wordCount": 3000,
      "bytes": 24000,
      "firstHeading": "System Architecture"
    }
  ]
}
```

## Telemetry
```
telemetry.info('pack.start', { files: docPaths.length })
telemetry.info('pack.complete', { packPath, docsProcessed: count })
telemetry.warn('doc.read_failed', { path, message })
telemetry.info('task.received', { id, files: docPaths.length })
telemetry.info('task.success', { id, packPath, docsProcessed })
telemetry.error('task.failed', { message })
```

## Configuration
File: `agent.config.json`
```json
{
  "docsPath": "./openclaw-docs",
  "knowledgePackDir": "../logs/knowledge-packs"
}
```
