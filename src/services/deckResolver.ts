import { deckEntryKey, resolveDeckEntries } from './scryfall/scryfall'
import { getDeckCommanders, type DeckDefinition, type DeckList } from '../types/deck'

export type DeckResolution = {
  deck?: DeckDefinition
  notFound: string[]
  resolvedUniqueCards: number
}

/** Resolves deck recipes without expanding quantities into physical game instances. */
export const resolveDeckList = async (
  name: string,
  deck: DeckList,
): Promise<DeckResolution> => {
  const commanders = getDeckCommanders(deck)
  const entries = [...commanders, ...deck.mainboard]
  const { definitions, notFound } = await resolveDeckEntries(entries)
  if (notFound.length)
    return { notFound, resolvedUniqueCards: definitions.size }

  const resolveEntry = (entry: (typeof entries)[number]) => {
    const card = definitions.get(deckEntryKey(entry))
    if (!card) throw new Error(`Scryfall did not return ${entry.name}.`)
    return { ...entry, card }
  }
  return {
    deck: {
      name,
      commanders: commanders.map(resolveEntry),
      // Keep the current single-commander runtime working until Partner gameplay is added.
      commander: resolveEntry(deck.commander),
      mainboard: deck.mainboard.map(resolveEntry),
      sideboard: deck.sideboard,
      maybeboard: deck.maybeboard,
    },
    notFound: [],
    resolvedUniqueCards: definitions.size,
  }
}
