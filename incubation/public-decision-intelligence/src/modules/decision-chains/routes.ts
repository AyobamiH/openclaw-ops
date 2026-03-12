import type { FastifyPluginAsync } from "fastify";

export const decisionChainRoutes: FastifyPluginAsync = async (app) => {
  app.get("/decision-chains", async () => ({
    items: [],
    intent: "List reconstructed decision chains with stage coverage, confidence, and review state."
  }));

  app.get("/decision-chains/:decisionChainId", async (request) => ({
    decisionChainId: (request.params as { decisionChainId: string }).decisionChainId,
    intent: "Return one decision chain with stages, citations, gaps, and alternative interpretations."
  }));
};
