import type { FastifyPluginAsync } from "fastify";
import { DomainError } from "../../common/errors.js";
import { buildEventProjection } from "../../lib/phase2-projections.js";

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get("/events", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const query = request.query as { eventType?: string; documentId?: string; entityId?: string };
    const items = ledger.events
      .filter((event) => {
        if (query.eventType && event.eventType !== query.eventType) {
          return false;
        }
        if (query.documentId && event.documentId !== query.documentId) {
          return false;
        }
        if (query.entityId && !event.entityIds.includes(query.entityId)) {
          return false;
        }
        return true;
      })
      .map((event) => buildEventProjection(ledger, event));
    return {
      items,
      count: items.length,
      intent: "List extracted events by type, date, and review state."
    };
  });

  app.get("/events/:eventId", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const eventId = (request.params as { eventId: string }).eventId;
    const event = ledger.events.find((entry) => entry.eventId === eventId);
    if (!event) {
      throw new DomainError("EVENT_NOT_FOUND", `No event found for ${eventId}`, 404);
    }
    return {
      ...buildEventProjection(ledger, event),
      relationships: ledger.relationships.filter((relationship) => relationship.eventId === event.eventId),
      intent: "Return one event with participants, supporting claims, and citations."
    };
  });
};
