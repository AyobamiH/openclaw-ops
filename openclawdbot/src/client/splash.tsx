import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';
import { useCommandCenterOverview } from './hooks/useCommandCenterOverview';
import { useMilestoneFeed } from './hooks/useMilestoneFeed';
import { buildFallbackOverview } from './lib/command-center';
import { formatTimeAgo } from './lib/milestones';
import heroImage from './OPENCLAWINFRA.jpg';

const BrandMark = () => (
  <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/20">
    <div className="absolute h-[72%] w-[72%] rounded-full border border-white/12" />
    <div className="absolute h-[34%] w-[34%] rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.9)]" />
  </div>
);

export const Splash = () => {
  const { items } = useMilestoneFeed(1);
  const headId = items[0]?.milestoneId ?? null;
  const { data } = useCommandCenterOverview(headId);
  const overview = data ?? buildFallbackOverview(items);
  const latest = overview.latest ?? items[0] ?? null;
  const proofChain = overview.proofNodes.filter((node) =>
    ['emit', 'verify', 'surface'].includes(node.id)
  );
  const integrityLabel =
    overview.deadLetterCount > 0 ? 'Watch' : latest ? 'Verified' : 'Standby';

  return (
    <div
      className="relative flex min-h-screen cursor-pointer flex-col overflow-hidden rounded-[1.8rem] border border-cyan-300/8 bg-[linear-gradient(135deg,#010611_0%,#061122_54%,#020713_100%)] px-4 py-4 text-slate-100"
      onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
    >
      <div className="pointer-events-none absolute inset-0">
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-82"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(1,6,17,0.94)_0%,rgba(1,6,17,0.82)_38%,rgba(1,6,17,0.4)_68%,rgba(1,6,17,0.62)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,6,17,0.18)_0%,rgba(1,6,17,0.68)_76%,rgba(1,6,17,0.9)_100%)]" />
        <div className="absolute inset-0 opacity-10 [background-image:linear-gradient(rgba(59,130,246,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.06)_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70">
                OpenClaw
              </p>
              <h1 className="mt-1 text-lg font-semibold text-white">
                Command Center
              </h1>
            </div>
          </div>

          <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-black/24 px-3 py-1.5 text-[11px] text-slate-200 backdrop-blur-xl">
            {integrityLabel}
          </span>
        </div>

        <div className="max-w-[76%]">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
            Proof / Control / Demand
          </p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">
            {latest?.claim ?? 'The public proof boundary is ready.'}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Tap to open the live command center and inspect proof flow, runtime
            controls, and demand pressure.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {proofChain.map((node) => (
            <div
              key={node.id}
              className="rounded-[1.1rem] border border-white/8 bg-black/24 px-3 py-3 backdrop-blur-xl"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {node.label}
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {node.state}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-[1.1rem] border border-white/8 bg-black/24 px-3 py-3 backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
              Freshness
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {latest ? formatTimeAgo(latest.timestampUtc) : 'standby'}
            </p>
          </div>
          <div className="rounded-[1.1rem] border border-white/8 bg-black/24 px-3 py-3 backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
              Integrity
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {overview.deadLetterCount > 0 ? `${overview.deadLetterCount} warn` : 'clean'}
            </p>
          </div>
          <div className="rounded-[1.1rem] border border-white/8 bg-black/24 px-3 py-3 backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
              Lanes
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {overview.activeLaneCount || 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
