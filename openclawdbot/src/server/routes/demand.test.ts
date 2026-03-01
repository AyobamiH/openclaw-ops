import { describe, expect, it } from 'vitest';
import { buildCommandCenterDemandResponse } from './demand';
import type { DemandSummaryFeedResponse } from '../../shared/demand-summary';

describe('buildCommandCenterDemandResponse()', () => {
  it('returns a standby fallback when no snapshot is available', () => {
    const response = buildCommandCenterDemandResponse({
      ok: true,
      snapshot: null,
      stale: true,
    });

    expect(response.summary.source).toBe('fallback');
    expect(response.summary.queueTotal).toBe(0);
    expect(response.summary.hotSegments).toBe(0);
    expect(response.segments.every((segment) => segment.state === 'idle')).toBe(
      true
    );
  });

  it('promotes live values from a fresh demand snapshot', () => {
    const feed: DemandSummaryFeedResponse = {
      ok: true,
      stale: false,
      snapshot: {
        summaryId: 'demand.summary.test',
        generatedAtUtc: '2026-03-01T12:00:00.000Z',
        source: 'orchestrator',
        queueTotal: 4,
        draftTotal: 3,
        selectedForDraftTotal: 2,
        tagCounts: {
          draft: 1,
          priority: 1,
          manualReview: 1,
        },
        topPillars: [{ id: 'openclaw', label: 'OpenClaw', count: 2 }],
        topKeywordClusters: [
          {
            id: 'skills_supply_chain',
            label: 'Skills Supply Chain',
            count: 2,
          },
        ],
        segments: [
          {
            id: 'skills-supply-chain',
            label: 'Skills Supply Chain',
            liveSignalCount: 3,
            state: 'hot',
            staticWeight: 4,
            clusterLabels: [
              'skills supply chain',
              'prompt injection',
              'extension trust',
            ],
          },
        ],
      },
    };

    const response = buildCommandCenterDemandResponse(feed);

    expect(response.summary.source).toBe('live');
    expect(response.summary.queueTotal).toBe(4);
    expect(response.summary.draftTotal).toBe(3);
    expect(response.summary.selectedForDraftTotal).toBe(2);
    expect(response.summary.topPillarLabel).toBe('OpenClaw');
    expect(
      response.segments.find((segment) => segment.id === 'skills-supply-chain')
        ?.state
    ).toBe('hot');
  });
});
