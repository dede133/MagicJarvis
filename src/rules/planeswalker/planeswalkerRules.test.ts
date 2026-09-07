import { describe, expect, it } from 'vitest'
import type { ActivatedAbilityDefinition } from '../../abilities/types/abilityTypes'
import { resolveActivatedAbility } from '../../abilities/engine/activationEngine'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import { planCombatDamage } from '../combat/combatRules'
import { checkStateBasedActions } from '../stateBasedActions'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import { turnStateFor } from '../../types/turn'
import { parseCommand } from '../../commands/parser/parseCommand'
import { resolveCommand } from '../../commands/resolver/resolveCommand'
import { LOYALTY_COUNTER } from './planeswalkerRules'

const walker: CardDefinition = {
  scryfallId: 'narset-test',
  name: 'Narset, Parter of Veils',
  cmc: 3,
  manaCost: '{1}{U}{U}',
  typeLine: 'Legendary Planeswalker — Narset',
  oracleText: 'Each opponent can’t draw more than one card each turn.\n−2: Look at the top four cards of your library.',
  colors: ['U'],
  colorIdentity: ['U'],
  loyalty: '5',
}

const creature: CardDefinition = {
  scryfallId: 'attacker-test',
  name: 'Attacker',
  cmc: 3,
  typeLine: 'Creature — Test',
  oracleText: '',
  colors: [],
  colorIdentity: [],
  power: '3',
  toughness: '3',
}

const instance = (
  instanceId: string,
  card: CardDefinition,
  extras: Partial<CardInstance> = {},
): CardInstance => ({
  instanceId,
  card,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ownerId: 'player-1',
  controllerId: 'player-1',
  controller: 'YOU',
  controlledSinceTurn: 0,
  ...extras,
})

const loyaltyAbility = (amount: number): ActivatedAbilityDefinition => ({
  id: `narset-loyalty-${amount}`,
  sourceCardName: walker.name,
  kind: 'ACTIVATED',
  costs: [{ type: 'LOYALTY', amount }],
  effects: [],
  automation: 'AUTO',
})

describe('Planeswalker core', () => {
  it('enters the battlefield with printed loyalty counters', () => {
    const state = createInitialGameState([
      instance('narset', walker, { zone: 'hand', counters: {} }),
    ])
    const next = applyGameAction(state, {
      type: 'MOVE_CARD',
      instanceId: 'narset',
      toZone: 'battlefield',
    })
    expect(next.cards[0].counters[LOYALTY_COUNTER]).toBe(5)
  })

  it('pays signed loyalty costs and only allows one loyalty ability per turn', () => {
    const source = instance('narset', walker, {
      counters: { [LOYALTY_COUNTER]: 5 },
    })
    const state: GameState = {
      ...createInitialGameState([source]),
      turnState: turnStateFor('MAIN_1'),
    }
    const activation = resolveActivatedAbility(state, source.instanceId, loyaltyAbility(1))
    expect(activation.ok).toBe(true)
    if (!activation.ok) return
    const paid = activation.costActions.reduce(
      (current, action) => applyGameAction(current, action),
      state,
    )
    expect(paid.cards[0].counters[LOYALTY_COUNTER]).toBe(6)
    expect(resolveActivatedAbility(paid, source.instanceId, loyaltyAbility(-2))).toEqual({
      ok: false,
      code: 'ACTIVATION_LIMIT_REACHED',
    })
  })

  it('cannot pay a negative loyalty cost larger than current loyalty', () => {
    const source = instance('narset', walker, {
      counters: { [LOYALTY_COUNTER]: 1 },
    })
    const state: GameState = {
      ...createInitialGameState([source]),
      turnState: turnStateFor('MAIN_1'),
    }
    expect(resolveActivatedAbility(state, source.instanceId, loyaltyAbility(-2))).toEqual({
      ok: false,
      code: 'NOT_ENOUGH_LOYALTY',
    })
  })

  it('damage removes loyalty and zero-loyalty planeswalkers die as an SBA', () => {
    const source = instance('narset', walker, {
      counters: { [LOYALTY_COUNTER]: 5 },
    })
    const state = createInitialGameState([source])
    const damaged = applyGameAction(state, {
      type: 'DEAL_DAMAGE',
      damage: {
        target: { kind: 'PLANESWALKER', instanceId: source.instanceId },
        amount: 5,
        damageKind: 'NONCOMBAT',
        hasDeathtouch: false,
      },
    })
    expect(damaged.cards[0].counters[LOYALTY_COUNTER]).toBe(0)
    expect(checkStateBasedActions(damaged).actions).toContainEqual({
      type: 'APPLY_STATE_BASED_ACTIONS',
      moves: [{ instanceId: source.instanceId, toZone: 'graveyard' }],
      removeInstanceIds: [],
      detachInstanceIds: [],
      counterRemovals: [],
    })
  })

  it('parses and resolves an attack directed at a known opposing planeswalker', () => {
    const attacker = instance('attacker', creature)
    const narset = instance('narset', walker, {
      ownerId: 'player-2',
      controllerId: 'player-2',
      controller: 'OPPONENT',
      counters: { [LOYALTY_COUNTER]: 5 },
    })
    const state: GameState = {
      ...createInitialGameState([attacker, narset]),
      turnState: turnStateFor('DECLARE_ATTACKERS'),
      combatState: {
        combatId: 'combat-pw-declaration',
        active: true,
        attackingPlayerId: 'local',
        attackingPlayerStableId: 'player-1',
        attackers: [],
        blockers: [],
        externalParticipants: [],
        damageStep: 'PENDING',
        firstStrikeDamageStepRequired: false,
      },
    }
    const parsed = parseCommand('ataco a narset, parter of veils con attacker')
    expect(parsed.status).toBe('parsed')
    if (parsed.status !== 'parsed') return
    const resolved = resolveCommand(state, parsed.command)
    expect(resolved.status).toBe('resolved')
    if (resolved.status !== 'resolved') return
    expect(resolved.actions[0]).toEqual(
      expect.objectContaining({
        type: 'DECLARE_ATTACKERS',
        attackers: [
          expect.objectContaining({
            attackerInstanceId: attacker.instanceId,
            defendingTarget: {
              kind: 'PLANESWALKER',
              id: narset.instanceId,
            },
          }),
        ],
      }),
    )
  })

  it('combat damage can be assigned to an opposing planeswalker', () => {
    const attacker = instance('attacker', creature)
    const narset = instance('narset', walker, {
      ownerId: 'player-2',
      controllerId: 'player-2',
      controller: 'OPPONENT',
      counters: { [LOYALTY_COUNTER]: 5 },
    })
    const state: GameState = {
      ...createInitialGameState([attacker, narset]),
      turnState: turnStateFor('COMBAT_DAMAGE'),
      combatState: {
        combatId: 'combat-pw',
        active: true,
        attackingPlayerId: 'local',
        attackingPlayerStableId: 'player-1',
        attackers: [
          {
            attackerInstanceId: attacker.instanceId,
            defendingTarget: { kind: 'PLANESWALKER', id: narset.instanceId },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
        blockers: [],
        externalParticipants: [],
        damageStep: 'PENDING',
        firstStrikeDamageStepRequired: false,
      },
    }
    const plan = planCombatDamage(state)
    expect(plan.type).toBe('ACTIONS')
    if (plan.type !== 'ACTIONS') return
    expect(plan.actions[0]).toEqual({
      type: 'DEAL_DAMAGE_BATCH',
      damages: [
        expect.objectContaining({
          target: { kind: 'PLANESWALKER', instanceId: narset.instanceId },
          amount: 3,
        }),
      ],
    })
  })
})
