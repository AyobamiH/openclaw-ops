import type {
  ClaimRecord,
  EntityMentionRecord,
  EntityRecord,
  EventRecord,
  EvidenceChunkRecord,
  RelationshipRecord,
  SourceCitationRecord
} from "../types/domain.js";
import { makeId, shortHash, slugKey } from "./ids.js";

type EntityType = EntityRecord["entityType"];

const EVENT_PATTERNS: Array<{ eventType: string; title: string; pattern: RegExp }> = [
  { eventType: "meeting", title: "Meeting", pattern: /\bmeeting|met with|met\b/i },
  { eventType: "email", title: "Email", pattern: /\bemail|emailed|wrote to\b/i },
  { eventType: "recommendation", title: "Recommendation", pattern: /\brecommend|recommended|recommendation\b/i },
  { eventType: "review", title: "Review", pattern: /\breview|reviewed|committee review\b/i },
  { eventType: "approval", title: "Approval", pattern: /\bapproved|approval\b/i },
  { eventType: "appointment", title: "Appointment", pattern: /\bappoint|appointment|appointed\b/i },
  { eventType: "announcement", title: "Announcement", pattern: /\bannounce|announcement|announced\b/i },
  { eventType: "statement", title: "Statement", pattern: /\bstatement|said that|stated\b/i },
  { eventType: "objection", title: "Objection", pattern: /\bobjection|objected|opposed\b/i }
];

const RELATION_PATTERNS: Array<{ predicate: string; pattern: RegExp }> = [
  { predicate: "met_with", pattern: /\bmet with|meeting with\b/i },
  { predicate: "recommended", pattern: /\brecommended|recommendation\b/i },
  { predicate: "reviewed", pattern: /\breviewed|committee review\b/i },
  { predicate: "appointed", pattern: /\bappointed|appointment\b/i },
  { predicate: "communicated_with", pattern: /\bemail|emailed|wrote to|called\b/i },
  { predicate: "objected_to", pattern: /\bobjected|opposed\b/i }
];

const DATE_REGEX = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/g;
const PERSON_REGEX = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
const ORG_KEYWORDS = /\b(Committee|Department|Office|Government|Cabinet|Council|Party|Ministry|Company|Corporation|Ltd|Limited|PLC)\b/i;

export function extractStructuredIntelligence(input: {
  documentId: string;
  chunks: EvidenceChunkRecord[];
  citations: SourceCitationRecord[];
  existingEntities: EntityRecord[];
}) {
  const entities = new Map<string, EntityRecord>();
  for (const entity of input.existingEntities) {
    entities.set(entity.canonicalKey, entity);
  }

  const mentions: EntityMentionRecord[] = [];
  const events: EventRecord[] = [];
  const claims: ClaimRecord[] = [];
  const relationships: RelationshipRecord[] = [];
  const citationById = new Map(input.citations.map((citation) => [citation.citationId, citation]));

  for (const chunk of input.chunks) {
    const chunkCitation = citationById.get(chunk.citationId);
    const chunkEntities = extractChunkEntities(chunk.text).map((candidate) => upsertEntity(candidate, input.documentId, entities));

    for (const candidate of chunkEntities) {
      mentions.push({
        mentionId: makeId("men"),
        entityId: candidate.entityId,
        documentId: input.documentId,
        chunkId: chunk.chunkId,
        citationId: chunk.citationId,
        surfaceForm: candidate.displayName,
        resolutionState: "resolved",
        confidence: candidate.confidence
      });
    }

    claims.push({
      claimId: makeId("clm"),
      documentId: input.documentId,
      chunkId: chunk.chunkId,
      citationIds: [chunk.citationId],
      claimText: chunk.text,
      evidenceClass: "direct",
      lifecycleState: "extracted",
      confidence: 0.75
    });

    const eventDate = firstDate(chunk.text);
    for (const descriptor of EVENT_PATTERNS.filter((event) => event.pattern.test(chunk.text))) {
      events.push({
        eventId: makeId("evt"),
        eventType: descriptor.eventType,
        documentId: input.documentId,
        chunkId: chunk.chunkId,
        citationId: chunk.citationId,
        title: descriptor.title,
        summary: chunk.excerpt,
        eventDate,
        evidenceClass: "direct",
        lifecycleState: "extracted",
        entityIds: chunkEntities.map((entity) => entity.entityId)
      });
    }

    for (const relation of RELATION_PATTERNS.filter((item) => item.pattern.test(chunk.text))) {
      if (chunkEntities.length >= 2) {
        relationships.push({
          relationshipId: makeId("rel"),
          documentId: input.documentId,
          chunkId: chunk.chunkId,
          citationId: chunk.citationId,
          subjectEntityId: chunkEntities[0].entityId,
          predicate: relation.predicate,
          objectEntityId: chunkEntities[1].entityId,
          eventId: null,
          summary: chunk.excerpt,
          evidenceClass: "direct",
          lifecycleState: "linked",
          confidence: 0.78
        });
      }
    }

    for (const event of events.filter((candidate) => candidate.chunkId === chunk.chunkId)) {
      for (const entity of chunkEntities) {
        relationships.push({
          relationshipId: makeId("rel"),
          documentId: input.documentId,
          chunkId: chunk.chunkId,
          citationId: chunk.citationId,
          subjectEntityId: entity.entityId,
          predicate: "participated_in",
          objectEntityId: null,
          eventId: event.eventId,
          summary: `${entity.displayName} appears in ${event.eventType} evidence`,
          evidenceClass: "direct",
          lifecycleState: "linked",
          confidence: 0.7
        });
      }
    }

    if (!chunkCitation) {
      continue;
    }
  }

  return {
    entities: [...entities.values()].filter((entity) => entity.documentIds.includes(input.documentId)),
    mentions,
    events,
    claims,
    relationships
  };
}

