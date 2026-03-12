import type {
  ClaimRecord,
  DecisionChainAlternativeRecord,
  DecisionChainGapRecord,
  DecisionChainRecord,
  DecisionChainStageRecord,
  DecisionChainStageType,
  EventRecord,
  LedgerState,
  RelationshipRecord
} from "../types/domain.js";
import { makeId, shortHash, slugKey } from "./ids.js";

const STAGE_LABELS: Record<DecisionChainStageType, string> = {
  precursor: "Precursor Signals",
  deliberation: "Internal Deliberation",
  formal_process: "Formal Process",
  outcome: "Outcome",
  after_effects: "After-Effects"
};

export function rebuildDecisionChains(state: LedgerState): DecisionChainRecord[] {
  const previousById = new Map(state.decisionChains.map((chain) => [chain.decisionChainId, chain]));
  const documentsById = new Map(state.documents.map((document) => [document.documentId, document]));
  const eventsByDocument = groupBy(state.events, (event) => event.documentId);
  const claimsByDocument = groupBy(state.claims, (claim) => claim.documentId);
  const relationshipsByDocument = groupBy(state.relationships, (relationship) => relationship.documentId);

  const collections = new Map<string, string[]>();
  for (const document of state.documents) {
    const list = collections.get(document.sourceCollection) ?? [];
    list.push(document.documentId);
    collections.set(document.sourceCollection, list);
  }

  const chains: DecisionChainRecord[] = [];

  for (const [sourceCollection, documentIds] of collections) {
    const collectionEvents = documentIds.flatMap((documentId) => eventsByDocument.get(documentId) ?? []);
    const collectionClaims = documentIds.flatMap((documentId) => claimsByDocument.get(documentId) ?? []);
    const collectionRelationships = documentIds.flatMap((documentId) => relationshipsByDocument.get(documentId) ?? []);

    const subjectEntityIds = selectSubjectEntities(state, documentIds, collectionEvents, collectionRelationships);
    for (const subjectEntityId of subjectEntityIds) {
      const chain = buildDecisionChain({
        state,
        documentsById,
        sourceCollection,
        documentIds,
        subjectEntityId,
        collectionEvents,
        collectionClaims,
        collectionRelationships,
        previous: previousById
      });
      if (chain) {
        chains.push(chain);
      }
    }
  }

  return chains.sort((a, b) => b.assembledAt.localeCompare(a.assembledAt));
}

function buildDecisionChain(input: {
  state: LedgerState;
  documentsById: Map<string, LedgerState["documents"][number]>;
  sourceCollection: string;
  documentIds: string[];
  subjectEntityId: string;
  collectionEvents: EventRecord[];
  collectionClaims: ClaimRecord[];
  collectionRelationships: RelationshipRecord[];
  previous: Map<string, DecisionChainRecord>;
}): DecisionChainRecord | null {
  const subjectEntity = input.state.entities.find((entity) => entity.entityId === input.subjectEntityId);
  if (!subjectEntity) {
    return null;
  }

  const relatedRelationships = input.collectionRelationships.filter(
    (relationship) =>
      relationship.subjectEntityId === input.subjectEntityId || relationship.objectEntityId === input.subjectEntityId
  );
  const relatedEvents = input.collectionEvents.filter(
    (event) =>
      event.entityIds.includes(input.subjectEntityId) ||
      relatedRelationships.some((relationship) => relationship.eventId === event.eventId)
  );

  if (relatedEvents.length === 0 && relatedRelationships.length === 0) {
    return null;
  }

  const relatedClaims = input.collectionClaims.filter(
    (claim) =>
      relatedEvents.some((event) => event.chunkId === claim.chunkId) ||
      relatedRelationships.some((relationship) => relationship.chunkId === claim.chunkId)
  );

  const stages = buildStages(relatedEvents, relatedClaims, relatedRelationships);
  const gaps = buildGaps(stages);
  const alternatives = buildAlternatives(relatedEvents, relatedRelationships, relatedClaims);
  const versionKey = `${input.sourceCollection}:${subjectEntity.canonicalKey}`;
  const decisionChainId = `dch_${shortHash(versionKey)}_${shortHash(subjectEntity.displayName)}`;
  const previous = input.previous.get(decisionChainId);
  const assembledAt = new Date().toISOString();
  const summary = buildSummary(subjectEntity.displayName, stages, gaps);
  const confidence = scoreConfidence(stages, gaps, relatedRelationships);
  const published = previous?.status === "published";

  return {
    decisionChainId,
    versionKey,
    sourceCollection: input.sourceCollection,
    subject: subjectEntity.displayName,
    subjectEntityIds: [input.subjectEntityId],
    status: published ? "published" : "under_review",
    verificationState: published ? "published" : previous?.verificationState ?? "under_review",
    confidence,
    summary,
    documentIds: [...new Set([...input.documentIds, ...relatedClaims.map((claim) => claim.documentId)])],
    eventIds: relatedEvents.map((event) => event.eventId),
    claimIds: relatedClaims.map((claim) => claim.claimId),
    relationshipIds: relatedRelationships.map((relationship) => relationship.relationshipId),
    stages,
    gaps,
    alternatives,
    assembledAt,
    reviewedAt: previous?.reviewedAt ?? null,
    publishedAt: previous?.publishedAt ?? null,
    revision: (previous?.revision ?? 0) + 1
  };
}

