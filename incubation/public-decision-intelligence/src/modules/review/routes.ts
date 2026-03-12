import type { FastifyPluginAsync } from "fastify";

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  app.get("/review/queue", async () => ({
    items: [],
    intent: "Return pending claims, relationships, and decision-chain steps awaiting review."
  }));

  app.post("/review/:targetType/:targetId", async (request) => ({
    targetType: (request.params as { targetType: string; targetId: string }).targetType,
    targetId: (request.params as { targetType: string; targetId: string }).targetId,
    intent: "Record a review disposition with reasoning and linked evidence notes."
  }));
};
