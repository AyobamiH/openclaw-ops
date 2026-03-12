import type { FastifyPluginAsync } from "fastify";
import { DomainError } from "../../common/errors.js";
import { buildEntityProjection } from "../../lib/phase2-projections.js";

export const entityRoutes: FastifyPluginAsync = async (app) => {
  app.get("/entities", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const query = request.query as {
      entityType?: string;
      q?: string;
    };
    const items = ledger.entities
      .filter((entity) => {
        if (query.entityType && entity.entityType !== query.entityType) {
          return false;
        }
        if (query.q) {
          const needle = query.q.toLowerCase();
          return [entity.displayName, entity.canonicalKey].some((value) => value.toLowerCase().includes(needle));
        }
        return true;
      })
      .map((entity) => buildEntityProjection(ledger, entity))
      .sort((a, b) => b.mentionCount - a.mentionCount);
    return {
      items,
      count: items.length,
      intent: "List canonical entities with aliases, counts, and linked object summaries."
    };
  });

  app.get("/entities/:entityId", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const entityId = (request.params as { entityId: string }).entityId;
    const entity = ledger.entities.find((entry) => entry.entityId === entityId);
    if (!entity) {
      throw new DomainError("ENTITY_NOT_FOUND", `No entity found for ${entityId}`, 404);
    }
    const mentions = ledger.mentions.filter((mention) => mention.entityId === entityId);
    const events = ledger.events.filter((event) => event.entityIds.includes(entityId));
    const relationships = ledger.relationships.filter(
      (relationship) =>
        relationship.subjectEntityId === entityId || relationship.objectEntityId === entityId
    );
    const claims = ledger.claims.filter((claim) =>
      mentions.some((mention) => mention.documentId === claim.documentId && mention.chunkId === claim.chunkId)
    );
    return {
      ...buildEntityProjection(ledger, entity),
      mentions,
      events,
      relationships,
      claims,
      documents: ledger.documents.filter((document) => entity.documentIds.includes(document.documentId)),
      intent: "Return one entity with mentions, relationships, events, and decision links."
    };
  });
};
