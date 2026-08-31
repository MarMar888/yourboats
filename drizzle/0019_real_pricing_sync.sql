-- Syncs the quote catalog to the rates published on squeakycleanboats.com
-- (pulled 2026-08-31). A few services on the live site don't reduce to a
-- clean per-ft or flat rate (step-based, per-sqft, or "contact us" custom
-- quotes); those are called out inline below and were approximated or
-- deactivated rather than guessed at silently.

-- Recurring wash plans: $5/wk, $6/biweekly (twice a month), $9/mo.
UPDATE "quote_services" SET rate = 5.00, min_price = NULL,
  description = 'Exterior wash, glass, and wipe-down every week.'
  WHERE key = 'recurring_weekly';
UPDATE "quote_services" SET rate = 6.00, min_price = NULL,
  description = 'Exterior wash, glass, and wipe-down twice a month.'
  WHERE key = 'recurring_biweekly';
INSERT INTO "quote_services" ("key", "category", "name", "description", "billing_type", "rate", "min_price", "sort_order")
  VALUES ('recurring_monthly', 'recurring', 'Monthly Wash', 'Exterior wash, glass, and wipe-down once a month.', 'per_ft', 9.00, NULL, 3);

-- Full Detail: published rate varies $12 to $16 per ft by boat category
-- (small / sport-surf-ski / cuddy cabin). We use the middle tier as the
-- instant-quote default and note the range, matching the site's own
-- "estimates, finalized at in-person quote" language.
UPDATE "quote_services" SET rate = 14.00, min_price = NULL,
  description = 'Complete hand wash, wax, vacuum, and wipe-down inside and out. Rate varies $12 to $16 per ft by boat type, confirmed at inspection.'
  WHERE key = 'detail_full';

-- Buffing & Waxing: published as $10/ft per step (dry sand, wet sand,
-- compound, polish), plus $2/ft for in-water service. We quote the single-step
-- base rate; actual steps needed are confirmed at inspection.
UPDATE "quote_services" SET rate = 10.00, min_price = NULL,
  description = 'Machine buff and protective wax coat, priced per step (dry sand, wet sand, compound, polish). Steps needed are confirmed at inspection. Adds $2/ft for in-water service.'
  WHERE key = 'buffing_waxing';

-- Acid Wash: maps to the site's onshore stain removal (powder + acid),
-- hull-sides-only tier. Hull plus underside runs $13/ft total onshore.
UPDATE "quote_services" SET rate = 7.00, min_price = NULL,
  description = 'Powder and acid treatment for hull sides, restores faded, chalky gelcoat. Hull plus underside runs $13/ft total, confirmed at inspection.'
  WHERE key = 'acid_washing';

-- Powerwashing: published as $0.45/sqft, not a per-ft rate. Converted to an
-- approximate per-ft rate (0.45 * ~8 sqft of washable surface per ft of
-- length) since the wizard only collects length, not surface area. This
-- conversion factor is an approximation, not a published number; confirm
-- with Marley and adjust the rate here if it's off.
UPDATE "quote_services" SET rate = 3.60, min_price = NULL,
  description = 'High-pressure rinse for the hull, bottom, and lift. Converted from our published $0.45/sqft rate; exact price confirmed at inspection.'
  WHERE key = 'powerwashing';

-- Gel-Coat Repair on the live site is priced per repair (chip repair ~$60 +
-- materials, wet/dry sanding ~$90/sqft + materials, buffing from $50/hr),
-- not a per-ft rate, and the site sends these customers to a custom quote.
-- Deactivating rather than forcing a per-ft number that would misquote
-- badly; still editable/reactivatable from the staff pricing tab.
UPDATE "quote_services" SET active = false,
  description = 'Heavy-duty wet-sand and polish for deeply oxidized gelcoat. Priced per repair (materials plus labor), not a per-foot rate. Handle as a custom quote instead of the instant tool.'
  WHERE key = 'gelcoat_wetsanding';

-- Ceramic Coating: published as $10/ft flat, no minimum.
UPDATE "quote_services" SET rate = 10.00, min_price = NULL,
  description = 'SIO2 spray-based coating applied after a full detail. Not a true ceramic coating.'
  WHERE key = 'ceramic_coating';

-- Add-ons: Carpet Shampoo and Chrome/Stainless Polish are published as
-- per-ft add-ons on the Detailing page, not flat rates.
UPDATE "quote_addons" SET billing_type = 'per_ft', rate = 2.00, min_price = NULL
  WHERE key = 'addon_carpet_shampoo';
UPDATE "quote_addons" SET billing_type = 'per_ft', rate = 2.00, min_price = NULL,
  description = 'Polish rails, cleats, and other stainless or chrome hardware.'
  WHERE key = 'addon_stainless';

-- New add-ons published on the Detailing page that weren't in the catalog yet.
INSERT INTO "quote_addons" ("key", "name", "description", "billing_type", "rate", "min_price", "requires_attribute", "sort_order") VALUES
  ('addon_rust_removal', 'Rust Removal', 'Treats and removes surface rust stains.', 'per_ft', 2.00, NULL, NULL, 9),
  ('addon_water_pumpout', 'Water Pumpout', 'Pumps standing water out of the boat.', 'per_ft', 3.00, NULL, NULL, 10),
  ('addon_prop_polish', 'Prop & Outdrive Polish', 'Polishes the prop and outdrive. Requires the boat out of water.', 'per_ft', 3.00, NULL, NULL, 11),
  ('addon_cover_wash', 'Cover Wash (Sealant Safe)', 'Washes the boat cover with a sealant-safe process.', 'per_ft', 2.00, NULL, NULL, 12),
  ('addon_wide_beam', 'Wide Beam Surcharge (9ft+)', 'Applies if your boat''s beam is over 9 feet wide.', 'per_ft', 2.00, NULL, NULL, 13);
