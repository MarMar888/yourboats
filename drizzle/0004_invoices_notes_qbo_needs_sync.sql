ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "qbo_needs_sync" boolean NOT NULL DEFAULT false;
