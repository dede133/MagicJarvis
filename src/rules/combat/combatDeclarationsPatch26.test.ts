import { describe, expect, it } from 'vitest'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import { parseCommand } from '../../commands/parser/parseCommand'
import { resolveCommand } from '../../commands/resolver/resolveCommand'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import {
  canAttack,
  canBlock,
  validateBlockDeclaration,
} from './combatRules'

const definition = (
  name: string,
  typeLine = 'Creature',
  oracleText = '',
  power = '2',
  toughness = '2',
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 0,
  typeLine,
  oracleText,
  power,
  toughness,
  colors: [],
  colorIdentity: [],
})

const permanent = (
  id: string,
  card: CardDefinition,
  playerId: 'player-1' | 'player-2',
  extras: Partial<CardInstance> = {},
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
  ...extras,
})

const blockersState = (cards: CardInstance[]): GameState => ({
  ...createInitialGameState(cards),
  activePlayerId: 'player-1',
  turnOrder: ['player-1', 'player-2'],
  turnState: {
    phase: 'COMBAT',
    step: 'DECLARE_BLOCKERS',
    priority: 'WINDOW_OPEN',
  },
  combatState: {
    combatId: 'combat-26',
    active: true,
    attackingPlayerId: 'local',
    attackingPlayerStableId: 'player-1',
    attackers: [
      {
        attackerInstanceId: 'attacker-one',
        defendingTarget: {
          kind: 'PLAYER',
          id: 'opponent',
          playerId: 'player-2',
        },
        blockedBy: [],
        externalBlockedBy: [],
      },
      {
        attackerInstanceId: 'attacker-two',
        defendingTarget: {
          kind: 'PLAYER',
          id: 'opponent',
          playerId: 'player-2',
        },
        blockedBy: [],
        externalBlockedBy: [],
      },
    ],
    blockers: [],
    externalParticipants: [],
    damageStep: 'PENDING',
    firstStrikeDamageStepRequired: false,
  },
})

