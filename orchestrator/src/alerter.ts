/**
 * Error Alerting System
 * Tracks failures and sends alerts to configured channels
 */

interface AlertConfig {
  enabled: boolean;
  slackWebhook?: string;
  emailTo?: string;
  severityThreshold: "error" | "warning" | "info";
}

interface AlertRecord {
  id: string;
  timestamp: string;
  severity: "critical" | "error" | "warning" | "info";
  component: string;
  message: string;
  context?: Record<string, unknown>;
  resolved?: boolean;
}

export class AlertManager {
  private config: AlertConfig;
  private alerts: AlertRecord[] = [];
  private logger: Console;

  constructor(config: AlertConfig, logger: Console) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Record an alert
   */
  alert(severity: AlertRecord["severity"], component: string, message: string, context?: Record<string, unknown>) {
    if (!this.shouldAlert(severity)) return;

    const alert: AlertRecord = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      severity,
      component,
      message,
      context,
    };

    this.alerts.push(alert);
    this.logger.log(
      `[alert] [${severity.toUpperCase()}] ${component}: ${message}`,
      context ? JSON.stringify(context) : ""
    );

    if (this.shouldSend(severity)) {
      this.send(alert).catch((err) => {
        this.logger.error(`[alert-send] Failed: ${err}`);
      });
    }
  }

  /**
   * Critical alert - always send
   */
  critical(component: string, message: string, context?: Record<string, unknown>) {
    this.alert("critical", component, message, context);
  }

  /**
   * Error alert
   */
  error(component: string, message: string, context?: Record<string, unknown>) {
    this.alert("error", component, message, context);
  }

  /**
   * Warning alert
   */
  warning(component: string, message: string, context?: Record<string, unknown>) {
    this.alert("warning", component, message, context);
  }

  /**
   * Info alert (lowest priority)
   */
  info(component: string, message: string, context?: Record<string, unknown>) {
    this.alert("info", component, message, context);
  }

  /**
   * Check if alert should be recorded based on threshold
   */
  private shouldAlert(severity: string): boolean {
    const levels = { info: 0, warning: 1, error: 2, critical: 3 };
    const thresholds = { info: 0, warning: 1, error: 2, critical: 3 };
    const severityLevel = levels[severity as keyof typeof levels] ?? 0;
    const thresholdLevel = thresholds[this.config.severityThreshold as keyof typeof thresholds] ?? 0;
    return severityLevel >= thresholdLevel;
  }

  /**
   * Check if alert should be sent to external service
   */
  private shouldSend(severity: string): boolean {
    // Only send error and critical alerts
    return severity === "error" || severity === "critical";
  }

  /**
   * Send alert to configured channels
   */
  private async send(alert: AlertRecord): Promise<void> {
    const tasks = [];

    if (this.config.slackWebhook) {
      tasks.push(this.sendSlack(alert));
    }

    if (this.config.emailTo) {
      tasks.push(this.sendEmail(alert));
    }

    await Promise.allSettled(tasks);
  }

  /**
   * Send Slack alert
   */
  private async sendSlack(alert: AlertRecord): Promise<void> {
    if (!this.config.slackWebhook) return;

    const color = alert.severity === "critical" ? "danger" : "warning";
    const payload = {
      attachments: [
        {
          color,
          title: `⚠️  ${alert.severity.toUpperCase()} - ${alert.component}`,
          text: alert.message,
          ts: Math.floor(new Date(alert.timestamp).getTime() / 1000),
          fields: alert.context
            ? [
                {
                  title: "Context",
                  value: JSON.stringify(alert.context, null, 2),
                  short: false,
                },
              ]
            : [],
        },
      ],
    };

    try {
      const response = await fetch(this.config.slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack error: ${response.statusText}`);
      }

      this.logger.log(`[alert-slack] ✅ Sent ${alert.severity} alert`);
    } catch (error) {
      this.logger.error(`[alert-slack] Failed:`, (error as Error).message);
    }
  }

  /**
   * Send email alert (stub)
   */
  private async sendEmail(alert: AlertRecord): Promise<void> {
    if (!this.config.emailTo) return;

    // Implement via your email service (SendGrid, etc.)
    this.logger.log(`[alert-email] Would send to ${this.config.emailTo}: ${alert.message}`);
  }

  /**
   * Get recent alerts
   */
  getAlerts(severity?: string, hours: number = 24): AlertRecord[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.alerts.filter((a) => {
      const matchesSeverity = !severity || a.severity === severity;
      const matchesTime = new Date(a.timestamp).getTime() > cutoff;
      return matchesSeverity && matchesTime;
    });
  }

  /**
   * Clear old alerts
   */
  cleanup(olderThanHours: number = 48): number {
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    const before = this.alerts.length;
    this.alerts = this.alerts.filter((a) => new Date(a.timestamp).getTime() > cutoff);
    this.logger.log(`[alert-cleanup] Removed ${before - this.alerts.length} old alerts`);
    return before - this.alerts.length;
  }

  /**
   * Export alerts for logging/storage
   */
  export(): AlertRecord[] {
    return [...this.alerts];
  }
}

/**
 * Build alert config from environment
 */
export function buildAlertConfig(): AlertConfig {
  return {
    enabled: process.env.ALERTS_ENABLED !== "false",
    slackWebhook: process.env.SLACK_ERROR_WEBHOOK,
    emailTo: process.env.ALERT_EMAIL_TO,
    severityThreshold: (process.env.ALERT_SEVERITY_THRESHOLD || "warning") as any,
  };
}

/**
 * Task Failure Tracker
 * Monitors handler results and alerts on failures
 */
export class TaskFailureTracker {
  private failureCount = new Map<string, number>();
  private alertManager: AlertManager;
  private maxFailuresBeforeAlert = 3;

  constructor(alertManager: AlertManager, maxFailures: number = 3) {
    this.alertManager = alertManager;
    this.maxFailuresBeforeAlert = maxFailures;
  }

  /**
   * Track task result
   */
  track(taskType: string, result: string | void, error?: Error): void {
    if (error || (typeof result === "string" && result.includes("failed"))) {
      const count = (this.failureCount.get(taskType) ?? 0) + 1;
      this.failureCount.set(taskType, count);

      if (count >= this.maxFailuresBeforeAlert) {
        this.alertManager.error(
          `task-${taskType}`,
          `Task failed ${count} times in a row: ${error?.message || result}`,
          { taskType, failureCount: count, lastError: error?.message }
        );
      }
    } else {
      // Success - reset counter
      this.failureCount.set(taskType, 0);
    }
  }

  /**
   * Get current failure count for a task
   */
  getFailureCount(taskType: string): number {
    return this.failureCount.get(taskType) ?? 0;
  }

  /**
   * Clear all counters
   */
  reset(): void {
    this.failureCount.clear();
  }
}
