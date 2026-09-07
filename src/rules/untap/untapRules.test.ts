import { describe, expect, it } from 'vitest'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import type { CardInstance } from '../../types/card'

const permanent = (
  id: string,
  counters: Record<string, number> = {},
): CardInstance => ({
  instanceId: id,
  card: {
    scryfallId: id,
    name: id,
    cmc: 0,
    typeLine: 'Creature',
    colors: [],
    colorIdentity: [],
  },
  zone: 'battlefield',
  tapped: true,
  counters,
  controller: 'YOU',
  controllerId: 'player-1',
  ownerId: 'player-1',
})

describe('stun counters and untap attempts', () => {
  it('removes one stun counter instead of untapping', () => {
    const state = createInitialGameState([permanent('target', { stun: 2 })])
    const next = applyGameAction(state, {
      type: 'UNTAP_CARD',
      instanceId: 'target',
    })
    expect(next.cards[0]).toMatchObject({ tapped: true, counters: { stun: 1 } })
  })

  it('untaps normally after the final stun counter has already been removed', () => {
    const state = createInitialGameState([permanent('target', { stun: 1 })])
    const first = applyGameAction(state, {
      type: 'UNTAP_CARD',
      instanceId: 'target',
    })
    const second = applyGameAction(first, {
      type: 'UNTAP_CARD',
      instanceId: 'target',
    })
    expect(first.cards[0]).toMatchObject({ tapped: true, counters: { stun: 0 } })
    expect(second.cards[0].tapped).toBe(false)
  })

  it('does not treat an untap-step restriction as a ban on explicit untap effects', () => {
    const source = permanent('source')
    const target = permanent('target', { stun: 1 })
    const state = {
      ...createInitialGameState([source, target]),
      untapRestrictions: [
        {
          sourceInstanceId: 'source',
          targetInstanceId: 'target',
          duration: 'WHILE_SOURCE_CONTROLLED' as const,
        },
      ],
    }
    const next = applyGameAction(state, {
      type: 'UNTAP_CARD',
      instanceId: 'target',
    })
    expect(next.cards.find((card) => card.instanceId === 'target')).toMatchObject(
      { tapped: true, counters: { stun: 0 } },
    )
  })

  it('ends a while-source-controlled untap restriction when its source leaves or changes control', () => {
    const source = permanent('source')
    const target = permanent('target')
    const restricted = applyGameAction(createInitialGameState([source, target]), {
      type: 'ADD_UNTAP_RESTRICTION',
      sourceInstanceId: 'source',
      sourceControllerId: 'player-1',
      targetInstanceId: 'target',
      duration: 'WHILE_SOURCE_CONTROLLED',
    })

    const afterLeave = applyGameAction(restricted, {
      type: 'MOVE_CARD',
      instanceId: 'source',
      toZone: 'graveyard',
    })
    expect(afterLeave.untapRestrictions).toHaveLength(0)

    const afterControlChange = applyGameAction(restricted, {
      type: 'SET_CARD_CONTROLLER',
      instanceId: 'source',
      controllerId: 'player-2',
    })
    expect(afterControlChange.untapRestrictions).toHaveLength(0)
  })

  it('uses the same stun replacement during the active player untap step', () => {
    const state = createInitialGameState([permanent('target', { stun: 1 })])
    const next = applyGameAction(state, { type: 'START_TURN' })
    expect(next.cards[0]).toMatchObject({ tapped: true, counters: { stun: 0 } })
  })

  it('uses the same untap rules for UNTAP_ALL effects', () => {
    const state = createInitialGameState([
      permanent('stunned', { stun: 1 }),
      permanent('normal'),
    ])
    const next = applyGameAction(state, { type: 'UNTAP_ALL' })
    expect(next.cards.find((card) => card.instanceId === 'stunned')).toMatchObject(
      { tapped: true, counters: { stun: 0 } },
    )
    expect(next.cards.find((card) => card.instanceId === 'normal')?.tapped).toBe(
      false,
    )
  })
})
