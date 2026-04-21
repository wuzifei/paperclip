import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, approvals, issues, workflowInstances, workflowTemplates } from "@paperclipai/db";
import type { WorkflowNodeDef } from "@paperclipai/db/schema/workflow_templates";
import { approvalService } from "./approvals.js";
import { issueApprovalService } from "./issue-approvals.js";
import { heartbeatService } from "./index.js";

/**
 * Advance a workflow pipeline to the next node.
 *
 * Called when an issue transitions to "in_review":
 *   - Find the workflow instance for this issue
 *   - Determine the next node based on currentNodeId
 *   - If next node is a task  → switch assignee to matching agent, set status "todo"
 *   - If next node is a gate  → create Approval record, set status "blocked"
 *   - If no next node        → mark instance as "completed"
 */
export async function advanceWorkflow(db: Db, issueId: string): Promise<void> {
  // 1. Find the workflow instance bound to this issue
  const instance = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.issueId, issueId))
    .then((rows) => rows[0] ?? null);

  if (!instance || instance.status !== "active") return;
  if (!instance.currentNodeId) return;

  // 2. Load template nodes
  const template = await db
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.id, instance.templateId))
    .then((rows) => rows[0] ?? null);

  if (!template) return;

  const nodes = template.nodes as WorkflowNodeDef[];

  // 3. Find the next node(s): nodes whose blockedBy includes currentNodeId
  const nextNodes = nodes.filter((n) =>
    (n.blockedBy ?? []).includes(instance.currentNodeId!),
  );

  // 4. No next node → pipeline complete
  if (nextNodes.length === 0) {
    await db
      .update(workflowInstances)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(workflowInstances.id, instance.id));
    return;
  }

  // Take the first next node (linear pipeline assumption)
  const nextNode = nextNodes[0];

  if (nextNode.type === "task") {
    // 5a. Find a matching agent by assigneeAgentId
    const agent = await db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.companyId, instance.companyId),
          eq(agents.id, nextNode.assigneeAgentId),
          ne(agents.status, "terminated"),
        ),
      )
      .then((rows) => rows[0] ?? null);

    await db
      .update(issues)
      .set({
        assigneeAgentId: agent?.id ?? null,
        assigneeUserId: null,
        status: "todo",
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issueId));

    await db
      .update(workflowInstances)
      .set({ currentNodeId: nextNode.id, updatedAt: new Date() })
      .where(eq(workflowInstances.id, instance.id));

    if (agent?.id) {
      const heartbeat = heartbeatService(db);
      heartbeat.wakeup(agent.id, {
        source: "assignment",
        triggerDetail: "system",
        reason: "workflow_advanced",
        payload: { issueId, mutation: "workflow_advance" },
        contextSnapshot: { issueId, source: "workflow.advance" },
      }).catch((err) => {
        console.error("[workflow-advance] wakeup failed:", err);
      });
    }

  } else if (nextNode.type === "approval_gate") {
    // 5b. Block the issue and create an Approval record
    await db
      .update(issues)
      .set({
        assigneeAgentId: null,
        assigneeUserId: instance.createdByUserId ?? null,
        status: "blocked",
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issueId));

    await db
      .update(workflowInstances)
      .set({ currentNodeId: nextNode.id, updatedAt: new Date() })
      .where(eq(workflowInstances.id, instance.id));

    const approvalSvc = approvalService(db);
    const issueAppSvc = issueApprovalService(db);

    const approval = await approvalSvc.create(instance.companyId, {
      type: "workflow_gate",
      payload: {
        workflowInstanceId: instance.id,
        workflowInstanceName: instance.name,
        nodeId: nextNode.id,
        nodeTitle: nextNode.title,
        gateIssueId: issueId,
        originalAssigneeRole: nextNode.assigneeRole,
      },
      requestedByUserId: instance.createdByUserId ?? undefined,
    });

    await issueAppSvc.linkManyForApproval(approval.id, [issueId]);
  }
}

/**
 * Called after an approval_gate Approval is approved.
 * Advances the workflow past the gate to the next task node.
 */
export async function advanceWorkflowAfterApproval(
  db: Db,
  issueId: string,
): Promise<void> {
  // Re-use the same engine — treat approval as equivalent to in_review signal
  await advanceWorkflow(db, issueId);
}
