CREATE TYPE "public"."collection_batch_status" AS ENUM('OPEN', 'IN_PROGRESS', 'SUBMITTED', 'REMITTED', 'RECONCILED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "collection_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collector_id" uuid NOT NULL,
	"collection_area_id" uuid NOT NULL,
	"batch_date" date NOT NULL,
	"status" "collection_batch_status" DEFAULT 'OPEN' NOT NULL,
	"created_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"remitted_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"reconciled_by_user_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "batch_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"service_account_id" uuid NOT NULL,
	"subscriber_account_number" text NOT NULL,
	"subscriber_name" text NOT NULL,
	"service_account_number" text NOT NULL,
	"route_address" text NOT NULL,
	"current_bill_centavos" bigint NOT NULL,
	"arrears_centavos" bigint NOT NULL,
	"total_due_centavos" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_accounts_amounts_nonnegative_check" CHECK ("batch_accounts"."current_bill_centavos" >= 0 and "batch_accounts"."arrears_centavos" >= 0 and "batch_accounts"."total_due_centavos" >= 0),
	CONSTRAINT "batch_accounts_total_check" CHECK ("batch_accounts"."total_due_centavos" = "batch_accounts"."current_bill_centavos" + "batch_accounts"."arrears_centavos")
);--> statement-breakpoint
CREATE TABLE "collector_remittances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"notes" text,
	"recorded_by_user_id" uuid,
	"remitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collector_remittances_amount_nonnegative_check" CHECK ("collector_remittances"."amount_centavos" >= 0)
);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "batch_account_id" uuid;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_reconciled_by_user_id_users_id_fk" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_accounts" ADD CONSTRAINT "batch_accounts_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_accounts" ADD CONSTRAINT "batch_accounts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_accounts" ADD CONSTRAINT "batch_accounts_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_remittances" ADD CONSTRAINT "collector_remittances_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_remittances" ADD CONSTRAINT "collector_remittances_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_batch_account_id_batch_accounts_id_fk" FOREIGN KEY ("batch_account_id") REFERENCES "public"."batch_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_batches_route_date_unique" ON "collection_batches" USING btree ("collector_id","collection_area_id","batch_date");--> statement-breakpoint
CREATE INDEX "collection_batches_status_date_index" ON "collection_batches" USING btree ("status","batch_date");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_accounts_batch_service_unique" ON "batch_accounts" USING btree ("batch_id","service_account_id");--> statement-breakpoint
CREATE INDEX "batch_accounts_subscriber_index" ON "batch_accounts" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collector_remittances_batch_unique" ON "collector_remittances" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_batch_account_unique" ON "payments" USING btree ("batch_account_id");
