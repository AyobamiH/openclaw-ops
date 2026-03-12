import type { EvidenceChunkRecord, SourceCitationRecord } from "../types/domain.js";
import { shortHash } from "./ids.js";

export interface ChunkSeed {
  content: string;
  page: number | null;
}

export function buildChunksAndCitations(
  documentId: string,
  seeds: ChunkSeed[]
): { chunks: EvidenceChunkRecord[]; citations: SourceCitationRecord[] } {
  const chunks: EvidenceChunkRecord[] = [];
  const citations: SourceCitationRecord[] = [];
  let anchor = 0;
  let sequence = 1;

  for (const seed of seeds) {
    const normalized = seed.content.replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }

    for (const part of splitChunk(normalized, 1200)) {
      const anchorStart = anchor;
      const anchorEnd = anchorStart + part.length;
      const chunkId = `chk_${documentId}_${sequence}_${shortHash(part)}`;
      const citationId = `cit_${documentId}_${sequence}_${shortHash(`${part}:${anchorStart}`)}`;
      const excerpt = part.length > 220 ? `${part.slice(0, 217)}...` : part;

      const citation: SourceCitationRecord = {
        citationId,
        documentId,
        chunkId,
        locatorType: seed.page ? "page" : "sequence",
        locatorValue: seed.page ? `page:${seed.page}` : `sequence:${sequence}`,
        excerpt,
        pageStart: seed.page,
        pageEnd: seed.page,
        anchorStart,
        anchorEnd
      };

      const chunk: EvidenceChunkRecord = {
        chunkId,
        documentId,
        sequence,
        citationId,
        text: part,
        normalizedText: part,
        excerpt,
        pageStart: seed.page,
        pageEnd: seed.page,
        anchorStart,
        anchorEnd
      };

      citations.push(citation);
      chunks.push(chunk);
      sequence += 1;
      anchor = anchorEnd + 1;
    }
  }

  return { chunks, citations };
}

function splitChunk(value: string, maxLength: number): string[] {
  if (value.length <= maxLength) {
    return [value];
  }

  const parts: string[] = [];
  let remaining = value;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const splitAt = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf(" "));
    const index = splitAt > maxLength * 0.6 ? splitAt + 1 : maxLength;
    parts.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts;
}
