import type { FastifyPluginAsync } from "fastify";

export const claimRoutes: FastifyPluginAsync = async (app) => {
  app.get("/claims", async () => ({
    items: [],
    intent: "List structured claims with evidence class, lifecycle state, and review posture."
  }));

  app.get("/claims/:claimId", async (request) => ({
    claimId: (request.params as { claimId: string }).claimId,
    intent: "Return one claim with citations, contradictions, and review history."
  }));
};
