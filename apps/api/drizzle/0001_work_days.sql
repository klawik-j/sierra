CREATE TABLE "work_days" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"minutes" integer NOT NULL,
	"note" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_days_org_id_user_id_date_pk" PRIMARY KEY("org_id","user_id","date")
);
--> statement-breakpoint
ALTER TABLE "work_days" ADD CONSTRAINT "work_days_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_days" ADD CONSTRAINT "work_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_days" ADD CONSTRAINT "work_days_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_days_org_id_date_index" ON "work_days" USING btree ("org_id","date");