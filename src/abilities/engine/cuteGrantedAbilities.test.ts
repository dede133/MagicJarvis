import { describe, expect, it } from 'vitest'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import { syggCombatDamageDrawGrantedAbility } from '../definitions/grantedTriggeredAbilities'
import { validateAbilityDefinitions } from '../compiler/validators/abilityDefinitionValidator'
import {
  advancePendingResolution,
  createPendingResolution,
  evaluateAbilities,
} from './abilityEngine'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { PendingAbility } from '../types/abilityTypes'
import type { PlayerState } from '../../types/player'

const emptyMana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }

const card = (name: string, typeLine: string): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
  name,
  typeLine,
  manaCost: '',
  cmc: 0,
  colors: [],
  colorIdentity: [],
})

const permanent = (
  instanceId: string,
  definition: CardDefinition,
  controllerId = 'player-1',
  ownerId = controllerId,
): CardInstance => ({
  instanceId,
  card: definition,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ownerId,
  controllerId,
  controller: controllerId === 'player-1' ? 'YOU' : 'OPPONENT',
})

const attackEvent = (
  instanceId: string,
  controllerId = 'player-1',
) => ({
  type: 'CREATURE_ATTACKED' as const,
  cardInstanceId: instanceId,
  cardName: 'Commander',
  eventGroupId: 'combat-1',
  controller: controllerId === 'player-1' ? ('YOU' as const) : ('OPPONENT' as const),
  playerId: controllerId,
  cardTypes: ['Legendary', 'Creature'],
  subtypes: ['Human'],
  isToken: false,
})

const player = (id: string, life: number, isLocal = false): PlayerState => ({
  id,
  life,
  isLocal,
  manaPool: { ...emptyMana },
})

