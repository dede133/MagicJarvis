import { describe, expect, it } from 'vitest'
import { createInitialGameState, applyGameAction } from '../../engine/gameEngine'
import { deriveGameEvents } from '../../events/deriveGameEvents'
import { turnStateFor } from '../../types/turn'
import type { CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import { validateAttackDeclaration, validateBlockDeclaration } from './combatRules'

const creature = (
  instanceId: string,
  controllerId: 'player-1' | 'player-2',
): CardInstance => ({
  instanceId,
  card: {
    scryfallId: instanceId,
    name: instanceId,
    cmc: 1,
    typeLine: 'Creature — Test',
    colors: [],
    colorIdentity: [],
    power: '2',
    toughness: '2',
  },
  zone: 'battlefield',
  tapped: false,
  counters: {},
  controllerId,
  ownerId: controllerId,
  controlledSinceTurn: 0,
})

const combatState = (): GameState => {
  const base = createInitialGameState()
  const attacker = creature('attacker', 'player-1')
  const blocker = creature('blocker', 'player-2')
  return {
    ...base,
    activePlayerId: 'player-1',
    turn: 3,
    turnState: turnStateFor('DECLARE_BLOCKERS'),
    cards: [attacker, blocker],
    combatState: {
      combatId: 'combat-3',
      active: true,
      attackingPlayerId: 'local',
      attackingPlayerStableId: 'player-1',
      attackers: [{
        attackerInstanceId: attacker.instanceId,
        defendingTarget: { kind: 'PLAYER', id: 'opponent', playerId: 'player-2' },
        blockedBy: [],
        externalBlockedBy: [],
      }],
      blockers: [],
      externalParticipants: [],
      damageStep: 'PENDING',
      firstStrikeDamageStepRequired: false,
      firstStrikeParticipantIds: [],
    },
  }
}

describe('Combat requirements core', () => {
  it('enforces a block-if-able requirement at declaration time', () => {
    const state = {
      ...combatState(),
      blockRequirements: [{
        blockerInstanceId: 'blocker',
        attackerInstanceId: 'attacker',
        turn: 3,
        combatId: 'combat-3',
      }],
    }
    expect(validateBlockDeclaration(state, []).legal).toBe(false)
    expect(
      validateBlockDeclaration(state, [{ blockerInstanceId: 'blocker', blocking: ['attacker'] }]).legal,
    ).toBe(true)
  })

  it('emits declaration, blocked-attacker and blocker events from one atomic block declaration', () => {
    const before = combatState()
    const action = {
      type: 'DECLARE_BLOCKERS' as const,
      blockers: [{ blockerInstanceId: 'blocker', blocking: ['attacker'] }],
    }
    const after = applyGameAction(before, action)
    const events = deriveGameEvents(before, action, after)
    expect(events.some((event) => event.type === 'BLOCKERS_DECLARED')).toBe(true)
    expect(events.some((event) => event.type === 'CREATURE_BECAME_BLOCKED')).toBe(true)
    expect(events.some((event) => event.type === 'CREATURE_BLOCKED')).toBe(true)
  })

  it('keeps attack requirements legal when the required attack would require an optional attack payment', () => {
    const source = creature('tax-source', 'player-2')
    source.card = {
      ...source.card,
      name: 'Windborn Muse',
      typeLine: 'Creature — Spirit',
      oracleText: 'Creatures can’t attack you unless their controller pays {2} for each creature they control that’s attacking you.',
    }
    const attacker = creature('required-attacker', 'player-1')
    const state: GameState = {
      ...createInitialGameState(),
      activePlayerId: 'player-1',
      turn: 4,
      turnState: turnStateFor('DECLARE_ATTACKERS'),
      cards: [source, attacker],
      combatState: {
        combatId: 'combat-4',
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
      attackRequirements: [{
        attackerInstanceId: attacker.instanceId,
        defendingPlayerId: 'player-2',
        turn: 4,
      }],
    }
    // Registry-backed Windborn Muse supplies the tax; declining to pay means
    // the "attacks if able" requirement does not force the attack.
    expect(validateAttackDeclaration(state, []).legal).toBe(true)
  })
})
