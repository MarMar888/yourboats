/**
 * Proof-of-concept: create a service + invoice in our DB, push it to QBO,
 * then write the qboInvoiceId back. Run with:
 *   pnpm tsx --env-file=.env.local scripts/test-invoice.ts
 *
 * Flags (env vars):
 *   CUSTOMER_NAME   – partial name match (default: first QBO-linked customer)
 *   AMOUNT          – invoice amount in dollars (default: 150)
 *   DRY_RUN=true    – skip QBO API call and DB writes, just print payload
 */

import { db } from '../lib/db'
import { customers, services, invoices } from '../lib/db/schema'
import { getQboClient } from '../lib/qbo/client'
import { isNotNull, ilike, eq } from 'drizzle-orm'
import { promisify } from 'util'

const AMOUNT = Number(process.env.AMOUNT ?? 150)
const DRY_RUN = process.env.DRY_RUN === 'true'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function qboPromise<T>(fn: (cb: (err: unknown, result: any) => void) => void): Promise<T> {
  return new Promise((resolve, reject) =>
    fn((err, result) => (err ? reject(err) : resolve(result)))
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Find a customer linked to QBO
  const nameFilter = process.env.CUSTOMER_NAME

  const [customer] = await db
    .select()
    .from(customers)
    .where(
      nameFilter
        ? ilike(customers.name, `%${nameFilter}%`)
        : isNotNull(customers.qboCustomerId)
    )
    .limit(1)

  if (!customer) {
    throw new Error(
      nameFilter
        ? `No customer matching "${nameFilter}"`
        : 'No customers with QBO IDs found — run the import-customers API first.'
    )
  }

  if (!customer.qboCustomerId) {
    throw new Error(
      `Customer "${customer.name}" has no qboCustomerId. Import them from QBO first.`
    )
  }

  console.log(`Customer : ${customer.name} (QBO ID: ${customer.qboCustomerId})`)
  console.log(`Amount   : $${AMOUNT.toFixed(2)}`)
  console.log(`Dry run  : ${DRY_RUN}\n`)

  // 2. Find a QBO Service-type item to use as the line-item ref
  const qbo = await getQboClient()

  const itemsRes = await qboPromise<{ QueryResponse: { Item?: { Id: string; Name: string }[] } }>(
    (cb) => qbo.findItems({ Type: 'Service' }, cb)
  )

  const items = itemsRes.QueryResponse?.Item ?? []
  if (items.length === 0) throw new Error('No Service-type items found in QBO.')

  const item = items[0]
  console.log(`QBO item : ${item.Name} (ID: ${item.Id})`)

  // 3. Build the QBO invoice payload
  const today = new Date().toISOString().split('T')[0]
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const invoicePayload = {
    CustomerRef: { value: customer.qboCustomerId },
    TxnDate: today,
    DueDate: dueDate,
    Line: [
      {
        Amount: AMOUNT,
        DetailType: 'SalesItemLineDetail',
        Description: 'Boat cleaning service',
        SalesItemLineDetail: {
          ItemRef: { value: item.Id, name: item.Name },
          UnitPrice: AMOUNT,
          Qty: 1,
        },
      },
    ],
  }

  console.log('Invoice payload:')
  console.log(JSON.stringify(invoicePayload, null, 2))

  if (DRY_RUN) {
    console.log('\nDry run — stopping before DB writes and QBO call.')
    process.exit(0)
  }

  // 4. Insert service row
  const [service] = await db
    .insert(services)
    .values({
      customerId: customer.id,
      serviceDate: today,
      serviceType: 'other',
      status: 'complete',
      totalPrice: String(AMOUNT),
      notes: '[test-invoice script]',
    })
    .returning()

  console.log(`\nCreated service: ${service.id}`)

  // 5. Insert draft invoice row
  const [invoice] = await db
    .insert(invoices)
    .values({
      serviceId: service.id,
      amount: String(AMOUNT),
      status: 'draft',
    })
    .returning()

  console.log(`Created invoice: ${invoice.id} (draft)`)

  // 6. Push to QBO
  const created = await qboPromise<{ Id: string; DocNumber: string }>(
    (cb) => qbo.createInvoice(invoicePayload, cb)
  )

  console.log(`QBO invoice created: ID=${created.Id}  DocNumber=${created.DocNumber}`)

  // 7. Write qboInvoiceId back and mark sent
  await db
    .update(invoices)
    .set({
      qboInvoiceId: created.Id,
      status: 'sent',
      sentAt: new Date(),
      lastSyncedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id))

  // 8. Link invoice back to service
  await db
    .update(services)
    .set({ invoiceId: invoice.id })
    .where(eq(services.id, service.id))

  console.log(`\nDone. Invoice ${invoice.id} linked to service ${service.id} and QBO #${created.DocNumber}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
