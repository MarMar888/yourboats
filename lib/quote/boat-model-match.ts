// Pure matching/ranking logic for the boat-model typeahead, kept separate
// from the DB fetch so it's unit-testable without mocking drizzle.

export type BoatModelRow = {
  id: string
  make: string
  model: string
  boatTypeKey: string
  lengthFt: number
  active: boolean
}

// A single typeahead suggestion, whichever source it came from: a catalog
// row (id set, precise) or an AI best-effort guess for a boat not in the
// catalog (id null, so it's never mistaken for a real catalog match).
export type BoatSuggestion = {
  id: string | null
  make: string
  model: string
  boatTypeKey: string
  lengthFt: number
  source: 'catalog' | 'ai'
}

export function suggestionFromCatalogRow(row: BoatModelRow): BoatSuggestion {
  return { id: row.id, make: row.make, model: row.model, boatTypeKey: row.boatTypeKey, lengthFt: row.lengthFt, source: 'catalog' }
}

export function rankBoatModels(query: string, rows: BoatModelRow[], limit = 8): BoatModelRow[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const terms = q.split(/\s+/).filter(Boolean)

  return rows
    .filter((r) => r.active)
    .map((row) => {
      const haystack = `${row.make} ${row.model}`.toLowerCase()
      if (!terms.every((t) => haystack.includes(t))) return null
      const score = haystack.startsWith(q) ? 0 : haystack.includes(q) ? 1 : 2
      return { row, score }
    })
    .filter((x): x is { row: BoatModelRow; score: number } => x !== null)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.row.make.localeCompare(b.row.make) ||
        a.row.model.localeCompare(b.row.model)
    )
    .slice(0, limit)
    .map((x) => x.row)
}
