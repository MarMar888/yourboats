-- Separate freeform "questions for us" field on the public quote wizard,
-- distinct from the operational "notes" field (gate code, lift instructions).
ALTER TABLE "quote_requests" ADD COLUMN "message" text;
