ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "reminder_suppressed" boolean NOT NULL DEFAULT false;
