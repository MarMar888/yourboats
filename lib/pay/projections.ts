export const SEASON_END = '2026-08-31'

export type SalariedRuleProjection = {
  id: string
  displayName: string
  type: string
  amountPerWeek: number | null
  amountFlat: number | null
  effectiveFrom: string
  effectiveTo: string
  frequencyWeeks: number
}

export type ScheduledServiceRow = {
  id: string
  date: string            // YYYY-MM-DD
  customerName: string
  serviceType: string
  price: number
  sharePct: number
}

export type OccurrenceEntry = {
  customerName: string
  date: string
  price: number
  sharePct: number
}

export type WeekRow = {
  weekStart: string
  weekEnd: string
  occurrences: OccurrenceEntry[]
  salariedCost: number
  salariedBreakdown: { name: string; amount: number }[]
}

export type ProjectionTotals = {
  revenue: number
  varLabor: number
  salariedCost: number
  totalLabor: number
  profit: number
}

function weekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const dow = d.getUTCDay()
  const daysToMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(d.getTime() + daysToMon * 86_400_000)
  return mon.toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10)
}

export function computeProjectionWeeks(
  scheduledServices: ScheduledServiceRow[],
  salariedRules: SalariedRuleProjection[],
  seasonEnd: string,
): WeekRow[] {
  const weekMap: Record<string, WeekRow> = {}

  const ensureWeek = (ws: string) => {
    if (!weekMap[ws]) {
      weekMap[ws] = { weekStart: ws, weekEnd: addDays(ws, 6), occurrences: [], salariedCost: 0, salariedBreakdown: [] }
    }
  }

  // All future scheduled services — actual bookings from the DB
  for (const s of scheduledServices) {
    if (s.date > seasonEnd) continue
    const ws = weekStart(s.date)
    ensureWeek(ws)
    weekMap[ws].occurrences.push({ customerName: s.customerName, date: s.date, price: s.price, sharePct: s.sharePct })
  }

  if (Object.keys(weekMap).length === 0) return []

  // Salaried cost per week
  for (const ws of Object.keys(weekMap)) {
    const we = weekMap[ws].weekEnd
    let total = 0
    const breakdown: { name: string; amount: number }[] = []
    for (const rule of salariedRules) {
      if (rule.effectiveTo < ws || rule.effectiveFrom > we) continue
      if (rule.type === 'gm_salary' && rule.amountPerWeek != null) {
        total += rule.amountPerWeek
        breakdown.push({ name: `${rule.displayName} salary`, amount: rule.amountPerWeek })
      } else if (rule.type === 'quality_bonus' && rule.amountFlat != null) {
        const perWeek = rule.amountFlat / rule.frequencyWeeks
        total += perWeek
        breakdown.push({ name: `${rule.displayName} bonus (expected)`, amount: perWeek })
      }
    }
    weekMap[ws].salariedCost = total
    weekMap[ws].salariedBreakdown = breakdown
  }

  return Object.values(weekMap).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

export function computeProjectionTotals(weeks: WeekRow[]): ProjectionTotals {
  let revenue = 0, varLabor = 0, salariedCost = 0
  for (const w of weeks) {
    revenue += w.occurrences.reduce((s, o) => s + o.price, 0)
    varLabor += w.occurrences.reduce((s, o) => s + o.price * (o.sharePct / 100), 0)
    salariedCost += w.salariedCost
  }
  return { revenue, varLabor, salariedCost, totalLabor: varLabor + salariedCost, profit: revenue - varLabor - salariedCost }
}
