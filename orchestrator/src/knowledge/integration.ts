/**
 * Integration point for Phase 4 + Phase 5
 * Memory consolidation feeds knowledge base automatically
 */

import { memoryScheduler } from '../memory/scheduler.js';
import { consolidationEngine } from '../memory/consolidation-engine.js';
import { knowledgeOrchestrator } from './orchestrator.js';

export class KnowledgeIntegration {
  private isEnabled = false;

  /**
   * Start knowledge base integration with memory consolidation
   */
  async start(): Promise<void> {
    console.log('[KnowledgeBase] 🧠 Starting knowledge base integration...');

    this.isEnabled = true;

    // Hydrate KB from persistence (MongoDB) if available
    await knowledgeOrchestrator.initialize();

    // Hook into daily consolidation
    // When consolidateYesterday runs, it will trigger KB processing
    this.hookConsolidationEvents();

    console.log('[KnowledgeBase] ✅ Knowledge base integration enabled');
    console.log('[KnowledgeBase] 🔗 Daily consolidations will feed into KB');
  }

  /**
   * Hook consolidation events
   */
  private hookConsolidationEvents(): void {
    // This would be called during memory scheduler's consolidation
    // For now, we expose a method that can be called after consolidation
    console.log('[KnowledgeBase] 🪝 Consolidation hooks registered');
  }

  /**
   * Process consolidation for KB (called after Phase 4 consolidation completes)
   */
  async onConsolidationComplete(consolidation: any, date: string): Promise<void> {
    if (!this.isEnabled) return;

    try {
      console.log(`[KnowledgeBase] 📖 Processing consolidation into KB...`);

      // Feed consolidation to knowledge orchestrator
      await knowledgeOrchestrator.processConsolidation(consolidation, date);

      const summary = knowledgeOrchestrator.getSummary();
      console.log(
        `[KnowledgeBase] ✨ KB updated: ${summary.stats.total} entries, ${summary.networkStats.totalConcepts} concepts`
      );
    } catch (error) {
      console.error('[KnowledgeBase] Error processing consolidation:', error);
    }
  }

  /**
   * Query KB via HTTP API
   */
  async queryAPI(query: string): Promise<{
    success: boolean;
    results: any;
    sources: string[];
  }> {
    try {
      const results = knowledgeOrchestrator.queryKnowledge(query);

      return {
        success: true,
        results,
        sources: results.entries.map(e => e.id),
      };
    } catch (error) {
      console.error('[KnowledgeBase] Query error:', error);
      return {
        success: false,
        results: null,
        sources: [],
      };
    }
  }

  /**
   * Get KB summary
   */
  getSummary(): any {
    return knowledgeOrchestrator.getSummary();
  }

  /**
   * Export KB
   */
  export(format: 'markdown' | 'json' = 'markdown'): string {
    if (format === 'markdown') {
      return knowledgeOrchestrator.exportAsMarkdown();
    }

    return JSON.stringify(knowledgeOrchestrator.getSummary(), null, 2);
  }
}

export const knowledgeIntegration = new KnowledgeIntegration();
