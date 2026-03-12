import type { FastifyPluginAsync } from "fastify";
import { DomainError } from "../../common/errors.js";
import { buildClaimProjection } from "../../lib/phase2-projections.js";

export const claimRoutes: FastifyPluginAsync = async (app) => {
  app.get("/claims", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const query = request.query as {
      documentId?: string;
      evidenceClass?: string;
      lifecycleState?: string;
    };
    const items = ledger.claims
      .filter((claim) => {
        if (query.documentId && claim.documentId !== query.documentId) {
          return false;
        }
        if (query.evidenceClass && claim.evidenceClass !== query.evidenceClass) {
          return false;
        }
        if (query.lifecycleState && claim.lifecycleState !== query.lifecycleState) {
          return false;
        }
        return true;
      })
      .map((claim) => buildClaimProjection(ledger, claim));
    return {
      items,
      count: items.length,
      intent: "List structured claims with evidence class, lifecycle state, and review posture."
    };
  });

  app.get("/claims/:claimId", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const claimId = (request.params as { claimId: string }).claimId;
    const claim = ledger.claims.find((entry) => entry.claimId === claimId);
    if (!claim) {
      throw new DomainError("CLAIM_NOT_FOUND", `No claim found for ${claimId}`, 404);
    }
    return {
      ...buildClaimProjection(ledger, claim),
      intent: "Return one claim with citations, contradictions, and review history."
    };
  });
};
