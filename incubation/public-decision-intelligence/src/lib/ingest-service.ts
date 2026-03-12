import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import type { EvidenceLedgerStore } from "./ledger-store.js";
import type { DocumentRecord, EntityRecord, IngestionAuditRecord } from "../types/domain.js";
import { DomainError } from "../common/errors.js";
import { makeId, shortHash, slugKey } from "./ids.js";
import { inferFormat, parseSourceFile } from "./file-parser.js";
import { buildChunksAndCitations } from "./chunker.js";
import { extractStructuredIntelligence } from "./phase2-extractor.js";
import { rebuildDecisionChains } from "./decision-chains.js";

export const ingestRequestSchema = z.object({
  sourcePath: z.string().min(1),
  logicalSourceKey: z.string().min(3),
  title: z.string().min(1).optional(),
  sourceType: z.string().min(1),
  sourceCollection: z.string().min(1),
  publishedDate: z.string().datetime().optional()
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;

export async function ingestDocument(
  input: IngestRequest,
  options: {
    env: AppEnv;
    ledger: EvidenceLedgerStore;
  }
) {
  const request = ingestRequestSchema.parse(input);
  const sourcePath = resolve(request.sourcePath);

  if (!isAbsolute(sourcePath)) {
    throw new DomainError("INVALID_SOURCE_PATH", "sourcePath must resolve to an absolute path");
  }

  let fileStat;
  try {
    fileStat = await stat(sourcePath);
  } catch {
    throw new DomainError("SOURCE_NOT_FOUND", `No source file found at ${sourcePath}`, 404);
  }

  if (!fileStat.isFile()) {
    throw new DomainError("INVALID_SOURCE_PATH", "sourcePath must point to a file");
  }

  const sizeMb = fileStat.size / (1024 * 1024);
  if (sizeMb > options.env.MAX_SOURCE_FILE_MB) {
    throw new DomainError("SOURCE_TOO_LARGE", `Source exceeds ${options.env.MAX_SOURCE_FILE_MB} MB limit`);
  }

  const sourceBuffer = await BunLike.readFileBuffer(sourcePath);
  const checksumSha256 = createHash("sha256").update(sourceBuffer).digest("hex");

  return options.ledger.update(async (state) => {
    const versionCandidate = state.documents
      .filter((document) => document.logicalSourceKey === request.logicalSourceKey)
      .sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt))[0];

    if (versionCandidate?.checksumSha256 === checksumSha256) {
      const audit: IngestionAuditRecord = {
        ingestId: makeId("ing"),
        documentId: versionCandidate.documentId,
        sourcePath,
        logicalSourceKey: request.logicalSourceKey,
        checksumSha256,
        status: "deduplicated",
        ingestedAt: new Date().toISOString(),
        message: "Source checksum already present for the logical source key."
      };
      state.ingests.push(audit);
      return {
        deduplicated: true,
        document: versionCandidate,
        chunks: state.chunks.filter((chunk) => chunk.documentId === versionCandidate.documentId),
        citations: state.citations.filter((citation) => citation.documentId === versionCandidate.documentId),
        entities: state.entities.filter((entity) => entity.documentIds.includes(versionCandidate.documentId)),
        mentions: state.mentions.filter((mention) => mention.documentId === versionCandidate.documentId),
        events: state.events.filter((event) => event.documentId === versionCandidate.documentId),
        claims: state.claims.filter((claim) => claim.documentId === versionCandidate.documentId),
        relationships: state.relationships.filter((relationship) => relationship.documentId === versionCandidate.documentId),
        decisionChains: state.decisionChains.filter((chain) =>
          chain.documentIds.includes(versionCandidate.documentId)
        ),
        ingest: audit
      };
    }

    const versionGroupId = versionCandidate?.versionGroupId ?? `vg_${slugKey(request.logicalSourceKey)}_${shortHash(request.logicalSourceKey)}`;
    const documentId = makeId("doc");
    const objectKey = buildObjectKey(versionGroupId, documentId, basename(sourcePath));
    const targetPath = resolve(options.env.OBJECT_STORAGE_BASE_DIR, objectKey);

    await mkdir(dirname(targetPath), { recursive: true });
    await mkdir(resolve(options.env.INGESTION_TMP_DIR), { recursive: true });
    await copyFile(sourcePath, targetPath);

    const parse = await parseSourceFile(targetPath, {
      ocrFallbackEnabled: options.env.OCR_FALLBACK_ENABLED
    });
    const { chunks, citations } = buildChunksAndCitations(documentId, parse.blocks);
    const structured = extractStructuredIntelligence({
      documentId,
      chunks,
      citations,
      existingEntities: state.entities
    });

    const document: DocumentRecord = {
      documentId,
      versionGroupId,
      logicalSourceKey: request.logicalSourceKey,
      title: request.title ?? basename(sourcePath, extname(sourcePath)),
      sourceType: request.sourceType,
      sourceCollection: request.sourceCollection,
      checksumSha256,
      sizeBytes: fileStat.size,
      objectKey,
      originalFilename: basename(sourcePath),
      mimeType: mimeFromFormat(inferFormat(sourcePath)),
      publishedDate: request.publishedDate ?? null,
      parseStatus: parse.parseStatus,
      ocrStatus: parse.ocrStatus,
      parseWarnings: parse.warnings,
      supersedesDocumentId: versionCandidate?.documentId ?? null,
      ingestedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      citationCount: citations.length
    };

    const audit: IngestionAuditRecord = {
      ingestId: makeId("ing"),
      documentId,
      sourcePath,
      logicalSourceKey: request.logicalSourceKey,
      checksumSha256,
      status: "ingested",
      ingestedAt: new Date().toISOString(),
      message: null
    };

    state.documents.push(document);
    state.chunks.push(...chunks);
    state.citations.push(...citations);
    state.entities = mergeEntities(state.entities, structured.entities);
    state.mentions.push(...structured.mentions);
    state.events.push(...structured.events);
    state.claims.push(...structured.claims);
    state.relationships.push(...structured.relationships);
    state.decisionChains = rebuildDecisionChains(state);
    state.ingests.push(audit);

    return {
      deduplicated: false,
      document,
      chunks,
      citations,
      entities: structured.entities,
      mentions: structured.mentions,
      events: structured.events,
      claims: structured.claims,
      relationships: structured.relationships,
      decisionChains: state.decisionChains.filter((chain) =>
        chain.documentIds.includes(documentId) || chain.sourceCollection === request.sourceCollection
      ),
      ingest: audit
    };
  });
}

