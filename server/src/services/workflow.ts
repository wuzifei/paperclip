import { randomUUID } from "node:crypto";
import { and, eq, desc, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, workflowTemplates, workflowInstances } from "@paperclipai/db";
import type { WorkflowNodeDef } from "@paperclipai/db/schema/workflow_templates";
import { notFound, unprocessable } from "../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstantiateInput {
  companyId: string;
  templateId: string;
  variables: Record<string, string>;
  createdByUserId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
}

interface IssueServiceCreateFn {
  (
    companyId: string,
    data: {
      title: string;
      description?: string | null;
      status?: string;
      assigneeAgentId?: string | null;
      assigneeUserId?: string | null;
      projectId?: string | null;
      goalId?: string | null;
      blockedByIssueIds?: string[];
      originKind?: string;
      originId?: string;
    },
  ): Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace {{var}} placeholders in a string with supplied variables. */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? `{{${key}}}`);
}

/** Topological sort of workflow nodes to ensure parents are created first. */
function topoSort(nodes: WorkflowNodeDef[]): WorkflowNodeDef[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const sorted: WorkflowNodeDef[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) return;
    for (const depId of node.blockedBy ?? []) {
      visit(depId);
    }
    sorted.push(node);
  }

  for (const node of nodes) {
    visit(node.id);
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function workflowService(db: Db) {
  return {
    // ---- Template CRUD ----

    listTemplates: async (companyId: string) => {
      return db
        .select()
        .from(workflowTemplates)
        .where(eq(workflowTemplates.companyId, companyId))
        .orderBy(desc(workflowTemplates.createdAt));
    },

    getTemplate: async (companyId: string, templateId: string) => {
      const row = await db
        .select()
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.id, templateId),
            eq(workflowTemplates.companyId, companyId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!row) throw notFound("Workflow template not found");
      return row;
    },

    createTemplate: async (
      companyId: string,
      data: { name: string; description?: string | null; nodes: WorkflowNodeDef[]; createdByUserId?: string | null },
    ) => {
      // Validate node references
      const nodeIds = new Set(data.nodes.map((n) => n.id));
      for (const node of data.nodes) {
        for (const dep of node.blockedBy ?? []) {
          if (!nodeIds.has(dep)) {
            throw unprocessable(`Node "${node.id}" references unknown dependency "${dep}"`);
          }
        }
      }

      const [created] = await db
        .insert(workflowTemplates)
        .values({
          companyId,
          name: data.name,
          description: data.description ?? null,
          nodes: data.nodes,
          createdByUserId: data.createdByUserId ?? null,
        })
        .returning();
      return created;
    },

    updateTemplate: async (
      companyId: string,
      templateId: string,
      data: { name?: string; description?: string | null; nodes?: WorkflowNodeDef[] },
    ) => {
      if (data.nodes) {
        const nodeIds = new Set(data.nodes.map((n) => n.id));
        for (const node of data.nodes) {
          for (const dep of node.blockedBy ?? []) {
            if (!nodeIds.has(dep)) {
              throw unprocessable(`Node "${node.id}" references unknown dependency "${dep}"`);
            }
          }
        }
      }

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (data.name !== undefined) patch.name = data.name;
      if (data.description !== undefined) patch.description = data.description;
      if (data.nodes !== undefined) patch.nodes = data.nodes;

      const [updated] = await db
        .update(workflowTemplates)
        .set(patch)
        .where(
          and(
            eq(workflowTemplates.id, templateId),
            eq(workflowTemplates.companyId, companyId),
          ),
        )
        .returning();
      if (!updated) throw notFound("Workflow template not found");
      return updated;
    },

    deleteTemplate: async (companyId: string, templateId: string) => {
      const [deleted] = await db
        .delete(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.id, templateId),
            eq(workflowTemplates.companyId, companyId),
          ),
        )
        .returning();
      if (!deleted) throw notFound("Workflow template not found");
      return deleted;
    },

    // ---- Instance (Instantiation) ----

    /**
     * v2 Single-Issue Model:
     * Instantiate a workflow template by creating ONE issue that travels
     * through multiple assignees as it progresses through the pipeline.
     *
     * - Finds the first node (no blockedBy dependencies)
     * - Creates a single Issue assigned to matching agent for that node
     * - Records issueId + currentNodeId on the workflow instance
     */
    instantiate: async (
      input: InstantiateInput,
      issueCreate: IssueServiceCreateFn,
    ) => {
      const template = await db
        .select()
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.id, input.templateId),
            eq(workflowTemplates.companyId, input.companyId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!template) throw notFound("Workflow template not found");

      const nodes = template.nodes as WorkflowNodeDef[];
      if (nodes.length === 0) throw unprocessable("Workflow template has no nodes");

      // Find the first node: entry node with no blockedBy dependencies
      const firstNode = nodes.find((n) => (n.blockedBy ?? []).length === 0);
      if (!firstNode) throw unprocessable("Workflow template has no entry node (cycle detected)");

      const instanceId = randomUUID();
      const instanceName = interpolate(template.name, input.variables);
      // Use user-provided title from variables if available, otherwise use node title
      const issueTitle = input.variables.title
        ? input.variables.title
        : interpolate(firstNode.title, input.variables);
      const description = firstNode.description
        ? interpolate(firstNode.description, input.variables)
        : null;

      // Find matching agent by assigneeAgentId
      const agent = await db
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.companyId, input.companyId),
            eq(agents.id, firstNode.assigneeAgentId),
            ne(agents.status, "terminated"),
          ),
        )
        .then((rows) => rows[0] ?? null);

      // Create the single issue representing the whole pipeline run
      // Use user-provided title directly, without [instanceName] prefix
      const issue = await issueCreate(input.companyId, {
        title: issueTitle,
        description,
        status: "todo",
        assigneeAgentId: agent?.id ?? undefined,
        projectId: input.projectId ?? null,
        goalId: input.goalId ?? null,
        originKind: "workflow",
        originId: instanceId,
      });

      // Persist the workflow instance with issue binding
      const [instance] = await db
        .insert(workflowInstances)
        .values({
          id: instanceId,
          companyId: input.companyId,
          templateId: input.templateId,
          name: instanceName,
          status: "active",
          variables: input.variables,
          nodeIssueMap: { [firstNode.id]: issue.id },
          issueId: issue.id,
          currentNodeId: firstNode.id,
          createdByUserId: input.createdByUserId ?? null,
        })
        .returning();

      return { instance, issueId: issue.id };
    },

    // ---- Instance queries ----

    listInstances: async (companyId: string) => {
      return db
        .select()
        .from(workflowInstances)
        .where(eq(workflowInstances.companyId, companyId))
        .orderBy(desc(workflowInstances.createdAt));
    },

    getInstance: async (companyId: string, instanceId: string) => {
      const row = await db
        .select()
        .from(workflowInstances)
        .where(
          and(
            eq(workflowInstances.id, instanceId),
            eq(workflowInstances.companyId, companyId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!row) throw notFound("Workflow instance not found");
      return row;
    },

    updateInstanceStatus: async (companyId: string, instanceId: string, status: string) => {
      const [updated] = await db
        .update(workflowInstances)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            eq(workflowInstances.id, instanceId),
            eq(workflowInstances.companyId, companyId),
          ),
        )
        .returning();
      if (!updated) throw notFound("Workflow instance not found");
      return updated;
    },
  };
}
