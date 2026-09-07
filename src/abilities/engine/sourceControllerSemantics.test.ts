import { describe, expect, it } from 'vitest'
import {
  advancePendingResolution,
  createPendingResolution,
  createSpellEffectResolution,
  evaluateAbilities,
} from './abilityEngine'
import { checkTargetLegality } from '../../rules/targeting/targetingRules'
import { createInitialGameState } from '../../engine/gameEngine'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import type { PendingAbility } from '../types/abilityTypes'
import { namorAbilities } from '../definitions/namor'
import { unbreakableFormationAbilities } from '../definitions/cuteGreenYellowSweep'

const card = (
  name: string,
  typeLine = 'Creature — Test',
  power = '2',
  toughness = '2',
): CardDefinition => ({
  scryfallId: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  typeLine,
  manaCost: '',
  oracleText: '',
  cmc: 0,
  colors: [],
  colorIdentity: [],
  power,
  toughness,
})

const instance = (
  instanceId: string,
  definition: CardDefinition,
  playerId: string,
  zone: CardInstance['zone'] = 'battlefield',
): CardInstance => ({
  instanceId,
  card: definition,
  zone,
  tapped: false,
  counters: {},
  ownerId: playerId,
  controllerId: playerId,
  controller: playerId === 'player-1' ? 'YOU' : 'OPPONENT',
})

const stateFor = (cards: CardInstance[], activePlayerId = 'player-2'): GameState => {
  const base = createInitialGameState()
  return {
    ...base,
    cards,
    activePlayerId,
    activePlayer: activePlayerId === 'player-1' ? 'local' : 'opponent',
    turnOrder: ['player-1', 'player-2'],
    turnState: { phase: 'PRECOMBAT_MAIN', step: 'MAIN_1', priority: 'WINDOW_OPEN' },
    players: [
      { ...base.players[0], id: 'player-1', isLocal: true },
      {
        id: 'player-2',
        life: 40,
        manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
      },
    ],
  }
}

const pendingFor = (
  source: CardInstance,
  resolvedEffects: PendingAbility['resolvedEffects'],
): PendingAbility => ({
  id: `pending-${source.instanceId}`,
  abilityId: 'fixture-ability',
  sourceInstanceId: source.instanceId,
  sourceCardName: source.card.name,
  createdFromEvent: { type: 'ABILITY_ACTIVATED' },
  resolvedEffects,
  automation: 'AUTO',
})

