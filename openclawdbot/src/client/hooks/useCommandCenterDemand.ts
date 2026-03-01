import { startTransition, useEffect, useState } from 'react';
import { connectRealtime, disconnectRealtime } from '@devvit/web/client';
import type { CommandCenterDemandResponse } from '../../shared/command-center';
import type { DemandSummaryRealtimeMessage } from '../../shared/demand-summary';
import { COMMAND_CENTER_DEMAND_SEGMENTS } from '../../shared/command-center-static';

const REALTIME_CHANNEL = 'demand_summary';

const FALLBACK_DEMAND: CommandCenterDemandResponse = {
  ok: true,
  segments: COMMAND_CENTER_DEMAND_SEGMENTS.map((segment) => ({
    ...segment,
    liveSignalCount: 0,
    state: 'idle',
  })),
  summary: {
    totalSegments: COMMAND_CENTER_DEMAND_SEGMENTS.length,
    hotSegments: 0,
    demandNarrative:
      'Demand radar is waiting for the next visible signal before it intensifies.',
    topSegmentLabel: null,
    topPillarLabel: null,
    stale: true,
    source: 'fallback',
    snapshotGeneratedAt: null,
    queueTotal: 0,
    draftTotal: 0,
    selectedForDraftTotal: 0,
  },
};

export const useCommandCenterDemand = (refreshKey?: string | null) => {
  const [data, setData] =
    useState<CommandCenterDemandResponse>(FALLBACK_DEMAND);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/command-center/demand');
        if (!response.ok) {
          throw new Error(`Demand request failed with ${response.status}`);
        }

        const nextData = (await response.json()) as CommandCenterDemandResponse;
        if (cancelled || !nextData.ok) return;

        startTransition(() => {
          setData(nextData);
          setError(null);
        });
      } catch (cause: unknown) {
        if (cancelled) return;
        const message =
          cause instanceof Error ? cause.message : 'Demand radar unavailable';
        startTransition(() => setError(message));
      } finally {
        if (!cancelled) {
          startTransition(() => setLoading(false));
        }
      }
    };

    void load();

    connectRealtime<DemandSummaryRealtimeMessage>({
      channel: REALTIME_CHANNEL,
      onMessage: () => {
        void load();
      },
    });

    return () => {
      cancelled = true;
      disconnectRealtime(REALTIME_CHANNEL);
    };
  }, [refreshKey]);

  return { data, loading, error } as const;
};
