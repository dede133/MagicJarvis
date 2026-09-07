import { describe, expect, it } from 'vitest'
import { createInitialGameState, applyGameAction } from '../engine/gameEngine'
import { deriveGameEvents } from '../events/deriveGameEvents'
import { evaluateAbilities } from '../abilities/engine/abilityEngine'
import {
  deriveActiveStaticEffects,
  modifiedPowerToughness,
} from '../abilities/engine/staticEffects'
import { checkStateBasedActions } from './stateBasedActions'
import { cleanupDiscardDecision } from './turn/cleanup'
import type { CardDefinition, CardInstance } from '../types/card'
import type { AbilityDefinition } from '../abilities/types/abilityTypes'

const definition = (
  name: string,
  typeLine: string,
  power?: string,
  toughness?: string,
): CardDefinition => ({
  scryfallId: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  typeLine,
  manaCost: '',
  oracleText: '',
  cmc: 0,
  colors: [],
  colorIdentity: [],
  ...(power !== undefined ? { power } : {}),
  ...(toughness !== undefined ? { toughness } : {}),
})

const permanent = (
  instanceId: string,
  card: CardDefinition,
  playerId: string,
): CardInstance => ({
  instanceId,
  card,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ownerId: playerId,
  controllerId: playerId,
  controller: playerId === 'player-1' ? 'YOU' : 'OPPONENT',
})

const twoPlayerState = () => {
  const state = createInitialGameState()
  return {
    ...state,
    activePlayerId: 'player-2',
    activePlayer: 'opponent' as const,
    turnOrder: ['player-1', 'player-2'],
    players: [
      { ...state.players[0], id: 'player-1', isLocal: true },
      {
        id: 'player-2',
        life: 40,
        manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
      },
    ],
  }
}

