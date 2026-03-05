/**
 * Persistence Integration Layer
 * Phase 6: Metrics Persistence Layer
 *
 * Integrates MongoDB persistence with existing Phase 4 & 5 systems
 */

import { MongoConnection } from './mongo-connection.js';
import { DataPersistence } from './data-persistence.js';
import { SnapshotDocument, ConsolidationDocument, COLLECTIONS } from './schemas.js';
import type { OrchestratorState } from '../types.js';

export class PersistenceIntegration {
  private static initialized = false;

  /**
   * Initialize persistence layer on startup
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('[Persistence] 🔗 Initializing...');

      // Connect to MongoDB
      await MongoConnection.connect();

      // Verify connection
      const isHealthy = await MongoConnection.healthCheck();
      if (!isHealthy) {
        throw new Error('MongoDB health check failed');
      }

      this.initialized = true;
      console.log('[Persistence] ✅ Initialized successfully');
    } catch (error) {
      console.error('[Persistence] ❌ Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Save hourly snapshot to MongoDB
   * Called by Phase 4 (SnapshotService)
   */
  static async onSnapshotCreated(snapshot: any): Promise<void> {
    try {
      if (!this.initialized) return;

      const doc: SnapshotDocument = {
        snapshotDate: snapshot.date || new Date().toISOString().split('T')[0],
        timestamp: new Date(),
        metrics: {
          activeMetrics: snapshot.metrics?.count || 0,
          anomalies: snapshot.metrics?.anomalies || 0,
          p50Latency: snapshot.latency?.p50 || 0,
          p95Latency: snapshot.latency?.p95 || 0,
          p99Latency: snapshot.latency?.p99 || 0,
        },
        alerts: {
          total: snapshot.alerts?.total || 0,
          active: snapshot.alerts?.active || 0,
          resolved: snapshot.alerts?.resolved || 0,
          bySeverity: snapshot.alerts?.bySeverity || {},
        },
        health: {
          orchestratorUp: true,
          prometheusUp: snapshot.health?.prometheus || false,
          mongoUp: snapshot.health?.mongo || false,
          redisUp: snapshot.health?.redis || false,
        },
        cost: snapshot.cost,
      };

      await DataPersistence.saveSnapshot(doc);
      console.log('[Persistence] 📊 Snapshot saved for', doc.snapshotDate);
    } catch (error) {
      console.error('[Persistence] ❌ Failed to save snapshot:', error);
    }
  }

  /**
   * Save consolidation to MongoDB
   * Called by Phase 4 (ConsolidationEngine)
   */
  static async onConsolidationCreated(consolidation: any): Promise<void> {
    try {
      if (!this.initialized) return;

      const doc: ConsolidationDocument = {
        date: consolidation.date,
        timestamp: new Date(),
        snapshots: consolidation.snapshots || { count: 0, timeRange: {} },
        alerts: consolidation.alerts || {},
        metrics: consolidation.metrics || {},
        summary: consolidation.summary || '',
        insights: consolidation.insights || [],
        recommendations: consolidation.recommendations || [],
        kbEntriesGenerated: consolidation.kbEntriesGenerated || 0,
      };

      await DataPersistence.saveConsolidation(doc);
      console.log('[Persistence] 📈 Consolidation saved for', doc.date);
    } catch (error) {
      console.error('[Persistence] ❌ Failed to save consolidation:', error);
    }
  }

  /**
   * Save KB entry to MongoDB
   * Called by Phase 5 (KnowledgeOrchestrator)
   */
  static async onKBEntryCreated(entry: any): Promise<void> {
    try {
      if (!this.initialized) return;

      await DataPersistence.saveKBEntry({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        category: entry.category,
        severity: entry.severity,
        rootCause: entry.rootCause,
        solution: entry.solution,
        prerequisites: entry.prerequisites,
        steps: entry.steps,
        expectedOutcome: entry.expectedOutcome,
        tags: entry.tags,
        relatedEntries: entry.relatedEntries,
        relatedConcepts: entry.relatedConcepts,
        occurrences: entry.occurrences || 1,
        successRate: entry.successRate,
        firstSeen: entry.firstSeen ? new Date(entry.firstSeen) : new Date(),
        lastSeen: entry.lastUpdated ? new Date(entry.lastUpdated) : new Date(),
        createdAt: entry.firstSeen ? new Date(entry.firstSeen) : new Date(),
        updatedAt: new Date(),
      });

      console.log('[Persistence] 🧠 KB entry saved:', entry.id);
    } catch (error) {
      console.error('[Persistence] ❌ Failed to save KB entry:', error);
    }
  }

