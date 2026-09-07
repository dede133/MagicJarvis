import type { CardDefinition } from './card'

export type DeckEntry = {
  quantity: number
  name: string
  setCode?: string
  collectorNumber?: string
  foil?: boolean
  etched?: boolean
}

export type DeckList = {
  /** All commanders declared by the deck recipe. Parsers populate this; optional only for legacy fixtures/snapshots. */
  commanders?: DeckEntry[]
  /** Legacy primary commander alias used by the current single-commander game runtime. */
  commander: DeckEntry
  mainboard: DeckEntry[]
  sideboard?: DeckEntry[]
  maybeboard?: DeckEntry[]
}

export type DeckCard = DeckEntry & {
  card: CardDefinition
}

/** A resolved deck recipe, before any physical card instances are created. */
export type DeckDefinition = {
  name: string
  /** All resolved commanders. Resolvers populate this; optional only for legacy fixtures/snapshots. */
  commanders?: DeckCard[]
  /** Legacy primary commander alias used by the current single-commander game runtime. */
  commander: DeckCard
  mainboard: DeckCard[]
  sideboard?: DeckEntry[]
  maybeboard?: DeckEntry[]
}

export const getDeckCommanders = (deck: DeckList): DeckEntry[] =>
  deck.commanders?.length ? deck.commanders : [deck.commander]

export const getDeckCardTotal = (deck: DeckList): number =>
  getDeckCommanders(deck).reduce((total, entry) => total + entry.quantity, 0) +
  deck.mainboard.reduce((total, entry) => total + entry.quantity, 0)

export const getMainboardCardTotal = (deck: DeckList): number =>
  deck.mainboard.reduce((total, entry) => total + entry.quantity, 0)

export const getUniqueCardNames = (deck: DeckList): string[] => [
  ...new Set([
    ...getDeckCommanders(deck).map((entry) => entry.name),
    ...deck.mainboard.map((entry) => entry.name),
  ]),
]

export const getResolvedDeckCommanders = (deck: DeckDefinition): DeckCard[] =>
  deck.commanders?.length ? deck.commanders : [deck.commander]
