import type { FastifyPluginAsync } from "fastify";

export const entityRoutes: FastifyPluginAsync = async (app) => {
  app.get("/entities", async () => ({
    items: [],
    intent: "List canonical entities with aliases, counts, and linked object summaries."
  }));

  app.get("/entities/:entityId", async (request) => ({
    entityId: (request.params as { entityId: string }).entityId,
    intent: "Return one entity with mentions, relationships, events, and decision links."
  }));
};
