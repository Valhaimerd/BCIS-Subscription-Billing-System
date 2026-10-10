CREATE TYPE "public"."contact_type" AS ENUM('MOBILE', 'EMAIL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."service_account_status" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "collection_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collector_area_assignments" (
	"collector_id" uuid NOT NULL,
	"collection_area_id" uuid NOT NULL,
	CONSTRAINT "collector_area_assignments_collector_id_collection_area_id_pk" PRIMARY KEY("collector_id","collection_area_id")
);
--> statement-breakpoint
CREATE TABLE "collectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"contact_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" text NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"installation_address_id" uuid,
	"assigned_collector_id" uuid,
	"current_rate_centavos" bigint NOT NULL,
	"billing_day" integer NOT NULL,
	"activation_date" timestamp with time zone,
	"status" "service_account_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "service_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"service_account_id" uuid NOT NULL,
	"previous_status" "service_account_status",
	"new_status" "service_account_status" NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_type_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price_centavos" bigint NOT NULL,
	"speed_mbps" integer,
	"channel_count" integer,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address_line" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"type" "contact_type" NOT NULL,
	"value" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriber_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"subscriber_id" uuid NOT NULL,
	"previous_status" "subscriber_status",
	"new_status" "subscriber_status" NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" text NOT NULL,
	"full_name" text NOT NULL,
	"status" "subscriber_status" DEFAULT 'ACTIVE' NOT NULL,
	"collection_area_id" uuid,
	"assigned_collector_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collector_area_assignments" ADD CONSTRAINT "collector_area_assignments_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_area_assignments" ADD CONSTRAINT "collector_area_assignments_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_plan_id_service_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."service_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_installation_address_id_subscriber_addresses_id_fk" FOREIGN KEY ("installation_address_id") REFERENCES "public"."subscriber_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_assigned_collector_id_collectors_id_fk" FOREIGN KEY ("assigned_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_addresses" ADD CONSTRAINT "subscriber_addresses_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_contacts" ADD CONSTRAINT "subscriber_contacts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_events" ADD CONSTRAINT "subscriber_events_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_events" ADD CONSTRAINT "subscriber_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_assigned_collector_id_collectors_id_fk" FOREIGN KEY ("assigned_collector_id") REFERENCES "public"."collectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_areas_code_unique" ON "collection_areas" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "collectors_code_unique" ON "collectors" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "service_accounts_account_number_unique" ON "service_accounts" USING btree ("account_number");--> statement-breakpoint
CREATE INDEX "service_accounts_subscriber_index" ON "service_accounts" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "service_accounts_status_index" ON "service_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "service_events_account_index" ON "service_events" USING btree ("service_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_plans_code_unique" ON "service_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "service_plans_type_index" ON "service_plans" USING btree ("service_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_types_code_unique" ON "service_types" USING btree ("code");--> statement-breakpoint
CREATE INDEX "subscriber_addresses_subscriber_index" ON "subscriber_addresses" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "subscriber_contacts_subscriber_index" ON "subscriber_contacts" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "subscriber_events_subscriber_index" ON "subscriber_events" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_account_number_unique" ON "subscribers" USING btree ("account_number");--> statement-breakpoint
CREATE INDEX "subscribers_full_name_index" ON "subscribers" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "subscribers_status_index" ON "subscribers" USING btree ("status");