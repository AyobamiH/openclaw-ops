import { startTransition, useEffect, useState } from 'react';
import { connectRealtime, disconnectRealtime } from '@devvit/web/client';
import type {
  MilestoneEvent,
  MilestoneFeedResponse,
  MilestoneRealtimeMessage,
} from '../../shared/milestones';
import {
  normalizeMilestoneEvents,
  prependMilestoneEvent,
} from '../lib/milestones';

const REALTIME_CHANNEL = 'milestones_feed';

export const useMilestoneFeed = (limit = 20) => {
  const [items, setItems] = useState<MilestoneEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/milestones/latest?limit=${limit}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Feed request failed with ${response.status}`);
        }

        return (await response.json()) as MilestoneFeedResponse;
      })
      .then((data) => {
        if (cancelled || !data.ok) return;

        startTransition(() => {
          setItems(normalizeMilestoneEvents(data.items).slice(0, limit));
          setError(null);
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;

        const message =
          cause instanceof Error ? cause.message : 'Feed unavailable';
        startTransition(() => {
          setError(message);
        });
      })
      .finally(() => {
        if (!cancelled) {
          startTransition(() => setLoading(false));
        }
      });

    connectRealtime<MilestoneRealtimeMessage>({
      channel: REALTIME_CHANNEL,
      onMessage: ({ event }) => {
        startTransition(() => {
          setItems((prev) => prependMilestoneEvent(prev, event, limit));
          setError(null);
        });
      },
    });

    return () => {
      cancelled = true;
      disconnectRealtime(REALTIME_CHANNEL);
    };
  }, [limit]);

  return { items, loading, error } as const;
};
