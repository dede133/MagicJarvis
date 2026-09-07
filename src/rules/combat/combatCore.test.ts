import { beforeEach, describe, expect, it } from 'vitest'
import { resolveActivatedAbility } from '../../abilities/engine/activationEngine'
import { hasDerivedKeyword } from '../../abilities/engine/staticEffects'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import { deriveGameEvents } from '../../events/deriveGameEvents'
import { useGameStore } from '../../store/gameStore'
import type { ActivatedAbilityDefinition } from '../../abilities/types/abilityTypes'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import { parseCommand } from '../../commands/parser/parseCommand'
import { resolveCommand } from '../../commands/resolver/resolveCommand'
import { canAttack, canBlock, planCombatDamage } from './combatRules'
import { hasCombatKeyword } from './keywords'

const definition = (
  name: string,
  typeLine = 'Creature',
  oracleText = '',
  power = '2',
  toughness = '2',
): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 0,
  typeLine,
  oracleText,
  power,
  toughness,
  colors: [],
  colorIdentity: [],
})

const instance = (
  id: string,
  card: CardDefinition,
  extras: Partial<CardInstance> = {},
): CardInstance => ({
  instanceId: id,
  card,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  controlledSinceTurn: 0,
  ...extras,
})

const attackerDefinition = definition('Attacker', 'Creature', '', '4', '4')
const blockerDefinition = definition('Blocker', 'Creature', '', '2', '2')
const combat = (cards: CardInstance[] = []): GameState => ({
  ...createInitialGameState(cards),
  turnState: {
    phase: 'COMBAT',
    step: 'DECLARE_ATTACKERS',
    priority: 'WINDOW_OPEN',
  },
  combatState: {
    combatId: 'combat-test',
    active: true,
    attackingPlayerId: 'local',
    attackers: [],
    blockers: [],
    externalParticipants: [],
    damageStep: 'PENDING',
    firstStrikeDamageStepRequired: false,
  },
})

const toBlockers = (state: GameState): GameState => ({
  ...state,
  turnState: {
    phase: 'COMBAT',
    step: 'DECLARE_BLOCKERS',
    priority: 'WINDOW_OPEN',
  },
})
const toDamage = (state: GameState): GameState => ({
  ...state,
  turnState: {
    phase: 'COMBAT',
    step: 'COMBAT_DAMAGE',
    priority: 'WINDOW_OPEN',
  },
})

beforeEach(() => useGameStore.getState().replaceGame(createInitialGameState()))

