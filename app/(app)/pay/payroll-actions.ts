'use server'

import { db } from '@/lib/db'
import { payroll, services } from '@/lib/db/schema'
import { and, gte, inArray, lte } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'
import { revalidatePath } from 'next/cache'
import { emailTransport } from '@/lib/email/client'

const OWNER_ALERT_EMAIL = 'marley@squeakycleanboats.com'

export type PayrollEntryInput = {
  serviceId: string
  userId: string
  displayName: string
  serviceDate: string
  serviceType: string
  customerName: string
  totalPrice: number
  employeePool: number
  splitPct: number
  deductionPct: number
  effectivePct: number
  netPay: number
  tipShare: number
  totalPay: number
}

// Upsert payroll rows for one or more services in a period.
// Called from the pay review "Save payroll" button.
export async function savePayrollEntries(
  entries: PayrollEntryInput[]
): Promise<{ error?: string; saved?: number }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { error: 'Not authorized' }
  }
  if (entries.length === 0) return { saved: 0 }

  // Look up invoice IDs for these services (optional FK — may not exist)
  const svcIds = Array.from(new Set(entries.map((e) => e.serviceId)))
  const svcRows = await db
    .select({ id: services.id, invoiceId: services.invoiceId })
    .from(services)
    .where(inArray(services.id, svcIds))
  const invoiceById: Record<string, string | null> = {}
  for (const s of svcRows) invoiceById[s.id] = s.invoiceId ?? null

  const now = new Date()
  const rows = entries.map((e) => ({
    serviceId:     e.serviceId,
    invoiceId:     invoiceById[e.serviceId] ?? null,
    userId:        e.userId,
    displayName:   e.displayName,
    serviceDate:   e.serviceDate,
    serviceType:   e.serviceType,
    customerName:  e.customerName,
    totalPrice:    String(e.totalPrice),
    employeePool:  String(e.employeePool),
    splitPct:      String(e.splitPct),
    deductionPct:  String(e.deductionPct),
    effectivePct:  String(e.effectivePct),
    netPay:        String(e.netPay),
    tipShare:      e.tipShare > 0 ? String(e.tipShare) : null,
    totalPay:      String(e.totalPay),
    savedByUserId: user.id,
    savedAt:       now,
  }))

  await db
    .insert(payroll)
    .values(rows)
    .onConflictDoUpdate({
      target: [payroll.serviceId, payroll.userId],
      set: {
        invoiceId:     payroll.invoiceId,
        displayName:   payroll.displayName,
        serviceDate:   payroll.serviceDate,
        serviceType:   payroll.serviceType,
        customerName:  payroll.customerName,
        totalPrice:    payroll.totalPrice,
        employeePool:  payroll.employeePool,
        splitPct:      payroll.splitPct,
        deductionPct:  payroll.deductionPct,
        effectivePct:  payroll.effectivePct,
        netPay:        payroll.netPay,
        tipShare:      payroll.tipShare,
        totalPay:      payroll.totalPay,
        savedByUserId: payroll.savedByUserId,
        savedAt:       payroll.savedAt,
      },
    })

  await log({
    action: 'save_payroll',
    entityType: 'payroll',
    entityId: svcIds[0],
    metadata: { services: svcIds.length, employees: entries.length },
  })

  revalidatePath('/pay')
  return { saved: entries.length }
}

export type SavedPayrollRow = {
  serviceId:        string
  userId:           string
  displayName:      string
  splitPct:         string
  deductionPct:     string
  effectivePct:     string
  netPay:           string
  tipShare:         string | null
  totalPay:         string
  savedAt:          Date
  savedByUserId:    string | null
  approvedAt:       Date | null
  approvedByUserId: string | null
  approvedByName:   string | null
}

// Return all saved payroll entries for services whose dates fall in [startDate, endDate].
// The serviceDate column is denormalised onto each payroll row so we can filter directly.
export async function getPayrollForPeriod(
  startDate: string,
  endDate: string
): Promise<SavedPayrollRow[]> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) return []

  return db
    .select({
      serviceId:        payroll.serviceId,
      userId:           payroll.userId,
      displayName:      payroll.displayName,
      splitPct:         payroll.splitPct,
      deductionPct:     payroll.deductionPct,
      effectivePct:     payroll.effectivePct,
      netPay:           payroll.netPay,
      tipShare:         payroll.tipShare,
      totalPay:         payroll.totalPay,
      savedAt:          payroll.savedAt,
      savedByUserId:    payroll.savedByUserId,
      approvedAt:       payroll.approvedAt,
      approvedByUserId: payroll.approvedByUserId,
      approvedByName:   payroll.approvedByName,
    })
    .from(payroll)
    .where(
      and(
        gte(payroll.serviceDate, startDate),
        lte(payroll.serviceDate, endDate)
      )
    )
}

// Approve all saved payroll rows for a period. Sets approved_at / approved_by on every row.
export async function approvePayrollForPeriod(
  startDate: string,
  endDate: string
): Promise<{ error?: string; approved?: number }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { error: 'Not authorized' }
  }

  const now = new Date()
  const result = await db
    .update(payroll)
    .set({
      approvedAt:       now,
      approvedByUserId: user.id,
      approvedByName:   user.displayName,
    })
    .where(
      and(
        gte(payroll.serviceDate, startDate),
        lte(payroll.serviceDate, endDate)
      )
    )

  await log({
    action: 'approve_payroll',
    entityType: 'payroll',
    entityId: startDate,
    metadata: { startDate, endDate, approvedBy: user.displayName },
  })

  revalidatePath('/pay')
  return { approved: (result as unknown as { rowCount?: number }).rowCount ?? 0 }
}

// Clear approval on all payroll rows for a period and notify the owner by email.
export async function unapprovePayrollForPeriod(
  startDate: string,
  endDate: string
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { error: 'Not authorized' }
  }

  await db
    .update(payroll)
    .set({ approvedAt: null, approvedByUserId: null, approvedByName: null })
    .where(
      and(
        gte(payroll.serviceDate, startDate),
        lte(payroll.serviceDate, endDate)
      )
    )

  await log({
    action: 'unapprove_payroll',
    entityType: 'payroll',
    entityId: startDate,
    metadata: { startDate, endDate, unapprovedBy: user.displayName },
  })

  // Email alert — non-fatal if email isn't configured
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const periodLabel = `${startDate} – ${endDate}`
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    try {
      await emailTransport.sendMail({
        from: `"Squeaky Clean Boats" <${process.env.GMAIL_USER}>`,
        to: OWNER_ALERT_EMAIL,
        subject: `⚠ Payroll unapproved — ${periodLabel}`,
        text: [
          `Payroll for the period ${periodLabel} was unapproved.`,
          ``,
          `Unapproved by: ${user.displayName} (${user.role})`,
          `Time: ${timestamp} ET`,
          ``,
          `Review at: https://yourboats.vercel.app/pay`,
        ].join('\n'),
        html: `
          <p>Payroll for the period <strong>${periodLabel}</strong> was unapproved.</p>
          <table style="border-collapse:collapse;margin-top:12px">
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Unapproved by</td><td><strong>${user.displayName}</strong> (${user.role})</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Time</td><td>${timestamp} ET</td></tr>
          </table>
          <p style="margin-top:16px"><a href="https://yourboats.vercel.app/pay">Review payroll →</a></p>
        `,
      })
    } catch (err) {
      console.error('[payroll] Failed to send unapproval alert email:', err)
      // Don't fail the action — unapproval itself succeeded
    }
  }

  revalidatePath('/pay')
  return {}
}
