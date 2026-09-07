import { describe, expect, it } from 'vitest'
import { getVisualCardLabel } from './cardLabels'
import type { CardInstance } from '../types/card'

const card = (id: string, name: string): CardInstance => ({
  instanceId: id,
  card: {
    scryfallId: id,
    name,
    cmc: 0,
    typeLine: 'Land',
    colors: [],
    colorIdentity: [],
  },
  zone: 'battlefield',
  tapped: false,
  counters: {},
})

describe('getVisualCardLabel', () => {
  it('numbers only duplicate names in the visible context', () => {
    const cards = [
      card('island-a', 'Island'),
      card('island-b', 'Island'),
      card('tower', 'Reliquary Tower'),
    ]
    expect(
      cards.map((instance) => getVisualCardLabel(instance, cards)),
    ).toEqual(['Island 1', 'Island 2', 'Reliquary Tower'])
  })
})
