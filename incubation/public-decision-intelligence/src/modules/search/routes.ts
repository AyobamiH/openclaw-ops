import type { FastifyPluginAsync } from "fastify";

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.post("/search", async () => ({
    intent: "Search documents, entities, events, claims, and decisions while preserving citation context.",
    items: [],
    groups: []
  }));
};
