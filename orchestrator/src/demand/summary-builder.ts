import { randomUUID } from "node:crypto";
import type {
  DemandSummarySegment,
  DemandSummarySnapshot,
  DemandSummaryTagCounts,
  DemandSummaryTopItem,
  OrchestratorState,
  RedditQueueItem,
  RssDraftRecord,
} from "../types.js";
import { DEMAND_SEGMENTS } from "./segments.js";

type DemandCounters = {
  queueTotal: number;
  draftTotal: number;
  selectedForDraftTotal: number;
  tagCounts: DemandSummaryTagCounts;
  pillarCounts: Map<string, number>;
  keywordCounts: Map<string, number>;
  segmentDraftCounts: Map<string, number>;
  segmentQueueCounts: Map<string, number>;
};

function normalizeToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function collectTokenSet(
  values: readonly string[] | undefined,
): Set<string> {
  const set = new Set<string>();
  if (!Array.isArray(values)) return set;

  for (const raw of values) {
    const token = normalizeToken(raw);
    if (!token) continue;
    set.add(token);
  }

  return set;
}

function resolveSegmentsForClusterSet(clusterSet: Set<string>): string[] {
  if (clusterSet.size === 0) return [];

  const matched: string[] = [];
  for (const segment of DEMAND_SEGMENTS) {
    const hasMatch = segment.keywordClusters.some((cluster) =>
      clusterSet.has(cluster),
    );
    if (hasMatch) matched.push(segment.id);
  }
  return matched;
}

function countTopItems(
  map: Map<string, number>,
  limit: number,
): DemandSummaryTopItem[] {
  return Array.from(map.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([id, count]) => ({
      id,
      label: formatLabel(id),
      count,
    }));
}

function isSelectedForDraft(item: RedditQueueItem): boolean {
  const raw = item as unknown as Record<string, unknown>;
  return raw.selectedForDraft === true;
}

function countSegmentsFromDraft(
  draft: RssDraftRecord,
  keywordCounts: Map<string, number>,
  pillarCounts: Map<string, number>,
  segmentCounts: Map<string, number>,
  tagCounts: DemandSummaryTagCounts,
): { clusterSet: Set<string>; segmentIds: string[] } {
  const tag = draft.tag;
  if (tag === "priority") tagCounts.priority += 1;
  else if (tag === "manual-review") tagCounts.manualReview += 1;
  else tagCounts.draft += 1;

  const pillar = normalizeToken(draft.pillar);
  if (pillar) increment(pillarCounts, pillar);

  const clusterSet = collectTokenSet(Object.keys(draft.scoreBreakdown ?? {}));
  for (const cluster of clusterSet) {
    increment(keywordCounts, cluster);
  }

  const segmentIds = resolveSegmentsForClusterSet(clusterSet);
  for (const segmentId of segmentIds) {
    increment(segmentCounts, segmentId);
  }

  return { clusterSet, segmentIds };
}

function countSegmentsFromQueue(
  segmentIds: readonly string[],
  segmentCounts: Map<string, number>,
): void {
  for (const segmentId of segmentIds) {
    increment(segmentCounts, segmentId);
  }
}

function buildDemandCounters(state: OrchestratorState): DemandCounters {
  const tagCounts: DemandSummaryTagCounts = {
    draft: 0,
    priority: 0,
    manualReview: 0,
  };
  const pillarCounts = new Map<string, number>();
  const keywordCounts = new Map<string, number>();
  const segmentDraftCounts = new Map<string, number>();
  const segmentQueueCounts = new Map<string, number>();
  const queueSegmentsByDraftId = new Map<string, string[]>();

  for (const segment of DEMAND_SEGMENTS) {
    segmentDraftCounts.set(segment.id, 0);
    segmentQueueCounts.set(segment.id, 0);
  }

  for (const draft of state.rssDrafts) {
    const details = countSegmentsFromDraft(
      draft,
      keywordCounts,
      pillarCounts,
      segmentDraftCounts,
      tagCounts,
    );
    queueSegmentsByDraftId.set(draft.draftId, details.segmentIds);
  }

  for (const item of state.redditQueue) {
    const segmentIds =
      (item.draftRecordId
        ? queueSegmentsByDraftId.get(item.draftRecordId)
        : undefined) ??
      [];
    countSegmentsFromQueue(segmentIds, segmentQueueCounts);
  }

  return {
    queueTotal: state.redditQueue.length,
    draftTotal: state.rssDrafts.length,
    selectedForDraftTotal: state.redditQueue.reduce(
      (sum, item) => sum + (isSelectedForDraft(item) ? 1 : 0),
      0,
    ),
    tagCounts,
    pillarCounts,
    keywordCounts,
    segmentDraftCounts,
    segmentQueueCounts,
  };
}

function toSegmentState(score: number): DemandSummarySegment["state"] {
  if (score >= 5) return "hot";
  if (score >= 1) return "warm";
  return "idle";
}

export function buildDemandStateFingerprint(state: OrchestratorState): string {
  const counters = buildDemandCounters(state);

  const serializeCounts = (map: Map<string, number>) =>
    Array.from(map.entries()).sort((left, right) =>
      left[0].localeCompare(right[0]),
    );

  return JSON.stringify({
    queueTotal: counters.queueTotal,
    draftTotal: counters.draftTotal,
    selectedForDraftTotal: counters.selectedForDraftTotal,
    tagCounts: counters.tagCounts,
    pillarCounts: serializeCounts(counters.pillarCounts),
    keywordCounts: serializeCounts(counters.keywordCounts),
  });
}

export function buildDemandSummarySnapshot(
  state: OrchestratorState,
  generatedAtUtc = new Date().toISOString(),
): DemandSummarySnapshot {
  const counters = buildDemandCounters(state);

  const segments: DemandSummarySnapshot["segments"] = DEMAND_SEGMENTS.map(
    (segment) => {
      const liveSignalCount = counters.segmentDraftCounts.get(segment.id) ?? 0;
      const queueSignalCount = counters.segmentQueueCounts.get(segment.id) ?? 0;
      const amplifiedScore =
        liveSignalCount + (queueSignalCount > liveSignalCount ? 1 : 0);

      return {
        id: segment.id,
        label: segment.label,
        liveSignalCount,
        state: toSegmentState(amplifiedScore),
        staticWeight: segment.staticWeight,
        clusterLabels: segment.clusterLabels,
      };
    },
  );

  return {
    summaryId: `demand.summary.${generatedAtUtc}.${randomUUID()}`,
    generatedAtUtc,
    source: "orchestrator",
    queueTotal: counters.queueTotal,
    draftTotal: counters.draftTotal,
    selectedForDraftTotal: counters.selectedForDraftTotal,
    tagCounts: counters.tagCounts,
    topPillars: countTopItems(counters.pillarCounts, 3),
    topKeywordClusters: countTopItems(counters.keywordCounts, 5),
    segments,
  };
}
