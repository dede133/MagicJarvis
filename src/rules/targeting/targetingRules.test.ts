import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import type { CardDefinition, CardInstance } from '../../types/card'
import { checkTargetLegality, targetingCosts } from './targetingRules'

const definition = (
  name: string,
  typeLine = 'Creature — Merfolk',
  oracleText = '',
): CardDefinition => ({
  scryfallId: name,
  name,
  cmc: 2,
  typeLine,
  oracleText,
  colors: ['U'],
  colorIdentity: ['U'],
})

const permanent = (
  id: string,
  card: CardDefinition,
  controllerId = 'player-1',
): CardInstance => ({
  instanceId: id,
  card,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  controller: controllerId === 'player-1' ? 'YOU' : 'OPPONENT',
  controllerId,
  ownerId: controllerId,
})

describe('central target legality', () => {
  it('allows our own hexproof target and rejects an opponent source', () => {
    const target = {
      ...permanent('target', definition('Hexproof Merfolk')),
      keywords: ['HEXPROOF'] as NonNullable<CardInstance['keywords']>,
    }
    const source = permanent('source', definition('Source'))
    const state = createInitialGameState([source, target])

    expect(
      checkTargetLegality(
        state,
        target,
        { sourceInstanceId: 'source', controllerId: 'player-1', kind: 'SPELL' },
        { zones: ['battlefield'] },
      ),
    ).toEqual({ legal: true })
    expect(
      checkTargetLegality(
        state,
        target,
        { sourceInstanceId: 'source', controllerId: 'player-2', kind: 'SPELL' },
        { zones: ['battlefield'] },
      ),
    ).toMatchObject({ legal: false, reason: 'HEXPROOF' })
  })

  it('rechecks the declared zone instead of following a target that moved', () => {
    const target = permanent('target', definition('Merfolk'))
    const source = permanent('source', definition('Source'))
    const state = createInitialGameState([
      source,
      { ...target, zone: 'graveyard' },
    ])
    expect(
      checkTargetLegality(
        state,
        state.cards.find((card) => card.instanceId === 'target')!,
        { sourceInstanceId: 'source', controllerId: 'player-1', kind: 'SPELL' },
        { zones: ['battlefield'] },
      ),
    ).toMatchObject({ legal: false, reason: 'ZONE' })
  })
})

describe('target-aware passive costs', () => {
  it('derives Kopala +{2} for opponent spells and activated abilities targeting our Merfolk', () => {
    const kopala = permanent(
      'kopala',
      definition(
        'Kopala, Warden of Waves',
        'Legendary Creature — Merfolk Wizard',
        'Spells your opponents cast that target a Merfolk you control cost {2} more to cast.\nAbilities your opponents activate that target a Merfolk you control cost {2} more to activate.',
      ),
    )
    const target = permanent('target', definition('Other Merfolk'))
    const state = createInitialGameState([kopala, target])

    expect(
      targetingCosts(state, target, {
        controllerId: 'player-2',
        kind: 'SPELL',
      }).additionalGeneric,
    ).toBe(2)
    expect(
      targetingCosts(state, target, {
        controllerId: 'player-2',
        kind: 'ACTIVATED_ABILITY',
      }).additionalGeneric,
    ).toBe(2)
    expect(
      targetingCosts(state, target, {
        controllerId: 'player-1',
        kind: 'SPELL',
      }).additionalGeneric,
    ).toBe(0)
  })

  it('derives Svyelun ward only for another Merfolk and only against an opponent', () => {
    const svyelun = permanent(
      'svyelun',
      definition(
        'Svyelun of Sea and Sky',
        'Legendary Creature — Merfolk God',
        'Svyelun has indestructible as long as you control at least two other Merfolk.\nWhenever Svyelun attacks, draw a card.\nOther Merfolk you control have ward {1}.',
      ),
    )
    const target = permanent('target', definition('Other Merfolk'))
    const state = createInitialGameState([svyelun, target])

    expect(
      targetingCosts(state, target, {
        controllerId: 'player-2',
        kind: 'TRIGGERED_ABILITY',
      }).wardCosts,
    ).toEqual(['{1}'])
    expect(
      targetingCosts(state, svyelun, {
        controllerId: 'player-2',
        kind: 'SPELL',
      }).wardCosts,
    ).toEqual([])
    expect(
      targetingCosts(state, target, {
        controllerId: 'player-1',
        kind: 'SPELL',
      }).wardCosts,
    ).toEqual([])
  })
})
