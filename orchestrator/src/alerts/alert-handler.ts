/**
 * Alert Handler - Main orchestration for AlertManager webhook
 * Receives alerts from Prometheus/AlertManager
 * Routes to Slack + SendGrid based on severity
 * Applies smart deduplication
 */

import { slackClient, SlackAlert } from './slack-client.js';
import { sendGridClient, CriticalAlertEmail } from './sendgrid-client.js';
import { alertDeduplicator, AlertFingerprint } from './alert-deduplicator.js';

export interface PrometheusAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export interface AlertManagerPayload {
  alerts: PrometheusAlert[];
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
}

export class AlertHandler {
  /**
   * Process alerts from AlertManager webhook
   */
  async handleAlertManagerWebhook(payload: AlertManagerPayload): Promise<void> {
    console.log(`[AlertHandler] Processing ${payload.alerts.length} alerts from AlertManager`);

    for (const alert of payload.alerts) {
      if (alert.status === 'firing') {
        await this.processAlert(alert);
      } else if (alert.status === 'resolved') {
        console.info('[AlertHandler] Alert resolved', {
          alertName: alert.labels.alertname,
        });
      }
    }
  }

  /**
   * Process individual alert
   */
  private async processAlert(alert: PrometheusAlert): Promise<void> {
    const alertName = alert.labels.alertname || 'Unknown';
    const severity = alert.labels.severity || 'info';
    const cause = alert.labels.cause || 'unknown';
    const agent = alert.labels.agent;

    const summary = alert.annotations.summary || '';
    const description = alert.annotations.description || '';
    const runbookUrl = alert.annotations.runbook;

    console.log(`[AlertHandler] Processing alert: ${alertName} (${severity})`);

    // Check deduplication
    const fingerprint: AlertFingerprint = {
      alertName,
      cause,
      agent,
      labels: alert.labels,
    };

    if (!alertDeduplicator.shouldFire(fingerprint)) {
      console.debug(`[AlertHandler] Alert deduplicated, not notifying`, {
        alertName,
      });
      return;
    }

    // Send to Slack (all severities)
    const slackAlert: SlackAlert = {
      alertName,
      severity: (severity as any) || 'info',
      summary,
      description,
      fingerprint: `${alertName}:${cause}`,
      value: alert.labels.value,
      agent,
      timestamp: new Date().toISOString(),
      runbookUrl,
    };

    const slackSent = await slackClient.sendAlert(slackAlert);

    // Send critical alerts to email too
    if (severity === 'critical') {
      const emailAlert: CriticalAlertEmail = {
        alertName,
        severity: 'critical',
        summary,
        description,
        value: alert.labels.value,
        agent,
        timestamp: new Date().toISOString(),
        runbookUrl,
      };

      const emailSent = await sendGridClient.sendCriticalAlert(emailAlert);
      console.info(`[AlertHandler] Critical alert routed`, {
        alertName,
        slackSent,
        emailSent,
      });
    }
  }
}

export const alertHandler = new AlertHandler();