function selectSubjectEntities(
  state: LedgerState,
  documentIds: string[],
  events: EventRecord[],
  relationships: RelationshipRecord[]
) {
  const weighted = new Map<string, number>();
  const increment = (entityId: string, amount: number) => weighted.set(entityId, (weighted.get(entityId) ?? 0) + amount);

  for (const event of events) {
    const weight = eventStage(event.eventType) === "outcome" ? 4 : eventStage(event.eventType) === "formal_process" ? 3 : 1;
    for (const entityId of event.entityIds) {
      increment(entityId, weight);
    }
  }

  for (const relationship of relationships) {
    increment(relationship.subjectEntityId, 1);
    if (relationship.objectEntityId) {
      increment(relationship.objectEntityId, 1);
    }
  }

  const fallbackEntities = state.entities
    .filter((entity) => entity.documentIds.some((documentId) => documentIds.includes(documentId)))
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .map((entity) => entity.entityId);

  const ranked = [...weighted.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([entityId]) => entityId);

  const unique = [...new Set([...ranked, ...fallbackEntities])];
  return unique.slice(0, Math.min(3, unique.length));
}

function buildStages(
  events: EventRecord[],
  claims: ClaimRecord[],
  relationships: RelationshipRecord[]
): DecisionChainStageRecord[] {
  const stages: DecisionChainStageType[] = [
    "precursor",
    "deliberation",
    "formal_process",
    "outcome",
    "after_effects"
  ];

  return stages.map((stage) => {
    const stageEvents = events.filter((event) => eventStage(event.eventType) === stage);
    const stageClaims = claims.filter((claim) => stageEvents.some((event) => event.chunkId === claim.chunkId));
    const stageRelationships = relationships.filter(
      (relationship) =>
        stageEvents.some((event) => event.eventId === relationship.eventId || event.chunkId === relationship.chunkId)
    );

    return {
      stage,
      label: STAGE_LABELS[stage],
      eventIds: stageEvents.map((event) => event.eventId),
      claimIds: stageClaims.map((claim) => claim.claimId),
      relationshipIds: stageRelationships.map((relationship) => relationship.relationshipId),
      summary: summarizeStage(stage, stageEvents, stageRelationships),
      evidenceClass: stageEvents.length > 0 || stageRelationships.length > 0 ? "direct" : "incomplete"
    };
  });
}

function buildGaps(stages: DecisionChainStageRecord[]): DecisionChainGapRecord[] {
  return stages
    .filter((stage) => stage.eventIds.length === 0 && stage.relationshipIds.length === 0)
    .map((stage) => ({
      gapId: makeId("gap"),
      stage: stage.stage,
      label: stage.label,
      description: `No anchored evidence has been assembled yet for the ${stage.label.toLowerCase()} stage.`,
      severity: stage.stage === "formal_process" || stage.stage === "outcome" ? "critical" : "warning"
    }));
}

