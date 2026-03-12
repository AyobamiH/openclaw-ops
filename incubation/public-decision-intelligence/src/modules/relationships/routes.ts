import type { FastifyPluginAsync } from "fastify";
import { DomainError } from "../../common/errors.js";
import { buildRelationshipProjection } from "../../lib/phase2-projections.js";

export const relationshipRoutes: FastifyPluginAsync = async (app) => {
  app.get("/relationships", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const query = request.query as {
      predicate?: string;
      entityId?: string;
      documentId?: string;
    };
    const items = ledger.relationships
      .filter((relationship) => {
        if (query.predicate && relationship.predicate !== query.predicate) {
          return false;
        }
        if (query.documentId && relationship.documentId !== query.documentId) {
          return false;
        }
        if (
          query.entityId &&
          relationship.subjectEntityId !== query.entityId &&
          relationship.objectEntityId !== query.entityId
        ) {
          return false;
        }
        return true;
      })
      .map((relationship) => buildRelationshipProjection(ledger, relationship));
    return {
      items,
      count: items.length,
      intent: "List structured relationships derived from cited evidence."
    };
  });

  app.get("/relationships/:relationshipId", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const relationshipId = (request.params as { relationshipId: string }).relationshipId;
    const relationship = ledger.relationships.find((entry) => entry.relationshipId === relationshipId);
    if (!relationship) {
      throw new DomainError("RELATIONSHIP_NOT_FOUND", `No relationship found for ${relationshipId}`, 404);
    }

    return {
      ...buildRelationshipProjection(ledger, relationship),
      intent: "Return one relationship with entity, event, and citation context."
    };
  });
};
