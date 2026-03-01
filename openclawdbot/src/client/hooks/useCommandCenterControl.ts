import { startTransition, useEffect, useState } from 'react';
import type { CommandCenterControlResponse } from '../../shared/command-center';
import { COMMAND_CENTER_CONTROL_CLUSTERS } from '../../shared/command-center-static';

export const useCommandCenterControl = () => {
  const [data, setData] = useState<CommandCenterControlResponse>({
    ok: true,
    clusters: COMMAND_CENTER_CONTROL_CLUSTERS,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/command-center/control')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Control request failed with ${response.status}`);
        }

        return (await response.json()) as CommandCenterControlResponse;
      })
      .then((nextData) => {
        if (cancelled || !nextData.ok) return;

        startTransition(() => {
          setData(nextData);
          setError(null);
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message =
          cause instanceof Error ? cause.message : 'Control metadata unavailable';
        startTransition(() => setError(message));
      })
      .finally(() => {
        if (!cancelled) {
          startTransition(() => setLoading(false));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error } as const;
};
