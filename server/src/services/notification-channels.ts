import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Notification Channel Abstraction
//
// A pluggable interface for delivering approval notifications to external
// systems. Each channel receives a structured ApprovalNotification payload
// and delivers it via its own protocol (webhook, API call, etc.).
//
// Built-in channels:
//   - feishu   : Feishu/Lark Bot webhook with interactive card actions
//   - openclaw : OpenClaw callback endpoint
//   - generic  : Generic HTTP POST webhook (catch-all)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalNotification {
  /** The type of event that triggered this notification. */
  event: "approval_pending" | "approval_approved" | "approval_rejected" | "approval_revision_requested";
  /** Paperclip issue information. */
  issue: {
    id: string;
    identifier: string | null;
    title: string;
    description: string | null;
    status: string;
  };
  /** Workflow context (if the issue belongs to a workflow instance). */
  workflow?: {
    instanceId: string;
    instanceName: string;
    templateName: string;
  } | null;
  /** The Paperclip board URL for this issue (for deep linking). */
  issueUrl: string;
  /** Approval metadata. */
  approval?: {
    id: string;
    type: string;
    status: string;
    decisionNote?: string | null;
  } | null;
  /** Timestamp of the event. */
  timestamp: string;
}

export interface NotificationChannelConfig {
  id: string;
  type: "feishu" | "openclaw" | "generic";
  name: string;
  enabled: boolean;
  /** Channel-specific settings. */
  settings: Record<string, unknown>;
}

export interface NotificationChannel {
  readonly type: string;
  send(notification: ApprovalNotification, config: NotificationChannelConfig): Promise<{ ok: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Feishu Channel
// ---------------------------------------------------------------------------

export class FeishuChannel implements NotificationChannel {
  readonly type = "feishu";

  async send(
    notification: ApprovalNotification,
    config: NotificationChannelConfig,
  ): Promise<{ ok: boolean; error?: string }> {
    const webhookUrl = config.settings.webhookUrl as string | undefined;
    if (!webhookUrl) {
      return { ok: false, error: "Feishu webhook URL not configured" };
    }

    const callbackUrl = config.settings.callbackUrl as string | undefined;
    const eventLabel = this.eventLabel(notification.event);
    const issueTitle = notification.issue.identifier
      ? `[${notification.issue.identifier}] ${notification.issue.title}`
      : notification.issue.title;

    // Build Feishu interactive card
    // https://open.feishu.cn/document/common-capabilities/message-card/message-cards-content
    const card: Record<string, unknown> = {
      msg_type: "interactive",
      card: {
        header: {
          title: {
            tag: "plain_text",
            content: `${eventLabel}: ${issueTitle}`,
          },
          template: this.headerColor(notification.event),
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: this.buildCardBody(notification),
            },
          },
          // Action buttons (only for pending approvals)
          ...(notification.event === "approval_pending" && callbackUrl
            ? [
                {
                  tag: "action",
                  actions: [
                    {
                      tag: "button",
                      text: { tag: "plain_text", content: "Approve" },
                      type: "primary",
                      value: {
                        action: "approve",
                        issueId: notification.issue.id,
                        approvalId: notification.approval?.id ?? null,
                      },
                    },
                    {
                      tag: "button",
                      text: { tag: "plain_text", content: "Reject" },
                      type: "danger",
                      value: {
                        action: "reject",
                        issueId: notification.issue.id,
                        approvalId: notification.approval?.id ?? null,
                      },
                    },
                    {
                      tag: "button",
                      text: { tag: "plain_text", content: "View in Paperclip" },
                      type: "default",
                      url: notification.issueUrl,
                    },
                  ],
                },
              ]
            : [
                {
                  tag: "action",
                  actions: [
                    {
                      tag: "button",
                      text: { tag: "plain_text", content: "View in Paperclip" },
                      type: "default",
                      url: notification.issueUrl,
                    },
                  ],
                },
              ]),
        ],
      },
    };

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.warn({ status: res.status, body }, "Feishu webhook delivery failed");
        return { ok: false, error: `HTTP ${res.status}: ${body}` };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Feishu webhook delivery error");
      return { ok: false, error: msg };
    }
  }

  private eventLabel(event: string): string {
    switch (event) {
      case "approval_pending": return "Pending Approval";
      case "approval_approved": return "Approved";
      case "approval_rejected": return "Rejected";
      case "approval_revision_requested": return "Revision Requested";
      default: return "Notification";
    }
  }

  private headerColor(event: string): string {
    switch (event) {
      case "approval_pending": return "orange";
      case "approval_approved": return "green";
      case "approval_rejected": return "red";
      case "approval_revision_requested": return "yellow";
      default: return "blue";
    }
  }

  private buildCardBody(n: ApprovalNotification): string {
    const lines: string[] = [];
    lines.push(`**Issue:** ${n.issue.identifier ?? n.issue.id}`);
    lines.push(`**Title:** ${n.issue.title}`);
    if (n.issue.description) {
      const desc = n.issue.description.length > 200
        ? n.issue.description.slice(0, 200) + "..."
        : n.issue.description;
      lines.push(`**Description:** ${desc}`);
    }
    lines.push(`**Status:** ${n.issue.status}`);
    if (n.workflow) {
      lines.push(`**Pipeline:** ${n.workflow.instanceName} (${n.workflow.templateName})`);
    }
    if (n.approval?.decisionNote) {
      lines.push(`**Note:** ${n.approval.decisionNote}`);
    }
    return lines.join("\n");
  }
}

