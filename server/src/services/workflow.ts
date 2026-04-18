import { and, eq, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { workflowTemplates, workflowInstances } from "@paperclipai/db";
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
     * Instantiate a workflow template: creates all Issues with proper
     * blockedBy relations, and returns the workflow instance record.
     *
     * `issueCreate` is injected so this service stays decoupled from
     * the full issues service (easier to test and avoids circular deps).
     */
    instantiate: async (input: InstantiateInput, issueCreate: IssueServiceCreateFn) => {
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
      const sorted = topoSort(nodes);

      // nodeId -> created issue id
      const nodeIssueMap: Record<string, string> = {};

      for (const node of sorted) {
        const title = interpolate(node.title, input.variables);
        const description = node.description
          ? interpolate(node.description, input.variables)
          : null;

        // Resolve blockedBy node IDs to already-created issue IDs
        const blockedByIssueIds = (node.blockedBy ?? [])
          .map((depNodeId) => nodeIssueMap[depNodeId])
          .filter(Boolean) as string[];

        const issue = await issueCreate(input.companyId, {
          title,
          description,
          status: "backlog",
          // approval_gate nodes are assigned to the human user
          assigneeUserId: node.type === "approval_gate" ? (input.createdByUserId ?? null) : null,
          projectId: input.projectId ?? null,
          goalId: input.goalId ?? null,
          blockedByIssueIds,
          originKind: "workflow",
          originId: input.templateId,
        });

        nodeIssueMap[node.id] = issue.id;
      }

      // Persist the workflow instance
      const instanceName = interpolate(template.name, input.variables);
      const [instance] = await db
        .insert(workflowInstances)
        .values({
          companyId: input.companyId,
          templateId: input.templateId,
          name: instanceName,
          status: "active",
          variables: input.variables,
          nodeIssueMap,
          createdByUserId: input.createdByUserId ?? null,
        })
        .returning();

      return { instance, nodeIssueMap };
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
