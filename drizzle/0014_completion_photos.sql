CREATE TABLE IF NOT EXISTS "completion_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "service_id" uuid NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "blob_url" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "completion_photos_service_id_idx" ON "completion_photos"("service_id");

-- Migrate any existing single photos into the new table. Guarded so re-running
-- this migration (e.g. the first run of the tracked migrate step against a
-- database that was already migrated by hand) does not duplicate rows.
INSERT INTO "completion_photos" ("service_id", "blob_url")
SELECT s."id", s."completion_photo_url"
FROM "services" s
WHERE s."completion_photo_url" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "completion_photos" cp
    WHERE cp."service_id" = s."id"
      AND cp."blob_url" = s."completion_photo_url"
  );
