CREATE TABLE IF NOT EXISTS "qbo_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "qbo_item_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "unit_price" numeric(10, 2),
  "synced_at" timestamp DEFAULT now() NOT NULL
);
