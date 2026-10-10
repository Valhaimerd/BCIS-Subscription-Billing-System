CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'GCASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING_VERIFICATION', 'POSTED', 'REJECTED', 'REVERSED');--> statement-breakpoint
ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'PAYMENT_CREDIT';--> statement-breakpoint
ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'PAYMENT_REVERSAL_DEBIT';--> statement-breakpoint
CREATE SEQUENCE "public"."receipt_number_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 5001 CACHE 1;--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_amount_positive_check" CHECK ("payment_allocations"."amount_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_path" text NOT NULL,
	"checksum_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_proofs_size_positive_check" CHECK ("payment_proofs"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" NOT NULL,
	"reference_number" text,
	"sender_details" text,
	"notes" text,
	"payment_date" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_by_user_id" uuid,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive_check" CHECK ("payments"."amount_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"receipt_number" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "payment_reversal_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_payment_invoice_unique" ON "payment_allocations" USING btree ("payment_id","invoice_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_index" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_proofs_payment_unique" ON "payment_proofs" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_proofs_storage_path_unique" ON "payment_proofs" USING btree ("storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reversals_payment_unique" ON "payment_reversals" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_subscriber_date_index" ON "payments" USING btree ("subscriber_id","payment_date");--> statement-breakpoint
CREATE INDEX "payments_status_index" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_reference_index" ON "payments" USING btree ("reference_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gcash_reference_unique" ON "payments" USING btree ("reference_number") WHERE "payments"."method" = 'GCASH' and "payments"."reference_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_payment_unique" ON "receipts" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_number_unique" ON "receipts" USING btree ("receipt_number");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_reversal_id_payment_reversals_id_fk" FOREIGN KEY ("payment_reversal_id") REFERENCES "public"."payment_reversals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_payment_type_unique" ON "ledger_entries" USING btree ("payment_id","entry_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_payment_reversal_unique" ON "ledger_entries" USING btree ("payment_reversal_id");