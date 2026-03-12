/**
 * Knowledge Orchestrator - Main KB coordinator
 * Integrates pattern analysis, concept mapping, and persistent learning
 * Feeds on Phase 4 daily consolidation insights
 */

import { PatternAnalyzer, AlertPattern, MetricPattern } from './pattern-analyzer.js';
import {
  KnowledgeBaseEngine,
  KBEntry,
  KBEntryProvenance,
} from './knowledge-base.js';
import { ConceptMapper } from './concept-mapper.js';
import { PersistenceIntegration } from '../persistence/persistence-integration.js';

export class KnowledgeOrchestrator {
  private patternAnalyzer = new PatternAnalyzer();
  private knowledgeBase = new KnowledgeBaseEngine();
  private conceptMapper = new ConceptMapper();

  /**
   * Hydrate KB from persistent storage on startup
   */
  async initialize(): Promise<void> {
    try {
      const persistedEntries = await PersistenceIntegration.loadKBEntries();
      if (persistedEntries.length > 0) {
        this.knowledgeBase.hydrateFromPersistence(persistedEntries);
        console.log(`[KnowledgeBase] ♻️ Hydrated ${persistedEntries.length} entries from MongoDB`);
      } else {
        console.log('[KnowledgeBase] ℹ️ No persisted KB entries found; starting fresh');
      }
    } catch (error) {
      console.error('[KnowledgeBase] Failed to hydrate from persistence:', error);
    }
  }

  /**
   * Process daily consolidation and extract knowledge
   */
  async processConsolidation(consolidation: any, date: string): Promise<void> {
    const dateStr = new Date(date).toISOString().split('T')[0];

    // 1. Extract patterns
    const { alertPatterns, metricPatterns, newPatterns } =
      this.patternAnalyzer.analyzeConsolidation(consolidation);

    if (newPatterns) {
      console.log(`[KnowledgeBase] 📊 Found ${alertPatterns.length} new patterns`);
    }

    // 2. Extract and link concepts
    const concepts = this.conceptMapper.extractConcepts(consolidation, dateStr);
    this.linkConceptsFromConsolidation(consolidation, concepts, dateStr);

    // 3. Create KB entries from patterns
    for (const pattern of alertPatterns) {
      await this.createKBEntryFromPattern(pattern, dateStr);
    }

    for (const pattern of metricPatterns) {
      await this.createKBEntryFromMetricPattern(pattern, dateStr);
    }

    // 4. Auto-link related KB entries
    this.autoLinkKBEntries();

    console.log(
      `[KnowledgeBase] ✨ Processed consolidation: ${concepts.length} concepts, ${alertPatterns.length} alert patterns`
    );
  }

  /**
   * Link concepts extracted from consolidation
   */
  private linkConceptsFromConsolidation(
    consolidation: any,
    concepts: any[],
    date: string
  ): void {
    // Find error-related concepts
    const errorConcepts = concepts.filter(
      c => c.type === 'root_cause' && consolidation.metrics.avgErrorRate > 0.05
    );

    // Find solution concepts
    const solutionConcepts = concepts.filter(c => c.type === 'solution');

    // Link errors to solutions
    errorConcepts.forEach(error => {
      solutionConcepts.forEach(solution => {
        this.conceptMapper.linkConcepts(error, solution, 'solved_by', date);
      });
    });

    // Link metrics to root causes
    const metricConcepts = concepts.filter(c => c.type === 'metric');
    metricConcepts.forEach(metric => {
      errorConcepts.forEach(error => {
        this.conceptMapper.linkConcepts(metric, error, 'indicates', date);
      });
    });
  }

