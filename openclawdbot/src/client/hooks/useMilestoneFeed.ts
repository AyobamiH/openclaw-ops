import { useEffect, useState } from 'react';
import { connectRealtime, disconnectRealtime } from '@devvit/web/client';
import type { MilestoneEvent, MilestoneFeedResponse, MilestoneRealtimeMessage } from '../../shared/milestones';

const REALTIME_CHANNEL = 'milestones-feed';

export const useMilestoneFeed = (limit = 20) => {
  const [items, setItems] = useState<MilestoneEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`/api/milestones/latest?limit=${limit}`)
      .then((r) => r.json() as Promise<MilestoneFeedResponse>)
      .then((data) => {
        if (data.ok) setItems(data.items);
      })
      .finally(() => setLoading(false));

    connectRealtime<MilestoneRealtimeMessage>({
      channel: REALTIME_CHANNEL,
      onMessage: ({ event }) => {
        setItems((prev) => [event, ...prev].slice(0, limit));
      },
    });

    return () => {
      disconnectRealtime(REALTIME_CHANNEL);
    };
  }, [limit]);

  return { items, loading } as const;
};
