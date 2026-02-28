/**
 * Pattern Analyzer - Identifies recurring patterns from alerts and metrics
 * Clusters similar issues to extract root causes and solutions
 */

export interface AlertPattern {
  name: string;
  description: string;
  fingerprints: string[];
  occurrences: number;
  lastSeen: number;
  rootCause: string;
  solution: string;
  severity: 'critical' | 'warning' | 'info';
  tags: string[];
}

export interface MetricPattern {
  name: string;
  metric: string;
  description: string;
  threshold: number;
  precedingMetrics?: string[];
  indicatesIssue: string;
  occurrences: number;
  lastSeen: number;
}

export class PatternAnalyzer {
  private alertPatterns: Map<string, AlertPattern> = new Map();
  private metricPatterns: Map<string, MetricPattern> = new Map();

  /**
   * Analyze daily consolidation for patterns
   */
  analyzeConsolidation(consolidation: any): {
    alertPatterns: AlertPattern[];
    metricPatterns: MetricPattern[];
    newPatterns: boolean;
  } {
    const alertPatterns: AlertPattern[] = [];
    const metricPatterns: MetricPattern[] = [];
    let newPatterns = false;

    // Analyze alerts from consolidation
    if (consolidation.alerts.totalCritical > 5) {
      const pattern = this.extractAlertPattern(consolidation);
      if (pattern && !this.alertPatterns.has(pattern.name)) {
        newPatterns = true;
      }
      alertPatterns.push(pattern);
    }

    // Analyze metrics for anomalies
    if (consolidation.patterns.errorTrend === 'increasing') {
      const pattern = this.extractMetricPattern(consolidation, 'error_spike');
      metricPatterns.push(pattern);
    }

    if (consolidation.patterns.costTrend === 'increasing') {
      const pattern = this.extractMetricPattern(consolidation, 'cost_increase');
      metricPatterns.push(pattern);
    }

    if (consolidation.patterns.performance === 'degrading') {
      const pattern = this.extractMetricPattern(consolidation, 'latency_spike');
      metricPatterns.push(pattern);
    }

    return { alertPatterns, metricPatterns, newPatterns };
  }

  /**
   * Extract alert-based pattern
   */
  private extractAlertPattern(consolidation: any): AlertPattern {
    const name = consolidation.alerts.mostFrequent || 'UnknownAlert';
    const hash = this.hashPattern(name);

    let pattern: AlertPattern;

    if (this.alertPatterns.has(hash)) {
      pattern = this.alertPatterns.get(hash)!;
      pattern.occurrences += 1;
      pattern.lastSeen = Date.now();
    } else {
      pattern = {
        name,
        description: `Alert "${name}" fired ${consolidation.alerts.totalCritical} times`,
        fingerprints: [],
        occurrences: 1,
        lastSeen: Date.now(),
        rootCause: this.inferRootCause(consolidation),
        solution: this.generateSolution(name),
        severity: consolidation.patterns.errorTrend === 'increasing' ? 'critical' : 'warning',
        tags: this.generateTags(name, consolidation),
      };

      this.alertPatterns.set(hash, pattern);
    }

    return pattern;
  }

  /**
   * Extract metric-based pattern
   */
  private extractMetricPattern(
    consolidation: any,
    patternType: 'error_spike' | 'cost_increase' | 'latency_spike'
  ): MetricPattern {
    const hash = this.hashPattern(patternType);

    let pattern: MetricPattern;

    if (this.metricPatterns.has(hash)) {
      pattern = this.metricPatterns.get(hash)!;
      pattern.occurrences += 1;
      pattern.lastSeen = Date.now();
    } else {
      pattern = {
        name: patternType,
        metric: this.getMetricName(patternType),
        description: this.getMetricDescription(patternType, consolidation),
        threshold: this.getMetricThreshold(patternType, consolidation),
        precedingMetrics: this.inferPrecedingMetrics(patternType),
        indicatesIssue: this.getIssueDescription(patternType),
        occurrences: 1,
        lastSeen: Date.now(),
      };

      this.metricPatterns.set(hash, pattern);
    }

    return pattern;
  }

