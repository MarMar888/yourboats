CREATE TABLE IF NOT EXISTS "time_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "service_id" uuid NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "boat_id" uuid REFERENCES "boats"("id") ON DELETE SET NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "clock_in" timestamp NOT NULL,
  "clock_out" timestamp,
  "notes" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "time_entries_service_id_idx" ON "time_entries"("service_id");
CREATE INDEX IF NOT EXISTS "time_entries_user_id_idx" ON "time_entries"("user_id");
CREATE INDEX IF NOT EXISTS "time_entries_clock_in_idx" ON "time_entries"("clock_in");
