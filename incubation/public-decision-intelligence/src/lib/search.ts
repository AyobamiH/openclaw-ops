import type { LedgerState } from "../types/domain.js";
import {
  buildClaimProjection,
  buildEntityProjection,
  buildEventProjection,
  buildRelationshipProjection
} from "./phase2-projections.js";

export interface SearchFilters {
  query?: string;
  entityType?: string;
  eventType?: string;
  documentId?: string;
  sourceCollection?: string;
  predicate?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function searchLedger(ledger: LedgerState, filters: SearchFilters) {
  const query = filters.query?.trim().toLowerCase() ?? null;

  const documents = ledger.documents
    .filter((document) => {
      if (filters.documentId && document.documentId !== filters.documentId) {
        return false;
      }
      if (filters.sourceCollection && document.sourceCollection !== filters.sourceCollection) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [document.title, document.logicalSourceKey, document.sourceCollection, document.sourceType].some((value) =>
        value.toLowerCase().includes(query)
      );
    })
    .map((document) => {
      const firstChunk = ledger.chunks.find((chunk) => chunk.documentId === document.documentId) ?? null;
      return {
        document,
        excerpt: firstChunk?.excerpt ?? null,
        chunkCount: ledger.chunks.filter((chunk) => chunk.documentId === document.documentId).length,
        citationCount: ledger.citations.filter((citation) => citation.documentId === document.documentId).length
      };
    });

  const entities = ledger.entities
    .filter((entity) => {
      if (filters.entityType && entity.entityType !== filters.entityType) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [entity.displayName, entity.canonicalKey].some((value) => value.toLowerCase().includes(query));
    })
    .map((entity) => ({
      ...buildEntityProjection(ledger, entity),
      mentionSamples: ledger.mentions.filter((mention) => mention.entityId === entity.entityId).slice(0, 3)
    }));

  const events = ledger.events
    .filter((event) => {
      if (filters.eventType && event.eventType !== filters.eventType) {
        return false;
      }
      if (filters.documentId && event.documentId !== filters.documentId) {
        return false;
      }
      if (!dateWithinRange(event.eventDate, filters.dateFrom, filters.dateTo)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [event.title, event.summary, event.eventDate ?? ""].some((value) => value.toLowerCase().includes(query));
    })
    .map((event) => buildEventProjection(ledger, event));

  const claims = ledger.claims
    .filter((claim) => {
      if (filters.documentId && claim.documentId !== filters.documentId) {
        return false;
      }
      if (!query) {
        return true;
      }
      return claim.claimText.toLowerCase().includes(query);
    })
    .map((claim) => buildClaimProjection(ledger, claim));

  const relationships = ledger.relationships
    .filter((relationship) => {
      if (filters.documentId && relationship.documentId !== filters.documentId) {
        return false;
      }
      if (filters.predicate && relationship.predicate !== filters.predicate) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [relationship.predicate, relationship.summary].some((value) => value.toLowerCase().includes(query));
    })
    .map((relationship) => buildRelationshipProjection(ledger, relationship));

  return {
    query: filters,
    groups: {
      documents,
      entities,
      events,
      claims,
      relationships
    },
    totals: {
      documents: documents.length,
      entities: entities.length,
      events: events.length,
      claims: claims.length,
      relationships: relationships.length
    }
  };
}

function dateWithinRange(value: string | null, dateFrom?: string, dateTo?: string) {
  if (!dateFrom && !dateTo) {
    return true;
  }
  const candidate = parseApproxDate(value);
  if (!candidate) {
    return false;
  }
  const from = parseApproxDate(dateFrom ?? null);
  const to = parseApproxDate(dateTo ?? null);
  if (from && candidate < from) {
    return false;
  }
  if (to && candidate > to) {
    return false;
  }
  return true;
}

function parseApproxDate(value: string | null) {
  if (!value) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split("/").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  return null;
}
