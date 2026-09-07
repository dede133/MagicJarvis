import { describe, expect, it } from 'vitest'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import { deriveGameEvents } from '../../events/deriveGameEvents'
import { useGameStore } from '../../store/gameStore'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import { planCombatDamage } from './combatRules'

const definition = (
  name: string,
  oracleText = '',
  power = '2',
  toughness = '2',
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 0,
  typeLine: 'Creature',
  oracleText,
  power,
  toughness,
  colors: [],
  colorIdentity: [],
})

const creature = (
  id: string,
  card: CardDefinition,
  playerId: 'player-1' | 'player-2',
): CardInstance => ({
  instanceId: id,
  card,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ownerId: playerId,
  controllerId: playerId,
  controller: playerId === 'player-1' ? 'YOU' : 'OPPONENT',
  controlledSinceTurn: 0,
})

const damageState = (cards: CardInstance[]): GameState => ({
  ...createInitialGameState(cards),
  activePlayerId: 'player-1',
  turnOrder: ['player-1', 'player-2'],
  turnState: {
    phase: 'COMBAT',
    step: 'COMBAT_DAMAGE',
    priority: 'WINDOW_OPEN',
  },
  combatState: {
    combatId: 'combat-27',
    active: true,
    attackingPlayerId: 'local',
    attackingPlayerStableId: 'player-1',
    attackers: [],
    blockers: [],
    externalParticipants: [],
    damageStep: 'PENDING',
    firstStrikeDamageStepRequired: false,
    firstStrikeParticipantIds: [],
  },
})

