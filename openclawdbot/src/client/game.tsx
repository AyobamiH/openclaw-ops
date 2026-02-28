import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useMilestoneFeed } from './hooks/useMilestoneFeed';
import type { MilestoneEvent } from '../shared/milestones';

const RISK_META: Record<MilestoneEvent['riskStatus'], { emoji: string; label: string; cls: string }> = {
  'on-track':  { emoji: '🟢', label: 'On track',  cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  'at-risk':   { emoji: '🟡', label: 'At risk',   cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  'blocked':   { emoji: '🔴', label: 'Blocked',   cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  'completed': { emoji: '✅', label: 'Completed', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const MilestoneCard = ({ item }: { item: MilestoneEvent }) => {
  const meta = RISK_META[item.riskStatus];
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate">{item.scope}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}>
          {meta.emoji} {meta.label}
        </span>
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">{item.claim}</p>
      {item.nextAction && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold">Next:</span> {item.nextAction}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
        <span>{item.evidence.length} evidence item{item.evidence.length !== 1 ? 's' : ''}</span>
        <span>{timeAgo(item.timestampUtc)}</span>
      </div>
    </div>
  );
};

export const App = () => {
  const { items, loading } = useMilestoneFeed(50);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-2">
        <span className="text-lg font-bold text-gray-900 dark:text-white">OpenClaw</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">milestone feed</span>
        {!loading && (
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{items.length} milestone{items.length !== 1 ? 's' : ''}</span>
        )}
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500 text-sm">
            Loading…
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400 dark:text-gray-500">
            <span className="text-3xl">🎯</span>
            <p className="text-sm">No milestones yet — check back soon.</p>
          </div>
        )}
        {items.map((item) => (
          <MilestoneCard key={item.milestoneId} item={item} />
        ))}
      </main>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