  /**
   * Create KB entry from alert pattern
   */
  private async createKBEntryFromPattern(
    pattern: AlertPattern,
    date: string
  ): Promise<KBEntry | null> {
    try {
      // Check if entry exists
      const existing = this.knowledgeBase.search(pattern.name);

      if (existing.length > 0) {
        // Update existing
        const updated = this.knowledgeBase.updateEntry(existing[0].id, {
          occurrences: existing[0].occurrences + 1,
          lastUpdated: Date.now(),
        });
        if (updated) {
          await PersistenceIntegration.onKBEntryCreated(updated);
        }
        return updated;
      }

      // Create new entry
      // Map AlertPattern severity to KBEntry severity
      const kbSeverity: 'critical' | 'high' | 'medium' | 'low' =
        pattern.severity === 'critical' ? 'critical' : 'high';

      const created = this.knowledgeBase.createEntry('alert_pattern', {
        title: pattern.name,
        description: pattern.description,
        severity: kbSeverity,
        rootCause: pattern.rootCause,
        solution: pattern.solution,
        steps: [pattern.solution],
        expectedOutcome: `${pattern.name} should stop firing`,
        tags: pattern.tags,
        occurrences: pattern.occurrences,
        provenance: {
          sourceType: 'alert-pattern',
          sourceModel: 'pattern-analyzer',
          derivedFrom: ['daily-consolidation', 'pattern-analyzer'],
          evidenceDate: date,
        },
      });
      await PersistenceIntegration.onKBEntryCreated(created);
      return created;
    } catch (error) {
      console.error(`[KnowledgeBase] Error creating entry from pattern:`, error);
      return null;
    }
  }

  /**
   * Create KB entry from metric pattern
   */
  private async createKBEntryFromMetricPattern(
    pattern: MetricPattern,
    date: string
  ): Promise<KBEntry | null> {
    try {
      // Check if entry exists
      const existing = this.knowledgeBase.search(pattern.name);

      if (existing.length > 0) {
        const updated = this.knowledgeBase.updateEntry(existing[0].id, {
          occurrences: existing[0].occurrences + 1,
          lastUpdated: Date.now(),
        });
        if (updated) {
          await PersistenceIntegration.onKBEntryCreated(updated);
        }
        return updated;
      }

      // Create new entry
      const created = this.knowledgeBase.createEntry('metric_anomaly', {
        title: `${pattern.name} Anomaly`,
        description: pattern.description,
        severity: 'high',
        rootCause: pattern.indicatesIssue,
        solution: `Monitor ${pattern.metric} and take corrective action`,
        steps: [
          `1. Check ${pattern.metric} value against threshold (${pattern.threshold})`,
          `2. Review preceding metrics: ${pattern.precedingMetrics?.join(', ') || 'N/A'}`,
          `3. Correlate with recent changes`,
          `4. Apply remediation from runbook`,
        ],
        expectedOutcome: `${pattern.metric} returns to normal levels`,
        tags: [pattern.name.toLowerCase(), 'metric', 'anomaly'],
        occurrences: pattern.occurrences,
        provenance: {
          sourceType: 'metric-pattern',
          sourceModel: 'pattern-analyzer',
          derivedFrom: ['daily-consolidation', 'pattern-analyzer'],
          evidenceDate: date,
        },
      });
      await PersistenceIntegration.onKBEntryCreated(created);
      return created;
    } catch (error) {
      console.error(`[KnowledgeBase] Error creating entry from metric pattern:`, error);
      return null;
    }
  }

  /**
   * Auto-link related KB entries
   */
  private autoLinkKBEntries(): void {
    const stats = this.knowledgeBase.getStats();

    // Find related entries by tag
    Object.entries(stats.byTag).forEach(([tag, count]) => {
      if (count >= 2) {
        const related = this.knowledgeBase.findByTag(tag);
        // Entries with same tag are related
        for (let i = 0; i < related.length - 1; i++) {
          for (let j = i + 1; j < related.length; j++) {
            // Link would be done via KB internal linking
          }
        }
      }
    });
  }

  /**
   * Query knowledge base for specific issue
   */
  queryKnowledge(query: string): {
    entries: KBEntry[];
    concepts: any[];
    solutions: string[];
    meta: {
      matchedEntries: number;
      freshness: {
        status: 'empty' | 'fresh' | 'aging' | 'stale';
        staleAfterHours: number;
        latestEntryUpdatedAt: string | null;
        oldestEntryUpdatedAt: string | null;
        staleEntries: number;
        freshEntries: number;
        ageHours: number | null;
      };
      provenance: {
        totalEntries: number;
        unknownProvenanceCount: number;
        bySourceType: Record<string, number>;
        bySourceModel: Record<string, number>;
        derivedFrom: Record<string, number>;
      };
      contradictionSignals: Array<{
        id: string;
        title: string;
        severity: 'info' | 'warning';
        kinds: string[];
        message: string;
        entryIds: string[];
      }>;
      repairLoop: ReturnType<typeof buildRepairLoopSummary>;
      graphs: {
        provenance: ReturnType<typeof buildProvenanceGraph>;
        contradictions: ReturnType<typeof buildContradictionGraph>;
        freshness: ReturnType<typeof buildFreshnessGraph>;
      };
    };
  } {
    // Search KB entries
    const entries = this.knowledgeBase.search(query);

    // Search concepts
    const relatedConcepts = entries.flatMap(e => {
      // Find related KB concepts
      return [];
    });

    // Extract solutions from entries
    const solutions = entries
      .map(e => e.solution)
      .filter((s): s is string => s !== undefined && s.length > 0);

    return {
      entries,
      concepts: relatedConcepts,
      solutions,
      meta: {
        matchedEntries: entries.length,
        freshness: buildFreshnessSummary(entries),
        provenance: buildProvenanceSummary(entries),
        contradictionSignals: detectContradictions(entries),
        repairLoop: buildRepairLoopSummary(entries),
        graphs: {
          provenance: buildProvenanceGraph(entries),
          contradictions: buildContradictionGraph(entries),
          freshness: buildFreshnessGraph(entries),
        },
      },
    };
  }

