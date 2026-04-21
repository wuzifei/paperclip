import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { workflowTemplates } from "./workflow_templates.js";

/**
 * A running instance of a workflow template.
 *
 * v2 (single-issue model): one Issue travels through multiple assignees.
 *   - `issueId`       : the single Issue that represents this pipeline run
 *   - `currentNodeId` : which template node the Issue is currently at
 *
 * `nodeIssueMap` is kept for backward-compatibility (legacy multi-issue runs).
 *
 * `status`:
 *   - "active"    : pipeline is running
 *   - "completed" : all nodes have been processed
 *   - "cancelled" : user manually cancelled the whole pipeline
 */

export const workflowInstances = pgTable(
  "workflow_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workflowTemplates.id),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    variables: jsonb("variables").$type<Record<string, string>>().notNull().default({}),
    nodeIssueMap: jsonb("node_issue_map").$type<Record<string, string>>().notNull().default({}),
    // v2 single-issue model
    issueId: uuid("issue_id"),           // the one Issue for this pipeline run
    currentNodeId: text("current_node_id"), // which node the issue is currently at
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("workflow_instances_company_idx").on(table.companyId),
    templateIdx: index("workflow_instances_template_idx").on(table.templateId),
    statusIdx: index("workflow_instances_status_idx").on(table.companyId, table.status),
  }),
);
