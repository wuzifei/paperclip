import { eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { notificationChannels, issues, workflowInstances } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { getNotificationChannel, type ApprovalNotification, type NotificationChannelConfig } from "./notification-channels.js";

// ---------------------------------------------------------------------------
// Notification Dispatcher Service
// ---------------------------------------------------------------------------

export function notificationDispatcherService(db: Db) {
  return {
    dispatchApprovalEvent: async (
      companyId: string,
      event: ApprovalNotification["event"],
      issueId: string,
      approvalData?: {
        id: string;
        type: string;
        status: string;
        decisionNote?: string | null;
      },
    ) => {
      try {
        // 1. Find all enabled channels for this company
        const channels = await db
          .select()
          .from(notificationChannels)
          .where(
            and(
              eq(notificationChannels.companyId, companyId),
              eq(notificationChannels.enabled, true),
            ),
          );

        if (channels.length === 0) return; // Nothing to do

        // 2. Fetch rich issue context
        const issue = await db
          .select({
            id: issues.id,
            identifier: issues.identifier,
            title: issues.title,
            description: issues.description,
            status: issues.status,
            originKind: issues.originKind,
            originId: issues.originId,
          })
          .from(issues)
          .where(eq(issues.id, issueId))
          .then((rows) => rows[0] ?? null);

        if (!issue) return;

        // 3. Fetch workflow context if applicable
        let workflowCtx: ApprovalNotification["workflow"] = null;
        if (issue.originKind === "workflow" && issue.originId) {
          const wf = await db
            .select({
              id: workflowInstances.id,
              name: workflowInstances.name,
            })
            .from(workflowInstances)
            .where(eq(workflowInstances.id, issue.originId))
            .then((rows) => rows[0] ?? null);

          if (wf) {
            workflowCtx = {
              instanceId: wf.id,
              instanceName: wf.name,
              templateName: "Paperclip SOP", // simplified
            };
          }
        }

        // 4. Build standard payload
        // Determine the base URL from env, default back to localhost
        const baseUrl = process.env.PAPERCLIP_BASE_URL || "http://localhost:3100";

        const payload: ApprovalNotification = {
          event,
          issue: {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description,
            status: issue.status,
          },
          workflow: workflowCtx,
          issueUrl: `${baseUrl}/issues/${issue.id}`,
          approval: approvalData ? { ...approvalData } : null,
          timestamp: new Date().toISOString(),
        };

        // 5. Fan-out to all configured and enabled channels
        const dispatchPromises = channels.map(async (channelRow) => {
          const channelImpl = getNotificationChannel(channelRow.type);
          if (!channelImpl) {
            logger.warn({ type: channelRow.type }, "Unknown notification channel type in database");
            return;
          }

          const config: NotificationChannelConfig = {
            id: channelRow.id,
            type: channelRow.type as any,
            name: channelRow.name,
            enabled: channelRow.enabled,
            settings: channelRow.settings as Record<string, unknown>,
          };

          const result = await channelImpl.send(payload, config);
          if (!result.ok) {
            logger.error(
              { channelId: channelRow.id, error: result.error },
              "Failed to dispatch notification to channel",
            );
          }
        });

        await Promise.allSettled(dispatchPromises);
      } catch (err) {
        logger.error({ err, issueId, event }, "Unhandled error in notification dispatcher");
      }
    },
  };
}
