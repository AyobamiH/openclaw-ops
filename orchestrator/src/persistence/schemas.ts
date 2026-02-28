/**
 * Data Schemas & Models
 * Phase 6: Metrics Persistence Layer
 *
 * MongoDB collection schemas for metrics, alerts, KB entries, and consolidations
 */

// ============================================================================
// METRICS SCHEMA
// ============================================================================

export interface MetricDocument {
  _id?: string;
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  labels?: Record<string, string>;
  retention?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

// ============================================================================
// ALERTS SCHEMA
// ============================================================================

export interface AlertDocument {
  _id?: string;
  name: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'firing' | 'resolved';
  message: string;
  fingerprint: string;
  timestamp: Date;
  resolvedAt?: Date;
  duration?: number; // milliseconds
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

// ============================================================================
// KNOWLEDGE BASE SCHEMA
// ============================================================================

export interface KBDocument {
  _id?: string;
  id: string;
  title: string;
  description?: string;
  category:
    | 'alert_pattern'
    | 'metric_anomaly'
    | 'optimization'
    | 'troubleshooting'
    | 'runbook';
  severity: 'critical' | 'high' | 'medium' | 'low';
  rootCause?: string;
  solution: string;
  prerequisites?: string[];
  steps?: string[];
  expectedOutcome?: string;
  tags?: string[];
  relatedEntries?: string[];
  relatedConcepts?: string[];
  occurrences?: number; // how many times this pattern appears
  successRate?: number;
  lastSeen?: Date;
  firstSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CONSOLIDATION SCHEMA
// ============================================================================

export interface ConsolidationDocument {
  _id?: string;
  date: string; // YYYY-MM-DD
  timestamp: Date;
  snapshots: {
    count: number;
    timeRange: {
      start: Date;
      end: Date;
    };
  };
  alerts: {
    total: number;
    bySeverity: Record<string, number>;
    topIssues: Array<{ name: string; count: number; severity: string }>;
  };
  metrics: {
    total: number;
    anomalies: Array<{
      name: string;
      value: number;
      threshold: number;
      deviation: number;
    }>;
    trends: Array<{
      name: string;
      direction: 'up' | 'down' | 'stable';
      changePercent: number;
    }>;
  };
  summary: string;
  insights: string[];
  recommendations: string[];
  kbEntriesGenerated?: number;
}

// ============================================================================
// SNAPSHOT SCHEMA
// ============================================================================

export interface SnapshotDocument {
  _id?: string;
  snapshotDate: string; // YYYY-MM-DD
  timestamp: Date;
  metrics: {
    activeMetrics: number;
    anomalies: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
  };
  alerts: {
    total: number;
    active: number;
    resolved: number;
    bySeverity: Record<string, number>;
  };
  health: {
    orchestratorUp: boolean;
    prometheusUp: boolean;
    mongoUp: boolean;
    redisUp: boolean;
  };
  cost?: {
    estimatedDaily: string;
    estimatedMonthly: string;
  };
}

// ============================================================================
// SYSTEM STATE SCHEMA
// ============================================================================

export interface SystemStateDocument {
  _id?: string;
  key: string;
  value: any;
  version: number;
  updatedAt: Date;
}

// ============================================================================
// AUDIT LOG SCHEMA
// ============================================================================

export interface AuditLogDocument {
  _id?: string;
  action: string;
  actor: string;
  resource: string;
  changes?: Record<string, any>;
  timestamp: Date;
  status: 'success' | 'failure';
  error?: string;
}

// ============================================================================
// CONCEPT (Knowledge Graph) SCHEMA
// ============================================================================

export interface ConceptDocument {
  _id?: string;
  id: string;
  name: string;
  type: 'root_cause' | 'metric' | 'solution' | 'pattern' | 'service';
  description?: string;
  relatedConcepts: string[];
  frequency: number;
  evidence?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConceptLinkDocument {
  _id?: string;
  fromId: string;
  toId: string;
  relationship:
    | 'causes'
    | 'solved_by'
    | 'related_to'
    | 'precedes'
    | 'follows'
    | 'indicates';
  strength: number; // 0-1: confidence level
  evidence: string[];
  frequency: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Collection Names (Constants)
// ============================================================================

export const COLLECTIONS = {
  METRICS: 'metrics',
  ALERTS: 'alerts',
  KNOWLEDGE_BASE: 'knowledge_base',
  CONSOLIDATIONS: 'consolidations',
  SNAPSHOTS: 'snapshots',
  SYSTEM_STATE: 'system_state',
  AUDIT_LOGS: 'audit_logs',
  CONCEPTS: 'concepts',
  CONCEPT_LINKS: 'concept_links',
} as const;
