import type { FastifyPluginAsync } from "fastify";
import { DomainError } from "../../common/errors.js";
import { buildDecisionChainProjection } from "../../lib/decision-chain-projections.js";

export const decisionChainRoutes: FastifyPluginAsync = async (app) => {
  app.get("/decision-chains", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const query = request.query as {
      sourceCollection?: string;
      status?: string;
      subject?: string;
    };
    const subjectNeedle = query.subject?.toLowerCase() ?? null;
    const items = ledger.decisionChains
      .filter((chain) => {
        if (query.sourceCollection && chain.sourceCollection !== query.sourceCollection) {
          return false;
        }
        if (query.status && chain.status !== query.status) {
          return false;
        }
        if (subjectNeedle && !chain.subject.toLowerCase().includes(subjectNeedle)) {
          return false;
        }
        return true;
      })
      .map((chain) => ({
        ...buildDecisionChainProjection(ledger, chain),
        reviewCount: ledger.reviews.filter(
          (review) => review.targetType === "decision_chain" && review.targetId === chain.decisionChainId
        ).length
      }));

    return {
      items,
      count: items.length,
      intent: "List reconstructed decision chains with stage coverage, confidence, and review state."
    };
  });

  app.get("/decision-chains/:decisionChainId", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const decisionChainId = (request.params as { decisionChainId: string }).decisionChainId;
    const chain = ledger.decisionChains.find((entry) => entry.decisionChainId === decisionChainId);
    if (!chain) {
      throw new DomainError("DECISION_CHAIN_NOT_FOUND", `No decision chain found for ${decisionChainId}`, 404);
    }
    return {
      ...buildDecisionChainProjection(ledger, chain),
      intent: "Return one decision chain with stages, citations, gaps, and alternative interpretations."
    };
  });
};
