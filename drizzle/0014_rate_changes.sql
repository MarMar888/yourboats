-- Effective-dated pay rates. Every rate (crew-pool share per service type and
-- tier deduction) is stored as a dated row; the rate for a service is the row
-- with the greatest effective_from on/before that service's date.

CREATE TABLE "rate_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" text NOT NULL,               -- 'service_type_share' | 'tier_deduction'
  "key" text NOT NULL,                -- service type name, or employee tier
  "pct" numeric(5,2) NOT NULL,
  "effective_from" date NOT NULL,
  "note" text,
  "created_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "rate_changes_kind_key_from_uniq"
  ON "rate_changes" ("kind", "key", "effective_from");

-- Baseline: snapshot every current rate as effective from the beginning of time,
-- so services dated before any change resolve to today's existing values.
INSERT INTO "rate_changes" ("kind", "key", "pct", "effective_from", "note")
SELECT 'service_type_share', "service_type", "employee_share_pct", '2000-01-01', 'baseline import'
FROM "service_type_shares";

INSERT INTO "rate_changes" ("kind", "key", "pct", "effective_from", "note")
SELECT 'tier_deduction', "tier", "deduction_pct", '2000-01-01', 'baseline import'
FROM "tier_config";
