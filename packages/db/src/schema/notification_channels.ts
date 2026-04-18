import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Configured notification channels for a company.
 *
 * Each channel corresponds to an integration (e.g. feishu, openclaw, generic)
 * and stores its specific configuration (webhook URLs, credentials).
 */
export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(), // "feishu", "openclaw", "generic"
    enabled: boolean("enabled").notNull().default(true),

    // Integration specific settings (URL, tokens, auth keys)
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),

    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("notification_channels_company_idx").on(table.companyId),
    typeIdx: index("notification_channels_type_idx").on(table.type),
  }),
);
