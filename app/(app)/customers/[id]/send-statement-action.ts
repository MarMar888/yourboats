'use server'

import { db } from '@/lib/db'
import { customers, customerReminderContacts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { extractQboErrorMessage } from '@/lib/qbo/errors'
import { getOpenInvoicesForCustomer } from '@/lib/qbo/open-invoices'
import { emailTransport } from '@/lib/email/client'
import { log } from '@/lib/log'
import { getCurrentUser } from '@/lib/auth/get-current-user'

type ActionResult = { ok: true } | { ok: false; error: string }

// QuickBooks Online has no API for sending an actual "Statement" — statements
// are a QBO-web-UI-only feature, not part of the Accounting API. This builds
// a custom balance summary instead: the customer's open (Balance > 0)
// invoices pulled live from QBO, emailed as a simple statement.
export async function sendCustomerStatement(customerId: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { ok: false, error: 'Not authorized.' }
  }

  const [customer] = await db
    .select({ id: customers.id, name: customers.name, email: customers.email, qboCustomerId: customers.qboCustomerId })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (!customer) return { ok: false, error: 'Customer not found.' }
  if (!customer.qboCustomerId) return { ok: false, error: 'Customer is not linked to QuickBooks yet.' }

  let to = customer.email
  if (!to) {
    const reminderContacts = await db
      .select({ email: customerReminderContacts.email })
      .from(customerReminderContacts)
      .where(eq(customerReminderContacts.customerId, customerId))

    if (reminderContacts.length === 0) {
      return { ok: false, error: 'Customer has no email address and no reminder contacts on file.' }
    }
    to = reminderContacts.map((c) => c.email).join(', ')
  }

  let openInvoices: Awaited<ReturnType<typeof getOpenInvoicesForCustomer>>
  try {
    openInvoices = await getOpenInvoicesForCustomer(customer.qboCustomerId)
  } catch (err) {
    return { ok: false, error: `Failed to pull balance from QuickBooks: ${extractQboErrorMessage(err)}` }
  }

  if (openInvoices.length === 0) {
    return { ok: false, error: `${customer.name} has no open balance — nothing to send.` }
  }

  const totalBalance = openInvoices.reduce((sum, inv) => sum + inv.balance, 0)
  const fmt = (n: number) => `$${n.toFixed(2)}`

  const rows = openInvoices.map((inv) => {
    const label = inv.docNumber ? `Invoice #${inv.docNumber}` : 'Invoice'
    return { label, date: inv.txnDate ?? '', dueDate: inv.dueDate ?? '', balance: inv.balance, link: inv.paymentLink }
  })

  const textLines = rows.map((r) =>
    `${r.label} — ${r.date}${r.dueDate ? ` (due ${r.dueDate})` : ''}: ${fmt(r.balance)}${r.link ? ` — Pay: ${r.link}` : ''}`
  )
  const text = `Hi ${customer.name}, here's a summary of your open balance with Squeaky Clean Boats:\n\n${textLines.join('\n')}\n\nTotal due: ${fmt(totalBalance)}`

  const htmlRows = rows.map((r) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${r.label}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${r.date}${r.dueDate ? ` (due ${r.dueDate})` : ''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmt(r.balance)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${r.link ? `<a href="${r.link}">Pay now</a>` : ''}</td>
    </tr>`).join('')
  const html = `
    <p>Hi ${customer.name}, here's a summary of your open balance with Squeaky Clean Boats:</p>
    <table style="border-collapse:collapse;width:100%;max-width:520px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 10px;">Invoice</th>
          <th style="text-align:left;padding:6px 10px;">Date</th>
          <th style="text-align:right;padding:6px 10px;">Balance</th>
          <th style="padding:6px 10px;"></th>
        </tr>
      </thead>
      <tbody>${htmlRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding:8px 10px;font-weight:bold;">Total due</td>
          <td style="padding:8px 10px;text-align:right;font-weight:bold;">${fmt(totalBalance)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>`

  try {
    await emailTransport.sendMail({
      from: `"Squeaky Clean Boats" <${process.env.GMAIL_USER}>`,
      to,
      subject: `Statement from Squeaky Clean Boats — ${fmt(totalBalance)} due`,
      text,
      html,
    })
  } catch (err) {
    return { ok: false, error: `Failed to send: ${err instanceof Error ? err.message : String(err)}` }
  }

  await log({
    action: 'send_customer_statement',
    entityType: 'customer',
    entityId: customerId,
    metadata: { openInvoiceCount: openInvoices.length, totalBalance, to },
  })

  return { ok: true }
}
