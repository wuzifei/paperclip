CREATE TABLE IF NOT EXISTS "workflow_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "nodes" jsonb NOT NULL,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_templates_company_idx" ON "workflow_templates" USING btree ("company_id");
--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "node_issue_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_instances_company_idx" ON "workflow_instances" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_instances_template_idx" ON "workflow_instances" USING btree ("template_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_instances_status_idx" ON "workflow_instances" USING btree ("company_id", "status");
--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE no action ON UPDATE no action;
