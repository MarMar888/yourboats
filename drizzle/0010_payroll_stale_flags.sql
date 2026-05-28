ALTER TABLE "payroll" ADD COLUMN IF NOT EXISTS "stale_at" timestamp;
ALTER TABLE "payroll" ADD COLUMN IF NOT EXISTS "stale_reason" text;
