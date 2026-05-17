CREATE TABLE IF NOT EXISTS "customer_reminder_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "label" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