  /**
   * Get KB summary
   */
  getSummary(): {
    lastUpdated: string;
    stats: any;
    networkStats: any;
    topIssues: KBEntry[];
    recentLearnings: KBEntry[];
    diagnostics: {
      freshness: {
        status: 'empty' | 'fresh' | 'aging' | 'stale';
        staleAfterHours: number;
        latestEntryUpdatedAt: string | null;
        oldestEntryUpdatedAt: string | null;
        staleEntries: number;
        freshEntries: number;
        ageHours: number | null;
      };
      provenance: {
        totalEntries: number;
        unknownProvenanceCount: number;
        bySourceType: Record<string, number>;
        bySourceModel: Record<string, number>;
        derivedFrom: Record<string, number>;
      };
      contradictionSignals: Array<{
        id: string;
        title: string;
        severity: 'info' | 'warning';
        kinds: string[];
        message: string;
        entryIds: string[];
      }>;
      repairLoop: ReturnType<typeof buildRepairLoopSummary>;
      graphs: {
        provenance: ReturnType<typeof buildProvenanceGraph>;
        contradictions: ReturnType<typeof buildContradictionGraph>;
        freshness: ReturnType<typeof buildFreshnessGraph>;
      };
    };
  } {
    const stats = this.knowledgeBase.getStats();
    const networkStats = this.conceptMapper.getNetworkStats();
    const entries = this.knowledgeBase.listEntries();

    return {
      lastUpdated: new Date().toISOString(),
      stats,
      networkStats,
      topIssues: stats.criticalEntries,
      recentLearnings: stats.recentUpdates,
      diagnostics: {
        freshness: buildFreshnessSummary(entries),
        provenance: buildProvenanceSummary(entries),
        contradictionSignals: detectContradictions(entries),
        repairLoop: buildRepairLoopSummary(entries),
        graphs: {
          provenance: buildProvenanceGraph(entries),
          contradictions: buildContradictionGraph(entries),
          freshness: buildFreshnessGraph(entries),
        },
      },
    };
  }

  /**
   * Export knowledge as markdown
   */
  exportAsMarkdown(): string {
    let markdown = '# Knowledge Base Export\n\n';
    markdown += `**Export Date:** ${new Date().toISOString()}\n\n`;

    const summary = this.getSummary();
    markdown += `## Summary\n\n`;
    markdown += `- Total KB Entries: ${summary.stats.total}\n`;
    markdown += `- Concept Network Nodes: ${summary.networkStats.totalConcepts}\n`;
    markdown += `- Network Connections: ${summary.networkStats.totalLinks}\n`;
    markdown += `- Avg Concept Connectivity: ${summary.networkStats.avgConnectivity.toFixed(2)}\n\n`;

    markdown += `## Top Issues (by Severity & Frequency)\n\n`;
    summary.topIssues.forEach(issue => {
      markdown += `### ${issue.title}\n`;
      markdown += `**Severity:** ${issue.severity} | **Occurrences:** ${issue.occurrences}\n\n`;
      markdown += `${issue.description}\n\n`;
      if (issue.solution) markdown += `**Solution:** ${issue.solution}\n\n`;
    });

    markdown += this.knowledgeBase.exportAsMarkdown();

    return markdown;
  }

  /**
   * Get concept graph for visualization
   */
  getConcceptGraph(): string {
    return this.conceptMapper.exportAsGraph();
  }
}

export const knowledgeOrchestrator = new KnowledgeOrchestrator();