// ---------------------------------------------------------------------------
// OpenClaw Channel
// ---------------------------------------------------------------------------

export class OpenClawChannel implements NotificationChannel {
  readonly type = "openclaw";

  async send(
    notification: ApprovalNotification,
    config: NotificationChannelConfig,
  ): Promise<{ ok: boolean; error?: string }> {
    const callbackUrl = config.settings.callbackUrl as string | undefined;
    if (!callbackUrl) {
      return { ok: false, error: "OpenClaw callback URL not configured" };
    }

    const apiKey = config.settings.apiKey as string | undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const payload = {
      type: "paperclip.approval",
      event: notification.event,
      issue: notification.issue,
      workflow: notification.workflow ?? null,
      approval: notification.approval ?? null,
      issueUrl: notification.issueUrl,
      timestamp: notification.timestamp,
    };

    try {
      const res = await fetch(callbackUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.warn({ status: res.status, body }, "OpenClaw callback delivery failed");
        return { ok: false, error: `HTTP ${res.status}: ${body}` };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "OpenClaw callback delivery error");
      return { ok: false, error: msg };
    }
  }
}

// ---------------------------------------------------------------------------
// Generic Webhook Channel
// ---------------------------------------------------------------------------

export class GenericWebhookChannel implements NotificationChannel {
  readonly type = "generic";

  async send(
    notification: ApprovalNotification,
    config: NotificationChannelConfig,
  ): Promise<{ ok: boolean; error?: string }> {
    const webhookUrl = config.settings.webhookUrl as string | undefined;
    if (!webhookUrl) {
      return { ok: false, error: "Webhook URL not configured" };
    }

    const secret = config.settings.secret as string | undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secret) {
      headers["X-Paperclip-Secret"] = secret;
    }

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(notification),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `HTTP ${res.status}: ${body}` };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}

// ---------------------------------------------------------------------------
// Channel Registry
// ---------------------------------------------------------------------------

const BUILTIN_CHANNELS: Record<string, NotificationChannel> = {
  feishu: new FeishuChannel(),
  openclaw: new OpenClawChannel(),
  generic: new GenericWebhookChannel(),
};

export function getNotificationChannel(type: string): NotificationChannel | null {
  return BUILTIN_CHANNELS[type] ?? null;
}

export function listAvailableChannelTypes(): string[] {
  return Object.keys(BUILTIN_CHANNELS);
}