function buildObjectKey(versionGroupId: string, documentId: string, filename: string): string {
  return join(versionGroupId, `${documentId}_${filename}`);
}

function mimeFromFormat(format: string): string {
  switch (format) {
    case "json":
      return "application/json";
    case "csv":
      return "text/csv";
    case "html":
      return "text/html";
    case "ipynb":
      return "application/x-ipynb+json";
    case "pdf":
      return "application/pdf";
    case "image":
      return "application/octet-stream";
    case "audio":
      return "application/octet-stream";
    case "video":
      return "application/octet-stream";
    default:
      return "text/plain";
  }
}

const BunLike = {
  async readFileBuffer(filePath: string): Promise<Buffer> {
    const { readFile } = await import("node:fs/promises");
    return Buffer.from(await readFile(filePath));
  }
};

function mergeEntities(existing: EntityRecord[], incoming: EntityRecord[]) {
  const merged = new Map(existing.map((entity) => [entity.canonicalKey, entity]));
  for (const entity of incoming) {
    const current = merged.get(entity.canonicalKey);
    if (!current) {
      merged.set(entity.canonicalKey, entity);
      continue;
    }
    current.mentionCount = Math.max(current.mentionCount, entity.mentionCount);
    for (const documentId of entity.documentIds) {
      if (!current.documentIds.includes(documentId)) {
        current.documentIds.push(documentId);
      }
    }
  }
  return [...merged.values()];
}