function buildFreshnessSummary(
  entries: KBEntry[],
  staleAfterHours = 72,
  referenceTime = Date.now()
) {
  if (entries.length === 0) {
    return {
      status: 'empty' as const,
      staleAfterHours,
      latestEntryUpdatedAt: null,
      oldestEntryUpdatedAt: null,
      staleEntries: 0,
      freshEntries: 0,
      ageHours: null,
    };
  }

  const timestamps = entries
    .map(entry => entry.lastUpdated)
    .filter(value => Number.isFinite(value))
    .sort((left, right) => left - right);
  const latest = timestamps.at(-1) ?? null;
  const oldest = timestamps[0] ?? null;
  const staleCutoff = referenceTime - staleAfterHours * 60 * 60 * 1000;
  const staleEntries = entries.filter(entry => entry.lastUpdated < staleCutoff).length;
  const ageHours =
    latest !== null ? Number(((referenceTime - latest) / (60 * 60 * 1000)).toFixed(2)) : null;

  return {
    status:
      staleEntries === entries.length
        ? ('stale' as const)
        : staleEntries > 0
          ? ('aging' as const)
          : ('fresh' as const),
    staleAfterHours,
    latestEntryUpdatedAt: latest ? new Date(latest).toISOString() : null,
    oldestEntryUpdatedAt: oldest ? new Date(oldest).toISOString() : null,
    staleEntries,
    freshEntries: entries.length - staleEntries,
    ageHours,
  };
}

function buildProvenanceSummary(entries: KBEntry[]) {
  return entries.reduce(
    (summary, entry) => {
      const provenance = normalizeEntryProvenance(entry.provenance);
      summary.totalEntries += 1;
      summary.bySourceType[provenance.sourceType] =
        (summary.bySourceType[provenance.sourceType] || 0) + 1;
      summary.bySourceModel[provenance.sourceModel] =
        (summary.bySourceModel[provenance.sourceModel] || 0) + 1;

      if (provenance.sourceType === 'unknown' || provenance.sourceModel === 'unknown') {
        summary.unknownProvenanceCount += 1;
      }

      provenance.derivedFrom.forEach(item => {
        summary.derivedFrom[item] = (summary.derivedFrom[item] || 0) + 1;
      });

      return summary;
    },
    {
      totalEntries: 0,
      unknownProvenanceCount: 0,
      bySourceType: {} as Record<string, number>,
      bySourceModel: {} as Record<string, number>,
      derivedFrom: {} as Record<string, number>,
    }
  );
}

function buildProvenanceGraph(entries: KBEntry[]) {
  const nodes = new Map<string, {
    id: string;
    label: string;
    kind: 'source-type' | 'source-model' | 'derivation' | 'entry';
    count?: number;
    status?: 'known' | 'unknown';
  }>();
  const edges = new Map<string, { id: string; from: string; to: string; weight: number; label: string }>();

  const ensureNode = (
    id: string,
    label: string,
    kind: 'source-type' | 'source-model' | 'derivation' | 'entry',
    status?: 'known' | 'unknown'
  ) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label, kind, count: 0, status });
    }
    const node = nodes.get(id)!;
    node.count = Number(node.count ?? 0) + 1;
  };

  const incrementEdge = (from: string, to: string, label: string) => {
    const id = `edge:${from}:${to}`;
    if (!edges.has(id)) {
      edges.set(id, { id, from, to, label, weight: 0 });
    }
    edges.get(id)!.weight += 1;
  };

  for (const entry of entries) {
    const provenance = normalizeEntryProvenance(entry.provenance);
    const entryNodeId = `entry:${entry.id}`;
    const sourceTypeNodeId = `source-type:${provenance.sourceType}`;
    const sourceModelNodeId = `source-model:${provenance.sourceModel}`;

    ensureNode(entryNodeId, entry.title, 'entry');
    ensureNode(
      sourceTypeNodeId,
      provenance.sourceType,
      'source-type',
      provenance.sourceType === 'unknown' ? 'unknown' : 'known'
    );
    ensureNode(
      sourceModelNodeId,
      provenance.sourceModel,
      'source-model',
      provenance.sourceModel === 'unknown' ? 'unknown' : 'known'
    );

    incrementEdge(sourceTypeNodeId, entryNodeId, 'sourced-entry');
    incrementEdge(sourceModelNodeId, entryNodeId, 'modeled-entry');

    for (const derived of provenance.derivedFrom) {
      const derivedNodeId = `derived:${derived}`;
      ensureNode(derivedNodeId, derived, 'derivation');
      incrementEdge(derivedNodeId, entryNodeId, 'derived-entry');
    }
  }

  const unknownNodes = Array.from(nodes.values()).filter(node => node.status === 'unknown').length;

  return {
    generatedAt: new Date().toISOString(),
    totalNodes: nodes.size,
    totalEdges: edges.size,
    hotspots:
      unknownNodes > 0
        ? [`${unknownNodes} provenance node(s) still have unknown source identity.`]
        : [],
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
  };
}

