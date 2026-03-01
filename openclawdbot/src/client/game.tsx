import './index.css';

import { StrictMode, useDeferredValue, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useCommandCenterControl } from './hooks/useCommandCenterControl';
import { useCommandCenterDemand } from './hooks/useCommandCenterDemand';
import { useCommandCenterOverview } from './hooks/useCommandCenterOverview';
import { useMilestoneFeed } from './hooks/useMilestoneFeed';
import type {
  CommandCenterControlResponse,
  CommandCenterDemandResponse,
  CommandCenterOverviewResponse,
  ProofNodeState,
} from '../shared/command-center';
import type { MilestoneEvent } from '../shared/milestones';
import {
  buildFallbackOverview,
  formatPollFreshness,
  getDemandStateMeta,
  getTierMeta,
} from './lib/command-center';
import { formatTimeAgo } from './lib/milestones';
import heroImage from './OPENCLAWINFRA.jpg';

type ViewMode = 'proof' | 'control' | 'demand';
type SourceName = NonNullable<MilestoneEvent['source']>;

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string }> = [
  { id: 'proof', label: 'Proof' },
  { id: 'control', label: 'Control' },
  { id: 'demand', label: 'Demand' },
];

const RISK_META: Record<
  MilestoneEvent['riskStatus'],
  { label: string; dot: string; pill: string }
> = {
  'on-track': {
    label: 'On track',
    dot: 'bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]',
    pill: 'bg-emerald-300/12 text-emerald-100 ring-1 ring-emerald-200/15',
  },
  'at-risk': {
    label: 'At risk',
    dot: 'bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.85)]',
    pill: 'bg-amber-300/12 text-amber-100 ring-1 ring-amber-200/15',
  },
  blocked: {
    label: 'Blocked',
    dot: 'bg-rose-300 shadow-[0_0_18px_rgba(253,164,175,0.85)]',
    pill: 'bg-rose-300/12 text-rose-100 ring-1 ring-rose-200/15',
  },
  completed: {
    label: 'Completed',
    dot: 'bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.85)]',
    pill: 'bg-cyan-300/12 text-cyan-100 ring-1 ring-cyan-200/15',
  },
};

const NODE_STATE_META: Record<
  ProofNodeState,
  { dot: string; tone: string; border: string }
> = {
  live: {
    dot: 'bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.9)]',
    tone: 'text-cyan-100',
    border: 'border-cyan-200/20',
  },
  warning: {
    dot: 'bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.8)]',
    tone: 'text-amber-100',
    border: 'border-amber-200/20',
  },
  idle: {
    dot: 'bg-slate-500',
    tone: 'text-slate-300',
    border: 'border-white/10',
  },
};

const SOURCE_LABEL: Record<SourceName, string> = {
  orchestrator: 'Orchestrator',
  agent: 'Claw Agent',
  operator: 'Operator',
};

const FALLBACK_LANES = ['runtime', 'proof layer', 'demand radar'];

const BrandMark = ({ sizeClass }: { sizeClass: string }) => (
  <div
    className={`relative flex items-center justify-center rounded-full border border-cyan-200/20 ${sizeClass}`}
  >
    <div className="absolute h-[72%] w-[72%] rounded-full border border-white/12" />
    <div className="absolute h-[34%] w-[34%] rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.9)]" />
  </div>
);

const SurfaceCard = ({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) => (
  <article className="rounded-[1.45rem] border border-white/8 bg-black/24 p-4 backdrop-blur-xl">
    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
      {eyebrow}
    </p>
    <h3 className="mt-2 text-base font-semibold leading-tight text-white">
      {title}
    </h3>
    <p className="mt-3 text-sm leading-snug text-slate-300">{body}</p>
  </article>
);

const MetricTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-[1.2rem] border border-white/8 bg-black/26 px-3 py-3 backdrop-blur-xl">
    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
      {label}
    </p>
    <p className="mt-2 text-base font-semibold text-white">{value}</p>
  </div>
);

