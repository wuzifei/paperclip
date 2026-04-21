import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * SOP Workflow Template definition.
 *
 * Each template describes a reusable pipeline (DAG of nodes).
 * `nodes` is a JSONB array conforming to the WorkflowNodeDef[] type:
 *
 *   { id, type, title, assigneeAgentId, description?, blockedBy? }
 *
 * Templates are company-scoped so different companies can have
 * independent SOP libraries.
 */

export interface WorkflowNodeDef {
  id: string;
  type: "task" | "approval_gate";
  title: string;
  assigneeAgentId: string;
  assigneeRole?: string;
  description?: string;
  blockedBy?: string[];
  position?: { x: number; y: number };
}

export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    description: text("description"),
    nodes: jsonb("nodes").$type<WorkflowNodeDef[]>().notNull(),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("workflow_templates_company_idx").on(table.companyId),
  }),
);
