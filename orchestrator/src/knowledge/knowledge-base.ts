/**
 * Knowledge Base Engine - Manages KB entries and persistence
 * Stores patterns, solutions, and learnings from daily consolidations
 */

import fs from 'fs';
import path from 'path';

export interface KBEntry {
  id: string;
  title: string;
  category: 'alert_pattern' | 'metric_anomaly' | 'optimization' | 'troubleshooting' | 'runbook';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  rootCause?: string;
  solution: string;
  prerequisites?: string[];
  steps: string[];
  expectedOutcome: string;
  tags: string[];
  relatedEntries: string[];
  firstSeen: number;
  lastUpdated: number;
  occurrences: number;
  successRate?: number; // 0-1
}

export interface KBIndex {
  totalEntries: number;
  categories: Record<string, number>;
  tags: Record<string, string[]>;
  lastUpdated: number;
}

export class KnowledgeBaseEngine {
  private kbPath = './data/knowledge-base';
  private entries: Map<string, KBEntry> = new Map();
  private index: KBIndex = {
    totalEntries: 0,
    categories: {},
    tags: {},
    lastUpdated: 0,
  };

  constructor() {
    this.ensureDirectories();
    this.loadIndex();
  }

  /**
   * Hydrate in-memory KB from persisted entries (MongoDB)
   */
  hydrateFromPersistence(entries: KBEntry[]): void {
    this.entries.clear();
    this.index = {
      totalEntries: 0,
      categories: {},
      tags: {},
      lastUpdated: Date.now(),
    };

    for (const entry of entries) {
      this.entries.set(entry.id, entry);
      this.updateIndex(entry);
    }

    this.saveIndex();
  }

  /**
   * Ensure KB directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      this.kbPath,
      path.join(this.kbPath, 'entries'),
      path.join(this.kbPath, 'runbooks'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Create KB entry from pattern
   */
  createEntry(
    category: KBEntry['category'],
    data: Partial<KBEntry>
  ): KBEntry {
    const id = this.generateId();
    const now = Date.now();

    const entry: KBEntry = {
      id,
      title: data.title || 'Untitled',
      category,
      severity: data.severity || 'medium',
      description: data.description || '',
      rootCause: data.rootCause,
      solution: data.solution || '',
      prerequisites: data.prerequisites || [],
      steps: data.steps || [],
      expectedOutcome: data.expectedOutcome || '',
      tags: data.tags || [],
      relatedEntries: data.relatedEntries || [],
      firstSeen: data.firstSeen || now,
      lastUpdated: now,
      occurrences: data.occurrences || 1,
      successRate: data.successRate,
    };

    this.entries.set(id, entry);
    this.updateIndex(entry);
    this.saveEntry(entry);

    return entry;
  }

  /**
   * Update KB entry
   */
  updateEntry(id: string, updates: Partial<KBEntry>): KBEntry | null {
    const entry = this.entries.get(id);
    if (!entry) return null;

    // Update fields
    Object.assign(entry, {
      ...updates,
      lastUpdated: Date.now(),
      occurrences: (entry.occurrences || 0) + 1,
    });

    this.updateIndex(entry);
    this.saveEntry(entry);

    return entry;
  }

  /**
   * Find entries by tag
   */
  findByTag(tag: string): KBEntry[] {
    const entryIds = this.index.tags[tag] || [];
    return entryIds
      .map(id => this.entries.get(id))
      .filter((e): e is KBEntry => e !== undefined);
  }

  /**
   * Find entries by category
   */
  findByCategory(category: KBEntry['category']): KBEntry[] {
    return Array.from(this.entries.values()).filter(e => e.category === category);
  }

