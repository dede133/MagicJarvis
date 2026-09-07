import { describe, expect, it } from 'vitest'
import {
  deriveActiveStaticEffects,
  modifiedPowerToughness,
} from '../abilities/engine/staticEffects'
import { createInitialGameState } from '../engine/gameEngine'
import { checkStateBasedActions } from './stateBasedActions'
import type { CardInstance } from '../types/card'

const namor: CardInstance = {
  instanceId: 'namor',
  card: {
    scryfallId: 'namor',
    name: 'Namor the Sub-Mariner',
    manaCost: '{1}{U}',
    cmc: 2,
    typeLine: 'Legendary Creature — Mutant Merfolk Villain',
    colors: ['U'],
    colorIdentity: ['U'],
    power: '*',
    toughness: '4',
  },
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ownerId: 'player-1',
  controllerId: 'player-1',
}

describe('dynamic printed power/toughness', () => {
  it("preserves Namor's printed toughness and counts itself as a Merfolk", () => {
    const state = createInitialGameState([namor])
    const active = deriveActiveStaticEffects(state)

    expect(modifiedPowerToughness(namor, active)).toEqual({
      power: 1,
      toughness: 4,
    })
  })

  it('counts another Merfolk in addition to Namor itself', () => {
    const otherMerfolk: CardInstance = {
      ...namor,
      instanceId: 'other-merfolk',
      card: {
        ...namor.card,
        scryfallId: 'other-merfolk',
        name: 'Test Merfolk',
        typeLine: 'Creature — Merfolk',
        power: '1',
        toughness: '1',
      },
    }
    const state = createInitialGameState([namor, otherMerfolk])
    const active = deriveActiveStaticEffects(state)

    expect(modifiedPowerToughness(namor, active)).toEqual({
      power: 2,
      toughness: 4,
    })
  })

  it('does not send Namor to the graveyard as a 0-toughness SBA', () => {
    const state = createInitialGameState([namor])
    const result = checkStateBasedActions(state)

    expect(
      result.actions.some(
        (action) =>
          action.type === 'MOVE_CARD' &&
          action.instanceId === namor.instanceId &&
          action.toZone === 'graveyard',
      ),
    ).toBe(false)
  })
})
