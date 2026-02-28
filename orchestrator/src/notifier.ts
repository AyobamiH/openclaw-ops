/**
 * Notification delivery utility
 * Supports: Slack, Discord, Email
 */

interface NotificationPayload {
  title: string;
  summary: string;
  count: number;
  digest?: Record<string, unknown>;
  url?: string;
}

interface NotifierConfig {
  channel: "slack" | "discord" | "email" | "log";
  target: string; // Webhook URL, channel ID, or email address
  slackBotToken?: string;
  emailSmtpUrl?: string;
}

/**
 * Send notification to configured channel
 */
export async function sendNotification(
  config: NotifierConfig,
  payload: NotificationPayload,
  logger: Console
): Promise<void> {
  const { channel, target } = config;

  switch (channel) {
    case "slack":
      await sendSlackNotification(target, payload, logger);
      break;
    case "discord":
      await sendDiscordNotification(target, payload, logger);
      break;
    case "email":
      await sendEmailNotification(target, payload, logger, config.emailSmtpUrl);
      break;
    case "log":
      sendLogNotification(payload, logger);
      break;
    default:
      logger.log(`[notifier] Unknown channel: ${channel}`);
  }
}

/**
 * Send Slack notification via webhook
 */
async function sendSlackNotification(
  webhookUrl: string,
  payload: NotificationPayload,
  logger: Console
): Promise<void> {
  if (!webhookUrl) {
    logger.warn("[notifier-slack] No webhook URL configured");
    return;
  }

  const message = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📨 " + payload.title,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${payload.summary}\n\n*Ready to Review:* ${payload.count} leads`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Digest",
            },
            url: payload.url || "#",
            style: "primary",
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    logger.log(`[notifier-slack] ✅ Notification sent (${payload.count} leads)`);
  } catch (error) {
    logger.error(`[notifier-slack] ❌ Failed:`, (error as Error).message);
  }
}

/**
 * Send Discord notification via webhook
 */
async function sendDiscordNotification(
  webhookUrl: string,
  payload: NotificationPayload,
  logger: Console
): Promise<void> {
  if (!webhookUrl) {
    logger.warn("[notifier-discord] No webhook URL configured");
    return;
  }

  const message = {
    embeds: [
      {
        title: payload.title,
        description: payload.summary,
        color: 0x5865f2, // Discord blue
        fields: [
          {
            name: "Ready to Review",
            value: `${payload.count} leads`,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.statusText}`);
    }

    logger.log(`[notifier-discord] ✅ Notification sent (${payload.count} leads)`);
  } catch (error) {
    logger.error(`[notifier-discord] ❌ Failed:`, (error as Error).message);
  }
}

/**
 * Send email notification
 * Uses fetch to a simple email API (e.g., SendGrid, Mailgun, or local service)
 */
async function sendEmailNotification(
  recipient: string,
  payload: NotificationPayload,
  logger: Console,
  smtpUrl?: string
): Promise<void> {
  if (!recipient) {
    logger.warn("[notifier-email] No recipient configured");
    return;
  }

  const emailBody = `
<html>
  <body>
    <h2>${payload.title}</h2>
    <p>${payload.summary}</p>
    <hr />
    <p><strong>Ready to Review:</strong> ${payload.count} leads</p>
    ${payload.url ? `<p><a href="${payload.url}">View Digest</a></p>` : ""}
    <p><small>Generated at ${new Date().toISOString()}</small></p>
  </body>
</html>
  `;

  try {
    // If using a service like SendGrid or Mailgun, configure via environment
    const apiKey = process.env.EMAIL_API_KEY;
    const apiUrl = process.env.EMAIL_API_URL || smtpUrl;

    if (!apiUrl) {
      logger.warn("[notifier-email] No email service configured (set EMAIL_API_URL)");
      sendLogNotification(payload, logger);
      return;
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: recipient,
        subject: payload.title,
        html: emailBody,
      }),
    });

    if (!response.ok) {
      throw new Error(`Email service error: ${response.statusText}`);
    }

    logger.log(`[notifier-email] ✅ Email sent to ${recipient} (${payload.count} leads)`);
  } catch (error) {
    logger.error(`[notifier-email] ❌ Failed:`, (error as Error).message);
    // Fallback to log
    sendLogNotification(payload, logger);
  }
}

/**
 * Log notification (fallback/default)
 */
function sendLogNotification(payload: NotificationPayload, logger: Console): void {
  console.log("\n" + "=".repeat(60));
  console.log(`📨 ${payload.title}`);
  console.log("=".repeat(60));
  console.log(payload.summary);
  console.log(`\n✅ Ready to Review: ${payload.count} leads`);
  if (payload.url) console.log(`View: ${payload.url}`);
  console.log("=".repeat(60) + "\n");
  logger.log(`[notifier-log] ✅ Notification logged (${payload.count} leads)`);
}

/**
 * Build notification config from orchestrator config
 */
export function buildNotifierConfig(orcConfig: Record<string, any>): NotifierConfig | null {
  const channel = orcConfig.digestNotificationChannel;
  const target = orcConfig.digestNotificationTarget;

  if (!channel || !target) {
    return null;
  }

  return {
    channel: channel as any,
    target,
    slackBotToken: process.env.SLACK_BOT_TOKEN,
    emailSmtpUrl: process.env.EMAIL_SMTP_URL,
  };
}