  /**
   * Load KB entries from MongoDB for startup hydration
   */
  static async loadKBEntries(): Promise<any[]> {
    try {
      if (!this.initialized) return [];

      const docs = await DataPersistence.getAllKBEntries();

      const entries = docs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        severity: doc.severity,
        description: doc.description || '',
        rootCause: doc.rootCause,
        solution: doc.solution,
        prerequisites: doc.prerequisites || [],
        steps: doc.steps || [],
        expectedOutcome: doc.expectedOutcome || '',
        tags: doc.tags || [],
        relatedEntries: doc.relatedEntries || [],
        firstSeen: doc.firstSeen ? new Date(doc.firstSeen).getTime() : Date.now(),
        lastUpdated: doc.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now(),
        occurrences: doc.occurrences || 1,
        successRate: doc.successRate,
      }));

      console.log('[Persistence] 🧠 Loaded KB entries from MongoDB:', entries.length);
      return entries;
    } catch (error) {
      console.error('[Persistence] ❌ Failed to load KB entries:', error);
      return [];
    }
  }

  /**
   * Get historical data for reporting
   */
  static async getHistoricalData(days: number = 30): Promise<any> {
    try {
      if (!this.initialized) return null;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const endDate = new Date();

      const [metrics, alerts, kb, consolidations] = await Promise.all([
        DataPersistence.getMetrics(undefined, startDate, endDate, 5000),
        DataPersistence.getAlerts(undefined, undefined, 1000),
        DataPersistence.getKBStats(),
        DataPersistence.getConsolidations(days),
      ]);

      const alertsBySeverity = alerts.reduce<Record<string, number>>((acc, alert: any) => {
        const severity = typeof alert.severity === 'string' ? alert.severity : 'unknown';
        acc[severity] = (acc[severity] || 0) + 1;
        return acc;
      }, {});

      const metricsByName = metrics.reduce<Record<string, number>>((acc, metric: any) => {
        const name = typeof metric.name === 'string' ? metric.name : 'unknown';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {});

      return {
        period: { startDate, endDate, days },
        metricsCount: metrics.length,
        alertsCount: alerts.length,
        alertsBySeverity,
        metricsByName,
        knowledgeBase: kb,
        consolidations: consolidations.length,
      };
    } catch (error) {
      console.error('[Persistence] ❌ Failed to retrieve historical data:', error);
      return null;
    }
  }

  /**
   * Export all data for backup
   */
  static async exportAllData(): Promise<any> {
    try {
      if (!this.initialized) return null;

      const stats = await DataPersistence.getCollectionStats();
      const dbSize = await DataPersistence.getDatabaseSize();

      return {
        exportDate: new Date().toISOString(),
        collections: stats,
        databaseSizeBytes: dbSize,
        databaseSizeMB: (dbSize / 1024 / 1024).toFixed(2),
      };
    } catch (error) {
      console.error('[Persistence] ❌ Failed to export data:', error);
      return null;
    }
  }

  static async getOperatorSummary(state: Pick<OrchestratorState, 'taskExecutions' | 'taskHistory' | 'taskRetryRecoveries'>): Promise<any> {
    if (!this.initialized) {
      return {
        generatedAt: new Date().toISOString(),
        status: 'degraded',
        persistenceAvailable: false,
        storage: null,
        collections: {},
        retention: {
          taskExecutions: state.taskExecutions.length,
          taskHistory: state.taskHistory.length,
          taskRetryRecoveries: state.taskRetryRecoveries.length,
        },
      };
    }

    const [health, stats, dbSize, alerts7d, consolidations7d] = await Promise.all([
      this.healthCheck(),
      DataPersistence.getCollectionStats(),
      DataPersistence.getDatabaseSize(),
      DataPersistence.getAlerts(undefined, undefined, 500),
      DataPersistence.getConsolidations(7),
    ]);

    const firingAlerts = alerts7d.filter((alert: any) => alert.status === 'firing').length;

    return {
      generatedAt: new Date().toISOString(),
      status: health.status,
      persistenceAvailable: health.database,
      storage: {
        databaseSizeBytes: dbSize,
        databaseSizeMB: Number((dbSize / 1024 / 1024).toFixed(2)),
      },
      collections: stats,
      indicators: {
        alertRecordsLastWindow: alerts7d.length,
        activeAlertRecords: firingAlerts,
        consolidationsLast7Days: consolidations7d.length,
      },
      retention: {
        taskExecutions: state.taskExecutions.length,
        taskHistory: state.taskHistory.length,
        taskRetryRecoveries: state.taskRetryRecoveries.length,
      },
    };
  }

  /**
   * Health check endpoint
   */
  static async healthCheck(): Promise<{
    status: string;
    database: boolean;
    collections: number;
  }> {
    try {
      const dbHealthy = await MongoConnection.healthCheck();
      const stats = await DataPersistence.getCollectionStats();
      const collCount = Object.keys(stats).length;

      return {
        status: dbHealthy ? 'healthy' : 'degraded',
        database: dbHealthy,
        collections: collCount,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        database: false,
        collections: 0,
      };
    }
  }

  /**
   * Cleanup old data based on retention policies
   */
  static async cleanupOldData(): Promise<void> {
    try {
      if (!this.initialized) return;

      console.log('[Persistence] 🧹 Cleaning old data...');

      // Remove metrics older than 90 days
      const metricsDeleted = await DataPersistence.deleteOldMetrics(90);
      console.log('[Persistence] Deleted', metricsDeleted, 'old metric records');
    } catch (error) {
      console.error('[Persistence] ❌ Cleanup failed:', error);
    }
  }

  /**
   * Close persistence resources
   */
  static async close(): Promise<void> {
    try {
      await MongoConnection.disconnect();
      this.initialized = false;
      console.log('[Persistence] ✅ Closed successfully');
    } catch (error) {
      console.error('[Persistence] ❌ Close failed:', error);
      throw error;
    }
  }
}

export default PersistenceIntegration;
