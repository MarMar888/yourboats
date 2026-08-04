CREATE TABLE IF NOT EXISTS "service_type_shares" (
  "service_type" text PRIMARY KEY,
  "employee_share_pct" numeric(5,2) NOT NULL
);

-- QBO item names (current)
INSERT INTO "service_type_shares" ("service_type", "employee_share_pct") VALUES
  ('Recurring Services',          55),
  ('Detailing Services',          50),
  ('Buffing/Waxing Services',     45),
  ('Acid Washing Services',       40),
  ('Powerwashing Services',       50),
  ('Gelcoat/Wetsanding Services', 50),
  ('Captaining Services',         83),
  ('SIO2 Coating',                40),
  ('Other Services',              50),
  ('Training Pay',               100),
  -- Legacy enum values (services created before QBO items were used)
  ('recurring',          55),
  ('detailing',          50),
  ('buffing_waxing',     45),
  ('acid_washing',       40),
  ('powerwashing',       50),
  ('gelcoat_wetsanding', 50),
  ('captaining',         83),
  ('other',              50)
ON CONFLICT ("service_type") DO NOTHING;
