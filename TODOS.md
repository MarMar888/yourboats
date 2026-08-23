# TODOS

## Landing page: finish Resend setup
**File:** `app/request-info-action.ts`

**What:** The lead-capture form and server action are live in production, but
`RESEND_API_KEY` is not yet set — Resend's Vercel Marketplace install is blocked on
accepting Resend's marketplace terms in a browser (link was sent to Marley). Until
that's done, submissions succeed for the visitor but no email actually sends (logged
via `logSystem` as `request_info_email_skipped`). Once terms are accepted: re-run
`vercel integration add resend -m domain=squeakycleanboats.com -m region=us-east-1
--plan free --no-claim`, pull env vars, and redeploy. Also decide on domain
verification (currently sends from Resend's shared `onboarding@resend.dev`, not a
verified `@squeakycleanboats.com` sender) — see code comment in
`request-info-action.ts`.

**Depends on:** Marley accepting Resend's marketplace terms (browser step, can't be
automated headlessly).

---

## Product: build real slip/berth management (currently landing-page-only)
**File:** New feature area — `lib/db/schema.ts` (new tables), new `app/(app)/marina/`
routes, etc. Not started.

**What:** The landing page now markets slip & berth management, transient/seasonal
reservations, work orders & haul-outs, fuel dock, ship's store POS, and utility
billing (`app/page.tsx`, shipped per Marley's explicit direction: "slip management and
all this stuff are all features we need to add to the homepage to make this work for
marinas"). None of this exists in the actual product yet — the schema has zero tables
for slips, berths, docks, reservations, work orders, fuel, POS, or utility metering.
Today yourboats is entirely service-ops (scheduling, job cards, invoicing, payroll).

**Why this matters:** the homepage is ahead of the product on purpose (Marley's call,
made with the gap explicitly flagged first) — but the gap is real and growing with
each new section added. This needs a real scoping pass whenever there's room for it:
at minimum a `slips`/`berths` table + boat-to-slip assignment + a marina map UI for
the flagship claim; reservations, work orders, fuel/POS/utilities can follow.

**Depends on:** Marley prioritizing this against the rest of the roadmap.

---

## Landing page: decide on more "connects to" logos (Mailchimp, etc.)
**File:** `components/integrations-marquee.tsx`

**What:** Marley asked to add more common connectors to the logo marquee (named
Mailchimp as an example) and confirmed listing capabilities ahead of the build is fine
for this page. Still haven't picked which additional logos/names to add — need a
concrete list (Mailchimp confirmed; what else counts as "common" for a marina/detailer
audience?).

**Decision needed:** the actual list of names/logos to add to the marquee.

---

## QBO: Rate change sync after invoice exists
**File:** `app/(app)/schedule/actions.ts` (see existing comment at bottom of file)

**What:** When `serviceBoats.rate` or `rateType` is updated after a QBO invoice already
exists for the service, the invoice lines in QuickBooks become stale.

**Why:** QBO is the customer-facing source of truth for invoice amounts. If rates are
corrected after pushing, the customer's QBO invoice shows the wrong total indefinitely.

**Where to start:** `updateService()` in `schedule/[id]/actions.ts`. After updating
boat rows, check if `invoices.qboInvoiceId` is set. If so, rebuild the `Line[]` array
from the new `serviceBoats` values and call `qbo.updateInvoice({ Id, SyncToken, sparse: true, Line: [...] })`.
Also update `invoices.amount` and `invoices.lastSyncedAt` locally. The `SyncToken` must
be fetched first via `qbo.getInvoice()`.

**Depends on:** None — self-contained change in `schedule/[id]/actions.ts`.

---