function detectContradictions(entries: KBEntry[]) {
  const groups = new Map<string, KBEntry[]>();

  for (const entry of entries) {
    const key = normalizeKnowledgeText(entry.title);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const signals: Array<{
    id: string;
    title: string;
    severity: 'info' | 'warning';
    kinds: string[];
    message: string;
    entryIds: string[];
  }> = [];

  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue;

    const uniqueSolutions = uniqueKnowledgeValues(group.map(entry => entry.solution));
    const uniqueRootCauses = uniqueKnowledgeValues(group.map(entry => entry.rootCause));
    const uniqueSeverities = new Set(group.map(entry => entry.severity));
    const kinds: string[] = [];

    if (uniqueSolutions.size > 1) kinds.push('solution');
    if (uniqueRootCauses.size > 1) kinds.push('root-cause');
    if (uniqueSeverities.size > 1) kinds.push('severity');
    if (kinds.length === 0) continue;

    const title = group[0]?.title || key;
    signals.push({
      id: `contradiction:${key}`,
      title,
      severity:
        uniqueSolutions.size > 1 || uniqueRootCauses.size > 1 ? 'warning' : 'info',
      kinds,
      message: `${group.length} knowledge entries for "${title}" disagree on ${kinds.join(', ')}.`,
      entryIds: group.map(entry => entry.id),
    });
  }

  return signals.slice(0, 10);
}

function buildContradictionGraph(entries: KBEntry[]) {
  const contradictions = detectContradictions(entries);
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  const nodes: Array<{
    id: string;
    label: string;
    kind: 'contradiction' | 'entry';
    severity?: 'info' | 'warning';
  }> = [];
  const edges: Array<{
    id: string;
    from: string;
    to: string;
    kind: 'flags-entry';
  }> = [];

  for (const signal of contradictions) {
    const contradictionNodeId = `contradiction:${signal.id}`;
    nodes.push({
      id: contradictionNodeId,
      label: signal.title,
      kind: 'contradiction',
      severity: signal.severity,
    });
    for (const entryId of signal.entryIds) {
      const entry = entryById.get(entryId);
      if (!entry) continue;
      const entryNodeId = `entry:${entry.id}`;
      nodes.push({
        id: entryNodeId,
        label: entry.title,
        kind: 'entry',
      });
      edges.push({
        id: `edge:${contradictionNodeId}:${entryNodeId}`,
        from: contradictionNodeId,
        to: entryNodeId,
        kind: 'flags-entry',
      });
    }
  }

  const uniqueNodes = Array.from(
    new Map(nodes.map(node => [node.id, node])).values()
  );

  return {
    generatedAt: new Date().toISOString(),
    contradictionCount: contradictions.length,
    nodes: uniqueNodes,
    edges,
    hotspots: contradictions.map(signal => signal.message).slice(0, 10),
  };
}

