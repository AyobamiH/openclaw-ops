/**
 * Alert Deduplicator with Smart Fingerprinting
 * Prevents alert spam by grouping on alert name + cause
 * 10-minute dedup window per unique fingerprint
 */

import crypto from 'crypto';

export interface AlertFingerprint {
  alertName: string;
  cause: string; // e.g., "timeout", "memory_leak", "network_blip"
  agent?: string;
  labels?: Record<string, string>;
}

interface DedupeEntry {
  fingerprint: string;
  lastFiredAt: number;
  count: number;
}

export class AlertDeduplicator {
  private dedupeMap: Map<string, DedupeEntry> = new Map();
  private dedupeWindowMs: number;

  constructor(dedupeWindowMs: number = 10 * 60 * 1000) {
    // 10 minutes default
    this.dedupeWindowMs = dedupeWindowMs;
    this.startCleanupTimer();
    console.log(`[AlertDeduplicator] Initialized with ${dedupeWindowMs / 1000}s window`);
  }

  /**
   * Check if alert should fire
   * Returns: true if should fire, false if deduplicated
   */
  shouldFire(fingerprint: AlertFingerprint): boolean {
    const hash = this.generateFingerprint(fingerprint);
    const now = Date.now();

    const existing = this.dedupeMap.get(hash);

    if (!existing) {
      // New alert, always fire
      this.dedupeMap.set(hash, {
        fingerprint: hash,
        lastFiredAt: now,
        count: 1,
      });
      return true;
    }

    const timeSinceLastFire = now - existing.lastFiredAt;

    if (timeSinceLastFire > this.dedupeWindowMs) {
      // Outside dedup window, fire again
      existing.lastFiredAt = now;
      existing.count += 1;
      console.info(`[AlertDeduplicator] Alert refired after dedup window`, {
        fingerprint: hash,
        count: existing.count,
      });
      return true;
    }

    // Within dedup window, don't fire
    console.debug(`[AlertDeduplicator] Alert deduplicated`, {
      fingerprint: hash,
      timeSinceLastFireMs: timeSinceLastFire,
      count: existing.count,
    });
    return false;
  }

  /**
   * Generate hash from alert fingerprint
   * Separate hashes for different error types (IMPORTANT for edge cases)
   */
  private generateFingerprint(fp: AlertFingerprint): string {
    // KEY: Different cause = different hash (user's requirement)
    // This allows "timeout error", "memory leak", "network blip" to be tracked separately
    const components = [
      fp.alertName,
      fp.cause, // ← Different cause = different hash
      fp.agent || 'global',
    ];

    const combined = components.join(':');
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
  }

  /**
   * Clean up old entries every hour
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [hash, entry] of this.dedupeMap.entries()) {
        // Remove entries not fired in last 2 hours
        if (now - entry.lastFiredAt > 2 * 60 * 60 * 1000) {
          this.dedupeMap.delete(hash);
          cleaned += 1;
        }
      }

      if (cleaned > 0) {
        console.debug(`[AlertDeduplicator] Cleaned up ${cleaned} stale dedup entries`);
      }
    }, 60 * 60 * 1000); // Every 1 hour
  }

  /**
   * Get stats (for monitoring)
   */
  getStats(): { entries: number; window: string } {
    return {
      entries: this.dedupeMap.size,
      window: `${this.dedupeWindowMs / 1000}s`,
    };
  }
}

export const alertDeduplicator = new AlertDeduplicator(10 * 60 * 1000);
