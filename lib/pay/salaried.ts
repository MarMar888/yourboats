/**
 * Pure business logic for salaried pay rules — no DB calls, no server actions.
 */

/**
 * Returns the dollar amount owed for a GM salary rule in a given pay period,
 * based on the day overlap between [periodStart, periodEnd] and [effectiveFrom, effectiveTo].
 * Overlap days / 7 * amountPerWeek, rounded to 2 decimal places.
 */
export function computeGMSalaryAmount(params: {
  amountPerWeek: number
  effectiveFrom: string  // YYYY-MM-DD
  effectiveTo: string
  periodStart: string
  periodEnd: string
}): number {
  const { amountPerWeek, effectiveFrom, effectiveTo, periodStart, periodEnd } = params

  const overlapStart = new Date(Math.max(
    new Date(periodStart).getTime(),
    new Date(effectiveFrom).getTime(),
  ))
  const overlapEnd = new Date(Math.min(
    new Date(periodEnd).getTime(),
    new Date(effectiveTo).getTime(),
  ))

  if (overlapEnd < overlapStart) return 0

  // +1 because both endpoints are inclusive
  const overlapDays =
    Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

  // Round up to the nearest whole week so partial weeks count as full weeks
  const weeks = Math.ceil(overlapDays / 7)
  return weeks * amountPerWeek
}

/**
 * A quality bonus is eligible when there are zero complaints in the period.
 */
export function isQualityBonusEligible(complaintCount: number): boolean {
  return complaintCount === 0
}

/**
 * Given a rule and a pay period, returns the expected dollar amount.
 * Returns 0 if the period falls entirely outside the rule's effective dates.
 */
export function computeSalariedAmount(
  rule: {
    type: string
    amountPerWeek: string | null
    amountFlat: string | null
    effectiveFrom: string
    effectiveTo: string
  },
  period: { startStr: string; endStr: string },
): number {
  const { type, amountPerWeek, amountFlat, effectiveFrom, effectiveTo } = rule
  const { startStr, endStr } = period

  // Check if period overlaps effective dates at all
  const periodStartMs = new Date(startStr).getTime()
  const periodEndMs = new Date(endStr).getTime()
  const effectiveFromMs = new Date(effectiveFrom).getTime()
  const effectiveToMs = new Date(effectiveTo).getTime()

  if (periodEndMs < effectiveFromMs || periodStartMs > effectiveToMs) return 0

  if (type === 'gm_salary') {
    if (!amountPerWeek) return 0
    return computeGMSalaryAmount({
      amountPerWeek: parseFloat(amountPerWeek),
      effectiveFrom,
      effectiveTo,
      periodStart: startStr,
      periodEnd: endStr,
    })
  }

  if (type === 'quality_bonus') {
    if (!amountFlat) return 0
    return parseFloat(amountFlat)
  }

  return 0
}