describe('Combat Core — declarations', () => {
  it('rejects a creature that entered this turn without haste', () => {
    const state = combat([
      instance('a', attackerDefinition, { controlledSinceTurn: 1 }),
    ])
    expect(canAttack(state, state.cards[0])).toMatchObject({
      legal: false,
      code: 'SUMMONING_SICKNESS',
    })
  })

  it('allows that creature on a following turn', () => {
    const state = {
      ...combat([
        instance('a', attackerDefinition, { controlledSinceTurn: 1 }),
      ]),
      turn: 2,
    }
    expect(canAttack(state, state.cards[0])).toEqual({ legal: true })
  })

  it('allows haste immediately', () => {
    const state = combat([
      instance('a', definition('Hasty', 'Creature', 'Haste'), {
        controlledSinceTurn: 1,
      }),
    ])
    expect(canAttack(state, state.cards[0])).toEqual({ legal: true })
  })

  it('does not infer haste from text that grants haste to other objects', () => {
    const mistDancer = instance(
      'a',
      definition(
        'Mist Dancer',
        'Creature — Merfolk Wizard',
        'Flying\nOther Merfolk you control get +1/+0 and have flying.\nEncore {5}{U}{U} (They gain haste.)',
      ),
      { controlledSinceTurn: 1 },
    )
    expect(hasCombatKeyword(mistDancer, 'FLYING')).toBe(true)
    expect(hasCombatKeyword(mistDancer, 'HASTE')).toBe(false)
    expect(canAttack(combat([mistDancer]), mistDancer)).toMatchObject({
      legal: false,
      code: 'SUMMONING_SICKNESS',
    })
  })

  it('applies Svyelun indestructible only while its condition is met', () => {
    const svyelun = instance(
      'svyelun',
      definition(
        'Svyelun of Sea and Sky',
        'Legendary Creature — Merfolk God',
        'Svyelun has indestructible as long as you control at least two other Merfolk.',
      ),
    )
    const firstMerfolk = instance(
      'm1',
      definition('Merfolk One', 'Creature — Merfolk'),
    )
    const secondMerfolk = instance(
      'm2',
      definition('Merfolk Two', 'Creature — Merfolk'),
    )
    expect(hasCombatKeyword(svyelun, 'INDESTRUCTIBLE')).toBe(false)
    expect(
      hasDerivedKeyword(combat([svyelun]), svyelun, 'INDESTRUCTIBLE'),
    ).toBe(false)
    const enabled = combat([svyelun, firstMerfolk, secondMerfolk])
    expect(hasDerivedKeyword(enabled, enabled.cards[0], 'INDESTRUCTIBLE')).toBe(
      true,
    )
  })

  it('prevents TAP_SOURCE activation while summoning sick', () => {
    const source = instance(
      'a',
      definition('Sick', 'Creature', '{T}: Add {U}.'),
      { controlledSinceTurn: 1 },
    )
    const ability: ActivatedAbilityDefinition = {
      id: 'tap',
      sourceCardName: 'Sick',
      kind: 'ACTIVATED',
      costs: [{ type: 'TAP_SOURCE' }],
      effects: [{ type: 'ADD_MANA', color: 'U', amount: 1 }],
      automation: 'AUTO',
    }
    expect(
      resolveActivatedAbility(combat([source]), source.instanceId, ability),
    ).toEqual({ ok: false, code: 'SUMMONING_SICKNESS' })
  })

  it('allows TAP_SOURCE activation with haste', () => {
    const source = instance('a', definition('Hasty', 'Creature', 'Haste'), {
      controlledSinceTurn: 1,
    })
    const ability: ActivatedAbilityDefinition = {
      id: 'tap',
      sourceCardName: 'Hasty',
      kind: 'ACTIVATED',
      costs: [{ type: 'TAP_SOURCE' }],
      effects: [{ type: 'ADD_MANA', color: 'U', amount: 1 }],
      automation: 'AUTO',
    }
    expect(
      resolveActivatedAbility(combat([source]), source.instanceId, ability),
    ).toMatchObject({ ok: true })
  })

  it('uses haste granted by a continuous effect for tap costs', () => {
    const source = instance('a', definition('Granted Haste', 'Creature'), {
      controlledSinceTurn: 1,
    })
    const state: GameState = {
      ...combat([source]),
      turn: 1,
      temporaryContinuousEffects: [
        {
          sourceInstanceId: 'grant',
          targetInstanceId: source.instanceId,
          grantKeywords: ['HASTE'],
          duration: 'UNTIL_END_OF_TURN',
        },
      ],
    }
    const ability: ActivatedAbilityDefinition = {
      id: 'tap',
      sourceCardName: 'Granted Haste',
      kind: 'ACTIVATED',
      costs: [{ type: 'TAP_SOURCE' }],
      effects: [{ type: 'ADD_MANA', color: 'U', amount: 1 }],
      automation: 'AUTO',
    }
    expect(
      resolveActivatedAbility(state, source.instanceId, ability),
    ).toMatchObject({ ok: true })
  })

  it('does not tap an attacker with vigilance granted by a continuous effect', () => {
    const source = instance('a', attackerDefinition)
    const state: GameState = {
      ...combat([source]),
      temporaryContinuousEffects: [
        {
          sourceInstanceId: 'grant',
          targetInstanceId: source.instanceId,
          grantKeywords: ['VIGILANCE'],
          duration: 'UNTIL_END_OF_TURN',
        },
      ],
    }
    const next = applyGameAction(state, {
      type: 'DECLARE_ATTACKERS',
      attackers: [
        {
          attackerInstanceId: source.instanceId,
          defendingTarget: { kind: 'PLAYER', id: 'opponent' },
        },
      ],
      eventGroupId: 'vigilance-grant',
    })
    expect(next.cards[0].tapped).toBe(false)
  })

  it('still permits an external tap of a sick creature', () => {
    const state = combat([
      instance('a', attackerDefinition, { controlledSinceTurn: 1 }),
    ])
    expect(
      applyGameAction(state, { type: 'TAP_CARD', instanceId: 'a' }).cards[0]
        .tapped,
    ).toBe(true)
  })

  it('requires a creature attacker', () => {
    const artifact = instance('a', definition('Artifact', 'Artifact'))
    expect(canAttack(combat([artifact]), artifact)).toMatchObject({
      legal: false,
      code: 'INVALID_ATTACKER',
    })
  })

  it('requires an untapped attacker', () => {
    const attacker = instance('a', attackerDefinition, { tapped: true })
    expect(canAttack(combat([attacker]), attacker)).toMatchObject({
      legal: false,
      code: 'ALREADY_TAPPED',
    })
  })

  it('taps attackers but not vigilance attackers', () => {
    const ordinary = instance('a', attackerDefinition)
    const vigilant = instance(
      'b',
      definition('Vigilant', 'Creature', 'Vigilance'),
    )
    const state = combat([ordinary, vigilant])
    const next = applyGameAction(state, {
      type: 'DECLARE_ATTACKERS',
      attackers: [
        {
          attackerInstanceId: 'a',
          defendingTarget: { kind: 'PLAYER', id: 'opponent' },
        },
        {
          attackerInstanceId: 'b',
          defendingTarget: { kind: 'PLAYER', id: 'opponent' },
        },
      ],
      eventGroupId: 'attack-group',
    })
    expect(next.cards.map((card) => card.tapped)).toEqual([true, false])
  })

  it('parses natural multiple and all-attacker declarations', () => {
    expect(parseCommand('ataco con Namor y Cosi')).toMatchObject({
      status: 'parsed',
      command: {
        type: 'DECLARE_ATTACKERS',
        attackerQueries: ['namor', 'cosi'],
      },
    })
    expect(parseCommand('ataco con todos los tritones')).toMatchObject({
      status: 'parsed',
      command: { type: 'DECLARE_ATTACKERS', all: true, subtype: 'tritones' },
    })
  })
})

