import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { searchLedger } from "../../lib/search.js";

const searchBodySchema = z.object({
  query: z.string().trim().min(1).optional(),
  entityType: z.string().optional(),
  eventType: z.string().optional(),
  documentId: z.string().optional(),
  sourceCollection: z.string().optional(),
  predicate: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.post("/search", async (request) => {
    const body = searchBodySchema.parse(request.body ?? {});
    const ledger = await app.runtimeContext.ledger.read();
    const result = searchLedger(ledger, body);

    return {
      intent: "Search documents, entities, events, claims, and decisions while preserving citation context.",
      ...result
    };
  });
};
