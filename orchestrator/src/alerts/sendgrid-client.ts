/**
 * SendGrid Email Client for Critical Alerts
 * Sends formatted HTML emails for critical security/cost/approval alerts
 */

export interface CriticalAlertEmail {
  alertName: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  description: string;
  value?: string;
  agent?: string;
  timestamp: string;
  runbookUrl?: string;
}

export class SendGridClient {
  private apiKey: string;
  private fromEmail: string;
  private toEmail: string;
  private isConfigured: boolean;

  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY || '';
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'alerts@openclaw.io';
    this.toEmail = process.env.ALERT_EMAIL || '';
    this.isConfigured = !!(this.apiKey && this.toEmail);

    if (this.isConfigured) {
      console.log('[SendGridClient] Configured for critical alerts');
    }
  }

  /**
   * Send critical alert email
   */
  async sendCriticalAlert(alert: CriticalAlertEmail): Promise<boolean> {
    if (!this.isConfigured) {
      console.warn('[SendGridClient] Not configured, skipping email');
      return false;
    }

    try {
      const subject = `[CRITICAL] ${alert.alertName}`;
      const htmlContent = this.buildEmailHTML(alert);

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: this.toEmail }],
              subject,
            },
          ],
          from: {
            email: this.fromEmail,
            name: 'OpenClaw Alerts',
          },
          content: [
            {
              type: 'text/html',
              value: htmlContent,
            },
          ],
          headers: {
            'X-Alert-Severity': alert.severity,
            'X-Alert-Name': alert.alertName,
            'X-Alert-Timestamp': alert.timestamp,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`SendGrid API error: ${response.status}`);
      }

      console.log(`[SendGridClient] Critical alert email sent: ${alert.alertName}`, {
        to: this.toEmail,
        timestamp: alert.timestamp,
      });
      return true;
    } catch (error: any) {
      console.error('[SendGridClient] Failed to send email', {
        error: error.message,
        alertName: alert.alertName,
      });
      return false;
    }
  }

  /**
   * Build HTML email template
   */
  private buildEmailHTML(alert: CriticalAlertEmail): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .header { background: #d32f2f; color: white; padding: 20px; border-radius: 4px 4px 0 0; }
    .content { background: white; padding: 20px; border-radius: 0 0 4px 4px; }
    .section { margin: 15px 0; }
    .label { font-weight: bold; color: #666; font-size: 12px; text-transform: uppercase; }
    .value { font-size: 16px; color: #333; margin-top: 5px; }
    .metric { background: #f5f5f5; padding: 10px; border-left: 4px solid #d32f2f; margin: 10px 0; }
    .footer { font-size: 12px; color: #999; margin-top: 20px; }
    .button { display: inline-block; background: #1976d2; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚨 Critical Alert</h1>
    </div>
    <div class="content">
      <div class="section">
        <div class="label">Alert Name</div>
        <div class="value">${alert.alertName}</div>
      </div>

      <div class="section">
        <div class="label">Summary</div>
        <div class="value">${alert.summary}</div>
      </div>

      <div class="section">
        <div class="label">Details</div>
        <div class="value">${alert.description}</div>
      </div>

      ${alert.value ? `
      <div class="metric">
        <div class="label">Current Value</div>
        <div class="value">${alert.value}</div>
      </div>
      ` : ''}

      ${alert.agent ? `
      <div class="section">
        <div class="label">Agent</div>
        <div class="value">${alert.agent}</div>
      </div>
      ` : ''}

      <div class="section">
        <div class="label">Timestamp</div>
        <div class="value">${new Date(alert.timestamp).toLocaleString()}</div>
      </div>

      ${alert.runbookUrl ? `
      <div class="section">
        <a href="${alert.runbookUrl}" class="button">📖 View Runbook</a>
      </div>
      ` : ''}

      <div class="footer">
        <p>This is an automated alert from OpenClaw Orchestrator.</p>
        <p>Check #boltsy-swarm on Slack for more details.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }
}

export const sendGridClient = new SendGridClient();
