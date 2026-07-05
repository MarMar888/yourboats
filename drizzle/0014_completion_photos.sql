CREATE TABLE IF NOT EXISTS "completion_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "service_id" uuid NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "blob_url" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "completion_photos_service_id_idx" ON "completion_photos"("service_id");

-- Migrate any existing single photos into the new table
INSERT INTO "completion_photos" ("service_id", "blob_url")
SELECT "id", "completion_photo_url"
FROM "services"
WHERE "completion_photo_url" IS NOT NULL;