function buildFreshnessGraph(entries: KBEntry[], staleAfterHours = 72) {
  const freshness = buildFreshnessSummary(entries, staleAfterHours);
  const now = Date.now();
  const agingCutoff = now - (staleAfterHours / 2) * 60 * 60 * 1000;
  const staleCutoff = now - staleAfterHours * 60 * 60 * 1000;

  const bands = {
    fresh: 0,
    aging: 0,
    stale: 0,
    unknown: 0,
  };
  const entryNodes: Array<{
    id: string;
    label: string;
    kind: 'entry';
    band: keyof typeof bands;
    ageHours: number | null;
  }> = [];

  for (const entry of entries) {
    const lastUpdated = Number(entry.lastUpdated);
    let band: keyof typeof bands = 'unknown';
    let ageHours: number | null = null;
    if (Number.isFinite(lastUpdated)) {
      ageHours = Number(((now - lastUpdated) / (60 * 60 * 1000)).toFixed(2));
      if (lastUpdated < staleCutoff) {
        band = 'stale';
      } else if (lastUpdated < agingCutoff) {
        band = 'aging';
      } else {
        band = 'fresh';
      }
    }
    bands[band] += 1;
    entryNodes.push({
      id: `entry:${entry.id}`,
      label: entry.title,
      kind: 'entry',
      band,
      ageHours,
    });
  }

  const bandNodes = (Object.keys(bands) as Array<keyof typeof bands>).map(band => ({
    id: `freshness-band:${band}`,
    label: band,
    kind: 'band' as const,
    count: bands[band],
  }));
  const bandEdges = entryNodes.map(node => ({
    id: `edge:freshness-band:${node.band}:${node.id}`,
    from: `freshness-band:${node.band}`,
    to: node.id,
    kind: 'contains-entry' as const,
  }));

  const weightedScore =
    entries.length === 0
      ? 0
      : Number(
          (
            ((bands.fresh * 1 + bands.aging * 0.5 + bands.stale * 0.1) /
              entries.length) *
            100
          ).toFixed(2)
        );

  return {
    generatedAt: new Date().toISOString(),
    score: weightedScore,
    status: freshness.status,
    bands,
    nodes: [...bandNodes, ...entryNodes],
    edges: bandEdges,
    hotspots:
      bands.stale > 0
        ? [`${bands.stale} knowledge entr${bands.stale === 1 ? 'y is' : 'ies are'} stale.`]
        : bands.aging > 0
          ? [`${bands.aging} knowledge entr${bands.aging === 1 ? 'y is' : 'ies are'} aging.`]
          : [],
  };
}

function buildRepairLoopSummary(entries: KBEntry[]) {
  const freshness = buildFreshnessSummary(entries);
  const contradictions = detectContradictions(entries);
  const provenance = buildProvenanceSummary(entries);
  const contradictionEntryIds = Array.from(
    new Set(contradictions.flatMap(signal => signal.entryIds))
  );
  const focusAreas: string[] = [];
  const nextActions: string[] = [];

  if (contradictions.length > 0) {
    focusAreas.push("Resolve contradictory knowledge entries before reuse.");
    nextActions.push(
      `Run drift-repair or doc-specialist review for ${contradictionEntryIds.length} contradictory knowledge entr${contradictionEntryIds.length === 1 ? 'y' : 'ies'}.`
    );
  }
  if (freshness.status === 'stale' || freshness.status === 'aging') {
    focusAreas.push("Refresh stale or aging knowledge entries from current repo/runtime truth.");
    nextActions.push("Refresh knowledge from current docs, config, runtime state, and public proof.");
  }
  if (provenance.unknownProvenanceCount > 0) {
    focusAreas.push("Backfill provenance for entries with unknown source identity.");
    nextActions.push(
      `Normalize provenance for ${provenance.unknownProvenanceCount} entr${provenance.unknownProvenanceCount === 1 ? 'y' : 'ies'} before downstream agents rely on them.`
    );
  }

  const status =
    contradictions.length > 0 ||
    freshness.status === 'stale' ||
    provenance.unknownProvenanceCount > Math.max(5, Math.floor(entries.length / 5))
      ? ('repair-needed' as const)
      : freshness.status === 'aging' || provenance.unknownProvenanceCount > 0
        ? ('watching' as const)
        : ('clear' as const);

  return {
    status,
    recommendedTaskType:
      contradictions.length > 0 || freshness.status !== 'fresh'
        ? ('drift-repair' as const)
        : ('qa-verification' as const),
    contradictionCount: contradictions.length,
    contradictionEntryIds,
    unknownProvenanceCount: provenance.unknownProvenanceCount,
    freshnessStatus: freshness.status,
    focusAreas,
    nextActions:
      nextActions.length > 0
        ? nextActions
        : ["Knowledge diagnostics are currently stable; continue passive monitoring."],
  };
}

function normalizeEntryProvenance(
  provenance?: KBEntryProvenance
): KBEntryProvenance {
  return {
    sourceType: provenance?.sourceType || 'unknown',
    sourceModel: provenance?.sourceModel || 'unknown',
    derivedFrom: Array.isArray(provenance?.derivedFrom) ? provenance.derivedFrom : [],
    evidenceDate: provenance?.evidenceDate,
  };
}

function normalizeKnowledgeText(value?: string) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniqueKnowledgeValues(values: Array<string | undefined>) {
  return new Set(values.map(value => normalizeKnowledgeText(value)).filter(Boolean));
}
