-- Client corner: customer self-service portal.
-- OTP codes for the /login email-recognition flow, and a staff-reviewed
-- request queue for reschedule/cancel/note/new-service asks.

DO $$ BEGIN
  CREATE TYPE "service_request_type" AS ENUM ('reschedule', 'cancel', 'note', 'new_service');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "service_request_status" AS ENUM ('pending', 'approved', 'denied');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "client_otp_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "client_otp_codes_customer_id_idx" ON "client_otp_codes"("customer_id");

CREATE TABLE IF NOT EXISTS "service_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "service_id" uuid REFERENCES "services"("id") ON DELETE CASCADE,
  "type" service_request_type NOT NULL,
  "requested_date" date,
  "service_type" text,
  "message" text,
  "status" service_request_status DEFAULT 'pending' NOT NULL,
  "staff_response" text,
  "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "service_requests_customer_id_idx" ON "service_requests"("customer_id");
CREATE INDEX IF NOT EXISTS "service_requests_status_idx" ON "service_requests"("status");
