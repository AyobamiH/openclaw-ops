import { z } from "zod";
import { DomainError } from "../common/errors.js";
import type {
  ClaimRecord,
  DecisionChainRecord,
  EventRecord,
  LedgerState,
  RelationshipRecord,
  ReviewDisposition,
  ReviewRecord
} from "../types/domain.js";
import { makeId } from "./ids.js";

export const reviewRequestSchema = z.object({
  disposition: z.enum(["verify", "challenge", "reject", "publish"]),
  reviewer: z.string().trim().min(1),
  notes: z.string().trim().min(1)
});

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

export function buildReviewQueue(ledger: LedgerState) {
  const items = [
    ...ledger.claims
      .filter((claim) => claim.lifecycleState !== "published")
      .map((claim) => reviewQueueItemFromClaim(ledger, claim)),
    ...ledger.relationships
      .filter((relationship) => relationship.lifecycleState !== "published")
      .map((relationship) => reviewQueueItemFromRelationship(ledger, relationship)),
    ...ledger.events
      .filter((event) => event.lifecycleState !== "published")
      .map((event) => reviewQueueItemFromEvent(ledger, event)),
    ...ledger.decisionChains
      .filter((chain) => chain.status !== "published")
      .map((chain) => reviewQueueItemFromChain(ledger, chain))
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return {
    items,
    count: items.length
  };
}

export function applyReview(
  ledger: LedgerState,
  targetType: "claim" | "relationship" | "event" | "decision_chain",
  targetId: string,
  input: unknown
) {
  const request = reviewRequestSchema.parse(input);
  const reviewedAt = new Date().toISOString();

  switch (targetType) {
    case "claim":
      return applyLifecycleReview(ledger, targetType, targetId, request, reviewedAt, ledger.claims, (item) => item.claimId);
    case "relationship":
      return applyLifecycleReview(ledger, targetType, targetId, request, reviewedAt, ledger.relationships, (item) => item.relationshipId);
    case "event":
      return applyLifecycleReview(ledger, targetType, targetId, request, reviewedAt, ledger.events, (item) => item.eventId);
    case "decision_chain":
      return applyDecisionChainReview(ledger, targetId, request, reviewedAt);
    default:
      throw new DomainError("UNSUPPORTED_REVIEW_TARGET", `Unsupported review target: ${targetType}`, 400);
  }
}

function applyLifecycleReview<T extends ClaimRecord | RelationshipRecord | EventRecord>(
  ledger: LedgerState,
  targetType: "claim" | "relationship" | "event",
  targetId: string,
  request: ReviewRequest,
  reviewedAt: string,
  items: T[],
  idSelector: (item: T) => string
) {
  const target = items.find((item) => idSelector(item) === targetId);
  if (!target) {
    throw new DomainError("REVIEW_TARGET_NOT_FOUND", `No ${targetType} found for ${targetId}`, 404);
  }

  const previousState = target.lifecycleState;
  const resultingState = lifecycleFromDisposition(request.disposition);
  target.lifecycleState = resultingState;

  const review: ReviewRecord = {
    reviewId: makeId("rev"),
    targetType,
    targetId,
    disposition: request.disposition,
    reviewer: request.reviewer,
    notes: request.notes,
    reviewedAt,
    previousState,
    resultingState,
    published: resultingState === "published"
  };
  ledger.reviews.push(review);

  return {
    review,
    target
  };
}

function applyDecisionChainReview(
  ledger: LedgerState,
  targetId: string,
  request: ReviewRequest,
  reviewedAt: string
) {
  const target = ledger.decisionChains.find((chain) => chain.decisionChainId === targetId);
  if (!target) {
    throw new DomainError("REVIEW_TARGET_NOT_FOUND", `No decision chain found for ${targetId}`, 404);
  }

  const previousState = `${target.status}:${target.verificationState}`;
  const resultingState = chainStateFromDisposition(request.disposition);
  target.status = resultingState.status;
  target.verificationState = resultingState.verificationState;
  target.reviewedAt = reviewedAt;
  target.publishedAt = resultingState.status === "published" ? reviewedAt : target.publishedAt;

  const review: ReviewRecord = {
    reviewId: makeId("rev"),
    targetType: "decision_chain",
    targetId,
    disposition: request.disposition,
    reviewer: request.reviewer,
    notes: request.notes,
    reviewedAt,
    previousState,
    resultingState: `${target.status}:${target.verificationState}`,
    published: target.status === "published"
  };
  ledger.reviews.push(review);

  return {
    review,
    target
  };
}

function lifecycleFromDisposition(disposition: ReviewDisposition): ClaimRecord["lifecycleState"] {
  switch (disposition) {
    case "verify":
      return "verified";
    case "challenge":
      return "challenged";
    case "reject":
      return "rejected";
    case "publish":
      return "published";
  }
}

function chainStateFromDisposition(disposition: ReviewDisposition) {
  switch (disposition) {
    case "verify":
      return {
        status: "under_review" as const,
        verificationState: "verified" as const
      };
    case "challenge":
      return {
        status: "under_review" as const,
        verificationState: "challenged" as const
      };
    case "reject":
      return {
        status: "draft" as const,
        verificationState: "rejected" as const
      };
    case "publish":
      return {
        status: "published" as const,
        verificationState: "published" as const
      };
  }
}

function reviewQueueItemFromClaim(ledger: LedgerState, claim: ClaimRecord) {
  return {
    targetType: "claim",
    targetId: claim.claimId,
    title: claim.claimText.slice(0, 140),
    state: claim.lifecycleState,
    evidenceClass: claim.evidenceClass,
    updatedAt: latestReviewAt(ledger, "claim", claim.claimId) ?? citationTimeProxy(ledger, claim.documentId),
    citations: claim.citationIds.length
  };
}

function reviewQueueItemFromRelationship(ledger: LedgerState, relationship: RelationshipRecord) {
  return {
    targetType: "relationship",
    targetId: relationship.relationshipId,
    title: relationship.summary,
    state: relationship.lifecycleState,
    evidenceClass: relationship.evidenceClass,
    updatedAt: latestReviewAt(ledger, "relationship", relationship.relationshipId) ?? citationTimeProxy(ledger, relationship.documentId),
    citations: relationship.citationId ? 1 : 0
  };
}

function reviewQueueItemFromEvent(ledger: LedgerState, event: EventRecord) {
  return {
    targetType: "event",
    targetId: event.eventId,
    title: event.summary,
    state: event.lifecycleState,
    evidenceClass: event.evidenceClass,
    updatedAt: latestReviewAt(ledger, "event", event.eventId) ?? citationTimeProxy(ledger, event.documentId),
    citations: event.citationId ? 1 : 0
  };
}

function reviewQueueItemFromChain(ledger: LedgerState, chain: DecisionChainRecord) {
  return {
    targetType: "decision_chain",
    targetId: chain.decisionChainId,
    title: chain.subject,
    state: `${chain.status}:${chain.verificationState}`,
    evidenceClass: chain.gaps.length === 0 ? "direct" : "incomplete",
    updatedAt: latestReviewAt(ledger, "decision_chain", chain.decisionChainId) ?? chain.assembledAt,
    citations: chain.claimIds.length
  };
}

function latestReviewAt(
  ledger: LedgerState,
  targetType: ReviewRecord["targetType"],
  targetId: string
) {
  return ledger.reviews
    .filter((review) => review.targetType === targetType && review.targetId === targetId)
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0]?.reviewedAt ?? null;
}

function citationTimeProxy(ledger: LedgerState, documentId: string) {
  return ledger.documents.find((document) => document.documentId === documentId)?.ingestedAt ?? new Date(0).toISOString();
}
