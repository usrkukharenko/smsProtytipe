CREATE TABLE IF NOT EXISTS "auth_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"phone" text,
	"ip" text,
	"user_agent" text,
	"event" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "banned_ips" (
	"ip" text PRIMARY KEY NOT NULL,
	"reason" text,
	"banned_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gateway_devices" (
	"device_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp,
	"battery_level" integer,
	"signal_strength" integer,
	"sim_info" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sms_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" text,
	"phone" text,
	"success" boolean NOT NULL,
	"error" text,
	"device_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	"is_banned" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_log" ADD CONSTRAINT "auth_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
