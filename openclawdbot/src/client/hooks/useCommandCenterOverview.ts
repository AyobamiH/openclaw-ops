import { startTransition, useEffect, useState } from 'react';
import type { CommandCenterOverviewResponse } from '../../shared/command-center';

export const useCommandCenterOverview = (refreshKey?: string | null) => {
  const [data, setData] = useState<CommandCenterOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/command-center/overview');
        if (!response.ok) {
          throw new Error(`Overview request failed with ${response.status}`);
        }

        const nextData =
          (await response.json()) as CommandCenterOverviewResponse;
        if (cancelled || !nextData.ok) return;

        startTransition(() => {
          setData(nextData);
          setError(null);
        });
      } catch (cause: unknown) {
        if (cancelled) return;
        const message =
          cause instanceof Error ? cause.message : 'Overview unavailable';
        startTransition(() => setError(message));
      } finally {
        if (!cancelled) {
          startTransition(() => setLoading(false));
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshKey]);

  return { data, loading, error } as const;
};