  /**
   * Search entries
   */
  search(query: string): KBEntry[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.entries.values()).filter(
      entry =>
        entry.title.toLowerCase().includes(lowerQuery) ||
        entry.description.toLowerCase().includes(lowerQuery) ||
        entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get similar entries (for linking)
   */
  getSimilar(entry: KBEntry, limit = 5): KBEntry[] {
    const scored = Array.from(this.entries.values())
      .filter(e => e.id !== entry.id)
      .map(e => ({
        entry: e,
        score: this.calculateSimilarity(entry, e),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(s => s.entry);
  }

  /**
   * Calculate similarity between two entries
   */
  private calculateSimilarity(entry1: KBEntry, entry2: KBEntry): number {
    let score = 0;

    // Category match: +2
    if (entry1.category === entry2.category) score += 2;

    // Tag overlap: +1 per match
    const commonTags = entry1.tags.filter(tag => entry2.tags.includes(tag)).length;
    score += commonTags;

    // Severity match: +1
    if (entry1.severity === entry2.severity) score += 1;

    // String similarity in title/description
    if (entry1.title === entry2.title) score += 3;
    if (
      entry1.description.toLowerCase().includes(entry2.title.toLowerCase()) ||
      entry2.description.toLowerCase().includes(entry1.title.toLowerCase())
    ) {
      score += 1;
    }

    return score;
  }

  /**
   * Get KB statistics
   */
  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    byTag: Record<string, number>;
    recentUpdates: KBEntry[];
    criticalEntries: KBEntry[];
  } {
    const stats = {
      total: this.entries.size,
      byCategory: {} as Record<string, number>,
      byTag: {} as Record<string, number>,
      recentUpdates: [] as KBEntry[],
      criticalEntries: [] as KBEntry[],
    };

    // Count by category
    Array.from(this.entries.values()).forEach(entry => {
      stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;

      // Count by tag
      entry.tags.forEach(tag => {
        stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
      });
    });

    // Recent updates (last 5)
    stats.recentUpdates = Array.from(this.entries.values())
      .sort((a, b) => b.lastUpdated - a.lastUpdated)
      .slice(0, 5);

    // Critical entries
    stats.criticalEntries = Array.from(this.entries.values())
      .filter(e => e.severity === 'critical')
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 5);

    return stats;
  }

  /**
   * Update index
   */
  private updateIndex(entry: KBEntry): void {
    // Update category count
    if (!this.index.categories[entry.category]) {
      this.index.categories[entry.category] = 0;
    }
    this.index.categories[entry.category]++;

    // Update tags
    entry.tags.forEach(tag => {
      if (!this.index.tags[tag]) {
        this.index.tags[tag] = [];
      }
      if (!this.index.tags[tag].includes(entry.id)) {
        this.index.tags[tag].push(entry.id);
      }
    });

    this.index.lastUpdated = Date.now();
    this.index.totalEntries = this.entries.size;
    this.saveIndex();
  }

  /**
   * Save entry to disk
   */
  private saveEntry(entry: KBEntry): void {
    const filePath = path.join(this.kbPath, 'entries', `${entry.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  }

  /**
   * Save index to disk
   */
  private saveIndex(): void {
    const indexPath = path.join(this.kbPath, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(this.index, null, 2));
  }

  /**
   * Load index from disk
   */
  private loadIndex(): void {
    const indexPath = path.join(this.kbPath, 'index.json');
    if (fs.existsSync(indexPath)) {
      try {
        this.index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      } catch (error) {
        console.error('[KnowledgeBase] Failed to load index:', error);
      }
    }
  }

  /**
   * Export KB as markdown
   */
  exportAsMarkdown(): string {
    const byCategory = this.findByCategory('runbook')
      .concat(this.findByCategory('troubleshooting'))
      .concat(this.findByCategory('optimization'));

    let markdown = '# Knowledge Base\n\n';
    markdown += `**Generated:** ${new Date().toISOString()}\n\n`;
    markdown += `**Total Entries:** ${this.entries.size}\n\n`;

    byCategory
      .slice(0, 20)
      .forEach(entry => {
        markdown += `## ${entry.title}\n\n`;
        markdown += `**Severity:** ${entry.severity} | **Category:** ${entry.category}\n\n`;

        if (entry.description) {
          markdown += `${entry.description}\n\n`;
        }

        if (entry.rootCause) {
          markdown += `**Root Cause:** ${entry.rootCause}\n\n`;
        }

        if (entry.prerequisites && entry.prerequisites.length > 0) {
          markdown += `**Prerequisites:** ${entry.prerequisites.join(', ')}\n\n`;
        }

        if (entry.steps && entry.steps.length > 0) {
          markdown += `**Steps:**\n`;
          entry.steps.forEach((step, i) => {
            markdown += `${i + 1}. ${step}\n`;
          });
          markdown += '\n';
        }

        markdown += `**Expected Outcome:** ${entry.expectedOutcome}\n\n`;
        markdown += `**Tags:** ${entry.tags.join(', ')}\n\n`;
        markdown += '---\n\n';
      });

    return markdown;
  }

  /**
   * Generate ID
   */
  private generateId(): string {
    return `kb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const knowledgeBase = new KnowledgeBaseEngine();
