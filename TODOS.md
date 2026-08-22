# TODOS

## Landing page: trim hero tagline
**File:** `app/page.tsx` (hero paragraph)

**What:** Cut the tagline after "...replaces the spreadsheet-and-text-message shuffle
with a single operations app." Drop the trailing list (recurring schedules, job cards,
invoicing, payroll) — that's covered by the feature sections below it.

**Why:** Per Marley: "this is the real unlock" — the short line is the punchier version;
the feature list is redundant with the per-feature sections already on the page.

---

## Landing page: remove "every shop runs differently" paragraph
**File:** `app/page.tsx` (section right after the hero, before the feature sections)

**What:** Remove the "Every marina, detail shop, and crew runs their program a little
differently..." paragraph entirely.

**Why:** Per Marley, cut from the page.

---

## Landing page: add a "custom connections & setups" section
**File:** `app/page.tsx`

**What:** Add a section near the bottom (before or alongside the footer) saying
Yourboats can build custom connections/setups on request — "just reach out" — linking
to the same contact email already in the footer (`marley@squeakycleanboats.com`).

**Why:** Per Marley — signal that integrations beyond the stock list (QBO/Gmail/SMS/
photos) are available on request, not a hard limit of the product.

---

## Landing page: highlight MCP / AI-agent access
**File:** `app/page.tsx`

**What:** Add a feature callout for the MCP server (already real and shipped —
`app/api/[transport]/route.ts`, personal access tokens issued from Settings) — pitch:
"run your business right from Claude" / any AI client, not just the web UI.

**Why:** Per Marley — this is a real, already-built differentiator not currently
mentioned anywhere on the landing page.

**Depends on:** None — the MCP server and token issuance already exist in production;
this is copy + a section, not new functionality.

---

## Landing page: scrolling logo marquee for integrations
**File:** `app/page.tsx` ("Connects to what you already run" section)

**What:** Replace the plain `Badge` list (QuickBooks Online, Gmail, Voice/SMS,
Photo uploads) with a horizontally scrolling logo marquee.

**Why:** Per Marley — more visual than text pills.

**Blocker:** Needs real logo assets (QuickBooks, Gmail, etc.) — check licensing/brand
guidelines before using official logos on a marketing page. No assets sourced yet.

---

## Landing page: "request more info" form wired to Resend
**File:** `app/page.tsx` (new field near the top) + new server action + email send

**What:** Add a phone-number input field near the top of the page. On submit, send an
email to `marley@squeakycleanboats.com` via Resend notifying that someone filled out
the form (include the submitted phone number).

**Why:** Per Marley — capture inbound interest from the landing page directly.

**Depends on:** Resend is a new external service for this project (current email
sending goes through Gmail SMTP via nodemailer, not Resend) — needs the Vercel
Marketplace `messaging` integration flow (provision + env vars) before writing code,
per this project's standing rule to provision real integrations before building
against them. Also needs a plain server action (public form on an unauthenticated
page) with basic validation/rate-limiting so it can't be spammed.

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
