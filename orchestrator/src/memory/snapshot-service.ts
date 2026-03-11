/**
 * Snapshot Service - Captures current system state hourly
 * Records metrics, alerts, active tasks for daily consolidation
 */

import fs from 'fs/promises';
import path from 'path';

export interface Snapshot {
  timestamp: number;
  date: string;
  metrics: {
    activeAgents: number;
    activeTasks: number;
    totalTasksCompleted: number;
    successRate: number;
    errorRate: number;
    averageTaskDuration: number;
    costPerDay: number;
  };
  alerts: {
    critical: number;
    warning: number;
    info: number;
    topAlert: string;
  };
  performance: {
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
  };
}

export class SnapshotService {
  private snapshotDir: string;

  constructor(
    snapshotDir: string = process.env.ORCHESTRATOR_SNAPSHOT_DIR || './data/snapshots',
  ) {
    this.snapshotDir = snapshotDir;
  }

  setSnapshotDir(snapshotDir: string): void {
    this.snapshotDir = snapshotDir;
  }

  /**
   * Capture current system state
   * Called hourly by scheduler
   */
  async captureSnapshot(metrics: any): Promise<Snapshot> {
    const now = Date.now();
    const date = new Date(now).toISOString().split('T')[0];

    const snapshot: Snapshot = {
      timestamp: now,
      date,
      metrics: {
        activeAgents: metrics.activeAgents || 0,
        activeTasks: metrics.activeTasks || 0,
        totalTasksCompleted: metrics.totalTasksCompleted || 0,
        successRate: metrics.successRate || 0,
        errorRate: metrics.errorRate || 0,
        averageTaskDuration: metrics.averageTaskDuration || 0,
        costPerDay: metrics.costPerDay || 0,
      },
      alerts: {
        critical: metrics.alertsCritical || 0,
        warning: metrics.alertsWarning || 0,
        info: metrics.alertsInfo || 0,
        topAlert: metrics.topAlert || 'none',
      },
      performance: {
        p50Latency: metrics.p50Latency || 0,
        p95Latency: metrics.p95Latency || 0,
        p99Latency: metrics.p99Latency || 0,
      },
    };

    // Save snapshot to daily file
    await this.saveSnapshot(snapshot, date);

    console.log(`[SnapshotService] Captured snapshot for ${date}`, {
      tasks: snapshot.metrics.activeTasks,
      alerts: snapshot.alerts.critical + snapshot.alerts.warning,
      costPerDay: `$${snapshot.metrics.costPerDay.toFixed(2)}`,
    });

    return snapshot;
  }

  /**
   * Save snapshot to file (append to daily file)
   */
  private async saveSnapshot(snapshot: Snapshot, date: string): Promise<void> {
    const dir = path.join(this.snapshotDir, date.split('-')[0], date.split('-')[1]);
    const file = path.join(dir, `${date}.jsonl`);

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(file, JSON.stringify(snapshot) + '\n');
    } catch (error) {
      console.error(`[SnapshotService] Error saving snapshot:`, error);
    }
  }

  /**
   * Load all snapshots for a given date
   */
  async loadSnapshotsForDate(date: string): Promise<Snapshot[]> {
    const dir = path.join(this.snapshotDir, date.split('-')[0], date.split('-')[1]);
    const file = path.join(dir, `${date}.jsonl`);

    try {
      const content = await fs.readFile(file, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get list of available dates with snapshots
   */
  async listAvailableDates(): Promise<string[]> {
    try {
      const years = await fs.readdir(this.snapshotDir);
      const dates: string[] = [];

      for (const year of years) {
        const yearPath = path.join(this.snapshotDir, year);
        const months = await fs.readdir(yearPath);

        for (const month of months) {
          const monthPath = path.join(yearPath, month);
          const files = await fs.readdir(monthPath);

          for (const file of files) {
            if (file.endsWith('.jsonl')) {
              dates.push(file.replace('.jsonl', ''));
            }
          }
        }
      }

      return dates.sort().reverse();
    } catch (error) {
      return [];
    }
  }
}

export const snapshotService = new SnapshotService();
