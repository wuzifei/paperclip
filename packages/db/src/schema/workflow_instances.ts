import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { workflowTemplates } from "./workflow_templates.js";

/**
 * A running instance of a workflow template.
 *
 * Created when a user instantiates an SOP template with concrete
 * variable substitutions (e.g. feature_name = "发音评分模块").
 *
 * `nodeIssueMap` tracks the mapping from template node IDs to the
 * actual issue IDs that were created:
 *   { [nodeId: string]: issueId (uuid string) }
 *
 * `status`:
 *   - "active"    : pipeline is running, some nodes still pending
 *   - "completed" : all nodes resolved (done / cancelled)
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
