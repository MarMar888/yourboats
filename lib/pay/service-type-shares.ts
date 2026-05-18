/**
 * Service-type share percentages.
 *
 * Each QBO item name maps to the fraction of the service's total revenue
 * that enters the employee pay pool. The business keeps the remainder.
 *
 * Example: a $400 Detailing Services job → $200 employee pool → split among
 * assigned workers → each share reduced by their tier deduction.
 *
 * Keys are the exact QBO item names as stored in services.serviceType.
 * Legacy enum values are mapped too so old services calculate correctly.
 */
export const SERVICE_TYPE_SHARES: Record<string, number> = {
  // ── Current QBO item names ──────────────────────────────────────────────
  'Recurring Services':        55,
  'Detailing Services':        50,
  'Buffing/Waxing Services':   45,
  'Acid Washing Services':     40,
  'Powerwashing Services':     50,
  'Gelcoat/Wetsanding Services': 50,
  'Captaining Services':       83,
  'SIO2 Coating':              40,
  'Other Services':            50,
  'Training Pay':             100,

  // ── Legacy enum values (services created before QBO items were used) ────
  recurring:          55,
  detailing:          50,
  buffing_waxing:     45,
  acid_washing:       40,
  powerwashing:       50,
  gelcoat_wetsanding: 50,
  captaining:         83,
  other:              50,
}

/** Fallback share for unrecognized service types. */
export const DEFAULT_SERVICE_TYPE_SHARE = 50

/**
 * Returns the employee pay-pool share percentage for a given service type.
 * E.g. getServiceTypeShare('Recurring Services') === 55
 */
export function getServiceTypeShare(serviceType: string): number {
  return SERVICE_TYPE_SHARES[serviceType] ?? DEFAULT_SERVICE_TYPE_SHARE
}
