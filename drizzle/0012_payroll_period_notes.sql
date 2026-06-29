CREATE TABLE IF NOT EXISTS "payroll_period_notes" (
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "notes" text NOT NULL DEFAULT '',
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "updated_by_user_id" text,
  CONSTRAINT "payroll_period_notes_pkey" PRIMARY KEY ("period_start", "period_end")
);
