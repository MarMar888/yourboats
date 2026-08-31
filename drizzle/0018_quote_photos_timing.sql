-- Photo uploads (for services priced more precisely with boat photos, e.g.
-- buffing/waxing and acid wash) and a preferred date range for scheduling,
-- both added to the public /quote wizard.

ALTER TABLE "quote_services" ADD COLUMN "requires_photos" boolean NOT NULL DEFAULT false;

ALTER TABLE "quote_requests" ADD COLUMN "preferred_start_date" date;
ALTER TABLE "quote_requests" ADD COLUMN "preferred_end_date" date;
ALTER TABLE "quote_requests" ADD COLUMN "photo_urls" text;

UPDATE "quote_services" SET "requires_photos" = true WHERE "key" IN ('buffing_waxing', 'acid_washing');
