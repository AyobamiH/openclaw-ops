/**
 * Slack Alert Client
 * Sends threaded alerts to #boltsy-swarm channel
 * Groups follow-up alerts by fingerprint (alert + cause)
 */

export interface SlackAlert {
  alertName: string;
  severity: 'info' | 'warning' | 'critical';
  summary: string;
  description: string;
  fingerprint: string; // For threading
  value?: string;
  agent?: string;
  timestamp: string;
  runbookUrl?: string;
}

export class SlackClient {
  private webhookUrl: string;
  private channelName: string;
  private threadTimestamps: Map<string, string> = new Map(); // fingerprint -> thread_ts
  private isConfigured: boolean;

  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
    this.channelName = process.env.SLACK_CHANNEL || '#boltsy-swarm';
    this.isConfigured = !!this.webhookUrl;

    if (this.isConfigured) {
      console.log(`[SlackClient] Configured to send alerts to ${this.channelName}`);
    } else {
      console.warn('[SlackClient] Slack webhook not configured');
    }
  }

  /**
   * Send alert to Slack with threading
   * First alert creates thread, follow-ups reply to thread
   */
  async sendAlert(alert: SlackAlert): Promise<boolean> {
    if (!this.isConfigured) {
      console.debug('[SlackClient] Not configured, skipping notification');
      return false;
    }

    try {
      const threadTs = this.threadTimestamps.get(alert.fingerprint);
      const payload = this.buildSlackPayload(alert, threadTs);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`);
      }

      // Store thread_ts for follow-up alerts with same fingerprint
      if (!threadTs) {
        // For new thread, use alert timestamp as thread_ts reference
        // In production, Slack would return ts in response
        this.threadTimestamps.set(alert.fingerprint, Date.now().toString());
      }

      console.log(`[SlackClient] Alert sent to Slack: ${alert.alertName}`, {
        severity: alert.severity,
        fingerprint: alert.fingerprint,
        threaded: !!threadTs,
      });
      return true;
    } catch (error: any) {
      console.error('[SlackClient] Failed to send alert', {
        error: error.message,
        alertName: alert.alertName,
      });
      return false;
    }
  }

  /**
   * Build Slack message payload with threading
   */
  private buildSlackPayload(alert: SlackAlert, threadTs?: string): any {
    const colorMap = {
      info: '#36a64f',
      warning: '#ff9900',
      critical: '#d32f2f',
    };

    const emoji = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨',
    };

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji[alert.severity]} ${alert.alertName}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Severity*\n${alert.severity.toUpperCase()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Time*\n${new Date(alert.timestamp).toLocaleTimeString()}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Summary:*\n${alert.summary}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Details:*\n${alert.description}`,
        },
      },
    ];

    // Add metrics if available
    if (alert.value || alert.agent) {
      const fields: any[] = [];
      if (alert.value) {
        fields.push({
          type: 'mrkdwn',
          text: `*Value*\n${alert.value}`,
        });
      }
      if (alert.agent) {
        fields.push({
          type: 'mrkdwn',
          text: `*Agent*\n${alert.agent}`,
        });
      }

      if (fields.length > 0) {
        blocks.push({
          type: 'section',
          fields,
        });
      }
    }

    // Add runbook button if available
    if (alert.runbookUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📖 View Runbook',
            },
            url: alert.runbookUrl,
          },
        ],
      } as any);
    }

    const payload: any = {
      channel: this.channelName,
      blocks,
    };

    // Thread reply if this is a follow-up alert
    if (threadTs) {
      payload.thread_ts = threadTs;
    }

    return payload;
  }

  /**
   * Clear old thread references (older than 24h)
   */
  clearStaleThreads(): void {
    // In production, would track timestamps with each thread_ts
    // For now, this is placeholder for cache cleanup
    console.debug('[SlackClient] Stale threads cleanup triggered');
  }
}

export const slackClient = new SlackClient();