const DesktopRail = ({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string;
  title: string;
  items: Array<{ label: string; value: string }>;
}) => (
  <aside className="hidden lg:block">
    <div className="sticky top-4 rounded-[2rem] border border-white/8 bg-black/24 p-4 backdrop-blur-xl">
      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-lg font-semibold text-white">{title}</h2>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] p-3"
          >
            <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">
              {item.label}
            </p>
            <p className="mt-2 text-sm leading-snug text-slate-300">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  </aside>
);

const ViewSwitch = ({
  activeView,
  setActiveView,
}: {
  activeView: ViewMode;
  setActiveView: (value: ViewMode) => void;
}) => (
  <div className="grid grid-cols-3 gap-2 rounded-[1.4rem] border border-white/8 bg-black/24 p-1.5 backdrop-blur-xl">
    {VIEW_OPTIONS.map((view) => {
      const active = view.id === activeView;

      return (
        <button
          key={view.id}
          type="button"
          className={`rounded-[1rem] px-3 py-2 text-xs font-medium transition ${
            active
              ? 'bg-cyan-300/12 text-cyan-100 ring-1 ring-cyan-200/15'
              : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
          }`}
          onClick={() => setActiveView(view.id)}
        >
          {view.label}
        </button>
      );
    })}
  </div>
);