describe('0026 combat declarations core', () => {
  it('uses the full static filter for Aqueous Form attachedToSource', () => {
    const attacker = permanent(
      'attacker-one',
      definition('Attacker One'),
      'player-1',
    )
    const second = permanent(
      'attacker-two',
      definition('Attacker Two'),
      'player-1',
    )
    const aura = permanent(
      'aura',
      definition(
        'Aqueous Form',
        'Enchantment — Aura',
        'Enchant creature\nEnchanted creature can’t be blocked.',
      ),
      'player-1',
      { attachedToInstanceId: attacker.instanceId },
    )
    const blocker = permanent('blocker', definition('Blocker'), 'player-2')
    const state = blockersState([attacker, second, aura, blocker])
    expect(canBlock(state, state.combatState.attackers[0], blocker)).toMatchObject({
      legal: false,
      code: 'CANNOT_BE_BLOCKED',
    })
  })

  it('uses hasCounterType for Herald of Secret Streams', () => {
    const attacker = permanent(
      'attacker-one',
      definition('Attacker One'),
      'player-1',
      { counters: { '+1/+1': 1 } },
    )
    const second = permanent(
      'attacker-two',
      definition('Attacker Two'),
      'player-1',
    )
    const herald = permanent(
      'herald',
      definition(
        'Herald of Secret Streams',
        'Creature — Merfolk Warrior',
        'Creatures you control with +1/+1 counters on them can’t be blocked.',
      ),
      'player-1',
    )
    const blocker = permanent('blocker', definition('Blocker'), 'player-2')
    const state = blockersState([attacker, second, herald, blocker])
    expect(canBlock(state, state.combatState.attackers[0], blocker)).toMatchObject({
      legal: false,
      code: 'CANNOT_BE_BLOCKED',
    })
  })

  it('enforces defender in the rules core', () => {
    const defender = permanent(
      'wall',
      definition('Wall', 'Creature — Wall', 'Defender'),
      'player-1',
    )
    const state: GameState = {
      ...createInitialGameState([defender]),
      activePlayerId: 'player-1',
      turnOrder: ['player-1', 'player-2'],
      turnState: {
        phase: 'COMBAT',
        step: 'DECLARE_ATTACKERS',
        priority: 'WINDOW_OPEN',
      },
      combatState: {
        ...createInitialGameState().combatState,
        combatId: 'combat-defender',
        active: true,
        attackingPlayerStableId: 'player-1',
      },
    }
    expect(canAttack(state, defender)).toMatchObject({
      legal: false,
      code: 'CANNOT_ATTACK',
    })
  })

  it('commits blockers for two different attackers atomically', () => {
    const attackerOne = permanent(
      'attacker-one',
      definition('Attacker One'),
      'player-1',
    )
    const attackerTwo = permanent(
      'attacker-two',
      definition('Attacker Two'),
      'player-1',
    )
    const blockerOne = permanent(
      'blocker-one',
      definition('Blocker One'),
      'player-2',
    )
    const blockerTwo = permanent(
      'blocker-two',
      definition('Blocker Two'),
      'player-2',
    )
    const state = blockersState([
      attackerOne,
      attackerTwo,
      blockerOne,
      blockerTwo,
    ])
    const blockers = [
      { blockerInstanceId: 'blocker-one', blocking: ['attacker-one'] },
      { blockerInstanceId: 'blocker-two', blocking: ['attacker-two'] },
    ]
    expect(validateBlockDeclaration(state, blockers)).toEqual({ legal: true })
    const next = applyGameAction(state, { type: 'DECLARE_BLOCKERS', blockers })
    expect(next.combatState.blockers).toEqual(blockers)
    expect(next.combatState.attackers).toMatchObject([
      { attackerInstanceId: 'attacker-one', blockedBy: ['blocker-one'] },
      { attackerInstanceId: 'attacker-two', blockedBy: ['blocker-two'] },
    ])
  })

  it('parses and resolves a full two-attacker block declaration', () => {
    const attackerOne = permanent(
      'attacker-one',
      definition('Attacker One'),
      'player-1',
    )
    const attackerTwo = permanent(
      'attacker-two',
      definition('Attacker Two'),
      'player-1',
    )
    const blockerOne = permanent(
      'blocker-one',
      definition('Blocker One'),
      'player-2',
    )
    const blockerTwo = permanent(
      'blocker-two',
      definition('Blocker Two'),
      'player-2',
    )
    const state = blockersState([
      attackerOne,
      attackerTwo,
      blockerOne,
      blockerTwo,
    ])
    const parsed = parseCommand(
      'blocker one bloquea attacker one y blocker two bloquea attacker two',
    )
    expect(parsed).toMatchObject({
      status: 'parsed',
      command: { type: 'DECLARE_BLOCKERS' },
    })
    if (parsed.status !== 'parsed') throw new Error('expected parsed command')
    const resolved = resolveCommand(state, parsed.command)
    expect(resolved.status).toBe('resolved')
    if (resolved.status !== 'resolved') throw new Error('expected resolution')
    expect(resolved.actions).toContainEqual({
      type: 'DECLARE_BLOCKERS',
      blockers: [
        { blockerInstanceId: 'blocker-one', blocking: ['attacker-one'] },
        { blockerInstanceId: 'blocker-two', blocking: ['attacker-two'] },
      ],
    })
  })

  it('keeps menace in engine-level block validation', () => {
    const menace = permanent(
      'attacker-one',
      definition('Menace Attacker', 'Creature', 'Menace'),
      'player-1',
    )
    const attackerTwo = permanent(
      'attacker-two',
      definition('Attacker Two'),
      'player-1',
    )
    const blocker = permanent('blocker-one', definition('Blocker One'), 'player-2')
    const state = blockersState([menace, attackerTwo, blocker])
    expect(
      validateBlockDeclaration(state, [
        { blockerInstanceId: blocker.instanceId, blocking: [menace.instanceId] },
      ]),
    ).toMatchObject({ legal: false, code: 'INVALID_BLOCKER' })
    const unchanged = applyGameAction(state, {
      type: 'DECLARE_BLOCKERS',
      blockers: [
        { blockerInstanceId: blocker.instanceId, blocking: [menace.instanceId] },
      ],
    })
    expect(unchanged.combatState.blockers).toEqual([])
  })
  it('supports different defending targets inside one atomic attack declaration', () => {
    const first = permanent('attack-a', definition('Attack A'), 'player-1')
    const second = permanent('attack-b', definition('Attack B'), 'player-1')
    const planeswalker = permanent(
      'walker',
      definition('Walker', 'Legendary Planeswalker — Test'),
      'player-2',
      { card: { ...definition('Walker', 'Legendary Planeswalker — Test'), loyalty: '4' } },
    )
    const base = createInitialGameState([first, second, planeswalker])
    const state: GameState = {
      ...base,
      activePlayerId: 'player-1',
      turnOrder: ['player-1', 'player-2'],
      turnState: {
        phase: 'COMBAT',
        step: 'DECLARE_ATTACKERS',
        priority: 'WINDOW_OPEN',
      },
      combatState: {
        ...base.combatState,
        combatId: 'combat-targets',
        active: true,
        attackingPlayerStableId: 'player-1',
      },
    }
    const next = applyGameAction(state, {
      type: 'DECLARE_ATTACKERS',
      actorPlayerId: 'player-1',
      eventGroupId: 'attack-targets',
      attackers: [
        {
          attackerInstanceId: first.instanceId,
          defendingTarget: {
            kind: 'PLAYER',
            id: 'opponent',
            playerId: 'player-2',
          },
        },
        {
          attackerInstanceId: second.instanceId,
          defendingTarget: { kind: 'PLANESWALKER', id: planeswalker.instanceId },
        },
      ],
    })
    expect(next.combatState.attackers).toMatchObject([
      { attackerInstanceId: 'attack-a', defendingTarget: { kind: 'PLAYER' } },
      { attackerInstanceId: 'attack-b', defendingTarget: { kind: 'PLANESWALKER', id: 'walker' } },
    ])
  })

  it('skips blockers and combat damage when no creatures attacked', () => {
    const base = createInitialGameState()
    const state: GameState = {
      ...base,
      activePlayerId: 'player-1',
      turnOrder: ['player-1', 'player-2'],
      turnState: {
        phase: 'COMBAT',
        step: 'DECLARE_ATTACKERS',
        priority: 'WINDOW_OPEN',
      },
      combatState: {
        ...base.combatState,
        combatId: 'combat-empty',
        active: true,
        attackingPlayerStableId: 'player-1',
      },
    }
    const next = applyGameAction(state, { type: 'ADVANCE_STEP' })
    expect(next.turnState.step).toBe('END_COMBAT')
    expect(next.combatState.active).toBe(false)
  })

})
