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

## Landing page: decide on more "connects to" logos (Mailchimp, etc.)
**File:** `components/integrations-marquee.tsx`

**What:** Marley asked to add more common connectors to the logo marquee (named
Mailchimp as an example). Only QuickBooks Online, Gmail, Voice/SMS reminders, and
Photo uploads are real, shipped integrations today — Mailchimp and similar aren't
built. Did not add unbuilt integrations to the marquee to avoid a false capability
claim on a live marketing page (same reasoning as the slip-management question below).

**Decision needed:** either (a) scope and build a real Mailchimp integration (new
engineering task — figure out what it would even sync: customer list? campaign
triggers on invoice events?), or (b) Marley is fine with the current 4 real items and
this is dropped, or (c) some other honest way to signal "more on request" beyond the
existing "Need something custom?" section, which already covers this.

---

## Landing page / product: slip & space management — copy vs. real feature?
**File:** `app/page.tsx` (positioning), potentially `lib/db/schema.ts` (new tables)

**What:** Marley wants yourboats positioned partly around "slip management," inspired
by competitor marina software (Sharper MMS) that does slip/berth assignment, a marina
map, and dock billing. The current schema has zero tables for slips, berths, docks, or
vessel-to-space assignment — yourboats is entirely service-ops (scheduling, job cards,
invoicing, payroll) today. Asked Marley to clarify and haven't heard back:

1. **Copy only** — reposition "slip management" loosely (e.g. "we manage the service
   work for boats in your slips") without claiming real slip/berth assignment features.
2. **Real feature** — actually build slip/berth assignment (new schema: a `slips`/
   `berths` table, boat-to-slip assignment, a marina map UI, probably dock/space
   billing). This is a significant, separate engineering project, not a landing-page
   edit — needs its own scoping pass if it's the direction.

**Why this matters:** don't want a capability claim live on the site that isn't true.

**Depends on:** Marley's answer.

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