  /**
   * Infer root cause from consolidation data
   */
  private inferRootCause(consolidation: any): string {
    if (consolidation.metrics.avgErrorRate > 0.1) {
      return 'High error rate - likely deployment issue or service degradation';
    }
    if (consolidation.metrics.maxActiveTasks > 20) {
      return 'System overload - insufficient capacity or batch size too large';
    }
    if (consolidation.metrics.totalCost > 30) {
      return 'Cost spike - expensive API calls or unoptimized queries';
    }
    return 'Unknown cause - requires manual investigation';
  }

  /**
   * Generate solution for alert type
   */
  private generateSolution(alertName: string): string {
    const solutions: Record<string, string> = {
      HighErrorRate: 'Check recent deploys, review logs, consider rollback if error rate >10%',
      DailyCostSpike: 'Audit recent API calls, check for runaway queries, review batch sizes',
      ApprovalSLABreach: 'Increase approval queue workers, set escalation rules',
      PermissionDenialSpike: 'Audit permission grants, check for misconfigured policies',
      TaskDurationSpike: 'Profile slow tasks, consider caching, optimize queries',
      PrometheusScrapeFailing: 'Verify Prometheus endpoint is reachable, check firewall rules',
    };

    return (
      solutions[alertName] || 'Escalate to on-call engineer for investigation'
    );
  }

  /**
   * Generate searchable tags
   */
  private generateTags(alertName: string, consolidation: any): string[] {
    const tags = [alertName.toLowerCase()];

    if (consolidation.metrics.avgErrorRate > 0.05) tags.push('high-error-rate');
    if (consolidation.metrics.maxActiveTasks > 15) tags.push('high-load');
    if (consolidation.metrics.totalCost > 25) tags.push('cost-spike');
    if (consolidation.patterns.errorTrend === 'increasing') tags.push('error-trending-up');
    if (consolidation.patterns.costTrend === 'increasing') tags.push('cost-trending-up');

    return [...new Set(tags)];
  }

  /**
   * Helper: Infer preceding metrics
   */
  private inferPrecedingMetrics(patternType: string): string[] {
    const precedingMap: Record<string, string[]> = {
      error_spike: ['task_duration', 'memory_usage', 'api_latency'],
      cost_increase: ['api_calls', 'batch_size', 'processing_time'],
      latency_spike: ['active_tasks', 'database_queries', 'queue_depth'],
    };

    return precedingMap[patternType] || [];
  }

  /**
   * Helper: Get metric name
   */
  private getMetricName(patternType: string): string {
    return patternType.replace(/_/g, ' ').toUpperCase();
  }

  /**
   * Helper: Get metric description
   */
  private getMetricDescription(patternType: string, consolidation: any): string {
    const descriptions: Record<string, string> = {
      error_spike: `Error rate ${(consolidation.metrics.avgErrorRate * 100).toFixed(1)}% (threshold: 5%)`,
      cost_increase: `Daily cost $${consolidation.metrics.totalCost.toFixed(2)} (threshold: $30)`,
      latency_spike: `P95 latency ${consolidation.metrics.avgLatencyP95.toFixed(0)}ms (threshold: 500ms)`,
    };

    return descriptions[patternType] || 'Unknown metric pattern';
  }

  /**
   * Helper: Get metric threshold
   */
  private getMetricThreshold(patternType: string, consolidation: any): number {
    const thresholds: Record<string, number> = {
      error_spike: 0.05,
      cost_increase: 30,
      latency_spike: 500,
    };

    return thresholds[patternType] || 0;
  }

  /**
   * Helper: Get issue description
   */
  private getIssueDescription(patternType: string): string {
    const descriptions: Record<string, string> = {
      error_spike: 'System reliability issue - investigate error sources',
      cost_increase: 'Cost efficiency issue - optimize usage patterns',
      latency_spike: 'Performance issue - consider scaling or optimization',
    };

    return descriptions[patternType] || 'System issue detected';
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): { alerts: AlertPattern[]; metrics: MetricPattern[] } {
    return {
      alerts: Array.from(this.alertPatterns.values()),
      metrics: Array.from(this.metricPatterns.values()),
    };
  }

  /**
   * Get related patterns
   */
  getRelatedPatterns(tag: string): AlertPattern[] {
    return Array.from(this.alertPatterns.values()).filter(p => p.tags.includes(tag));
  }

  /**
   * Simple hash function
   */
  private hashPattern(input: string): string {
    return input.toLowerCase().replace(/\s+/g, '-');
  }
}

export const patternAnalyzer = new PatternAnalyzer();
