# TODOS

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
