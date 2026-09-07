import { describe, expect, it } from 'vitest'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import {
  advancePendingResolution,
  createActivatedPendingAbility,
  createPendingResolution,
  evaluateDelayedEffects,
} from './abilityEngine'
import { resolveActivatedAbility } from './activationEngine'
import { deriveActiveStaticEffects, hasEffectiveKeyword } from './staticEffects'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameAction } from '../../actions/gameActions'

const mistDancer: CardDefinition = {
  scryfallId: 'mist-dancer',
  name: 'Mist Dancer',
  manaCost: '{4}{U}',
  cmc: 5,
  typeLine: 'Creature — Merfolk Wizard',
  oracleText:
    'Flying\nOther Merfolk you control get +1/+0 and have flying.\nEncore {5}{U}{U}',
  colors: ['U'],
  colorIdentity: ['U'],
  power: '3',
  toughness: '3',
}

const otherMerfolk: CardDefinition = {
  scryfallId: 'other-merfolk',
  name: 'Other Merfolk',
  manaCost: '{U}',
  cmc: 1,
  typeLine: 'Creature — Merfolk',
  colors: ['U'],
  colorIdentity: ['U'],
  power: '1',
  toughness: '1',
}

const instance = (
  instanceId: string,
  card: CardDefinition,
  zone: CardInstance['zone'],
): CardInstance => ({
  instanceId,
  card,
  zone,
  tapped: false,
  counters: {},
  ownerId: 'player-1',
  controllerId: 'player-1',
  controller: 'YOU',
})

const applyAll = (
  state: ReturnType<typeof createInitialGameState>,
  actions: GameAction[],
) =>
  actions.reduce(
    (next, action, index) =>
      applyGameAction(next, action, {
        actionId: `test-${index}`,
        timestamp: index,
      }),
    state,
  )

