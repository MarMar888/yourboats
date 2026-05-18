-- Migration: convert service_type from enum → text; add qbo_item_id to services
--
-- The service_type column was a PostgreSQL enum but now stores free-text QBO
-- product names (or legacy enum values). qbo_item_id stores the exact QBO item
-- ID chosen at service-creation time so invoicing never needs fuzzy matching.

ALTER TABLE "services"
  ALTER COLUMN "service_type" TYPE text USING "service_type"::text;

ALTER TABLE "recurring_schedules"
  ALTER COLUMN "service_type" TYPE text USING "service_type"::text;

ALTER TABLE "services"
  ADD COLUMN "qbo_item_id" text;
