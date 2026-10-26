-- FloatCTF 标准退出（Back-Channel Logout 1.0）：Better Auth 会话 ↔ FloatCTF 身份会话 (iss, sid) 映射与 jti 防重放。
-- 注意：profiles 表由 db/schema.sql 创建，不在这里重复创建（drizzle 快照里登记它只是为了后续 diff 正确）。
CREATE TABLE "floatctf_logout_jti" (
	"issuer" text NOT NULL,
	"jti" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floatctf_logout_jti_issuer_jti_pk" PRIMARY KEY("issuer","jti")
);
--> statement-breakpoint
CREATE TABLE "floatctf_oidc_sessions" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"sid" text,
	"id_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "floatctf_oidc_sessions" ADD CONSTRAINT "floatctf_oidc_sessions_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "floatctf_oidc_sessions_issuer_sid_idx" ON "floatctf_oidc_sessions" USING btree ("issuer","sid");--> statement-breakpoint
CREATE INDEX "floatctf_oidc_sessions_issuer_subject_idx" ON "floatctf_oidc_sessions" USING btree ("issuer","subject");