// Curated boat-type taxonomy for the client-facing instant quote tool.
// Each type's physical attributes drive which detail add-ons are relevant:
// e.g. only cabin boats are offered a cabin-interior detail, only carpeted
// boats are offered a carpet shampoo, only flybridge boats get the bridge
// upcharge. Kept in code (not DB) since the attributes are structural facts
// about the boat, not a business setting anyone needs to tweak day-to-day.

export type BoatType = {
  key: string
  label: string
  blurb: string
  hasCabin: boolean
  hasCarpet: boolean
  hasBridge: boolean
}

export const BOAT_TYPES: BoatType[] = [
  {
    key: 'bowrider',
    label: 'Bowrider / Ski Boat',
    blurb: 'Open bow, carpeted cockpit',
    hasCabin: false,
    hasCarpet: true,
    hasBridge: false,
  },
  {
    key: 'wakeboard',
    label: 'Wakeboard / Wake Surf Boat',
    blurb: 'Tower, ballast, carpeted interior',
    hasCabin: false,
    hasCarpet: true,
    hasBridge: false,
  },
  {
    key: 'deck_boat',
    label: 'Deck Boat',
    blurb: 'Wide-beam open deck, vinyl seating',
    hasCabin: false,
    hasCarpet: false,
    hasBridge: false,
  },
  {
    key: 'pontoon',
    label: 'Pontoon / Tritoon',
    blurb: 'Flat deck, vinyl flooring',
    hasCabin: false,
    hasCarpet: false,
    hasBridge: false,
  },
  {
    key: 'center_console',
    label: 'Center Console',
    blurb: 'Open fishing layout, no cabin',
    hasCabin: false,
    hasCarpet: false,
    hasBridge: false,
  },
  {
    key: 'cuddy_cabin',
    label: 'Cuddy Cabin',
    blurb: 'Small forward cabin below the bow',
    hasCabin: true,
    hasCarpet: true,
    hasBridge: false,
  },
  {
    key: 'express_cruiser',
    label: 'Express Cruiser / Cabin Cruiser',
    blurb: 'Below-deck cabin, carpeted salon',
    hasCabin: true,
    hasCarpet: true,
    hasBridge: false,
  },
  {
    key: 'sport_fisherman',
    label: 'Sport Fisherman / Flybridge',
    blurb: 'Cabin plus a raised flybridge helm',
    hasCabin: true,
    hasCarpet: true,
    hasBridge: true,
  },
  {
    key: 'sailboat',
    label: 'Sailboat',
    blurb: 'Below-deck cabin, fiberglass or teak sole',
    hasCabin: true,
    hasCarpet: false,
    hasBridge: false,
  },
  {
    key: 'jon_boat',
    label: 'Aluminum Fishing / Jon Boat',
    blurb: 'Bare aluminum hull, no upholstery',
    hasCabin: false,
    hasCarpet: false,
    hasBridge: false,
  },
]

export function getBoatType(key: string): BoatType | undefined {
  return BOAT_TYPES.find((t) => t.key === key)
}
