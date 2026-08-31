-- Adds an hourly billing type for labor-based add-ons, splits recurring
-- plans into interior-only vs interior+exterior scope, and removes two
-- catalog entries that don't belong in the boat quote tool.
--
-- Note: production briefly had 'per_hour' added directly onto rate_type
-- before switching to the dedicated quote_rate_type enum below; that value
-- is harmless and unused (Postgres can't drop enum values without
-- recreating the type). A fresh run of this migration won't have it.

-- rate_type is also used by service_boats' per-boat rate overrides
-- (unrelated to the quote tool), so the quote catalog gets its own enum
-- instead of adding 'per_hour' onto that shared type.
CREATE TYPE "quote_rate_type" AS ENUM ('per_ft', 'flat', 'per_hour');

ALTER TABLE "quote_services"
  ALTER COLUMN "billing_type" DROP DEFAULT,
  ALTER COLUMN "billing_type" TYPE quote_rate_type USING billing_type::text::quote_rate_type,
  ALTER COLUMN "billing_type" SET DEFAULT 'flat';

ALTER TABLE "quote_addons"
  ALTER COLUMN "billing_type" DROP DEFAULT,
  ALTER COLUMN "billing_type" TYPE quote_rate_type USING billing_type::text::quote_rate_type,
  ALTER COLUMN "billing_type" SET DEFAULT 'flat';

-- Hourly add-ons. The wizard doesn't collect a job duration, so these bill
-- for one assumed hour as the instant-quote baseline; actual time (and
-- price) is confirmed at the job. Rates here are working estimates, not
-- published numbers, review and adjust from the staff pricing tab.
UPDATE "quote_addons" SET billing_type = 'per_hour', rate = 55.00, min_price = NULL
  WHERE key = 'addon_engine_bay';
UPDATE "quote_addons" SET billing_type = 'per_hour', rate = 60.00, min_price = NULL
  WHERE key = 'addon_bilge';
UPDATE "quote_addons" SET billing_type = 'per_hour', rate = 50.00, min_price = NULL,
  description = 'Treats and removes surface rust stains. Billed hourly.'
  WHERE key = 'addon_rust_removal';
UPDATE "quote_addons" SET billing_type = 'per_hour', rate = 50.00, min_price = NULL,
  description = 'Pumps standing water out of the boat. Billed hourly.'
  WHERE key = 'addon_water_pumpout';

-- Wide Beam Surcharge: removed, beam will be computed into the boat's rate
-- directly instead of a manual customer-facing checkbox.
UPDATE "quote_addons" SET active = false WHERE key = 'addon_wide_beam';

-- Powerwashing: the published $0.45/sqft rate is for non-boat surfaces
-- (docks, siding, driveways), not boat hulls, so it doesn't belong in the
-- boat quote catalog.
UPDATE "quote_services" SET active = false WHERE key = 'powerwashing';

-- Recurring plans: split each frequency into interior-only vs
-- interior+exterior (down to the waterline) scope. Interior+exterior keeps
-- the existing published per-ft rate; interior-only rates are a working
-- estimate (roughly 60% of the full rate), review and adjust from the
-- staff pricing tab.
UPDATE "quote_services" SET name = 'Weekly: Interior + Exterior (to Waterline)',
  description = 'Interior clean plus exterior hull wash down to the waterline, with glass and stainless care.',
  sort_order = 2
  WHERE key = 'recurring_weekly';
UPDATE "quote_services" SET name = 'Biweekly: Interior + Exterior (to Waterline)',
  description = 'Interior clean plus exterior hull wash down to the waterline, with glass and stainless care. Twice a month.',
  sort_order = 4
  WHERE key = 'recurring_biweekly';
UPDATE "quote_services" SET name = 'Monthly: Interior + Exterior (to Waterline)',
  description = 'Interior clean plus exterior hull wash down to the waterline, with glass and stainless care. Once a month.',
  sort_order = 6
  WHERE key = 'recurring_monthly';

INSERT INTO "quote_services" ("key", "category", "name", "description", "billing_type", "rate", "min_price", "sort_order") VALUES
  ('recurring_weekly_interior', 'recurring', 'Weekly: Interior Only', 'Interior clean: vinyl, flooring, and dashboard care, trash removed, cabin tidied.', 'per_ft', 3.00, NULL, 1),
  ('recurring_biweekly_interior', 'recurring', 'Biweekly: Interior Only', 'Interior clean: vinyl, flooring, and dashboard care, trash removed, cabin tidied. Twice a month.', 'per_ft', 3.75, NULL, 3),
  ('recurring_monthly_interior', 'recurring', 'Monthly: Interior Only', 'Interior clean: vinyl, flooring, and dashboard care, trash removed, cabin tidied. Once a month.', 'per_ft', 5.50, NULL, 5);