describe('Combat Core — blocks and damage', () => {
  const declared = (): GameState => {
    const state = combat([
      instance('a', attackerDefinition),
      instance('b', blockerDefinition, { controller: 'OPPONENT' }),
    ])
    return applyGameAction(state, {
      type: 'DECLARE_ATTACKERS',
      attackers: [
        {
          attackerInstanceId: 'a',
          defendingTarget: { kind: 'PLAYER', id: 'opponent' },
        },
      ],
      eventGroupId: 'attack',
    })
  }

  it('does not tap a blocker', () => {
    const state = toBlockers(declared())
    const next = applyGameAction(state, {
      type: 'DECLARE_BLOCKERS',
      blockers: [{ blockerInstanceId: 'b', blocking: ['a'] }],
    })
    expect(next.cards.find((card) => card.instanceId === 'b')?.tapped).toBe(
      false,
    )
  })

  it('requires an untapped opponent creature to block', () => {
    const state = toBlockers({
      ...declared(),
      cards: declared().cards.map((card) =>
        card.instanceId === 'b' ? { ...card, tapped: true } : card,
      ),
    })
    const attacker = state.combatState.attackers[0]
    expect(
      canBlock(
        state,
        attacker,
        state.cards.find((card) => card.instanceId === 'b')!,
      ),
    ).toMatchObject({ legal: false, code: 'INVALID_BLOCKER' })
  })

  it('enforces flying and permits reach', () => {
    const flyer = instance('a', definition('Flyer', 'Creature', 'Flying'))
    const ground = instance('b', blockerDefinition, { controller: 'OPPONENT' })
    const reach = instance('c', definition('Reach', 'Creature', 'Reach'), {
      controller: 'OPPONENT',
    })
    const state = toBlockers({
      ...combat([flyer, ground, reach]),
      combatState: {
        ...combat([flyer, ground, reach]).combatState,
        attackers: [
          {
            attackerInstanceId: 'a',
            defendingTarget: { kind: 'PLAYER', id: 'opponent' },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
      },
    })
    expect(
      canBlock(state, state.combatState.attackers[0], ground),
    ).toMatchObject({ legal: false })
    expect(canBlock(state, state.combatState.attackers[0], reach)).toEqual({
      legal: true,
    })
  })

  it('rejects exactly one blocker against menace', () => {
    const menace = instance('a', definition('Menace', 'Creature', 'Menace'))
    const blocker = instance('b', blockerDefinition, { controller: 'OPPONENT' })
    const state = toBlockers({
      ...combat([menace, blocker]),
      combatState: {
        ...combat([menace, blocker]).combatState,
        attackers: [
          {
            attackerInstanceId: 'a',
            defendingTarget: { kind: 'PLAYER', id: 'opponent' },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
      },
    })
    const resolved = resolveCommand(state, {
      type: 'DECLARE_BLOCKERS',
      attackerQuery: 'menace',
      blockerQueries: ['blocker'],
    })
    expect(resolved).toMatchObject({
      status: 'error',
      error: { code: 'INVALID_BLOCKER' },
    })
  })

  it('deals unblocked combat damage to the defending player', () => {
    const state = toDamage(declared())
    const plan = planCombatDamage(state)
    expect(plan).toMatchObject({ type: 'ACTIONS' })
    if (plan.type === 'ACTIONS') {
      const next = plan.actions.reduce(
        (current, action) => applyGameAction(current, action),
        state,
      )
      expect(next.opponentLife).toBe(36)
    }
  })

  it('marks simultaneous blocked damage without reducing toughness', () => {
    const blocked = applyGameAction(toBlockers(declared()), {
      type: 'DECLARE_BLOCKERS',
      blockers: [{ blockerInstanceId: 'b', blocking: ['a'] }],
    })
    const plan = planCombatDamage(toDamage(blocked))
    if (plan.type !== 'ACTIONS') throw new Error('expected damage plan')
    const next = plan.actions.reduce(
      (current, action) => applyGameAction(current, action),
      toDamage(blocked),
    )
    expect(next.cards.find((card) => card.instanceId === 'a')).toMatchObject({
      damageMarked: 2,
    })
    expect(next.cards.find((card) => card.instanceId === 'b')).toMatchObject({
      damageMarked: 4,
    })
    expect(
      next.cards.find((card) => card.instanceId === 'b')?.card.toughness,
    ).toBe('2')
  })

  it('requires a pending choice for multiple known blockers', () => {
    const state = toDamage({
      ...declared(),
      cards: [
        ...declared().cards,
        instance('c', blockerDefinition, { controller: 'OPPONENT' }),
      ],
      combatState: {
        ...declared().combatState,
        attackers: [
          { ...declared().combatState.attackers[0], blockedBy: ['b', 'c'] },
        ],
        blockers: [
          { blockerInstanceId: 'b', blocking: ['a'] },
          { blockerInstanceId: 'c', blocking: ['a'] },
        ],
      },
    })
    expect(planCombatDamage(state)).toMatchObject({
      type: 'DECISION',
      decision: { type: 'COMBAT_DAMAGE_ASSIGNMENT' },
    })
  })

  it('supports basic trample damage after lethal to a single blocker', () => {
    const trampler = instance(
      'a',
      definition('Trampler', 'Creature', 'Trample', '5', '5'),
    )
    const blocker = instance('b', blockerDefinition, { controller: 'OPPONENT' })
    const base = combat([trampler, blocker])
    const attacked = applyGameAction(base, {
      type: 'DECLARE_ATTACKERS',
      attackers: [
        {
          attackerInstanceId: 'a',
          defendingTarget: { kind: 'PLAYER', id: 'opponent' },
        },
      ],
      eventGroupId: 'a',
    })
    const blocked = applyGameAction(toBlockers(attacked), {
      type: 'DECLARE_BLOCKERS',
      blockers: [{ blockerInstanceId: 'b', blocking: ['a'] }],
    })
    const plan = planCombatDamage(toDamage(blocked))
    if (plan.type !== 'ACTIONS') throw new Error('expected plan')
    const next = plan.actions.reduce(
      (current, action) => applyGameAction(current, action),
      toDamage(blocked),
    )
    expect(next.opponentLife).toBe(37)
    expect(
      next.cards.find((card) => card.instanceId === 'b')?.damageMarked,
    ).toBe(2)
  })
})

describe('Combat Core — damage SBA and keywords', () => {
  it('moves a lethally damaged creature to graveyard through the store SBA loop', () => {
    useGameStore
      .getState()
      .replaceGame(combat([instance('victim', blockerDefinition)]))
    useGameStore.getState().dispatch({
      type: 'DEAL_DAMAGE',
      damage: {
        sourceInstanceId: 'source',
        target: { kind: 'CREATURE', instanceId: 'victim' },
        amount: 2,
        damageKind: 'COMBAT',
        hasDeathtouch: false,
      },
    })
    expect(useGameStore.getState().cards[0]?.zone).toBe('graveyard')
  })

  it('lets indestructible survive lethal and deathtouch damage', () => {
    const indestructible = instance(
      'victim',
      definition('Indestructible', 'Creature', 'Indestructible', '2', '2'),
    )
    useGameStore.getState().replaceGame(combat([indestructible]))
    useGameStore.getState().dispatch({
      type: 'DEAL_DAMAGE_BATCH',
      damages: [
        {
          sourceInstanceId: 'source',
          target: { kind: 'CREATURE', instanceId: 'victim' },
          amount: 2,
          damageKind: 'COMBAT',
          hasDeathtouch: true,
        },
      ],
    })
    expect(useGameStore.getState().cards[0]?.zone).toBe('battlefield')
  })

  it('still sends indestructible zero toughness to graveyard', () => {
    const zero = instance(
      'victim',
      definition('Zero', 'Creature', 'Indestructible', '2', '0'),
    )
    useGameStore.getState().replaceGame(combat([zero]))
    useGameStore
      .getState()
      .dispatch({ type: 'ADD_MANA', color: 'U', amount: 1 })
    expect(useGameStore.getState().cards[0]?.zone).toBe('graveyard')
  })

  it('applies lifelink at the same time as damage', () => {
    const source = instance(
      'source',
      definition('Lifelink', 'Creature', 'Lifelink', '3', '3'),
    )
    const state = createInitialGameState([source])
    const next = applyGameAction(state, {
      type: 'DEAL_DAMAGE',
      damage: {
        sourceInstanceId: 'source',
        target: { kind: 'PLAYER', player: 'opponent' },
        amount: 3,
        damageKind: 'COMBAT',
        hasDeathtouch: false,
      },
    })
    expect(next.life).toBe(43)
    expect(next.opponentLife).toBe(37)
  })

  it('applies lifelink granted by a continuous effect', () => {
    const source = instance(
      'source',
      definition('Granted Lifelink', 'Creature', '', '3', '3'),
    )
    const state: GameState = {
      ...createInitialGameState([source]),
      temporaryContinuousEffects: [
        {
          sourceInstanceId: 'grant',
          targetInstanceId: source.instanceId,
          grantKeywords: ['LIFELINK'],
          duration: 'UNTIL_END_OF_TURN',
        },
      ],
    }
    const next = applyGameAction(state, {
      type: 'DEAL_DAMAGE',
      damage: {
        sourceInstanceId: source.instanceId,
        target: { kind: 'PLAYER', player: 'opponent' },
        amount: 3,
        damageKind: 'COMBAT',
        hasDeathtouch: false,
      },
    })
    expect(next.life).toBe(43)
    expect(next.opponentLife).toBe(37)
  })

  it('cleans marked damage at cleanup', () => {
    const state: GameState = {
      ...combat([
        instance('a', attackerDefinition, {
          damageMarked: 3,
          deathtouchDamageMarked: true,
        }),
      ]),
      turnState: { phase: 'ENDING', step: 'END_STEP', priority: 'WINDOW_OPEN' },
    }
    const next = applyGameAction(state, { type: 'ADVANCE_STEP' })
    expect(next.cards[0]).toMatchObject({
      damageMarked: 0,
      deathtouchDamageMarked: false,
    })
  })

  it('creates distinct first-strike and normal damage steps', () => {
    const first = instance(
      'a',
      definition('First', 'Creature', 'First strike', '2', '2'),
    )
    const state = toDamage({
      ...combat([first]),
      combatState: {
        ...combat([first]).combatState,
        attackers: [
          {
            attackerInstanceId: 'a',
            defendingTarget: { kind: 'PLAYER', id: 'opponent' },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
      },
    })
    const plan = planCombatDamage(state)
    if (plan.type !== 'ACTIONS') throw new Error('expected first strike plan')
    const afterFirst = plan.actions.reduce(
      (current, action) => applyGameAction(current, action),
      state,
    )
    expect(afterFirst.combatState.damageStep).toBe('NORMAL')
    const second = planCombatDamage(afterFirst)
    if (second.type !== 'ACTIONS') throw new Error('expected normal plan')
    const complete = second.actions.reduce(
      (current, action) => applyGameAction(current, action),
      afterFirst,
    )
    expect(complete.opponentLife).toBe(38)
  })

  it('double strike deals in both damage steps', () => {
    const double = instance(
      'a',
      definition('Double', 'Creature', 'Double strike', '2', '2'),
    )
    const state = toDamage({
      ...combat([double]),
      combatState: {
        ...combat([double]).combatState,
        attackers: [
          {
            attackerInstanceId: 'a',
            defendingTarget: { kind: 'PLAYER', id: 'opponent' },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
      },
    })
    const first = planCombatDamage(state)
    if (first.type !== 'ACTIONS') throw new Error('expected plan')
    const afterFirst = first.actions.reduce(
      (current, action) => applyGameAction(current, action),
      state,
    )
    const normal = planCombatDamage(afterFirst)
    if (normal.type !== 'ACTIONS') throw new Error('expected plan')
    const afterNormal = normal.actions.reduce(
      (current, action) => applyGameAction(current, action),
      afterFirst,
    )
    expect(afterNormal.opponentLife).toBe(36)
  })

  it('tracks only combat damage from a commander to the local player', () => {
    const commander = instance('cmd', attackerDefinition)
    const state = { ...createInitialGameState([commander]), commanderId: 'cmd' }
    const combatDamage = applyGameAction(state, {
      type: 'DEAL_DAMAGE',
      damage: {
        sourceInstanceId: 'cmd',
        target: { kind: 'PLAYER', player: 'local' },
        amount: 4,
        damageKind: 'COMBAT',
        hasDeathtouch: false,
      },
    })
    const noncombat = applyGameAction(combatDamage, {
      type: 'DEAL_DAMAGE',
      damage: {
        sourceInstanceId: 'cmd',
        target: { kind: 'PLAYER', player: 'local' },
        amount: 3,
        damageKind: 'NONCOMBAT',
        hasDeathtouch: false,
      },
    })
    expect(noncombat.commanderDamageReceivedBySource).toEqual({ cmd: 4 })
  })

  it('loses at twenty-one commander combat damage and undo restores the snapshot', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([instance('cmd', attackerDefinition)]),
      commanderId: 'cmd',
    })
    useGameStore.getState().dispatch({
      type: 'DEAL_DAMAGE',
      damage: {
        sourceInstanceId: 'cmd',
        target: { kind: 'PLAYER', player: 'local' },
        amount: 21,
        damageKind: 'COMBAT',
        hasDeathtouch: false,
      },
    })
    expect(useGameStore.getState().gameLossReason).toBe('COMMANDER_DAMAGE')
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState().commanderDamageReceivedBySource).toEqual({})
  })
})

describe('Combat Core — regression matrix', () => {
  it.each([
    [
      'attacker outside declare attackers',
      () => {
        const state = {
          ...combat([instance('a', attackerDefinition)]),
          turnState: {
            phase: 'COMBAT' as const,
            step: 'DECLARE_BLOCKERS' as const,
            priority: 'WINDOW_OPEN' as const,
          },
        }
        return canAttack(state, state.cards[0]).legal
      },
      false,
    ],
    [
      'attacker outside battlefield',
      () => {
        const state = combat([
          instance('a', attackerDefinition, { zone: 'graveyard' }),
        ])
        return canAttack(state, state.cards[0]).legal
      },
      false,
    ],
    [
      'opponent cannot be declared by local attacker resolver',
      () => {
        const state = combat([
          instance('a', attackerDefinition, { controller: 'OPPONENT' }),
        ])
        return canAttack(state, state.cards[0]).legal
      },
      false,
    ],
    [
      'blocker must be controlled by opponent',
      () => {
        const attacker = instance('a', attackerDefinition)
        const blocker = instance('b', blockerDefinition)
        const state = toBlockers({
          ...combat([attacker, blocker]),
          combatState: {
            ...combat([attacker, blocker]).combatState,
            attackers: [
              {
                attackerInstanceId: 'a',
                defendingTarget: { kind: 'PLAYER', id: 'opponent' },
                blockedBy: [],
                externalBlockedBy: [],
              },
            ],
          },
        })
        return canBlock(state, state.combatState.attackers[0], blocker).legal
      },
      false,
    ],
    [
      'completed combat damage does not plan again',
      () => {
        const attacker = instance('a', attackerDefinition)
        const state = toDamage({
          ...combat([attacker]),
          combatState: {
            ...combat([attacker]).combatState,
            damageStep: 'COMPLETE',
            attackers: [
              {
                attackerInstanceId: 'a',
                defendingTarget: { kind: 'PLAYER', id: 'opponent' },
                blockedBy: [],
                externalBlockedBy: [],
              },
            ],
          },
        })
        return planCombatDamage(state).type === 'ERROR'
      },
      true,
    ],
    [
      'land play Core 1 state remains intact',
      () => createInitialGameState().landPlayLimit,
      1,
    ],
    [
      'mana pool Core 1 state remains intact',
      () => createInitialGameState().manaPool.U,
      0,
    ],
    [
      'hidden zones remain untracked by default',
      () => createInitialGameState().hiddenZoneTracking,
      'UNTRACKED',
    ],
    [
      'commander damage begins empty',
      () => createInitialGameState().commanderDamageReceivedBySource,
      {},
    ],
    [
      'combat begins inactive before its step',
      () => createInitialGameState().combatState.active,
      false,
    ],
    [
      'cleanup does not remove counters',
      () => {
        const state: GameState = {
          ...combat([
            instance('a', attackerDefinition, {
              counters: { '+1/+1': 2 },
              damageMarked: 1,
            }),
          ]),
          turnState: {
            phase: 'ENDING',
            step: 'END_STEP',
            priority: 'WINDOW_OPEN',
          },
        }
        return applyGameAction(state, { type: 'ADVANCE_STEP' }).cards[0]
          .counters['+1/+1']
      },
      2,
    ],
    [
      'manual damage preserves card identity',
      () => {
        const state = createInitialGameState([
          instance('a', attackerDefinition),
        ])
        return applyGameAction(state, {
          type: 'DEAL_DAMAGE',
          damage: {
            target: { kind: 'CREATURE', instanceId: 'a' },
            amount: 1,
            damageKind: 'NONCOMBAT',
            hasDeathtouch: false,
          },
        }).cards[0].instanceId
      },
      'a',
    ],
  ])('%s', (_label, actual, expected) => {
    expect(typeof actual === 'function' ? actual() : actual).toEqual(expected)
  })

  it.each([
    ['ataco con namor', 'DECLARE_ATTACKERS'],
    ['ataco con todos', 'DECLARE_ATTACKERS'],
    ['bloqueo namor con cosi', 'DECLARE_BLOCKERS'],
    ['bloqueo con cosi', 'DECLARE_BLOCKERS'],
    ['sin bloqueos', 'DECLARE_BLOCKERS'],
    ['daño', 'RESOLVE_COMBAT_DAMAGE'],
    ['namor queda bloqueado', 'DECLARE_ASSISTED_BLOCKER'],
    ['namor recibe 3', 'DECLARE_DAMAGE'],
    ['me hacen 4', 'DECLARE_DAMAGE'],
  ] as const)('parses %s as %s', (input, type) => {
    expect(parseCommand(input)).toMatchObject({
      status: 'parsed',
      command: { type },
    })
  })

  it.each([
    ['BEGIN_COMBAT', 'COMBAT_STARTED'],
    ['DECLARE_ATTACKERS', 'ATTACKERS_DECLARED'],
    ['DECLARE_ATTACKERS', 'CREATURE_ATTACKED'],
    ['DEAL_DAMAGE_BATCH', 'DAMAGE_DEALT'],
    ['DEAL_DAMAGE_BATCH', 'COMBAT_DAMAGE_DEALT'],
    ['DEAL_DAMAGE_BATCH', 'PLAYER_DEALT_DAMAGE'],
  ] as const)('derives %s event for %s', (actionType, eventType) => {
    const state = combat([instance('a', attackerDefinition)])
    const action: import('../../actions/gameActions').GameAction =
      actionType === 'BEGIN_COMBAT'
        ? { type: 'BEGIN_COMBAT' }
        : actionType === 'DECLARE_ATTACKERS'
          ? {
              type: 'DECLARE_ATTACKERS',
              attackers: [
                {
                  attackerInstanceId: 'a',
                  defendingTarget: { kind: 'PLAYER', id: 'opponent' },
                },
              ],
              eventGroupId: 'events',
            }
          : {
              type: 'DEAL_DAMAGE_BATCH',
              damages: [
                {
                  sourceInstanceId: 'a',
                  target: { kind: 'PLAYER', player: 'opponent' },
                  amount: 1,
                  damageKind: 'COMBAT',
                  hasDeathtouch: false,
                },
              ],
            }
    const next = applyGameAction(state, action)
    expect(
      deriveGameEvents(state, action, next).some(
        (event) => event.type === eventType,
      ),
    ).toBe(true)
  })

  it.each([
    ['normal', '', 'COMPLETE'],
    ['first strike', 'First strike', 'NORMAL'],
    ['double strike', 'Double strike', 'NORMAL'],
  ] as const)('sets %s damage progression', (_label, text, expected) => {
    const source = instance(
      'a',
      definition('Source', 'Creature', text, '2', '2'),
    )
    const state = toDamage({
      ...combat([source]),
      combatState: {
        ...combat([source]).combatState,
        attackers: [
          {
            attackerInstanceId: 'a',
            defendingTarget: { kind: 'PLAYER', id: 'opponent' },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
      },
    })
    const plan = planCombatDamage(state)
    if (plan.type !== 'ACTIONS') throw new Error('expected actions')
    const next = plan.actions.reduce(
      (current, action) => applyGameAction(current, action),
      state,
    )
    expect(next.combatState.damageStep).toBe(expected)
  })

  it.each([
    ['BEGIN_COMBAT', 'active'],
    ['END_COMBAT', 'inactive'],
    ['CLEANUP', 'cleared damage'],
    ['NEXT_TURN', 'untapped'],
  ] as const)(
    'keeps combat lifecycle deterministic at %s',
    (step, expectation) => {
      const source = instance('a', attackerDefinition, {
        tapped: true,
        damageMarked: 2,
      })
      const base = combat([source])
      const state: GameState =
        step === 'END_COMBAT'
          ? {
              ...base,
              turnState: {
                phase: 'COMBAT',
                step: 'COMBAT_DAMAGE',
                priority: 'WINDOW_OPEN',
              },
            }
          : step === 'CLEANUP'
            ? {
                ...base,
                turnState: {
                  phase: 'ENDING',
                  step: 'END_STEP',
                  priority: 'WINDOW_OPEN',
                },
              }
            : base
      const next =
        step === 'BEGIN_COMBAT'
          ? applyGameAction(state, { type: 'BEGIN_COMBAT' })
          : step === 'NEXT_TURN'
            ? applyGameAction(state, { type: 'NEXT_TURN' })
            : applyGameAction(state, { type: 'ADVANCE_STEP' })
      if (expectation === 'active') expect(next.combatState.active).toBe(true)
      if (expectation === 'inactive')
        expect(next.combatState.active).toBe(false)
      if (expectation === 'cleared damage')
        expect(next.cards[0].damageMarked).toBe(0)
      if (expectation === 'untapped') expect(next.cards[0].tapped).toBe(false)
    },
  )

  it.each([
    ['local player', { kind: 'PLAYER' as const, player: 'local' as const }, 36],
    [
      'opponent player',
      { kind: 'PLAYER' as const, player: 'opponent' as const },
      36,
    ],
  ])(
    'records manual damage to %s without turning it into lose-life',
    (_label, target, expectedLife) => {
      const state = createInitialGameState()
      const next = applyGameAction(state, {
        type: 'DEAL_DAMAGE',
        damage: {
          target,
          amount: 4,
          damageKind: 'NONCOMBAT',
          hasDeathtouch: false,
        },
      })
      expect(target.player === 'local' ? next.life : next.opponentLife).toBe(
        expectedLife,
      )
    },
  )

  it.each([
    ['external blocker never creates a card definition', undefined, undefined],
    ['external blocker has declared power only', 3, undefined],
    ['external blocker has declared toughness only', undefined, 4],
  ] as const)('%s', (_label, power, toughness) => {
    const state = applyGameAction(combat([instance('a', attackerDefinition)]), {
      type: 'DECLARE_ATTACKERS',
      attackers: [
        {
          attackerInstanceId: 'a',
          defendingTarget: { kind: 'PLAYER', id: 'opponent' },
        },
      ],
      eventGroupId: 'assisted',
    })
    const next = applyGameAction(state, {
      type: 'DECLARE_ASSISTED_BLOCKER',
      attackerInstanceId: 'a',
      participant: {
        temporaryId: 'external',
        controller: 'OPPONENT',
        ...(power === undefined ? {} : { power }),
        ...(toughness === undefined ? {} : { toughness }),
        damageMarked: 0,
        keywords: [],
      },
    })
    expect(next.cards).toHaveLength(1)
    expect(next.combatState.externalParticipants[0]).toMatchObject({
      temporaryId: 'external',
      ...(power === undefined ? {} : { power }),
      ...(toughness === undefined ? {} : { toughness }),
    })
  })

  it('resolves a chosen multi-block distribution atomically', () => {
    const attacker = instance('a', definition('Five', 'Creature', '', '5', '5'))
    const first = instance('b', blockerDefinition, { controller: 'OPPONENT' })
    const second = instance('c', blockerDefinition, { controller: 'OPPONENT' })
    const state = toDamage({
      ...combat([attacker, first, second]),
      combatState: {
        ...combat([attacker, first, second]).combatState,
        attackers: [
          {
            attackerInstanceId: 'a',
            defendingTarget: { kind: 'PLAYER', id: 'opponent' },
            blockedBy: ['b', 'c'],
            externalBlockedBy: [],
          },
        ],
        blockers: [
          { blockerInstanceId: 'b', blocking: ['a'] },
          { blockerInstanceId: 'c', blocking: ['a'] },
        ],
      },
    })
    const plan = planCombatDamage(state)
    if (plan.type !== 'DECISION') throw new Error('expected decision')
    useGameStore.getState().replaceGame(state)
    useGameStore
      .getState()
      .dispatch({ type: 'ADD_PENDING_DECISION', decision: plan.decision })
    useGameStore
      .getState()
      .resolvePendingDecision(
        plan.decision.id,
        plan.decision.options?.[0].instanceId ?? '',
      )
    expect(useGameStore.getState().combatState.damageStep).toBe('COMPLETE')
  })

  it('keeps an attacker blocked when its known blocker leaves before damage', () => {
    const attacker = instance('a', attackerDefinition)
    const state = toDamage({
      ...combat([attacker]),
      combatState: {
        ...combat([attacker]).combatState,
        attackers: [
          {
            attackerInstanceId: 'a',
            defendingTarget: { kind: 'PLAYER', id: 'opponent' },
            blockedBy: ['gone-blocker'],
            externalBlockedBy: [],
          },
        ],
      },
    })
    const plan = planCombatDamage(state)
    expect(plan).toMatchObject({ type: 'ACTIONS' })
    if (plan.type === 'ACTIONS')
      expect(
        plan.actions.find((action) => action.type === 'DEAL_DAMAGE_BATCH'),
      ).toMatchObject({ damages: [] })
  })

  it('lets trample deal through after every known blocker has left combat', () => {
    const attacker = instance(
      'a',
      definition('Trampler', 'Creature', 'Trample', '5', '5'),
    )
    const state = toDamage({
      ...combat([attacker]),
      combatState: {
        ...combat([attacker]).combatState,
        attackers: [
          {
            attackerInstanceId: 'a',
            defendingTarget: { kind: 'PLAYER', id: 'opponent' },
            blockedBy: ['gone-blocker'],
            externalBlockedBy: [],
          },
        ],
      },
    })
    const plan = planCombatDamage(state)
    expect(plan).toMatchObject({ type: 'ACTIONS' })
    if (plan.type === 'ACTIONS')
      expect(
        plan.actions.find((action) => action.type === 'DEAL_DAMAGE_BATCH'),
      ).toMatchObject({
        damages: [
          expect.objectContaining({
            amount: 5,
            target: { kind: 'PLAYER', player: 'opponent' },
          }),
        ],
      })
  })

  it('offers only trample multi-block assignments with lethal to every blocker before player damage', () => {
    const attacker = instance(
      'a',
      definition('Trampler', 'Creature', 'Trample', '5', '5'),
    )
    const first = instance('b', blockerDefinition, { controller: 'OPPONENT' })
    const second = instance('c', blockerDefinition, { controller: 'OPPONENT' })
    const state = toDamage({
      ...combat([attacker, first, second]),
      combatState: {
        ...combat([attacker, first, second]).combatState,
        attackers: [
          {
            attackerInstanceId: 'a',
            defendingTarget: { kind: 'PLAYER', id: 'opponent' },
            blockedBy: ['b', 'c'],
            externalBlockedBy: [],
          },
        ],
        blockers: [
          { blockerInstanceId: 'b', blocking: ['a'] },
          { blockerInstanceId: 'c', blocking: ['a'] },
        ],
      },
    })
    const plan = planCombatDamage(state)
    expect(plan).toMatchObject({ type: 'DECISION' })
    if (plan.type === 'DECISION')
      expect(
        plan.decision.options?.some((option) => option.label.endsWith('/1')),
      ).toBe(true)
  })

  it.each([
    ['attacks undo restores tap', 'DECLARE_ATTACKERS'],
    ['damage undo restores life', 'DEAL_DAMAGE'],
    ['blocks undo restores associations', 'DECLARE_BLOCKERS'],
  ] as const)('%s', (_label, kind) => {
    const state = combat([
      instance('a', attackerDefinition),
      instance('b', blockerDefinition, { controller: 'OPPONENT' }),
    ])
    useGameStore.getState().replaceGame(state)
    if (kind === 'DECLARE_ATTACKERS')
      useGameStore.getState().dispatch({
        type: 'DECLARE_ATTACKERS',
        attackers: [
          {
            attackerInstanceId: 'a',
            defendingTarget: { kind: 'PLAYER', id: 'opponent' },
          },
        ],
        eventGroupId: 'undo',
      })
    if (kind === 'DEAL_DAMAGE')
      useGameStore.getState().dispatch({
        type: 'DEAL_DAMAGE',
        damage: {
          target: { kind: 'PLAYER', player: 'local' },
          amount: 2,
          damageKind: 'NONCOMBAT',
          hasDeathtouch: false,
        },
      })
    if (kind === 'DECLARE_BLOCKERS') {
      useGameStore.getState().replaceGame(
        toBlockers(
          applyGameAction(state, {
            type: 'DECLARE_ATTACKERS',
            attackers: [
              {
                attackerInstanceId: 'a',
                defendingTarget: { kind: 'PLAYER', id: 'opponent' },
              },
            ],
            eventGroupId: 'undo',
          }),
        ),
      )
      useGameStore.getState().dispatch({
        type: 'DECLARE_BLOCKERS',
        blockers: [{ blockerInstanceId: 'b', blocking: ['a'] }],
      })
    }
    useGameStore.getState().undoLastAction()
    if (kind === 'DECLARE_ATTACKERS')
      expect(useGameStore.getState().cards[0].tapped).toBe(false)
    if (kind === 'DEAL_DAMAGE') expect(useGameStore.getState().life).toBe(40)
    if (kind === 'DECLARE_BLOCKERS')
      expect(
        useGameStore.getState().combatState.attackers[0].blockedBy,
      ).toEqual([])
  })
})
