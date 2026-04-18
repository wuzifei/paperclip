CREATE TABLE IF NOT EXISTS "notification_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_channels_company_idx" ON "notification_channels" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_channels_type_idx" ON "notification_channels" USING btree ("type");
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
