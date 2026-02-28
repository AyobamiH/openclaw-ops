/**
 * Data Persistence Layer
 * Phase 6: Metrics Persistence Layer
 *
 * CRUD operations for all persistent data types
 */

import { MongoConnection } from './mongo-connection.js';
import {
  MetricDocument,
  AlertDocument,
  KBDocument,
  ConsolidationDocument,
  SnapshotDocument,
  SystemStateDocument,
  AuditLogDocument,
  ConceptDocument,
  ConceptLinkDocument,
  COLLECTIONS,
} from './schemas.js';
import { Collection } from 'mongodb';

export class DataPersistence {
  // =========================================================================
  // METRICS
  // =========================================================================

  static async saveMetric(metric: MetricDocument): Promise<string> {
    const col = MongoConnection.getCollection<MetricDocument>(COLLECTIONS.METRICS);
    const result = await col.insertOne({
      ...metric,
      timestamp: new Date(metric.timestamp),
    });
    return result.insertedId.toString();
  }

  static async saveMetrics(metrics: MetricDocument[]): Promise<number> {
    if (metrics.length === 0) return 0;
    const col = MongoConnection.getCollection<MetricDocument>(COLLECTIONS.METRICS);
    const result = await col.insertMany(
      metrics.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }))
    );
    return result.insertedCount;
  }

  static async getMetrics(
    name?: string,
    startTime?: Date,
    endTime?: Date,
    limit: number = 100
  ): Promise<MetricDocument[]> {
    const col = MongoConnection.getCollection<MetricDocument>(COLLECTIONS.METRICS);
    const query: any = {};
    if (name) query.name = name;
    if (startTime || endTime) {
      query.timestamp = {};
      if (startTime) query.timestamp.$gte = startTime;
      if (endTime) query.timestamp.$lte = endTime;
    }
    return col.find(query).sort({ timestamp: -1 }).limit(limit).toArray();
  }

  static async deleteOldMetrics(olderThanDays: number = 30): Promise<number> {
    const col = MongoConnection.getCollection<MetricDocument>(COLLECTIONS.METRICS);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const result = await col.deleteMany({ timestamp: { $lt: cutoff } });
    return result.deletedCount || 0;
  }

  // =========================================================================
  // ALERTS
  // =========================================================================

  static async saveAlert(alert: AlertDocument): Promise<string> {
    const col = MongoConnection.getCollection<AlertDocument>(COLLECTIONS.ALERTS);
    const result = await col.insertOne({
      ...alert,
      timestamp: new Date(alert.timestamp),
    });
    return result.insertedId.toString();
  }

  static async saveAlerts(alerts: AlertDocument[]): Promise<number> {
    if (alerts.length === 0) return 0;
    const col = MongoConnection.getCollection<AlertDocument>(COLLECTIONS.ALERTS);
    const result = await col.insertMany(
      alerts.map((a) => ({
        ...a,
        timestamp: new Date(a.timestamp),
      }))
    );
    return result.insertedCount;
  }

  static async getAlerts(
    severity?: string,
    status?: string,
    limit: number = 100
  ): Promise<AlertDocument[]> {
    const col = MongoConnection.getCollection<AlertDocument>(COLLECTIONS.ALERTS);
    const query: any = {};
    if (severity) query.severity = severity;
    if (status) query.status = status;
    return col.find(query).sort({ timestamp: -1 }).limit(limit).toArray();
  }

  static async resolveAlert(fingerprint: string): Promise<boolean> {
    const col = MongoConnection.getCollection<AlertDocument>(COLLECTIONS.ALERTS);
    const result = await col.updateMany(
      { fingerprint, status: 'firing' },
      { $set: { status: 'resolved', resolvedAt: new Date() } }
    );
    return (result.modifiedCount || 0) > 0;
  }

  static async alertStats(days: number = 7): Promise<any> {
    const col = MongoConnection.getCollection<AlertDocument>(COLLECTIONS.ALERTS);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await col.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 },
        },
      },
    ]).toArray();

    return Object.fromEntries(stats.map((s: any) => [s._id, s.count]));
  }

  // =========================================================================
  // KNOWLEDGE BASE
  // =========================================================================

  static async saveKBEntry(entry: KBDocument): Promise<string> {
    const col = MongoConnection.getCollection<KBDocument>(COLLECTIONS.KNOWLEDGE_BASE);
    const now = new Date();
    const result = await col.updateOne(
      { id: entry.id },
      {
        $set: {
          ...entry,
          lastSeen: entry.lastSeen ? new Date(entry.lastSeen) : now,
          firstSeen: entry.firstSeen ? new Date(entry.firstSeen) : now,
          createdAt: entry.createdAt ? new Date(entry.createdAt) : now,
          updatedAt: entry.updatedAt ? new Date(entry.updatedAt) : now,
        },
        $setOnInsert: {
          id: entry.id,
          createdAt: entry.createdAt ? new Date(entry.createdAt) : now,
        },
      },
      { upsert: true }
    );

    return (
      result.upsertedId?.toString() ||
      entry.id
    );
  }

  static async updateKBEntry(id: string, updates: Partial<KBDocument>): Promise<boolean> {
    const col = MongoConnection.getCollection<KBDocument>(COLLECTIONS.KNOWLEDGE_BASE);
    const result = await col.updateOne(
      { id },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );
    return (result.modifiedCount || 0) > 0;
  }

  static async searchKB(query: string, limit: number = 20): Promise<KBDocument[]> {
    const col = MongoConnection.getCollection<KBDocument>(COLLECTIONS.KNOWLEDGE_BASE);
    return (col as any)
      .find({ $text: { $search: query } })
      .limit(limit)
      .toArray();
  }

  static async getKBByCategory(category: string, limit: number = 50): Promise<KBDocument[]> {
    const col = MongoConnection.getCollection<KBDocument>(COLLECTIONS.KNOWLEDGE_BASE);
    return col.find({ category }).sort({ frequency: -1 }).limit(limit).toArray();
  }

  static async getKBStats(): Promise<any> {
    const col = MongoConnection.getCollection<KBDocument>(COLLECTIONS.KNOWLEDGE_BASE);
    return {
      total: await col.countDocuments(),
      byCategory: await col
        .aggregate([
          { $group: { _id: '$category', count: { $sum: 1 } } },
        ])
        .toArray(),
      bySeverity: await col
        .aggregate([
          { $group: { _id: '$severity', count: { $sum: 1 } } },
        ])
        .toArray(),
    };
  }

  static async getAllKBEntries(limit: number = 5000): Promise<KBDocument[]> {
    const col = MongoConnection.getCollection<KBDocument>(COLLECTIONS.KNOWLEDGE_BASE);
    return col.find({}).sort({ updatedAt: -1 }).limit(limit).toArray();
  }

  // =========================================================================
  // CONSOLIDATIONS
  // =========================================================================

  static async saveConsolidation(consolidation: ConsolidationDocument): Promise<string> {
    const col = MongoConnection.getCollection<ConsolidationDocument>(
      COLLECTIONS.CONSOLIDATIONS
    );
    const result = await col.insertOne({
      ...consolidation,
      timestamp: new Date(consolidation.timestamp),
    });
    return result.insertedId.toString();
  }

  static async getConsolidation(date: string): Promise<ConsolidationDocument | null> {
    const col = MongoConnection.getCollection<ConsolidationDocument>(
      COLLECTIONS.CONSOLIDATIONS
    );
    return col.findOne({ date });
  }

  static async getConsolidations(limit: number = 30): Promise<ConsolidationDocument[]> {
    const col = MongoConnection.getCollection<ConsolidationDocument>(
      COLLECTIONS.CONSOLIDATIONS
    );
    return col.find({}).sort({ date: -1 }).limit(limit).toArray();
  }

  // =========================================================================
  // SNAPSHOTS
  // =========================================================================

  static async saveSnapshot(snapshot: SnapshotDocument): Promise<string> {
    const col = MongoConnection.getCollection<SnapshotDocument>(COLLECTIONS.SNAPSHOTS);
    const result = await col.insertOne({
      ...snapshot,
      timestamp: new Date(snapshot.timestamp),
    });
    return result.insertedId.toString();
  }

  static async getSnapshotsForDate(date: string, limit: number = 100): Promise<SnapshotDocument[]> {
    const col = MongoConnection.getCollection<SnapshotDocument>(COLLECTIONS.SNAPSHOTS);
    return col
      .find({ snapshotDate: date })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  // =========================================================================
  // SYSTEM STATE
  // =========================================================================

  static async saveSystemState(key: string, value: any): Promise<void> {
    const col = MongoConnection.getCollection<SystemStateDocument>(COLLECTIONS.SYSTEM_STATE);
    const existing = await col.findOne({ key });
    if (existing) {
      await col.updateOne(
        { key },
        {
          $set: {
            value,
            version: (existing.version || 0) + 1,
            updatedAt: new Date(),
          },
        }
      );
    } else {
      await col.insertOne({
        key,
        value,
        version: 1,
        updatedAt: new Date(),
      });
    }
  }

  static async getSystemState(key: string): Promise<any> {
    const col = MongoConnection.getCollection<SystemStateDocument>(COLLECTIONS.SYSTEM_STATE);
    const doc = await col.findOne({ key });
    return doc?.value || null;
  }

  // =========================================================================
  // AUDIT LOGS
  // =========================================================================

  static async logAudit(audit: AuditLogDocument): Promise<string> {
    const col = MongoConnection.getCollection<AuditLogDocument>(COLLECTIONS.AUDIT_LOGS);
    const result = await col.insertOne({
      ...audit,
      timestamp: new Date(),
    });
    return result.insertedId.toString();
  }

  static async getAuditLogs(action?: string, limit: number = 100): Promise<AuditLogDocument[]> {
    const col = MongoConnection.getCollection<AuditLogDocument>(COLLECTIONS.AUDIT_LOGS);
    const query = action ? { action } : {};
    return col.find(query).sort({ timestamp: -1 }).limit(limit).toArray();
  }

  // =========================================================================
  // CONCEPTS (Knowledge Graph)
  // =========================================================================

  static async saveConcept(concept: ConceptDocument): Promise<string> {
    const col = MongoConnection.getCollection<ConceptDocument>(COLLECTIONS.CONCEPTS);
    const result = await col.insertOne({
      ...concept,
      createdAt: new Date(concept.createdAt),
      updatedAt: new Date(concept.updatedAt),
    });
    return result.insertedId.toString();
  }

  static async updateConcept(id: string, updates: Partial<ConceptDocument>): Promise<boolean> {
    const col = MongoConnection.getCollection<ConceptDocument>(COLLECTIONS.CONCEPTS);
    const result = await col.updateOne(
      { id },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );
    return (result.modifiedCount || 0) > 0;
  }

  static async getConceptsByType(type: string): Promise<ConceptDocument[]> {
    const col = MongoConnection.getCollection<ConceptDocument>(COLLECTIONS.CONCEPTS);
    return (col as any).find({ type }).sort({ frequency: -1 }).toArray();
  }

  static async saveConceptLink(link: ConceptLinkDocument): Promise<string> {
    const col = MongoConnection.getCollection<ConceptLinkDocument>(COLLECTIONS.CONCEPT_LINKS);
    const result = await col.insertOne({
      ...link,
      createdAt: new Date(link.createdAt),
      updatedAt: new Date(link.updatedAt),
    });
    return result.insertedId.toString();
  }

  static async getConceptLinks(fromId: string): Promise<ConceptLinkDocument[]> {
    const col = MongoConnection.getCollection<ConceptLinkDocument>(COLLECTIONS.CONCEPT_LINKS);
    return col.find({ fromId }).sort({ strength: -1 }).toArray();
  }

  // =========================================================================
  // DATABASE HEALTH & STATS
  // =========================================================================

  static async getCollectionStats(): Promise<Record<string, number>> {
    const db = MongoConnection.getDb();
    const stats: Record<string, number> = {};
    for (const collName of Object.values(COLLECTIONS)) {
      const col = db.collection(collName);
      stats[collName] = await col.countDocuments();
    }
    return stats;
  }

  static async getDatabaseSize(): Promise<number> {
    const db = MongoConnection.getDb();
    const stats = await db.stats();
    return stats.dataSize || 0;
  }
}

export default DataPersistence;
