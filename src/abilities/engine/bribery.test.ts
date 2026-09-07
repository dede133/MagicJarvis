import { describe, expect, it } from 'vitest'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import {
  advancePendingResolution,
  createSpellEffectResolution,
} from './abilityEngine'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import type { CardDefinition } from '../../types/card'

const bribery: CardDefinition = {
  scryfallId: 'bribery',
  name: 'Bribery',
  manaCost: '{3}{U}{U}',
  cmc: 5,
  typeLine: 'Sorcery',
  oracleText:
    "Search target opponent's library for a creature card and put that card onto the battlefield under your control. Then that player shuffles.",
  colors: ['U'],
  colorIdentity: ['U'],
}

const stolenCreature: CardDefinition = {
  scryfallId: 'stolen-creature',
  name: 'Stolen Creature',
  manaCost: '{4}{U}',
  cmc: 5,
  typeLine: 'Creature — Sphinx',
  oracleText: 'Flying',
  colors: ['U'],
  colorIdentity: ['U'],
  power: '4',
  toughness: '4',
}

describe('Bribery runtime', () => {
  it('searches the selected opponent physical library for a creature', () => {
    const ability = getAbilitiesForCard(bribery)[0]
    expect(ability).toMatchObject({
      id: 'bribery-spell',
      kind: 'SPELL_EFFECT',
      automation: 'ASSISTED',
    })
    if (!ability || ability.kind !== 'SPELL_EFFECT') return

    const state = createInitialGameState()
    const resolution = createSpellEffectResolution(
      { instanceId: 'bribery-instance', card: bribery },
      ability,
    )
    const playerStep = advancePendingResolution(state, resolution)
    expect(playerStep.type).toBe('DECISION')
    if (playerStep.type !== 'DECISION') return
    expect(playerStep.decision).toMatchObject({
      type: 'PLAYER_SELECTION',
      decisionPlayerId: state.localPlayerId,
    })

    const searchResolution = {
      ...playerStep.resolution,
      effects: [...playerStep.decision.continuation.effectsToExecute],
      currentEffectIndex: 0,
      context: {
        ...playerStep.resolution.context,
        selectedPlayers: ['player-2'],
      },
    }
    const searchStep = advancePendingResolution(state, searchResolution)
    expect(searchStep.type).toBe('DECISION')
    if (searchStep.type !== 'DECISION') return
    expect(searchStep.decision).toMatchObject({
      type: 'HIDDEN_ZONE_CARD_SELECTION',
      decisionPlayerId: state.localPlayerId,
      constraints: { cardTypesAnyOf: ['Creature'] },
      continuation: {
        librarySearch: {
          player: 'TARGET_PLAYER',
          playerId: 'player-2',
          destination: 'battlefield',
          controller: 'SOURCE_CONTROLLER',
          shuffle: true,
          allowFail: true,
        },
      },
    })
  })

  it('preserves opponent ownership while the searched creature enters under local control', () => {
    let state = createInitialGameState()
    state = applyGameAction(state, {
      type: 'DECLARE_EXTERNAL_CARD',
      instanceId: 'searched-creature',
      card: stolenCreature,
      zone: 'library',
      controllerId: 'player-2',
      knownBecause: 'SEARCHED',
    })
    state = applyGameAction(state, {
      type: 'MOVE_CARD',
      instanceId: 'searched-creature',
      toZone: 'battlefield',
      controllerId: state.localPlayerId,
    })

    expect(
      state.cards.find((card) => card.instanceId === 'searched-creature'),
    ).toMatchObject({
      zone: 'battlefield',
      ownerId: 'player-2',
      controllerId: state.localPlayerId,
      controller: 'YOU',
      knownBecause: 'SEARCHED',
    })
  })
})
