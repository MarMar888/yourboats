-- Public /quote signup link: business-editable service/add-on catalog plus
-- the table of submissions from that link. billing_type reuses the existing
-- "rate_type" enum ('per_ft' | 'flat') created in 0014_completion_photos's
-- predecessor migrations.

CREATE TABLE "quote_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "category" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "billing_type" "rate_type" NOT NULL DEFAULT 'flat',
  "rate" numeric(10,2) NOT NULL,
  "min_price" numeric(10,2),
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "quote_addons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "billing_type" "rate_type" NOT NULL DEFAULT 'flat',
  "rate" numeric(10,2) NOT NULL,
  "min_price" numeric(10,2),
  "requires_attribute" text,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "quote_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'new',
  "customer_name" text NOT NULL,
  "email" text,
  "phone" text,
  "address" text,
  "boat_type_key" text NOT NULL,
  "boat_nickname" text,
  "boat_make_model" text,
  "boat_length_ft" integer NOT NULL,
  "plan_type" text NOT NULL,
  "recurring_service_key" text,
  "detail_service_keys" text,
  "addon_keys" text,
  "notes" text,
  "quoted_price" numeric(10,2) NOT NULL,
  "quoted_price_breakdown" text,
  "converted_customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "contacted_at" timestamp
);

-- ─── Seed catalog: recurring plans ─────────────────────────────────────────

INSERT INTO "quote_services" ("key", "category", "name", "description", "billing_type", "rate", "min_price", "sort_order") VALUES
  ('recurring_weekly', 'recurring', 'Weekly Wash', 'Exterior wash, glass, and wipe-down every week.', 'per_ft', 3.50, 65, 1),
  ('recurring_biweekly', 'recurring', 'Biweekly Wash', 'Exterior wash, glass, and wipe-down every other week.', 'per_ft', 3.75, 70, 2);

-- ─── Seed catalog: one-time detail services ────────────────────────────────

INSERT INTO "quote_services" ("key", "category", "name", "description", "billing_type", "rate", "min_price", "sort_order") VALUES
  ('detail_full', 'detail', 'Full Detail: Interior & Exterior', 'Complete hand wash, wax, vacuum, and wipe-down inside and out.', 'per_ft', 12.00, 220, 1),
  ('buffing_waxing', 'detail', 'Buffing & Waxing', 'Machine buff and protective wax coat for the hull and topsides.', 'per_ft', 14.00, 280, 2),
  ('acid_washing', 'detail', 'Acid Wash / Oxidation Removal', 'Restores faded, chalky gelcoat back to a glossy finish.', 'per_ft', 6.00, 150, 3),
  ('powerwashing', 'detail', 'Powerwashing / Bottom Wash', 'High-pressure rinse for the hull, bottom, and lift.', 'per_ft', 2.50, 90, 4),
  ('gelcoat_wetsanding', 'detail', 'Gelcoat Wet-Sanding', 'Heavy-duty wet-sand and polish for deeply oxidized gelcoat.', 'per_ft', 28.00, 600, 5),
  ('ceramic_coating', 'detail', 'Ceramic Coating', 'Long-lasting ceramic protection applied after a full detail.', 'per_ft', 20.00, 450, 6);

-- ─── Seed catalog: add-ons ──────────────────────────────────────────────────

INSERT INTO "quote_addons" ("key", "name", "description", "billing_type", "rate", "requires_attribute", "sort_order") VALUES
  ('addon_cabin_interior', 'Cabin / Cuddy Interior Detail', 'Wipe-down, vacuum, and surface clean of the cabin interior.', 'flat', 85.00, 'cabin', 1),
  ('addon_carpet_shampoo', 'Carpet Shampoo & Deep Clean', 'Machine shampoo for marine carpet.', 'flat', 65.00, 'carpet', 2),
  ('addon_bridge_detail', 'Flybridge / Bridge Detail', 'Wash and wipe-down of the flybridge helm and seating.', 'flat', 120.00, 'bridge', 3),
  ('addon_engine_bay', 'Engine Bay Cleaning', 'Degrease and wipe-down of the engine compartment.', 'flat', 55.00, NULL, 4),
  ('addon_teak', 'Teak Cleaning & Conditioning', 'Brightening wash and conditioner for teak surfaces.', 'flat', 95.00, NULL, 5),
  ('addon_canvas', 'Canvas & Upholstery Conditioning', 'Clean and UV-protect canvas tops and vinyl upholstery.', 'flat', 70.00, NULL, 6),
  ('addon_stainless', 'Stainless & Chrome Polish', 'Polish rails, cleats, and other stainless hardware.', 'flat', 45.00, NULL, 7),
  ('addon_bilge', 'Bilge Cleaning', 'Pump-out and scrub of the bilge compartment.', 'flat', 60.00, NULL, 8);
