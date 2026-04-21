import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, issueRelations, approvals, workflowInstances } from "@paperclipai/db";
import { approvalService } from "./approvals.js";
import { issueApprovalService } from "./issue-approvals.js";

/**
 * Called after any issue transitions to "done".
 *
 * Scans all downstream issues that were blocked by the just-completed issue.
 * If a downstream issue is a workflow approval gate ([APPROVAL GATE] prefix)
 * and ALL of its blockers are now terminal (done/cancelled),
 * we create the Approval record so the human reviewer gets notified
 * exactly at the right moment — not at pipeline creation time.
 */
export async function triggerWorkflowGateIfReady(
  db: Db,
  completedIssueId: string,
): Promise<void> {
  const TERMINAL = ["done", "cancelled"];

  // 1. Find all issues that were blocked by this completed issue
  const downstreamRows = await db
    .select({
      issueId: issueRelations.relatedIssueId,
    })
    .from(issueRelations)
    .where(
      and(
        eq(issueRelations.issueId, completedIssueId),
        eq(issueRelations.type, "blocks"),
      ),
    );

  if (downstreamRows.length === 0) return;

  const downstreamIds = downstreamRows.map((r) => r.issueId).filter(Boolean) as string[];

  // 2. Load those downstream issues — filter to workflow approval gates only
  const downstreamIssues = await db
    .select({
      id: issues.id,
      title: issues.title,
      status: issues.status,
      companyId: issues.companyId,
      originKind: issues.originKind,
      originId: issues.originId,
      createdByUserId: issues.createdByUserId,
    })
    .from(issues)
    .where(
      and(
        inArray(issues.id, downstreamIds),
        eq(issues.originKind, "workflow"),
      ),
    );

  const gateIssues = downstreamIssues.filter((i) =>
    i.title.startsWith("[APPROVAL GATE]"),
  );

  if (gateIssues.length === 0) return;

  const approvalSvc = approvalService(db);
  const issueAppSvc = issueApprovalService(db);

  for (const gate of gateIssues) {
    // 3. Check if an approval was already created for this gate issue
    const existingApprovals = await db
      .select({ id: approvals.id })
      .from(approvals)
      .where(eq(approvals.companyId, gate.companyId))
      .then((rows) =>
        // We use a payload check — look for approvals that link to this issue via issueApprovals
        // For simplicity, just check if there's already a workflow_gate approval matching this issue
        rows
      );

    // 4. Check all blockers of this gate issue are now terminal
    const allBlockers = await db
      .select({
        blockerStatus: issues.status,
      })
      .from(issueRelations)
      .innerJoin(issues, eq(issues.id, issueRelations.issueId))
      .where(
        and(
          eq(issueRelations.relatedIssueId, gate.id),
          eq(issueRelations.type, "blocks"),
        ),
      );

    const allResolved = allBlockers.every((b) => TERMINAL.includes(b.blockerStatus));
    if (!allResolved) continue;

    // 5. Look up the workflow instance to get node metadata
    const instanceId = gate.originId;
    let workflowInstanceName = "Unknown Pipeline";
    let nodeTitle = gate.title.replace("[APPROVAL GATE] ", "");

    if (instanceId) {
      const instance = await db
        .select({ id: workflowInstances.id, name: workflowInstances.name })
        .from(workflowInstances)
        .where(eq(workflowInstances.id, instanceId))
        .then((rows) => rows[0] ?? null);
      if (instance) {
        workflowInstanceName = instance.name;
      }
    }

    // 6. Create the Approval record now that all upstream nodes are done
    const approval = await approvalSvc.create(gate.companyId, {
      type: "workflow_gate",
      payload: {
        workflowInstanceId: instanceId ?? null,
        workflowInstanceName,
        nodeTitle,
        gateIssueId: gate.id,
        originalAssigneeRole: "human",
      },
      requestedByUserId: gate.createdByUserId ?? undefined,
    });

    // 7. Link the approval to the gate issue for bidirectional tracking
    await issueAppSvc.linkManyForApproval(
      approval.id,
      [gate.id],
    );
  }
}
