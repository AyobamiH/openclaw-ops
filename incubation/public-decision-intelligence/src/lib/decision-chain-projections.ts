import type { DecisionChainRecord, LedgerState } from "../types/domain.js";

export function buildDecisionChainProjection(ledger: LedgerState, chain: DecisionChainRecord) {
  return {
    chain,
    subjectEntities: ledger.entities.filter((entity) => chain.subjectEntityIds.includes(entity.entityId)),
    documents: ledger.documents.filter((document) => chain.documentIds.includes(document.documentId)),
    events: ledger.events.filter((event) => chain.eventIds.includes(event.eventId)),
    claims: ledger.claims.filter((claim) => chain.claimIds.includes(claim.claimId)),
    relationships: ledger.relationships.filter((relationship) => chain.relationshipIds.includes(relationship.relationshipId)),
    reviews: ledger.reviews
      .filter((review) => review.targetType === "decision_chain" && review.targetId === chain.decisionChainId)
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
  };
}

export function decisionChainVisibilitySummary(ledger: LedgerState) {
  const published = ledger.decisionChains.filter((chain) => chain.status === "published");
  const previewMode = published.length === 0;
  return {
    previewMode,
    visibleChains: previewMode
      ? [...ledger.decisionChains].sort((a, b) => b.confidence - a.confidence).slice(0, 12)
      : published.sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!))
  };
}
