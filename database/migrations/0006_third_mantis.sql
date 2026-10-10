CREATE TYPE "public"."reconnection_status" AS ENUM('REQUESTED', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "delinquency_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"grace_period_days" integer DEFAULT 7 NOT NULL,
	"suspension_threshold_days" integer DEFAULT 60 NOT NULL,
	"reconnection_fee_centavos" bigint DEFAULT 0 NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delinquency_settings_singleton_check" CHECK ("delinquency_settings"."id" = 1),
	CONSTRAINT "delinquency_settings_values_check" CHECK ("delinquency_settings"."grace_period_days" >= 0 and "delinquency_settings"."suspension_threshold_days" >= "delinquency_settings"."grace_period_days" and "delinquency_settings"."reconnection_fee_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reconnection_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"suspension_record_id" uuid,
	"status" "reconnection_status" DEFAULT 'REQUESTED' NOT NULL,
	"reason" text NOT NULL,
	"technician" text NOT NULL,
	"request_date" date NOT NULL,
	"completion_date" date,
	"fee_centavos" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"approved_by_user_id" uuid,
	"completed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconnection_records_fee_nonnegative_check" CHECK ("reconnection_records"."fee_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suspension_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"effective_date" date NOT NULL,
	"notes" text,
	"approved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delinquency_settings" ADD CONSTRAINT "delinquency_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_suspension_record_id_suspension_records_id_fk" FOREIGN KEY ("suspension_record_id") REFERENCES "public"."suspension_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconnection_records_service_date_index" ON "reconnection_records" USING btree ("service_account_id","request_date");--> statement-breakpoint
CREATE UNIQUE INDEX "reconnection_records_open_service_unique" ON "reconnection_records" USING btree ("service_account_id") WHERE "reconnection_records"."status" = 'REQUESTED';--> statement-breakpoint
CREATE INDEX "suspension_records_service_date_index" ON "suspension_records" USING btree ("service_account_id","effective_date");
--> statement-breakpoint
INSERT INTO "delinquency_settings" ("id", "grace_period_days", "suspension_threshold_days", "reconnection_fee_centavos") VALUES (1, 7, 60, 50000) ON CONFLICT ("id") DO NOTHING;