describe('1v1 core passive/rules audit', () => {
  it('evaluates EVENT_CONTROLLER_IS relative to the P2 source controller', () => {
    const source = permanent('ishai', definition('Ishai fixture', 'Legendary Creature — Bird Monk', '1', '1'), 'player-2')
    const state = { ...twoPlayerState(), cards: [source] }
    const ability: AbilityDefinition = {
      id: 'opponent-cast-fixture',
      sourceCardName: source.card.name,
      kind: 'TRIGGERED',
      trigger: { type: 'SPELL_CAST' },
      conditions: [{ type: 'EVENT_CONTROLLER_IS', value: 'OPPONENT' }],
      effects: [{ type: 'ADD_COUNTER', target: 'SOURCE', counterType: '+1/+1', amount: { type: 'LITERAL', value: 1 } }],
      automation: 'AUTO',
    }
    const getAbilities = () => [ability]
    const p1Cast = {
      type: 'SPELL_CAST' as const,
      cardInstanceId: 'p1-spell',
      cardName: 'Spell',
      isCreature: false,
      blueManaSymbols: 0,
      controller: 'YOU' as const,
      playerId: 'player-1',
      cardTypes: ['Instant'],
      subtypes: [],
      isToken: false as const,
    }
    const p2Cast = { ...p1Cast, cardInstanceId: 'p2-spell', controller: 'OPPONENT' as const, playerId: 'player-2' }
    expect(evaluateAbilities(state, p1Cast, state, getAbilities)).toHaveLength(1)
    expect(evaluateAbilities(state, p2Cast, state, getAbilities)).toHaveLength(0)
  })

  it('fires a your-upkeep trigger only during the source controller upkeep', () => {
    const source = permanent('remora', definition('Remora fixture', 'Enchantment'), 'player-1')
    const state = { ...twoPlayerState(), cards: [source] }
    const ability: AbilityDefinition = {
      id: 'your-upkeep-fixture',
      sourceCardName: source.card.name,
      kind: 'TRIGGERED',
      trigger: { type: 'UPKEEP_STARTED' },
      conditions: [{ type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' }],
      effects: [{ type: 'ADD_COUNTER', target: 'SOURCE', counterType: 'AGE', amount: { type: 'LITERAL', value: 1 } }],
      automation: 'AUTO',
    }
    const getAbilities = () => [ability]
    const opponentUpkeep = {
      type: 'UPKEEP_STARTED' as const,
      turn: 2,
      phase: 'BEGINNING' as const,
      step: 'UPKEEP' as const,
      activePlayerId: 'player-2',
    }
    const controllerUpkeep = { ...opponentUpkeep, turn: 3, activePlayerId: 'player-1' }
    expect(evaluateAbilities(state, opponentUpkeep, state, getAbilities)).toHaveLength(0)
    expect(evaluateAbilities(state, controllerUpkeep, state, getAbilities)).toHaveLength(1)
  })

  it('counts SOURCE_CONTROLLER permanents for P2 dynamic power/toughness', () => {
    const creature = permanent('creature', definition('Bearer', 'Legendary Creature — Human', '2', '2'), 'player-2')
    const blackblade = {
      ...permanent('blackblade', definition('Blackblade Reforged', 'Legendary Artifact — Equipment'), 'player-2'),
      attachedToInstanceId: creature.instanceId,
    }
    const cards = [
      creature,
      blackblade,
      permanent('p2-land-a', definition('Island', 'Basic Land — Island'), 'player-2'),
      permanent('p2-land-b', definition('Plains', 'Basic Land — Plains'), 'player-2'),
      permanent('p1-land-a', definition('Island', 'Basic Land — Island'), 'player-1'),
      permanent('p1-land-b', definition('Island', 'Basic Land — Island'), 'player-1'),
      permanent('p1-land-c', definition('Island', 'Basic Land — Island'), 'player-1'),
    ]
    const state = { ...twoPlayerState(), cards }
    expect(modifiedPowerToughness(creature, deriveActiveStaticEffects(state))).toEqual({ power: 4, toughness: 4 })
  })

  it('offers the command-zone choice to the owner of a P2 commander', () => {
    const commander = {
      ...permanent('p2-commander', definition('P2 Commander', 'Legendary Creature — Dog', '2', '2'), 'player-2'),
      zone: 'graveyard' as const,
    }
    const state = {
      ...twoPlayerState(),
      cards: [commander],
      commanderIdsByPlayer: { 'player-1': [], 'player-2': [commander.instanceId] },
    }
    expect(checkStateBasedActions(state).decision).toMatchObject({
      type: 'COMMANDER_ZONE_CHOICE',
      decisionPlayerId: 'player-2',
      sourceInstanceId: commander.instanceId,
    })
  })

  it('asks the active P2 player to discard down to seven at cleanup', () => {
    const base = twoPlayerState()
    const state = {
      ...base,
      turnState: { phase: 'ENDING' as const, step: 'CLEANUP' as const, priority: 'NONE' as const },
      players: base.players.map((player) =>
        player.id === 'player-2'
          ? { ...player, hiddenZoneTracking: 'COUNTS_ONLY' as const, handCount: 9 }
          : player,
      ),
    }
    expect(cleanupDiscardDecision(state)).toMatchObject({
      type: 'CLEANUP_DISCARD_SELECTION',
      decisionPlayerId: 'player-2',
      continuation: { cleanupDiscard: { maxHandSize: 7 } },
    })
  })

  it('emits exactly one CARD_DRAWN event for a successful draw-step draw', () => {
    const state = {
      ...twoPlayerState(),
      turnState: { phase: 'BEGINNING' as const, step: 'UPKEEP' as const, priority: 'NONE' as const },
    }
    const action = { type: 'ADVANCE_STEP' as const }
    const next = applyGameAction(state, action)
    const draws = deriveGameEvents(state, action, next).filter((event) => event.type === 'CARD_DRAWN')
    expect(draws).toHaveLength(1)
    expect(draws[0]).toMatchObject({ playerId: 'player-2' })
  })
})