describe('Cute patch 9 - granted triggered abilities', () => {
  it('keeps Flaming Fist and Sword Coast Sailor validator-clean', () => {
    for (const [name, typeLine] of [
      ['Flaming Fist', 'Legendary Enchantment — Background'],
      ['Sword Coast Sailor', 'Legendary Enchantment — Background'],
    ] as const)
      expect(
        validateAbilityDefinitions(getAbilitiesForCard(card(name, typeLine))),
      ).toMatchObject({ valid: true })
  })

  it('Flaming Fist grants its attack trigger to commander creatures you own, even if an opponent controls one', () => {
    const fist = permanent(
      'fist',
      card('Flaming Fist', 'Legendary Enchantment — Background'),
    )
    const commander = permanent(
      'commander',
      card('Borrowed Commander', 'Legendary Creature — Human'),
      'player-2',
      'player-1',
    )
    let state = createInitialGameState([fist, commander])
    state = { ...state, commanderId: commander.instanceId, commanderIds: [commander.instanceId] }

    const pending = evaluateAbilities(
      state,
      attackEvent(commander.instanceId, 'player-2'),
    )
    expect(pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceInstanceId: commander.instanceId,
          abilityId: expect.stringContaining(
            'flaming-fist-granted-attack-double-strike@grant:fist',
          ),
        }),
      ]),
    )

    state = { ...state, cards: state.cards.filter((entry) => entry.instanceId !== fist.instanceId) }
    expect(
      evaluateAbilities(state, attackEvent(commander.instanceId, 'player-2')),
    ).toHaveLength(0)
  })

  it('Sword Coast Sailor only grants evasion when attacking a player tied for greatest life among opponents', () => {
    const sailor = permanent(
      'sailor',
      card('Sword Coast Sailor', 'Legendary Enchantment — Background'),
    )
    const commander = permanent(
      'commander',
      card('Commander', 'Legendary Creature — Human'),
    )
    let state = createInitialGameState([sailor, commander])
    state = {
      ...state,
      commanderId: commander.instanceId,
      commanderIds: [commander.instanceId],
      localPlayerId: 'player-1',
      players: [player('player-1', 40, true), player('player-2', 30), player('player-3', 35)],
      turnOrder: ['player-1', 'player-2', 'player-3'],
      combatState: {
        ...state.combatState,
        active: true,
        combatId: 'combat-1',
        attackers: [
          {
            attackerInstanceId: commander.instanceId,
            defendingTarget: { kind: 'PLAYER', id: 'player-2', playerId: 'player-2' },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
      },
    }

    expect(evaluateAbilities(state, attackEvent(commander.instanceId))).toHaveLength(0)

    state = {
      ...state,
      players: [player('player-1', 40, true), player('player-2', 35), player('player-3', 35)],
    }
    expect(evaluateAbilities(state, attackEvent(commander.instanceId))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceInstanceId: commander.instanceId,
          abilityId: expect.stringContaining(
            'sword-coast-sailor-granted-attack-evasion@grant:sailor',
          ),
        }),
      ]),
    )

    state = {
      ...state,
      combatState: {
        ...state.combatState,
        attackers: [
          {
            attackerInstanceId: commander.instanceId,
            defendingTarget: { kind: 'PLANESWALKER', id: 'walker' },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
      },
    }
    expect(evaluateAbilities(state, attackEvent(commander.instanceId))).toHaveLength(0)
  })

  it('supports Sygg-style temporary combat-damage draw triggers until cleanup', () => {
    const creature = permanent('creature', card('Chosen Creature', 'Creature — Human'))
    let state = createInitialGameState([creature])
    state = applyGameAction(state, {
      type: 'ADD_TEMPORARY_GRANTED_TRIGGERED_ABILITY',
      id: 'sygg-grant-1',
      sourceInstanceId: 'sygg',
      targetInstanceId: creature.instanceId,
      ability: syggCombatDamageDrawGrantedAbility,
      duration: 'UNTIL_END_OF_TURN',
    })

    const playerDamage = evaluateAbilities(state, {
      type: 'DAMAGE_DEALT',
      sourceInstanceId: creature.instanceId,
      sourcePlayerId: 'player-1',
      targetPlayerId: 'player-2',
      amount: 2,
      damageKind: 'COMBAT',
    })
    expect(playerDamage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceInstanceId: creature.instanceId,
          abilityId: expect.stringContaining('sygg-granted-combat-damage-draw@temporary:sygg-grant-1'),
        }),
      ]),
    )

    const noncombat = evaluateAbilities(state, {
      type: 'DAMAGE_DEALT',
      sourceInstanceId: creature.instanceId,
      sourcePlayerId: 'player-1',
      targetPlayerId: 'player-2',
      amount: 2,
      damageKind: 'NONCOMBAT',
    })
    expect(noncombat).toHaveLength(0)

    state = applyGameAction(state, { type: 'END_TURN' })
    expect(state.temporaryGrantedTriggeredAbilities).toEqual([])
  })

  it('resolves the temporary grant effect into a serializable GameAction', () => {
    const target = permanent('target', card('Target', 'Creature — Human'))
    const state = createInitialGameState([target])
    const pending: PendingAbility = {
      id: 'pending-grant',
      abilityId: 'test-grant',
      sourceInstanceId: 'sygg',
      sourceCardName: 'Sygg, Wanderwine Wisdom',
      createdFromEvent: { type: 'CARD_DRAWN', knownIdentity: false },
      resolvedEffects: [
        {
          type: 'GRANT_TRIGGERED_ABILITY_UNTIL_END_OF_TURN',
          target: 'SELECTED_TARGET',
          ability: syggCombatDamageDrawGrantedAbility,
        },
      ],
      automation: 'AUTO',
    }
    const resolution = createPendingResolution(pending)
    resolution.context.selectedTargets.push(target.instanceId)
    resolution.context.declaredTargets = [
      { targetId: target.instanceId, constraints: { zones: ['battlefield'], cardTypes: ['Creature'] } },
    ]
    const step = advancePendingResolution(state, resolution)
    expect(step.type).toBe('ACTIONS')
    if (step.type === 'ACTIONS')
      expect(step.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'ADD_TEMPORARY_GRANTED_TRIGGERED_ABILITY',
            targetInstanceId: target.instanceId,
          }),
        ]),
      )
  })
})
