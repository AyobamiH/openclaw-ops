import type { FastifyPluginAsync } from "fastify";
import { DomainError } from "../../common/errors.js";
import { applyReview, buildReviewQueue } from "../../lib/review.js";

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  app.get("/review/queue", async () => {
    const ledger = await app.runtimeContext.ledger.read();
    const queue = buildReviewQueue(ledger);
    return {
      ...queue,
      intent: "Return pending claims, relationships, events, and decision-chain steps awaiting review."
    };
  });

  app.get("/review/history", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const query = request.query as { targetType?: string; targetId?: string };
    const items = ledger.reviews.filter((review) => {
      if (query.targetType && review.targetType !== query.targetType) {
        return false;
      }
      if (query.targetId && review.targetId !== query.targetId) {
        return false;
      }
      return true;
    });
    return {
      items: items.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)),
      count: items.length
    };
  });

  app.post("/review/:targetType/:targetId", async (request) => {
    const params = request.params as { targetType: string; targetId: string };
    const targetType = params.targetType as "claim" | "relationship" | "event" | "decision_chain";
    const targetId = params.targetId;
    if (!["claim", "relationship", "event", "decision_chain"].includes(targetType)) {
      throw new DomainError("INVALID_REVIEW_TARGET", `Unsupported review target ${params.targetType}`, 400);
    }
    const result = await app.runtimeContext.ledger.update(async (state) =>
      applyReview(state, targetType, targetId, request.body as Record<string, unknown>)
    );
    return {
      ...result,
      intent: "Record a review disposition with reasoning and linked evidence notes."
    };
  });
};
