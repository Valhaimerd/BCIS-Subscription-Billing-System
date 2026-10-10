CREATE TYPE "public"."backup_operation" AS ENUM('BACKUP', 'SAFETY_BACKUP', 'RESTORE');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "application_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"backup_retention_count" integer DEFAULT 10 NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_settings_singleton_check" CHECK ("application_settings"."id" = 1),
	CONSTRAINT "application_settings_retention_check" CHECK ("application_settings"."backup_retention_count" between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "backup_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" "backup_operation" NOT NULL,
	"status" "backup_status" NOT NULL,
	"backup_name" text NOT NULL,
	"source_backup_name" text,
	"manifest" jsonb,
	"message" text NOT NULL,
	"initiated_by_user_id" uuid,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_history" ADD CONSTRAINT "backup_history_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "backup_history_name_operation_unique" ON "backup_history" USING btree ("backup_name","operation");--> statement-breakpoint
CREATE INDEX "backup_history_completed_at_index" ON "backup_history" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "payments_status_date_index" ON "payments" USING btree ("status","payment_date");