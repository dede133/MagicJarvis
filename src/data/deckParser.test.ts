import { describe, expect, it } from 'vitest'
import cuteDeckText from './decks/cute.txt?raw'
import tritonesDeckText from './decks/tritones.txt?raw'
import { parseDeckList } from './deckParser'
import {
  getDeckCardTotal,
  getMainboardCardTotal,
  getUniqueCardNames,
} from '../types/deck'

describe('parseDeckList', () => {
  it('parses a single card quantity', () => {
    const deck = parseDeckList(
      '[COMMANDER]\n1 Commander\n[DECK]\n1 Counterspell',
    )
    expect(deck.mainboard).toEqual([{ quantity: 1, name: 'Counterspell' }])
  })

  it('parses large quantities', () => {
    const deck = parseDeckList('[COMMANDER]\n1 Commander\n[DECK]\n34 Island')
    expect(deck.mainboard).toEqual([{ quantity: 34, name: 'Island' }])
  })

  it('parses the export format, print metadata and active totals', () => {
    const deck = parseDeckList(tritonesDeckText)
    expect(deck.commanders).toEqual([
      {
        quantity: 1,
        name: 'Namor the Sub-Mariner',
        setCode: 'MSH',
        collectorNumber: '391',
        foil: true,
      },
    ])
    expect(deck.commander).toEqual(deck.commanders?.[0])
    expect(getMainboardCardTotal(deck)).toBe(99)
    expect(getDeckCardTotal(deck)).toBe(100)
    expect(
      deck.mainboard.find((entry) => entry.name === 'Island'),
    ).toMatchObject({ quantity: 30, setCode: 'EOE', collectorNumber: '269' })
    expect(getUniqueCardNames(deck)).toHaveLength(71)
    expect(deck.sideboard).toHaveLength(6)
    expect(deck.maybeboard).toHaveLength(14)
  })

  it('parses multiple exported commanders without mixing the mainboard', () => {
    const deck = parseDeckList(cuteDeckText)
    expect(deck.commanders).toEqual([
      {
        quantity: 1,
        name: 'Ishai, Ojutai Dragonspeaker',
        setCode: 'BLC',
        collectorNumber: '89',
        foil: true,
      },
      {
        quantity: 1,
        name: 'Yoshimaru, Ever Faithful',
        setCode: 'SLD',
        collectorNumber: '794',
        foil: true,
      },
    ])
    expect(deck.commander.name).toBe('Ishai, Ojutai Dragonspeaker')
    expect(getMainboardCardTotal(deck)).toBe(98)
    expect(getDeckCardTotal(deck)).toBe(100)
    expect(getUniqueCardNames(deck)).toHaveLength(89)
    expect(deck.sideboard).toHaveLength(2)
    expect(deck.maybeboard).toHaveLength(26)
    expect(
      deck.mainboard.find((entry) => entry.name === 'Flaming Fist'),
    ).toMatchObject({
      setCode: 'CLB',
      collectorNumber: '474',
      etched: true,
    })
  })

  it('supports multiple commanders in explicit section format', () => {
    const deck = parseDeckList(
      '[COMMANDER]\n1 Commander One\n1 Commander Two\n[DECK]\n98 Island',
    )
    expect(deck.commanders?.map((entry) => entry.name)).toEqual([
      'Commander One',
      'Commander Two',
    ])
    expect(getDeckCardTotal(deck)).toBe(100)
  })
})
