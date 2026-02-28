import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';
import type { MilestoneEvent, MilestoneFeedResponse } from '../shared/milestones';

const RISK_EMOJI: Record<MilestoneEvent['riskStatus'], string> = {
  'on-track': '🟢',
  'at-risk': '🟡',
  'blocked': '🔴',
  'completed': '✅',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export const Splash = () => {
  const [latest, setLatest] = useState<MilestoneEvent | null>(null);

  useEffect(() => {
    void fetch('/api/milestones/latest?limit=1')
      .then((r) => r.json() as Promise<MilestoneFeedResponse>)
      .then((data) => {
        if (data.ok && data.items.length > 0) setLatest(data.items[0]!);
      });
  }, []);

  return (
    <div
      className="flex flex-col justify-between min-h-screen bg-white dark:bg-gray-900 px-4 py-4 cursor-pointer"
      onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold text-gray-900 dark:text-white">OpenClaw</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">milestones</span>
      </div>

      {latest ? (
        <div className="flex flex-col gap-1 py-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <span>{RISK_EMOJI[latest.riskStatus]}</span>
            <span className="font-mono truncate">{latest.scope}</span>
            <span className="ml-auto whitespace-nowrap">{timeAgo(latest.timestampUtc)}</span>
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">
            {latest.claim}
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No milestones yet.</p>
      )}

      <p className="text-xs text-[#d93900] dark:text-orange-400 font-semibold">
        Tap to view all →
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
