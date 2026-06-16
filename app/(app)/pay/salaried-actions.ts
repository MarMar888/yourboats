'use server'

import { db } from '@/lib/db'
import { salariedRules, salariedPayroll, complaints } from '@/lib/db/schema'
import { and, eq, gte, lte, count } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'
import { revalidatePath } from 'next/cache'
import { computeSalariedAmount } from '@/lib/pay/salaried'

export type SalariedLine = {
  id: string
  ruleId: string
  userId: string
  displayName: string
  periodStart: string
  periodEnd: string
  type: 'gm_salary' | 'quality_bonus'
  amount: string
  status: 'pending' | 'approved' | 'denied' | 'ineligible'
  ineligibleReason: string | null
  notes: string | null
  approvedByName: string | null
  approvedAt: Date | null
  createdAt: Date
}

function toLine(row: typeof salariedPayroll.$inferSelect): SalariedLine {
  return {
    id: row.id,
    ruleId: row.ruleId,
    userId: row.userId,
    displayName: row.displayName,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    type: row.type as 'gm_salary' | 'quality_bonus',
    amount: row.amount,
    status: row.status as 'pending' | 'approved' | 'denied' | 'ineligible',
    ineligibleReason: row.ineligibleReason ?? null,
    notes: row.notes ?? null,
    approvedByName: row.approvedByName ?? null,
    approvedAt: row.approvedAt ?? null,
    createdAt: row.createdAt,
  }
}

/**
 * Get (or create) salaried payroll lines for a given pay period.
 *
 * For each active rule whose effective dates overlap the period:
 *   - gm_salary rows are auto-approved on creation.
 *   - quality_bonus rows start as 'pending' unless there are complaints in the
 *     period window, in which case they are 'ineligible'.
 *
 * Uses INSERT … ON CONFLICT DO NOTHING so this is safe to call repeatedly.
 */
export async function getSalariedLinesForPeriod(
  startDate: string,
  endDate: string,
): Promise<SalariedLine[]> {
  // 1. Fetch all active rules
  const rules = await db
    .select()
    .from(salariedRules)
    .where(eq(salariedRules.active, true))

  // 2. Complaint window: full days in UTC
  const windowStart = new Date(`${startDate}T00:00:00.000Z`)
  const windowEnd   = new Date(`${endDate}T23:59:59.999Z`)

  // 3. Attempt to insert a row for each rule that overlaps this period
  for (const rule of rules) {
    const amount = computeSalariedAmount(
      {
        type: rule.type,
        amountPerWeek: rule.amountPerWeek,
        amountFlat: rule.amountFlat,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
      },
      { startStr: startDate, endStr: endDate },
    )

    // Skip rules that don't apply to this period
    if (amount === 0) continue

    let status: 'pending' | 'approved' | 'ineligible'
    let ineligibleReason: string | null = null

    if (rule.type === 'gm_salary') {
      status = 'approved'
    } else {
      // quality_bonus — check for complaints in period
      const [{ value: complaintCount }] = await db
        .select({ value: count() })
        .from(complaints)
        .where(
          and(
            gte(complaints.createdAt, windowStart),
            lte(complaints.createdAt, windowEnd),
          ),
        )

      if (Number(complaintCount) > 0) {
        status = 'ineligible'
        ineligibleReason = 'Complaint(s) on record in this period'
      } else {
        status = 'pending'
      }
    }

    // Insert, ignoring conflicts (rule_id + period_start unique index)
    await db
      .insert(salariedPayroll)
      .values({
        ruleId: rule.id,
        userId: rule.userId,
        displayName: rule.displayName,
        periodStart: startDate,
        periodEnd: endDate,
        type: rule.type,
        amount: String(amount),
        status,
        ineligibleReason,
      })
      .onConflictDoNothing()
  }

  // 4. Return all rows for this period
  const rows = await db
    .select()
    .from(salariedPayroll)
    .where(eq(salariedPayroll.periodStart, startDate))

  return rows.map(toLine)
}

/**
 * Approve a pending quality bonus — owner/manager only.
 */
export async function approveSalariedLine(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (user.role !== 'owner' && user.role !== 'manager') {
    return { ok: false, error: 'Unauthorized' }
  }

  const [existing] = await db
    .select()
    .from(salariedPayroll)
    .where(eq(salariedPayroll.id, id))

  if (!existing) return { ok: false, error: 'Row not found' }
  if (existing.status !== 'pending') {
    return { ok: false, error: `Cannot approve a line with status '${existing.status}'` }
  }

  await db
    .update(salariedPayroll)
    .set({
      status: 'approved',
      approvedByUserId: user.id,
      approvedByName: user.displayName,
      approvedAt: new Date(),
    })
    .where(eq(salariedPayroll.id, id))

  await log({
    action: 'approve_salaried_line',
    entityType: 'salaried_payroll',
    entityId: id,
    metadata: {
      userId: existing.userId,
      displayName: existing.displayName,
      type: existing.type,
      amount: existing.amount,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
    },
  })

  revalidatePath('/pay')
  return { ok: true }
}

/**
 * Deny a pending quality bonus — owner/manager only.
 */
export async function denySalariedLine(
  id: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (user.role !== 'owner' && user.role !== 'manager') {
    return { ok: false, error: 'Unauthorized' }
  }

  const [existing] = await db
    .select()
    .from(salariedPayroll)
    .where(eq(salariedPayroll.id, id))

  if (!existing) return { ok: false, error: 'Row not found' }
  if (existing.status !== 'pending') {
    return { ok: false, error: `Cannot deny a line with status '${existing.status}'` }
  }

  await db
    .update(salariedPayroll)
    .set({
      status: 'denied',
      approvedByUserId: user.id,
      approvedByName: user.displayName,
      approvedAt: new Date(),
      notes: reason ?? null,
    })
    .where(eq(salariedPayroll.id, id))

  await log({
    action: 'deny_salaried_line',
    entityType: 'salaried_payroll',
    entityId: id,
    metadata: {
      userId: existing.userId,
      displayName: existing.displayName,
      type: existing.type,
      amount: existing.amount,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      reason: reason ?? null,
    },
  })

  revalidatePath('/pay')
  return { ok: true }
}

/**
 * Revert an approved or denied salaried line back to pending — owner only.
 */
export async function revertSalariedLine(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (user.role !== 'owner') return { ok: false, error: 'Only the owner can revert' }

  const [existing] = await db
    .select()
    .from(salariedPayroll)
    .where(eq(salariedPayroll.id, id))

  if (!existing) return { ok: false, error: 'Row not found' }
  if (existing.status !== 'approved' && existing.status !== 'denied') {
    return { ok: false, error: `Cannot revert a line with status '${existing.status}'` }
  }

  await db
    .update(salariedPayroll)
    .set({
      status: 'pending',
      approvedByUserId: null,
      approvedByName: null,
      approvedAt: null,
      notes: null,
    })
    .where(eq(salariedPayroll.id, id))

  await log({
    action: 'revert_salaried_line',
    entityType: 'salaried_payroll',
    entityId: id,
    metadata: { userId: existing.userId, type: existing.type, previousStatus: existing.status },
  })

  revalidatePath('/pay')
  return { ok: true }
}
