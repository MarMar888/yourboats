/**
 * Date helpers that are timezone-aware.
 *
 * The server runs in UTC. US users in Eastern time are UTC-4/5, so
 * `new Date()` on the server rolls to the next calendar day starting
 * at 8 PM ET (EDT) or 7 PM ET (EST). Use todayET() anywhere you need
 * "today's date" for display or business-logic comparisons.
 */

const TZ = 'America/New_York'

/** Returns today's date as YYYY-MM-DD in America/New_York time. */
export function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Returns a Date object set to midnight local time for the ET "today". */
export function todayETDate(): Date {
  return new Date(todayET() + 'T00:00:00')
}

/** Converts a Date to YYYY-MM-DD using its UTC date parts (safe for UTC-anchored dates). */
export function toISODateUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}
