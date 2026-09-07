import { describe, expect, it } from 'vitest'
import { resolveCardQuery } from './cardResolver'
import type { CardDefinition } from '../../types/card'
import type { DeckDefinition } from '../../types/deck'

const card = (name: string): CardDefinition => ({
  scryfallId: name,
  name,
  cmc: 0,
  typeLine: 'Artifact',
  colors: [],
  colorIdentity: [],
})
const deck: DeckDefinition = {
  name: 'aliases',
  commander: {
    quantity: 1,
    name: 'Namor the Sub-Mariner',
    card: card('Namor the Sub-Mariner'),
  },
  mainboard: [
    {
      quantity: 1,
      name: 'Sol Ring',
      card: { ...card('Sol Ring'), localizedAliases: ['anillo solar'] },
    },
    { quantity: 1, name: 'Mystic Remora', card: card('Mystic Remora') },
    { quantity: 1, name: 'Mystic Confluence', card: card('Mystic Confluence') },
    { quantity: 1, name: "Cosi's Trickster", card: card("Cosi's Trickster") },
    { quantity: 6, name: 'Plains', card: card('Plains') },
  ],
}

describe('local card name resolution', () => {
  it.each([
    ['anillo solar', 'Sol Ring'],
    ['remora', 'Mystic Remora'],
    ['rémora', 'Mystic Remora'],
    ['cosi', "Cosi's Trickster"],
    ['solar ring', 'Sol Ring'],
    ['llanura', 'Plains'],
    ['llanuras', 'Plains'],
  ])('resolves a local/partial spoken alias: %s', (query, name) => {
    expect(resolveCardQuery(deck, query)).toEqual({ status: 'resolved', name })
  })

  it('does not guess when a partial name identifies multiple active cards', () => {
    expect(resolveCardQuery(deck, 'mystic')).toMatchObject({
      status: 'ambiguous',
    })
  })

  it('normalizes Spanish basic-land names without inventing cards outside the active deck', () => {
    expect(resolveCardQuery(deck, 'bosque')).toEqual({ status: 'not_found' })
  })

  it('uses prepared aliases without any network dependency', () => {
    expect(resolveCardQuery(deck, 'anillo solar')).toMatchObject({
      status: 'resolved',
    })
  })
})