function buildAlternatives(
  events: EventRecord[],
  relationships: RelationshipRecord[],
  claims: ClaimRecord[]
): DecisionChainAlternativeRecord[] {
  const alternatives: DecisionChainAlternativeRecord[] = [];
  const objections = events.filter((event) => event.eventType === "objection");
  const formal = events.filter((event) => eventStage(event.eventType) === "formal_process" || eventStage(event.eventType) === "outcome");

  if (objections.length > 0 && formal.length > 0) {
    alternatives.push({
      alternativeId: makeId("alt"),
      summary: "Recorded objections may not have altered the formal outcome.",
      rationale: "The chain contains both objection evidence and later formal/outcome evidence, which may indicate that objections were overridden or only partially reflected in the formal path.",
      citationIds: uniqueCitations([...objections, ...formal], relationships, claims),
      confidence: 0.58
    });
  }

  if (!events.some((event) => eventStage(event.eventType) === "formal_process") && events.some((event) => eventStage(event.eventType) === "outcome")) {
    alternatives.push({
      alternativeId: makeId("alt"),
      summary: "The available evidence may skip over the formal process.",
      rationale: "An outcome is visible, but no formal-process event has been extracted yet. This can mean either the process records are missing or the outcome path bypassed the expected formal steps.",
      citationIds: uniqueCitations(events, relationships, claims),
      confidence: 0.51
    });
  }

  return alternatives;
}

function buildSummary(subject: string, stages: DecisionChainStageRecord[], gaps: DecisionChainGapRecord[]) {
  const completed = stages.filter((stage) => stage.eventIds.length > 0 || stage.relationshipIds.length > 0).length;
  if (completed === 0) {
    return `${subject} has not yet accumulated enough structured evidence to form a decision chain.`;
  }
  return `${subject} currently has ${completed} evidenced decision stages with ${gaps.length} unresolved gap${gaps.length === 1 ? "" : "s"}.`;
}

function scoreConfidence(
  stages: DecisionChainStageRecord[],
  gaps: DecisionChainGapRecord[],
  relationships: RelationshipRecord[]
) {
  const stageCoverage = stages.filter((stage) => stage.eventIds.length > 0 || stage.relationshipIds.length > 0).length / stages.length;
  const gapPenalty = gaps.filter((gap) => gap.severity === "critical").length * 0.12 + gaps.filter((gap) => gap.severity === "warning").length * 0.05;
  const relationshipBoost = Math.min(relationships.length / 8, 1) * 0.18;
  const score = stageCoverage * 0.75 + relationshipBoost - gapPenalty;
  return Math.max(0.18, Math.min(0.95, Number(score.toFixed(2))));
}

function eventStage(eventType: string): DecisionChainStageType {
  switch (eventType) {
    case "meeting":
    case "email":
    case "recommendation":
      return "precursor";
    case "review":
    case "statement":
    case "objection":
      return "deliberation";
    case "approval":
    case "appointment":
      return "formal_process";
    case "announcement":
      return "outcome";
    default:
      return "after_effects";
  }
}

function summarizeStage(stage: DecisionChainStageType, events: EventRecord[], relationships: RelationshipRecord[]) {
  if (events.length === 0 && relationships.length === 0) {
    return `No direct evidence assembled for ${STAGE_LABELS[stage].toLowerCase()}.`;
  }
  const eventSummary = events.slice(0, 2).map((event) => event.title).join(", ");
  const relationSummary = relationships.slice(0, 2).map((relationship) => relationship.predicate.replaceAll("_", " ")).join(", ");
  return [eventSummary, relationSummary].filter(Boolean).join(" | ");
}

function uniqueCitations(events: EventRecord[], relationships: RelationshipRecord[], claims: ClaimRecord[]) {
  return [...new Set([
    ...events.map((event) => event.citationId),
    ...relationships.map((relationship) => relationship.citationId),
    ...claims.flatMap((claim) => claim.citationIds)
  ])];
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }
  return grouped;
}
