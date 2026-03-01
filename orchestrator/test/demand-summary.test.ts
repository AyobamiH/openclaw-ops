import { afterEach, describe, expect, it, vi } from "vitest";
import { DemandSummaryEmitter } from "../src/demand/emitter.js";
import {
  buildDemandStateFingerprint,
  buildDemandSummarySnapshot,
} from "../src/demand/summary-builder.js";
import { createDefaultState } from "../src/state.js";
import type { OrchestratorConfig, OrchestratorState } from "../src/types.js";

const baseConfig: OrchestratorConfig = {
  docsPath: "/tmp/test-docs",
  logsDir: "/tmp/test-logs",
  stateFile: "/tmp/test-state.json",
};

const configWithUrl: OrchestratorConfig = {
  ...baseConfig,
  demandSummaryIngestUrl: "http://localhost:9999/internal/demand/ingest",
};

function makeEmitter(config: OrchestratorConfig, state: OrchestratorState) {
  const persistState = vi.fn().mockResolvedValue(undefined);
  const emitter = new DemandSummaryEmitter(config, () => state, persistState);
  return { emitter, persistState, state };
}

function buildPopulatedState(): OrchestratorState {
  const state = createDefaultState();
  state.rssDrafts.push(
    {
      draftId: "draft-1",
      pillar: "openclaw",
      feedId: "feed-1",
      subreddit: "openclaw",
      title: "Need safer plugin isolation",
      content: "skill issue",
      link: "https://example.com/1",
      matchedKeywords: ["skills_supply_chain", "security_exposure"],
      scoreBreakdown: {
        skills_supply_chain: 2,
        security_exposure: 1,
      },
      totalScore: 10,
      suggestedReply: "reply 1",
      ctaVariant: "cta 1",
      tag: "manual-review",
      queuedAt: "2026-03-01T10:00:00.000Z",
    },
    {
      draftId: "draft-2",
      pillar: "lovable",
      feedId: "feed-2",
      subreddit: "lovable",
      title: "Preview differs from production",
      content: "preview mismatch",
      link: "https://example.com/2",
      matchedKeywords: ["preview_vs_production", "payments_and_backend"],
      scoreBreakdown: {
        preview_vs_production: 2,
        payments_and_backend: 1,
      },
      totalScore: 8,
      suggestedReply: "reply 2",
      ctaVariant: "cta 2",
      tag: "priority",
      queuedAt: "2026-03-01T10:05:00.000Z",
    },
  );
  state.redditQueue.push(
    {
      id: "queue-1",
      subreddit: "openclaw",
      question: "Need safer plugin isolation",
      queuedAt: "2026-03-01T10:00:00.000Z",
      matchedKeywords: ["skills_supply_chain", "security_exposure"],
    },
    {
      id: "queue-2",
      subreddit: "lovable",
      question: "Preview differs from production",
      queuedAt: "2026-03-01T10:05:00.000Z",
      matchedKeywords: ["preview_vs_production", "payments_and_backend"],
      tag: "priority",
    } as OrchestratorState["redditQueue"][number] & {
      selectedForDraft?: boolean;
    },
  );
  (
    state.redditQueue[1] as OrchestratorState["redditQueue"][number] & {
      selectedForDraft?: boolean;
    }
  ).selectedForDraft = true;
  return state;
}

afterEach(() => {
  delete process.env.MILESTONE_SIGNING_SECRET;
  vi.restoreAllMocks();
});

describe("buildDemandSummarySnapshot()", () => {
  it("returns idle zeroed segments for an empty state", () => {
    const state = createDefaultState();

    const snapshot = buildDemandSummarySnapshot(
      state,
      "2026-03-01T12:00:00.000Z",
    );

    expect(snapshot.queueTotal).toBe(0);
    expect(snapshot.draftTotal).toBe(0);
    expect(snapshot.selectedForDraftTotal).toBe(0);
    expect(snapshot.tagCounts).toEqual({
      draft: 0,
      priority: 0,
      manualReview: 0,
    });
    expect(snapshot.segments.every((segment) => segment.state === "idle")).toBe(
      true,
    );
  });

  it("normalizes tag counts, pillars, and segment counts deterministically", () => {
    const state = buildPopulatedState();

    const snapshot = buildDemandSummarySnapshot(
      state,
      "2026-03-01T12:00:00.000Z",
    );

    expect(snapshot.tagCounts).toEqual({
      draft: 0,
      priority: 1,
      manualReview: 1,
    });
    expect(snapshot.topPillars.map((item) => item.id)).toEqual([
      "lovable",
      "openclaw",
    ]);
    expect(snapshot.topKeywordClusters.map((item) => item.id)).toEqual([
      "payments_and_backend",
      "preview_vs_production",
      "security_exposure",
      "skills_supply_chain",
    ]);
    expect(
      snapshot.segments.find((segment) => segment.id === "cash-velocity")
        ?.liveSignalCount,
    ).toBe(1);
    expect(
      snapshot.segments.find((segment) => segment.id === "skills-supply-chain")
        ?.state,
    ).toBe("warm");
  });

  it("changes the demand fingerprint when queue readiness changes", () => {
    const state = buildPopulatedState();
    const before = buildDemandStateFingerprint(state);

    (
      state.redditQueue[0] as OrchestratorState["redditQueue"][number] & {
        selectedForDraft?: boolean;
      }
    ).selectedForDraft = true;

    expect(buildDemandStateFingerprint(state)).not.toBe(before);
  });
});

describe("DemandSummaryEmitter.deliverPending()", () => {
  it("marks a pending record as delivered on a successful ingest response", async () => {
    const state = createDefaultState();
    process.env.MILESTONE_SIGNING_SECRET = "test-secret";
    const snapshot = buildDemandSummarySnapshot(
      state,
      "2026-03-01T12:00:00.000Z",
    );

    state.demandSummaryDeliveries.push({
      idempotencyKey: "abc123abc123abc1",
      summaryId: snapshot.summaryId,
      sentAtUtc: "2026-03-01T12:00:00.000Z",
      snapshot,
      status: "pending",
      attempts: 0,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        status: "accepted",
        summaryId: snapshot.summaryId,
      }),
    } as unknown as Response);

    const { emitter, persistState } = makeEmitter(configWithUrl, state);
    await emitter.deliverPending();

    expect(state.demandSummaryDeliveries[0].status).toBe("delivered");
    expect(state.demandSummaryDeliveries[0].attempts).toBe(1);
    expect(persistState).toHaveBeenCalled();
  });
});