describe('source-controller semantics', () => {
  it('treats YOU/OPPONENT target constraints relative to the P2 source controller', () => {
    const source = instance('source', card('P2 Source'), 'player-2')
    const p2Target = instance('p2-target', card('P2 Target'), 'player-2')
    const p1Target = instance('p1-target', card('P1 Target'), 'player-1')
    const state = stateFor([source, p2Target, p1Target])
    const targetingSource = {
      sourceInstanceId: source.instanceId,
      sourceCard: source.card,
      controllerId: 'player-2',
      kind: 'TRIGGERED_ABILITY' as const,
    }

    expect(
      checkTargetLegality(state, p2Target, targetingSource, {
        zones: ['battlefield'],
        controller: 'YOU',
      }),
    ).toEqual({ legal: true })
    expect(
      checkTargetLegality(state, p1Target, targetingSource, {
        zones: ['battlefield'],
        controller: 'YOU',
      }),
    ).toMatchObject({ legal: false, reason: 'CONTROLLER' })
    expect(
      checkTargetLegality(state, p1Target, targetingSource, {
        zones: ['battlefield'],
        controller: 'OPPONENT',
      }),
    ).toEqual({ legal: true })
  })

  it('defaults legacy draw, token and mana effects to the P2 source controller', () => {
    const source = instance('source', card('P2 Source'), 'player-2')
    const state = stateFor([source])
    const pending = pendingFor(source, [
      { type: 'DRAW_CARD', amount: 1 },
      { type: 'CREATE_TOKEN', tokenId: 'BLUE_MERFOLK_1_1', amount: 1 },
      { type: 'ADD_MANA', color: 'U', amount: 1 },
    ])
    const step = advancePendingResolution(state, createPendingResolution(pending))
    expect(step.type).toBe('ACTIONS')
    if (step.type !== 'ACTIONS') return

    expect(step.actions).toContainEqual({ type: 'DRAW_CARD', playerId: 'player-2' })
    expect(step.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CREATE_TOKEN',
          controllerId: 'player-2',
          ownerId: 'player-2',
        }),
        {
          type: 'ADD_MANA',
          color: 'U',
          amount: 1,
          actorPlayerId: 'player-2',
        },
      ]),
    )
  })

  it('asks the P2 source controller to discard only a P2 known hand card', () => {
    const source = instance('source', card('P2 Source'), 'player-2')
    const p1Hand = instance('p1-hand', card('P1 Hand Card', 'Instant'), 'player-1', 'hand')
    const p2Hand = instance('p2-hand', card('P2 Hand Card', 'Instant'), 'player-2', 'hand')
    const state = stateFor([source, p1Hand, p2Hand])
    const pending = pendingFor(source, [
      { type: 'DISCARD_CARD', player: 'YOU', amount: 1 },
    ])
    const step = advancePendingResolution(state, createPendingResolution(pending))
    expect(step.type).toBe('DECISION')
    if (step.type !== 'DECISION') return

    expect(step.decision.decisionPlayerId).toBe('player-2')
    expect(step.decision.options).toEqual([
      { instanceId: 'p2-hand', label: 'P2 Hand Card' },
    ])
  })

  it('makes Namor trigger only for spells cast by its own controller when Namor is P2', () => {
    const namor = instance(
      'namor',
      card('Namor the Sub-Mariner', 'Legendary Creature — Human Mutant'),
      'player-2',
    )
    const state = stateFor([namor])
    const p1Cast = {
      type: 'SPELL_CAST' as const,
      cardInstanceId: 'p1-spell',
      cardName: 'Blue Instant',
      isCreature: false,
      blueManaSymbols: 1,
      controller: 'YOU' as const,
      playerId: 'player-1',
      cardTypes: ['Instant'],
      subtypes: [],
      isToken: false as const,
    }
    const p2Cast = {
      ...p1Cast,
      cardInstanceId: 'p2-spell',
      controller: 'OPPONENT' as const,
      playerId: 'player-2',
    }
    const getAbilities = () => namorAbilities

    expect(evaluateAbilities(state, p1Cast, state, getAbilities)).toHaveLength(0)
    expect(evaluateAbilities(state, p2Cast, state, getAbilities)).toHaveLength(1)
  })

  it('applies Unbreakable Formation addendum only during its controller main phase', () => {
    const spellDefinition = card('Unbreakable Formation', 'Instant')
    const spell = instance('formation', spellDefinition, 'player-2', 'stack')
    const creature = instance('p2-creature', card('P2 Creature'), 'player-2')
    const ability = unbreakableFormationAbilities[0]
    if (ability.kind !== 'SPELL_EFFECT') throw new Error('Expected spell effect')

    const opponentMain = stateFor([spell, creature], 'player-1')
    const opponentStep = advancePendingResolution(
      opponentMain,
      createSpellEffectResolution(spell, ability),
    )
    expect(opponentStep.type).toBe('ACTIONS')
    if (opponentStep.type === 'ACTIONS')
      expect(opponentStep.actions.some((action) => action.type === 'ADD_COUNTER')).toBe(false)

    const ownMain = stateFor([spell, creature], 'player-2')
    const ownStep = advancePendingResolution(
      ownMain,
      createSpellEffectResolution(spell, ability),
    )
    expect(ownStep.type).toBe('ACTIONS')
    if (ownStep.type === 'ACTIONS')
      expect(ownStep.actions).toContainEqual({
        type: 'ADD_COUNTER',
        instanceId: creature.instanceId,
        counter: '+1/+1',
        amount: 1,
      })
  })
})
