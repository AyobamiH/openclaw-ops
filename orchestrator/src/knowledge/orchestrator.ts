/**
 * Knowledge Orchestrator - Main KB coordinator
 * Integrates pattern analysis, concept mapping, and persistent learning
 * Feeds on Phase 4 daily consolidation insights
 */

import { PatternAnalyzer, AlertPattern, MetricPattern } from './pattern-analyzer.js';
import { KnowledgeBaseEngine, KBEntry } from './knowledge-base.js';
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

    return { entries, concepts: relatedConcepts, solutions };
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
  } {
    const stats = this.knowledgeBase.getStats();
    const networkStats = this.conceptMapper.getNetworkStats();

    return {
      lastUpdated: new Date().toISOString(),
      stats,
      networkStats,
      topIssues: stats.criticalEntries,
      recentLearnings: stats.recentUpdates,
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
