import { describe, expect, it } from 'vitest'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import { effectiveCardDefinition } from '../copy/copyCharacteristics'
import type { CardDefinition, CardInstance } from '../../types/card'

const transformingCard: CardDefinition = {
  scryfallId: 'transforming-card',
  layout: 'transform',
  name: 'Front Face',
  manaCost: '{1}{U}',
  cmc: 2,
  typeLine: 'Legendary Creature — Human',
  oracleText: '{T}: Transform Front Face.',
  colors: ['U'],
  colorIdentity: ['U'],
  power: '1',
  toughness: '2',
  cardFaces: [
    {
      name: 'Front Face',
      manaCost: '{1}{U}',
      typeLine: 'Legendary Creature — Human',
      oracleText: '{T}: Transform Front Face.',
      colors: ['U'],
      power: '1',
      toughness: '2',
    },
    {
      name: 'Back Face',
      typeLine: 'Legendary Creature — Avatar',
      oracleText: 'Flying',
      colors: ['U'],
      power: '4',
      toughness: '4',
    },
  ],
}

describe('transforming double-faced cards', () => {
  it('changes the effective face without creating a new object', () => {
    const permanent: CardInstance = {
      instanceId: 'dfc',
      card: transformingCard,
      zone: 'battlefield',
      tapped: true,
      counters: { '+1/+1': 2 },
      attachedToInstanceId: 'equipment',
      ownerId: 'player-1',
      controllerId: 'player-1',
    }
    const initial = createInitialGameState([permanent])
    const transformed = applyGameAction(initial, {
      type: 'TRANSFORM_CARD',
      instanceId: permanent.instanceId,
    })
    const result = transformed.cards[0]

    expect(result.instanceId).toBe(permanent.instanceId)
    expect(result.currentFaceIndex).toBe(1)
    expect(result.tapped).toBe(true)
    expect(result.counters).toEqual({ '+1/+1': 2 })
    expect(result.attachedToInstanceId).toBe('equipment')
    expect(effectiveCardDefinition(transformed, result)).toMatchObject({
      name: 'Back Face',
      typeLine: 'Legendary Creature — Avatar',
      power: '4',
      toughness: '4',
    })
  })

  it('returns to front-face characteristics after changing zones', () => {
    const permanent: CardInstance = {
      instanceId: 'dfc',
      card: transformingCard,
      zone: 'battlefield',
      tapped: false,
      counters: {},
      currentFaceIndex: 1,
    }
    const moved = applyGameAction(createInitialGameState([permanent]), {
      type: 'MOVE_CARD',
      instanceId: permanent.instanceId,
      toZone: 'graveyard',
    })
    expect(moved.cards[0].currentFaceIndex).toBe(0)
    expect(effectiveCardDefinition(moved, moved.cards[0]).name).toBe(
      'Front Face',
    )
  })

  it('does not transform modal double-faced cards', () => {
    const modal: CardInstance = {
      instanceId: 'modal',
      card: { ...transformingCard, layout: 'modal_dfc' },
      zone: 'battlefield',
      tapped: false,
      counters: {},
    }
    const state = createInitialGameState([modal])
    expect(
      applyGameAction(state, { type: 'TRANSFORM_CARD', instanceId: 'modal' }),
    ).toBe(state)
  })
})