const SignedSignalChain = ({
  overview,
  pulseActive,
}: {
  overview: CommandCenterOverviewResponse;
  pulseActive: boolean;
}) => (
  <section
    className={`rounded-[1.8rem] border bg-black/24 p-3 backdrop-blur-xl transition ${
      pulseActive
        ? 'animate-[pulse_1.2s_ease-out_1] border-cyan-200/20 shadow-[0_0_30px_rgba(34,211,238,0.12)]'
        : 'border-white/8'
    }`}
  >
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
          Signed signal chain
        </p>
        <h2 className="mt-1 text-base font-semibold text-white">
          Selective transparency, instrumented live
        </h2>
      </div>
      <span className="rounded-full border border-white/8 bg-black/22 px-3 py-1.5 text-[11px] text-slate-300">
        {overview.realtimeChannel}
      </span>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
      {overview.proofNodes.map((node) => {
        const meta = NODE_STATE_META[node.state];

        return (
          <div
            key={node.id}
            className={`rounded-[1.2rem] border bg-white/[0.03] p-3 ${meta.border} ${
              pulseActive && node.id === 'surface'
                ? 'shadow-[0_0_24px_rgba(34,211,238,0.16)]'
                : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              <p
                className={`text-[10px] uppercase tracking-[0.22em] ${meta.tone}`}
              >
                {node.label}
              </p>
            </div>
            <p className="mt-2 text-xs leading-snug text-slate-300">
              {node.detail}
            </p>
          </div>
        );
      })}
    </div>
  </section>
);

const HeroBoard = ({
  latest,
  loading,
  activeView,
  summary,
  visibleCount,
  evidenceCount,
  laneCount,
}: {
  latest: MilestoneEvent | null;
  loading: boolean;
  activeView: ViewMode;
  summary: string;
  visibleCount: number;
  evidenceCount: number;
  laneCount: number;
}) => {
  const meta = latest ? RISK_META[latest.riskStatus] : RISK_META['on-track'];
  const headline = latest?.claim ?? 'Command center standing by.';
  const viewLabel =
    activeView === 'proof'
      ? 'Operational proof'
      : activeView === 'control'
        ? 'Runtime control'
        : 'Demand radar';

  return (
    <section className="relative overflow-hidden rounded-[2.2rem] border border-cyan-300/8 bg-[linear-gradient(135deg,#010611_0%,#061122_54%,#020713_100%)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <div className="pointer-events-none absolute inset-0">
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-84"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(1,6,17,0.94)_0%,rgba(1,6,17,0.84)_28%,rgba(1,6,17,0.36)_60%,rgba(1,6,17,0.7)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,6,17,0.2)_0%,rgba(1,6,17,0.58)_72%,rgba(1,6,17,0.88)_100%)]" />
        <div className="absolute inset-0 opacity-10 [background-image:linear-gradient(rgba(59,130,246,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.06)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="relative z-10 flex min-h-[24rem] flex-col justify-between gap-5 p-4 sm:p-5 lg:min-h-[25rem] lg:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandMark sizeClass="h-11 w-11 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-cyan-200/70">
                OpenClaw
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-[0.06em] text-white sm:text-2xl">
                Live Command Center
              </h1>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium ${meta.pill}`}
            >
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {loading ? 'Syncing' : meta.label}
            </span>
            <span className="rounded-full border border-white/8 bg-black/22 px-3 py-1.5 text-[11px] text-slate-300">
              {latest ? formatTimeAgo(latest.timestampUtc) : 'standby'}
            </span>
          </div>
        </div>

        <div className="max-w-[40rem]">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
            {viewLabel}
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-4xl">
            {headline}
          </h2>
          <p className="mt-3 max-w-[34rem] text-sm leading-relaxed text-slate-300 sm:text-base">
            {summary}
          </p>
          {latest?.nextAction && (
            <p className="mt-4 inline-flex max-w-[34rem] rounded-full border border-white/8 bg-black/26 px-3 py-2 text-xs text-slate-300 backdrop-blur-xl">
              Next: {latest.nextAction}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <MetricTile
            label="Visible"
            value={`${visibleCount} signal${visibleCount === 1 ? '' : 's'}`}
          />
          <MetricTile
            label="Evidence"
            value={`${evidenceCount} item${evidenceCount === 1 ? '' : 's'}`}
          />
          <MetricTile label="Lanes" value={`${laneCount} active`} />
        </div>
      </div>
    </section>
  );
};

const ProofSurface = ({
  overview,
  timeline,
  proofHealth,
}: {
  overview: CommandCenterOverviewResponse;
  timeline: MilestoneEvent[];
  proofHealth: string;
}) => (
  <div className="grid gap-3 md:grid-cols-2">
    <SurfaceCard
      eyebrow="Integrity"
      title="What proves the signal"
      body={proofHealth}
    />
    <SurfaceCard
      eyebrow="Freshness"
      title="Canonical feed status"
      body={formatPollFreshness(overview.lastPollAt)}
    />
    <SurfaceCard
      eyebrow="Risk posture"
      title="Visible risk mix"
      body={`${overview.riskCounts.onTrack} on track, ${overview.riskCounts.atRisk} at risk, ${overview.riskCounts.blocked} blocked, ${overview.riskCounts.completed} completed.`}
    />
    <SurfaceCard
      eyebrow="Feed scope"
      title="What the board is seeing"
      body={
        overview.activeLanes.length > 0
          ? `Active lanes: ${overview.activeLanes.join(', ')}.`
          : 'The proof layer is warming before the first lane is visible.'
      }
    />

    <article className="rounded-[1.45rem] border border-white/8 bg-black/24 p-4 backdrop-blur-xl md:col-span-2">
      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
        Queue behind the head
      </p>
      <h3 className="mt-2 text-base font-semibold text-white">
        What is already lined up behind the latest signal
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(timeline.length > 0
          ? timeline.slice(0, 4)
          : [overview.latest].filter(Boolean)
        ).map((item) => (
          <div
            key={item!.milestoneId}
            className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-3"
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {item!.scope} • {formatTimeAgo(item!.timestampUtc)}
            </p>
            <p className="mt-2 text-sm font-medium leading-snug text-slate-200">
              {item!.claim}
            </p>
            {item!.evidence[0] && (
              <p className="mt-2 text-xs leading-snug text-slate-400">
                Evidence: {item!.evidence[0].summary}
              </p>
            )}
          </div>
        ))}
      </div>
    </article>
  </div>
);

const ControlSurface = ({
  control,
  error,
}: {
  control: CommandCenterControlResponse;
  error: string | null;
}) => (
  <div className="space-y-3">
    {error && (
      <div className="rounded-[1.35rem] border border-amber-200/15 bg-amber-300/8 px-4 py-3 text-xs text-amber-100">
        Live control metadata is degraded. The board is using the bundled
        contract snapshot.
      </div>
    )}

    {control.clusters.map((cluster) => (
      <section
        key={cluster.id}
        className="rounded-[1.6rem] border border-white/8 bg-black/24 p-4 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
              {cluster.id.replace(/-/g, ' ')}
            </p>
            <h3 className="mt-1 text-base font-semibold text-white">
              {cluster.label}
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {cluster.engines.length} engine
            {cluster.engines.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {cluster.engines.map((engine) => {
            const tierMeta = getTierMeta(engine.tier);

            return (
              <article
                key={engine.id}
                className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">
                    {engine.name}
                  </h4>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] ${tierMeta.tone}`}
                  >
                    {tierMeta.label}
                  </span>
                </div>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                  {engine.task}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
                  <p>Model: {engine.model}</p>
                  <p>Timeout: {engine.timeoutLabel}</p>
                  <p>Network: {engine.networkMode}</p>
                  <p>Approval: {engine.approvalClass}</p>
                </div>
                <p className="mt-3 text-xs leading-snug text-slate-400">
                  Skills: {engine.allowedSkills.join(', ')}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    ))}
  </div>
);

const DemandSurface = ({
  demand,
  error,
}: {
  demand: CommandCenterDemandResponse;
  error: string | null;
}) => {
  const provenance =
    demand.summary.source === 'live'
      ? 'Live from orchestrator queue telemetry.'
      : demand.summary.source === 'stale'
        ? 'Holding the last verified demand snapshot.'
        : 'Demand telemetry is standing by for the first signed summary.';

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-[1.35rem] border border-amber-200/15 bg-amber-300/8 px-4 py-3 text-xs text-amber-100">
          Live demand intensity is degraded. The board is using the last safe
          demand state until the telemetry channel refreshes.
        </div>
      )}

      <SurfaceCard
        eyebrow="Demand thesis"
        title="Where the market pressure is concentrating"
        body={demand.summary.demandNarrative}
      />

      <section className="rounded-[1.45rem] border border-white/8 bg-black/24 p-4 backdrop-blur-xl">
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
          Telemetry source
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold text-white">Queue pressure</h3>
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] text-slate-300">
            {provenance}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <MetricTile label="Queue" value={`${demand.summary.queueTotal}`} />
          <MetricTile label="Drafts" value={`${demand.summary.draftTotal}`} />
          <MetricTile
            label="Ready"
            value={`${demand.summary.selectedForDraftTotal}`}
          />
        </div>
        {demand.summary.topPillarLabel && (
          <p className="mt-3 text-xs leading-snug text-slate-300">
            Top pillar: {demand.summary.topPillarLabel}
          </p>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {demand.segments.map((segment) => {
          const meta = getDemandStateMeta(segment.state);

          return (
            <article
              key={segment.id}
              className={`rounded-[1.45rem] border bg-black/24 p-4 ring-1 backdrop-blur-xl ${meta.ring} border-white/8`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">
                  {segment.label}
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] ${meta.tone}`}
                >
                  {meta.label}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Weight {segment.staticWeight} • {segment.liveSignalCount} live
                signal{segment.liveSignalCount === 1 ? '' : 's'}
              </p>
              <p className="mt-3 text-xs leading-snug text-slate-300">
                {segment.clusterLabels.join(' • ')}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
};

const MilestoneCard = ({ item }: { item: MilestoneEvent }) => {
  const meta = RISK_META[item.riskStatus];
  const leadEvidence = item.evidence[0];

  return (
    <article className="rounded-[1.6rem] border border-white/10 bg-black/24 p-4 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
            <span className="truncate">
              {item.source ? SOURCE_LABEL[item.source] : item.scope}
            </span>
            <span>{formatTimeAgo(item.timestampUtc)}</span>
          </div>

          <p className="mt-3 text-base font-semibold leading-tight text-white sm:text-lg">
            {item.claim}
          </p>

          {item.nextAction && (
            <p className="mt-2 text-sm leading-snug text-slate-300">
              Next: {item.nextAction}
            </p>
          )}

          {leadEvidence && (
            <p className="mt-2 text-xs leading-snug text-slate-400">
              Evidence: {leadEvidence.summary}
            </p>
          )}
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.pill}`}
        >
          {meta.label}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
        <span>
          {item.evidence.length} evidence item
          {item.evidence.length === 1 ? '' : 's'}
        </span>
        <span className="truncate">{item.scope}</span>
      </div>
    </article>
  );
};

export const App = () => {
  const {
    items,
    loading: feedLoading,
    error: feedError,
  } = useMilestoneFeed(24);
  const deferredItems = useDeferredValue(items);
  const feedHeadId = deferredItems[0]?.milestoneId ?? null;
  const {
    data: overviewData,
    loading: overviewLoading,
    error: overviewError,
  } = useCommandCenterOverview(feedHeadId);
  const { data: controlData, error: controlError } = useCommandCenterControl();
  const { data: demandData, error: demandError } =
    useCommandCenterDemand(feedHeadId);
  const [activeView, setActiveView] = useState<ViewMode>('proof');

  const overview =
    overviewData ?? buildFallbackOverview(deferredItems, 'milestones_feed');
  const control = controlData;
  const demand = demandData;

  const latest = overview.latest ?? deferredItems[0] ?? null;
  const visibleFeed =
    deferredItems.length > 0 ? deferredItems : latest ? [latest] : [];
  const timeline = deferredItems.slice(0, 6);
  const activeLanes =
    overview.activeLanes.length > 0 ? overview.activeLanes : FALLBACK_LANES;

  const headlineSummary =
    activeView === 'proof'
      ? overviewError
        ? 'Live summary is recovering. The command center is holding to the visible milestone stream while proof telemetry rehydrates.'
        : 'This layer turns signed runtime milestones into a readable public proof boundary without exposing the private core.'
      : activeView === 'control'
        ? 'The control layer exposes what each autonomous engine is allowed to do, where it is bounded, and which paths remain approval-aware.'
        : 'The demand layer now reads signed queue and draft telemetry from the orchestrator, turning real backlog pressure into a public market-intelligence surface without exposing the private core.';

  const proofHealth =
    overview.deadLetterCount > 0
      ? `${overview.deadLetterCount} rejected payload${overview.deadLetterCount === 1 ? '' : 's'} are visible in the dead-letter path. Signature verification is alerting, not failing closed.`
      : overview.lastPollAt
        ? `Canonical polling is healthy. ${formatPollFreshness(overview.lastPollAt)} and the proof chain is rebroadcasting live.`
        : 'The proof layer is warming. The board is holding visible feed state while the canonical poll cycle stabilizes.';

  const leftRailItems =
    activeView === 'proof'
      ? [
          {
            label: 'Next action',
            value:
              latest?.nextAction ||
              'The next verified action will surface here as soon as the feed advances.',
          },
          {
            label: 'Queued behind it',
            value:
              timeline[1]?.claim ||
              timeline[0]?.claim ||
              'As fresh milestones arrive, the queue behind the current head will stack here.',
          },
          {
            label: 'Risk posture',
            value:
              overview.riskCounts.blocked > 0
                ? `${overview.riskCounts.blocked} blocked signal${overview.riskCounts.blocked === 1 ? '' : 's'} need immediate attention.`
                : overview.riskCounts.atRisk > 0
                  ? `${overview.riskCounts.atRisk} at-risk signal${overview.riskCounts.atRisk === 1 ? '' : 's'} are visible, with no blocked items right now.`
                  : 'Visible proof is currently clear of at-risk and blocked signals.',
          },
        ]
      : activeView === 'control'
        ? [
            {
              label: 'Engine groups',
              value: `${control.clusters.length} stable clusters expose the current runtime contract snapshot.`,
            },
            {
              label: 'Approval posture',
              value:
                'High-trust lanes stay bounded, while build and deployment style actions remain the explicit human-override boundary.',
            },
            {
              label: 'Why it matters',
              value:
                'This is not a vague swarm. It is a declared engine map with named powers, network posture, and time budgets.',
            },
          ]
        : [
            {
              label: 'Hot segments',
              value:
                demand.summary.source === 'fallback'
                  ? 'Demand telemetry is standing by for the first signed summary.'
                  : `${demand.summary.hotSegments} segment${demand.summary.hotSegments === 1 ? '' : 's'} are actively rising on the board.`,
            },
            {
              label: 'Lead vector',
              value:
                demand.summary.topSegmentLabel ??
                'Awaiting the next visible pressure spike.',
            },
            {
              label: 'Why it matters',
              value:
                demand.summary.source === 'live'
                  ? 'Demand is reading the orchestrator queue directly, so the board reflects actual live pressure rather than inferred copy.'
                  : demand.summary.source === 'stale'
                    ? 'The board is holding the last verified demand snapshot until the telemetry channel refreshes.'
                    : 'The taxonomy is ready, and the board will promote live demand pressure as soon as the first summary lands.',
            },
          ];

  const rightRailItems = [
    {
      label: 'Freshness',
      value: formatPollFreshness(overview.lastPollAt),
    },
    {
      label: 'Proof integrity',
      value: proofHealth,
    },
    {
      label: 'Visible signal',
      value: `${overview.visibleFeedCount} signal${overview.visibleFeedCount === 1 ? '' : 's'}, ${overview.evidenceCount} evidence item${overview.evidenceCount === 1 ? '' : 's'}, ${activeLanes.length} active lane${activeLanes.length === 1 ? '' : 's'}.`,
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_24%),linear-gradient(180deg,rgba(1,6,19,0.9),rgba(2,8,23,0.98))]" />
      </div>

      <main className="relative mx-auto w-full max-w-[24rem] px-3 py-4 sm:max-w-[42rem] sm:px-4 lg:max-w-[96rem] lg:px-6">
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)_18rem]">
          <DesktopRail
            eyebrow="Strategic Context"
            title="What Comes Next"
            items={leftRailItems}
          />

          <div className="min-w-0 space-y-4">
            <HeroBoard
              latest={latest}
              loading={feedLoading || overviewLoading}
              activeView={activeView}
              summary={headlineSummary}
              visibleCount={overview.visibleFeedCount}
              evidenceCount={overview.evidenceCount}
              laneCount={activeLanes.length}
            />

            <SignedSignalChain
              key={feedHeadId ?? 'idle'}
              overview={overview}
              pulseActive={Boolean(feedHeadId)}
            />

            <section className="space-y-3 rounded-[2rem] border border-white/8 bg-white/[0.02] p-3 sm:p-4">
              <ViewSwitch
                activeView={activeView}
                setActiveView={setActiveView}
              />

              {activeView === 'proof' && (
                <ProofSurface
                  overview={overview}
                  timeline={timeline}
                  proofHealth={proofHealth}
                />
              )}

              {activeView === 'control' && (
                <ControlSurface control={control} error={controlError} />
              )}

              {activeView === 'demand' && (
                <DemandSurface demand={demand} error={demandError} />
              )}
            </section>

            <section className="space-y-3 pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                    Timeline
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-white">
                    Visible runtime signals
                  </h2>
                </div>
                <span className="text-xs text-slate-500">
                  {visibleFeed.length} event
                  {visibleFeed.length === 1 ? '' : 's'}
                </span>
              </div>

              {(feedError || overviewError) && (
                <div className="rounded-[1.35rem] border border-amber-200/15 bg-amber-300/8 px-4 py-3 text-xs text-amber-100">
                  Summary signal is partially degraded. The command center is
                  still rendering from the last safe milestone feed.
                </div>
              )}

              {feedLoading && visibleFeed.length === 0 && (
                <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.025] px-4 py-10 text-center text-sm text-slate-400">
                  Syncing live milestones...
                </div>
              )}

              {!feedLoading && visibleFeed.length === 0 && (
                <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.025] px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-300">
                    No mission events yet.
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    The proof layer will populate as soon as the first runtime
                    signal lands.
                  </p>
                </div>
              )}

              {visibleFeed.slice(0, 6).map((item) => (
                <MilestoneCard key={item.milestoneId} item={item} />
              ))}
            </section>
          </div>

          <DesktopRail
            eyebrow="Trust + Momentum"
            title="Why It Holds"
            items={rightRailItems}
          />
        </div>
      </main>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
