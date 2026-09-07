import { describe, expect, it } from 'vitest'
import type { CardInstance } from '../types/card'
import { applyGameAction, createInitialGameState } from './gameEngine'

const card = (
  id: string,
  zone: CardInstance['zone'],
  tapped = false,
): CardInstance => ({
  instanceId: id,
  card: {
    scryfallId: id,
    name: id,
    cmc: 0,
    typeLine: 'Artifact',
    colors: [],
    colorIdentity: [],
  },
  zone,
  tapped,
  counters: {},
})

describe('applyGameAction', () => {
  it('gains and loses life', () => {
    const game = createInitialGameState()
    expect(applyGameAction(game, { type: 'GAIN_LIFE', amount: 3 }).life).toBe(
      43,
    )
    expect(applyGameAction(game, { type: 'LOSE_LIFE', amount: 5 }).life).toBe(
      35,
    )
  })

  it('adds and spends mana without letting the pool go negative', () => {
    const added = applyGameAction(createInitialGameState(), {
      type: 'ADD_MANA',
      color: 'G',
      amount: 2,
    })
    expect(
      applyGameAction(added, { type: 'SPEND_MANA', color: 'G', amount: 1 })
        .manaPool.G,
    ).toBe(1)
    expect(
      applyGameAction(added, { type: 'SPEND_MANA', color: 'G', amount: 4 })
        .manaPool.G,
    ).toBe(0)
  })

  it('taps and untaps a card', () => {
    const game = createInitialGameState([card('ring', 'battlefield')])
    const tapped = applyGameAction(game, {
      type: 'TAP_CARD',
      instanceId: 'ring',
    })
    expect(tapped.cards[0].tapped).toBe(true)
    expect(
      applyGameAction(tapped, { type: 'UNTAP_CARD', instanceId: 'ring' })
        .cards[0].tapped,
    ).toBe(false)
  })

  it('moves a card between zones', () => {
    const game = createInitialGameState([card('elf', 'hand')])
    expect(
      applyGameAction(game, {
        type: 'MOVE_CARD',
        instanceId: 'elf',
        toZone: 'battlefield',
      }).cards[0].zone,
    ).toBe('battlefield')
  })

  it('draws an unknown card by changing hidden counts without inventing an identity', () => {
    const game = {
      ...createInitialGameState(),
      hiddenZoneTracking: 'COUNTS_ONLY' as const,
      libraryCount: 2,
      handCount: 7,
    }
    const next = applyGameAction(game, { type: 'DRAW_CARD' })
    expect(next.libraryCount).toBe(1)
    expect(next.handCount).toBe(8)
    expect(next.cards).toEqual([])
  })

  it('untaps all battlefield cards only', () => {
    const game = createInitialGameState([
      card('one', 'battlefield', true),
      card('two', 'hand', true),
    ])
    const next = applyGameAction(game, { type: 'UNTAP_ALL' })
    expect(next.cards[0].tapped).toBe(false)
    expect(next.cards[1].tapped).toBe(true)
  })

  it('starts the next turn and empties mana', () => {
    const game = applyGameAction(createInitialGameState(), {
      type: 'ADD_MANA',
      color: 'U',
      amount: 2,
    })
    const next = applyGameAction(game, { type: 'NEXT_TURN' })
    expect(next.turn).toBe(2)
    expect(next.manaPool.U).toBe(0)
  })

  it('sets hidden zone counts as manual corrections', () => {
    const game = createInitialGameState()
    expect(
      applyGameAction(game, { type: 'SET_HAND_COUNT', count: 7 }).handCount,
    ).toBe(7)
    expect(
      applyGameAction(game, { type: 'SET_LIBRARY_COUNT', count: 92 })
        .libraryCount,
    ).toBe(92)
  })

  it('does not create mana when a card is tapped', () => {
    const game = createInitialGameState([card('island', 'battlefield')])
    const next = applyGameAction(game, {
      type: 'TAP_CARD',
      instanceId: 'island',
    })
    expect(next.manaPool).toEqual(game.manaPool)
  })

  it('materializes a known card from hand without creating an extra card', () => {
    const game = {
      ...createInitialGameState(),
      hiddenZoneTracking: 'COUNTS_ONLY' as const,
      handCount: 1,
    }
    const next = applyGameAction(game, {
      type: 'MATERIALIZE_CARD',
      instanceId: 'brainstorm-instance',
      card: card('brainstorm', 'hand').card,
      fromZone: 'hand',
      toZone: 'battlefield',
    })
    expect(next.handCount).toBe(0)
    expect(next.cards).toHaveLength(1)
    expect(next.cards[0].card.name).toBe('brainstorm')
  })

  it('returns source-bound linked cards immediately when the source leaves battlefield', () => {
    const source = { ...card('source', 'battlefield'), ownerId: 'player-1' }
    const linked = { ...card('linked', 'exile'), ownerId: 'player-1' }
    const game = {
      ...createInitialGameState([source, linked]),
      linkedObjectGroups: [
        {
          sourceInstanceId: 'source',
          key: 'until-source-leaves',
          linkedInstanceIds: ['linked'],
          returnOnSourceLeaves: {
            fromZone: 'exile' as const,
            destination: 'battlefield' as const,
            controller: 'OWNER' as const,
          },
        },
      ],
    }
    const next = applyGameAction(game, {
      type: 'MOVE_CARD',
      instanceId: 'source',
      toZone: 'graveyard',
    })
    expect(next.cards.find((item) => item.instanceId === 'linked')?.zone).toBe(
      'battlefield',
    )
    expect(next.linkedObjectGroups).toEqual([])
  })
})