describe('0027 combat damage correctness', () => {
  it('keeps the rest of combat damage when one attacker needs a multi-block assignment', () => {
    const multi = creature('multi', definition('Multi', '', '4', '4'), 'player-1')
    const open = creature('open', definition('Open', '', '3', '3'), 'player-1')
    const openTwo = creature('open-two', definition('Open Two', '', '1', '1'), 'player-1')
    const blockerOne = creature('b1', definition('Blocker One'), 'player-2')
    const blockerTwo = creature('b2', definition('Blocker Two'), 'player-2')
    const state: GameState = {
      ...damageState([multi, open, openTwo, blockerOne, blockerTwo]),
      combatState: {
        ...damageState([]).combatState,
        active: true,
        combatId: 'combat-27-one',
        attackingPlayerStableId: 'player-1',
        attackers: [
          {
            attackerInstanceId: 'multi',
            defendingTarget: { kind: 'PLAYER', id: 'opponent', playerId: 'player-2' },
            blockedBy: ['b1', 'b2'],
            externalBlockedBy: [],
          },
          {
            attackerInstanceId: 'open',
            defendingTarget: { kind: 'PLAYER', id: 'opponent', playerId: 'player-2' },
            blockedBy: [],
            externalBlockedBy: [],
          },
          {
            attackerInstanceId: 'open-two',
            defendingTarget: { kind: 'PLAYER', id: 'opponent', playerId: 'player-2' },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
        blockers: [
          { blockerInstanceId: 'b1', blocking: ['multi'] },
          { blockerInstanceId: 'b2', blocking: ['multi'] },
        ],
        externalParticipants: [],
        damageStep: 'PENDING',
        firstStrikeDamageStepRequired: false,
        firstStrikeParticipantIds: [],
      },
    }
    const plan = planCombatDamage(state)
    if (plan.type !== 'DECISION') throw new Error('expected assignment decision')
    useGameStore.getState().replaceGame(state)
    useGameStore.getState().dispatch({ type: 'ADD_PENDING_DECISION', decision: plan.decision })
    useGameStore.getState().resolvePendingDecision(
      plan.decision.id,
      plan.decision.options?.[0]?.instanceId ?? '',
    )
    const next = useGameStore.getState()
    expect(next.combatState.damageStep).toBe('COMPLETE')
    expect(next.players.find((player) => player.id === 'player-2')?.life).toBe(36)
    expect(next.cards.find((card) => card.instanceId === 'multi')?.damageMarked).toBe(4)
  })

  it('collects multiple independent damage assignments before dealing any damage', () => {
    const first = creature('a1', definition('First Attacker', '', '3', '3'), 'player-1')
    const second = creature('a2', definition('Second Attacker', '', '3', '3'), 'player-1')
    const blockers = ['b1', 'b2', 'b3', 'b4'].map((id) =>
      creature(id, definition(id), 'player-2'),
    )
    const state: GameState = {
      ...damageState([first, second, ...blockers]),
      combatState: {
        ...damageState([]).combatState,
        active: true,
        combatId: 'combat-27-two',
        attackingPlayerStableId: 'player-1',
        attackers: [
          {
            attackerInstanceId: 'a1',
            defendingTarget: { kind: 'PLAYER', id: 'opponent', playerId: 'player-2' },
            blockedBy: ['b1', 'b2'],
            externalBlockedBy: [],
          },
          {
            attackerInstanceId: 'a2',
            defendingTarget: { kind: 'PLAYER', id: 'opponent', playerId: 'player-2' },
            blockedBy: ['b3', 'b4'],
            externalBlockedBy: [],
          },
        ],
        blockers: [
          { blockerInstanceId: 'b1', blocking: ['a1'] },
          { blockerInstanceId: 'b2', blocking: ['a1'] },
          { blockerInstanceId: 'b3', blocking: ['a2'] },
          { blockerInstanceId: 'b4', blocking: ['a2'] },
        ],
        externalParticipants: [],
        damageStep: 'PENDING',
        firstStrikeDamageStepRequired: false,
        firstStrikeParticipantIds: [],
      },
    }
    const plan = planCombatDamage(state)
    if (plan.type !== 'DECISION') throw new Error('expected first decision')
    useGameStore.getState().replaceGame(state)
    useGameStore.getState().dispatch({ type: 'ADD_PENDING_DECISION', decision: plan.decision })
    useGameStore.getState().resolvePendingDecision(
      plan.decision.id,
      plan.decision.options?.[0]?.instanceId ?? '',
    )
    const between = useGameStore.getState()
    expect(between.damageRecords).toHaveLength(0)
    expect(between.pendingDecisions).toHaveLength(1)
    const secondDecision = between.pendingDecisions[0]
    useGameStore.getState().resolvePendingDecision(
      secondDecision.id,
      secondDecision.options?.[0]?.instanceId ?? '',
    )
    const complete = useGameStore.getState()
    expect(complete.pendingDecisions).toHaveLength(0)
    expect(complete.combatState.damageStep).toBe('COMPLETE')
    expect(complete.damageRecords.length).toBeGreaterThan(0)
  })

  it('remembers who had first strike when the first damage step began', () => {
    const first = creature(
      'first',
      definition('First', 'First strike', '2', '2'),
      'player-1',
    )
    const normal = creature('normal', definition('Normal', '', '2', '2'), 'player-1')
    const state: GameState = {
      ...damageState([first, normal]),
      combatState: {
        ...damageState([]).combatState,
        active: true,
        combatId: 'combat-first-strike',
        attackingPlayerStableId: 'player-1',
        attackers: [
          {
            attackerInstanceId: 'first',
            defendingTarget: { kind: 'PLAYER', id: 'opponent', playerId: 'player-2' },
            blockedBy: [],
            externalBlockedBy: [],
          },
          {
            attackerInstanceId: 'normal',
            defendingTarget: { kind: 'PLAYER', id: 'opponent', playerId: 'player-2' },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
        blockers: [],
        externalParticipants: [],
        damageStep: 'PENDING',
        firstStrikeDamageStepRequired: false,
        firstStrikeParticipantIds: [],
      },
    }
    const firstPlan = planCombatDamage(state)
    if (firstPlan.type !== 'ACTIONS') throw new Error('expected first-strike actions')
    let afterFirst = firstPlan.actions.reduce(
      (current, action) => applyGameAction(current, action),
      state,
    )
    expect(afterFirst.players.find((player) => player.id === 'player-2')?.life).toBe(38)
    afterFirst = {
      ...afterFirst,
      cards: afterFirst.cards.map((card) =>
        card.instanceId === 'first'
          ? { ...card, card: { ...card.card, oracleText: '' } }
          : card.instanceId === 'normal'
            ? { ...card, card: { ...card.card, oracleText: 'First strike' } }
            : card,
      ),
    }
    const normalPlan = planCombatDamage(afterFirst)
    if (normalPlan.type !== 'ACTIONS') throw new Error('expected normal actions')
    const complete = normalPlan.actions.reduce(
      (current, action) => applyGameAction(current, action),
      afterFirst,
    )
    expect(complete.players.find((player) => player.id === 'player-2')?.life).toBe(36)
  })

  it('derives damage events from damage actually dealt after prevention', () => {
    const source = creature('source', definition('Source', '', '3', '3'), 'player-1')
    const target = creature('target', definition('Target', '', '3', '3'), 'player-2')
    const state: GameState = {
      ...createInitialGameState([source, target]),
      damagePreventionEffects: [
        {
          id: 'shield',
          sourceInstanceId: 'shield-source',
          targetInstanceId: target.instanceId,
          preventAll: true,
          duration: 'UNTIL_END_OF_TURN',
        },
      ],
    }
    const action = {
      type: 'DEAL_DAMAGE_BATCH' as const,
      damages: [
        {
          sourceInstanceId: source.instanceId,
          target: { kind: 'CREATURE' as const, instanceId: target.instanceId },
          amount: 3,
          damageKind: 'COMBAT' as const,
          hasDeathtouch: false,
        },
      ],
    }
    const next = applyGameAction(state, action)
    expect(next.damageRecords).toHaveLength(state.damageRecords.length)
    expect(deriveGameEvents(state, action, next)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'DAMAGE_DEALT' })]),
    )
  })
})