function extractChunkEntities(text: string): Array<{ displayName: string; entityType: EntityType; confidence: number; canonicalKey: string }> {
  const results = new Map<string, { displayName: string; entityType: EntityType; confidence: number; canonicalKey: string }>();

  for (const match of text.matchAll(PERSON_REGEX)) {
    const displayName = match[1].trim();
    if (displayName.length < 5) {
      continue;
    }
    const entityType: EntityType = ORG_KEYWORDS.test(displayName) ? classifyEntityType(displayName) : "person";
    const canonicalKey = `${entityType}:${slugKey(displayName)}`;
    results.set(canonicalKey, {
      displayName,
      entityType,
      confidence: entityType === "person" ? 0.68 : 0.72,
      canonicalKey
    });
  }

  for (const match of text.matchAll(/\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4}\s+(?:Committee|Department|Office|Government|Council|Ministry|Party|Company|Corporation|Ltd|Limited|PLC))\b/g)) {
    const displayName = match[1].trim();
    const entityType = classifyEntityType(displayName);
    const canonicalKey = `${entityType}:${slugKey(displayName)}`;
    results.set(canonicalKey, {
      displayName,
      entityType,
      confidence: 0.82,
      canonicalKey
    });
  }

  return [...results.values()];
}

function classifyEntityType(value: string): EntityType {
  if (/Committee/i.test(value)) {
    return "committee";
  }
  if (/Department|Ministry|Office|Government|Cabinet/i.test(value)) {
    return "department";
  }
  if (/Council|Party|Company|Corporation|Ltd|Limited|PLC/i.test(value)) {
    return "organization";
  }
  return "person";
}

function upsertEntity(
  candidate: { displayName: string; entityType: EntityType; confidence: number; canonicalKey: string },
  documentId: string,
  entityMap: Map<string, EntityRecord>
): EntityRecord {
  const existing = entityMap.get(candidate.canonicalKey);
  if (existing) {
    if (!existing.documentIds.includes(documentId)) {
      existing.documentIds.push(documentId);
    }
    existing.mentionCount += 1;
    return existing;
  }

  const record: EntityRecord = {
    entityId: `ent_${shortHash(candidate.canonicalKey)}_${shortHash(candidate.displayName)}`,
    canonicalKey: candidate.canonicalKey,
    entityType: candidate.entityType,
    displayName: candidate.displayName,
    confidence: candidate.confidence,
    mentionCount: 1,
    documentIds: [documentId]
  };
  entityMap.set(candidate.canonicalKey, record);
  return record;
}

function firstDate(text: string): string | null {
  const match = text.match(DATE_REGEX);
  return match?.[0] ?? null;
}