describe('Mist Dancer / Encore', () => {
  it('grants +1/+0 and flying to other Merfolk', () => {
    const dancer = instance('mist', mistDancer, 'battlefield')
    const merfolk = instance('merfolk', otherMerfolk, 'battlefield')
    const state = createInitialGameState([dancer, merfolk])
    const statics = deriveActiveStaticEffects(state)
    expect(statics.powerToughnessModifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceInstanceId: dancer.instanceId,
          power: 1,
          toughness: 0,
        }),
      ]),
    )
    expect(hasEffectiveKeyword(state, merfolk, 'FLYING')).toBe(true)
  })

  it('pays {5}{U}{U}, exiles the source from graveyard, and creates one hasty required attacker per current opponent', () => {
    const dancer = instance('mist', mistDancer, 'graveyard')
    let state = createInitialGameState([dancer])
    state = {
      ...state,
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
      manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 5 },
    }
    const ability = getAbilitiesForCard(mistDancer).find(
      (candidate) =>
        candidate.kind === 'ACTIVATED' && candidate.id === 'mist-dancer-encore',
    )
    expect(ability?.kind).toBe('ACTIVATED')
    if (!ability || ability.kind !== 'ACTIVATED') return

    const activation = resolveActivatedAbility(
      state,
      dancer.instanceId,
      ability,
    )
    expect(activation.ok).toBe(true)
    if (!activation.ok) return
    state = applyAll(state, activation.costActions)
    expect(
      state.cards.find((card) => card.instanceId === dancer.instanceId)?.zone,
    ).toBe('exile')

    const pending = createActivatedPendingAbility(dancer, ability)
    const result = advancePendingResolution(
      state,
      createPendingResolution(pending),
    )
    expect(result.type).toBe('ACTIONS')
    if (result.type !== 'ACTIONS') return
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CREATE_TOKEN_COPY',
          sourceInstanceId: dancer.instanceId,
          amount: 1,
          grantKeywords: ['HASTE'],
          attackPlayerIds: ['player-2'],
        }),
        expect.objectContaining({ type: 'ADD_DELAYED_EFFECT' }),
      ]),
    )
    state = applyAll(state, result.actions)
    const token = state.cards.find(
      (card) => card.isToken && card.copiedFromInstanceId === dancer.instanceId,
    )
    expect(token).toBeDefined()
    expect(token && hasEffectiveKeyword(state, token, 'HASTE')).toBe(true)
    expect(state.attackRequirements).toContainEqual({
      attackerInstanceId: token?.instanceId,
      defendingPlayerId: 'player-2',
      turn: state.turn,
    })
    expect(state.delayedEffects).toHaveLength(1)
  })

  it('rejects an attacker declaration that omits an able Encore token', () => {
    const dancer = instance('mist', mistDancer, 'exile')
    let state = createInitialGameState([dancer])
    state = applyGameAction(state, {
      type: 'CREATE_TOKEN_COPY',
      sourceInstanceId: dancer.instanceId,
      amount: 1,
      controllerId: 'player-1',
      instanceIds: ['encore-token'],
      grantKeywords: ['HASTE'],
      attackPlayerIds: ['player-2'],
    })
    state = {
      ...state,
      turnState: {
        phase: 'COMBAT',
        step: 'DECLARE_ATTACKERS',
        priority: 'NONE',
      },
      combatState: { ...state.combatState, active: true, combatId: 'combat-1' },
    }
    const rejected = applyGameAction(state, {
      type: 'DECLARE_ATTACKERS',
      attackers: [],
      eventGroupId: 'attack-empty',
    })
    expect(rejected.combatState.attackers).toHaveLength(0)
    expect(rejected.attackRequirements).toHaveLength(1)

    const accepted = applyGameAction(state, {
      type: 'DECLARE_ATTACKERS',
      attackers: [
        {
          attackerInstanceId: 'encore-token',
          defendingTarget: {
            kind: 'PLAYER',
            id: 'opponent',
            playerId: 'player-2',
          },
        },
      ],
      eventGroupId: 'attack-encore',
    })
    expect(accepted.combatState.attackers).toHaveLength(1)
    expect(accepted.attackRequirements).toHaveLength(0)
  })

  it('sacrifices the Encore token at the next end step only if the source controller still controls it', () => {
    const dancer = instance('mist', mistDancer, 'exile')
    let state = createInitialGameState([dancer])
    const tokenId = 'encore-token'
    state = applyGameAction(state, {
      type: 'CREATE_TOKEN_COPY',
      sourceInstanceId: dancer.instanceId,
      amount: 1,
      controllerId: 'player-1',
      instanceIds: [tokenId],
      grantKeywords: ['HASTE'],
      attackPlayerIds: ['player-2'],
    })
    state = applyGameAction(state, {
      type: 'ADD_DELAYED_EFFECT',
      delayedEffect: {
        id: 'encore-delay',
        sourceAbilityId: 'mist-dancer-encore',
        sourceInstanceId: dancer.instanceId,
        sourceCardName: 'Mist Dancer',
        sourceControllerId: 'player-1',
        trigger: { type: 'END_STEP_STARTED' },
        effects: [
          {
            type: 'FOR_EACH_SELECTED',
            selection: 'CARDS',
            filter: {
              zones: ['battlefield'],
              controller: 'SOURCE_CONTROLLER',
              isToken: true,
            },
            effects: [{ type: 'SACRIFICE', target: 'CURRENT_OBJECT' }],
          },
        ],
        capturedContext: {
          selectedTargets: [],
          selectedCards: [tokenId],
          selectedStackObjects: [],
          selectedPlayers: [],
          variables: {},
        },
        automation: 'AUTO',
      },
    })
    const event = {
      type: 'END_STEP_STARTED' as const,
      turn: state.turn,
      phase: 'ENDING' as const,
      step: 'END_STEP' as const,
      activePlayerId: 'player-1',
    }
    const delayed = evaluateDelayedEffects(state, event)
    expect(delayed.pending).toHaveLength(1)
    const sacrifice = advancePendingResolution(
      state,
      createPendingResolution(delayed.pending[0]),
    )
    expect(sacrifice.type).toBe('ACTIONS')
    if (sacrifice.type === 'ACTIONS')
      expect(sacrifice.actions).toContainEqual({
        type: 'MOVE_CARD',
        instanceId: tokenId,
        toZone: 'graveyard',
      })

    const stolen = applyGameAction(state, {
      type: 'SET_CARD_CONTROLLER',
      instanceId: tokenId,
      controllerId: 'player-2',
    })
    const delayedStolen = evaluateDelayedEffects(stolen, event)
    const noSacrifice = advancePendingResolution(
      stolen,
      createPendingResolution(delayedStolen.pending[0]),
    )
    expect(noSacrifice.type).toBe('COMPLETE')
  })
})
