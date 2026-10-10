CREATE TYPE "public"."billing_cycle_status" AS ENUM('DRAFT', 'FINALIZED');--> statement-breakpoint
CREATE TYPE "public"."invoice_item_type" AS ENUM('SUBSCRIPTION', 'FEE', 'DISCOUNT', 'PENALTY', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'CREDITED');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('INVOICE_DEBIT', 'INVOICE_VOID', 'ADJUSTMENT_DEBIT', 'ADJUSTMENT_CREDIT');--> statement-breakpoint
CREATE SEQUENCE "public"."invoice_number_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adjustments_nonzero_check" CHECK ("adjustments"."amount_centavos" <> 0)
);
--> statement-breakpoint
CREATE TABLE "billing_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"status" "billing_cycle_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_user_id" uuid,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_cycles_period_check" CHECK ("billing_cycles"."period_year" between 2000 and 2200 and "billing_cycles"."period_month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"type" "invoice_item_type" NOT NULL,
	"description" text NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"billing_cycle_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"service_account_id" uuid NOT NULL,
	"service_account_number" text NOT NULL,
	"plan_name" text NOT NULL,
	"billing_period_label" text NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"subtotal_centavos" bigint NOT NULL,
	"total_centavos" bigint NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"finalized_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_totals_check" CHECK ("invoices"."subtotal_centavos" >= 0 and "invoices"."total_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ledger_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"subscriber_id" uuid NOT NULL,
	"invoice_id" uuid,
	"adjustment_id" uuid,
	"entry_type" "ledger_entry_type" NOT NULL,
	"reference" text NOT NULL,
	"description" text NOT NULL,
	"debit_centavos" bigint DEFAULT 0 NOT NULL,
	"credit_centavos" bigint DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amounts_check" CHECK ("ledger_entries"."debit_centavos" >= 0 and "ledger_entries"."credit_centavos" >= 0 and not ("ledger_entries"."debit_centavos" > 0 and "ledger_entries"."credit_centavos" > 0))
);
--> statement-breakpoint
ALTER TABLE "service_accounts" ADD COLUMN "due_day" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD COLUMN "billing_start_date" date DEFAULT '2026-01-01' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "default_billing_day" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "default_due_day" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_adjustment_id_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adjustments_invoice_index" ON "adjustments" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_cycles_period_unique" ON "billing_cycles" USING btree ("period_year","period_month");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_index" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_service_cycle_unique" ON "invoices" USING btree ("service_account_id","billing_cycle_id");--> statement-breakpoint
CREATE INDEX "invoices_subscriber_index" ON "invoices" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "invoices_due_status_index" ON "invoices" USING btree ("due_date","status");--> statement-breakpoint
CREATE INDEX "ledger_entries_subscriber_date_index" ON "ledger_entries" USING btree ("subscriber_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_invoice_type_unique" ON "ledger_entries" USING btree ("invoice_id","entry_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_adjustment_unique" ON "ledger_entries" USING btree ("adjustment_id");--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_billing_days_check" CHECK ("service_accounts"."billing_day" between 1 and 28 and "service_accounts"."due_day" between 1 and 28);--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_billing_days_check" CHECK ("subscribers"."default_billing_day" between 1 and 28 and "subscribers"."default_due_day" between 1 and 28);