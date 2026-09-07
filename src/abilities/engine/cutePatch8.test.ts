import { describe, expect, it } from 'vitest'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import { validateAbilityDefinitions } from '../compiler/validators/abilityDefinitionValidator'
import {
  advancePendingResolution,
  createSpellEffectResolution,
  evaluateAbilities,
} from './abilityEngine'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import { deriveGameEvents } from '../../events/deriveGameEvents'
import { legalDeclarationTargetOptions } from '../../rules/targeting/declarationTargets'
import type { AbilityDefinition } from '../types/abilityTypes'
import type { CardDefinition, CardInstance } from '../../types/card'

const card = (name: string, typeLine: string): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
  name,
  typeLine,
  manaCost: '',
  cmc: 0,
  colors: [],
  colorIdentity: [],
})

const instance = (
  instanceId: string,
  definition: CardDefinition,
  zone: CardInstance['zone'] = 'battlefield',
  controllerId = 'player-1',
): CardInstance => ({
  instanceId,
  card: definition,
  zone,
  tapped: false,
  counters: {},
  ownerId: controllerId,
  controllerId,
  controller: controllerId === 'player-1' ? 'YOU' : 'OPPONENT',
})

const metadata = { actionId: 'patch8-test', timestamp: 1 }

describe('Cute patch 8', () => {
  it('keeps Senu, Kitnap and Dawn\'s Truce validator-clean', () => {
    for (const [name, typeLine] of [
      ['Senu, Keen-Eyed Protector', 'Legendary Creature — Bird Scout'],
      ['Kitnap', 'Enchantment — Aura'],
      ["Dawn's Truce", 'Instant'],
    ] as const)
      expect(
        validateAbilityDefinitions(getAbilitiesForCard(card(name, typeLine))),
      ).toMatchObject({ valid: true })
  })

  it('lets triggered abilities opt into exile and Senu only sees an unblocked legendary attacker', () => {
    const senu = instance(
      'senu',
      card('Senu, Keen-Eyed Protector', 'Legendary Creature — Bird Scout'),
      'exile',
    )
    const attacker = instance(
      'legend',
      card('Legendary Friend', 'Legendary Creature — Human'),
    )
    const state = createInitialGameState([senu, attacker])
    const pending = evaluateAbilities(state, {
      type: 'CREATURE_ATTACKED_UNBLOCKED',
      cardInstanceId: attacker.instanceId,
      cardName: attacker.card.name,
      eventGroupId: 'combat-1',
      controller: 'YOU',
      playerId: 'player-1',
      cardTypes: ['Legendary', 'Creature'],
      subtypes: ['Human'],
      isToken: false,
    })
    expect(pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceInstanceId: 'senu',
          abilityId: 'senu-return-from-exile-unblocked-legendary',
        }),
      ]),
    )
  })

  it('derives the unblocked event after blockers are declared, not when attackers are declared', () => {
    const attacker = instance(
      'legend',
      card('Legendary Friend', 'Legendary Creature — Human'),
    )
    const blocker = instance(
      'blocker',
      card('Blocker', 'Creature — Human'),
      'battlefield',
      'player-2',
    )
    let before = createInitialGameState([attacker, blocker])
    before = {
      ...before,
      combatState: {
        ...before.combatState,
        combatId: 'combat-1',
        active: true,
        attackers: [
          {
            attackerInstanceId: attacker.instanceId,
            defendingTarget: {
              kind: 'PLAYER',
              id: 'player-2',
              playerId: 'player-2',
            },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
      },
    }
    const noBlocks = { type: 'DECLARE_BLOCKERS' as const, blockers: [] }
    const afterNoBlocks = applyGameAction(before, noBlocks, metadata)
    expect(deriveGameEvents(before, noBlocks, afterNoBlocks)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CREATURE_ATTACKED_UNBLOCKED',
          cardInstanceId: attacker.instanceId,
        }),
      ]),
    )

    const blocks = {
      type: 'DECLARE_BLOCKERS' as const,
      blockers: [
        { blockerInstanceId: blocker.instanceId, blocking: [attacker.instanceId] },
      ],
    }
    const afterBlocks = applyGameAction(before, blocks, metadata)
    expect(
      deriveGameEvents(before, blocks, afterBlocks).some(
        (event) => event.type === 'CREATURE_ATTACKED_UNBLOCKED',
      ),
    ).toBe(false)
  })

  it('can put Senu onto the battlefield attacking an opposing planeswalker', () => {
    const senu = instance(
      'senu',
      card('Senu, Keen-Eyed Protector', 'Legendary Creature — Bird Scout'),
    )
    const walker = instance(
      'walker',
      card('Enemy Walker', 'Legendary Planeswalker — Test'),
      'battlefield',
      'player-2',
    )
    let state = createInitialGameState([senu, walker])
    state = {
      ...state,
      combatState: {
        ...state.combatState,
        combatId: 'combat-1',
        active: true,
      },
    }
    state = applyGameAction(
      state,
      {
        type: 'ADD_ATTACKING_CREATURE_TO_COMBAT',
        instanceId: senu.instanceId,
        defendingTarget: { kind: 'PLANESWALKER', id: walker.instanceId },
      },
      metadata,
    )
    expect(state.combatState.attackers).toEqual([
      expect.objectContaining({
        attackerInstanceId: senu.instanceId,
        defendingTarget: { kind: 'PLANESWALKER', id: walker.instanceId },
      }),
    ])
  })

  it('keeps Kitnap control only while the Aura remains attached', () => {
    const kitnap = {
      ...instance('kitnap', card('Kitnap', 'Enchantment — Aura')),
      attachedToInstanceId: 'victim',
    }
    const victim = instance(
      'victim',
      card('Victim', 'Creature — Human'),
      'battlefield',
      'player-2',
    )
    let state = createInitialGameState([kitnap, victim])
    state = applyGameAction(
      state,
      {
        type: 'ADD_ATTACHMENT_CONTROL_EFFECT',
        sourceInstanceId: kitnap.instanceId,
        targetInstanceId: victim.instanceId,
        controllerId: 'player-1',
      },
      metadata,
    )
    expect(
      state.cards.find((candidate) => candidate.instanceId === victim.instanceId)
        ?.controllerId,
    ).toBe('player-1')

    state = applyGameAction(
      state,
      { type: 'DETACH_CARD', attachmentInstanceId: kitnap.instanceId },
      metadata,
    )
    expect(
      state.cards.find((candidate) => candidate.instanceId === victim.instanceId)
        ?.controllerId,
    ).toBe('player-2')

    state = applyGameAction(
      state,
      {
        type: 'ATTACH_CARD',
        attachmentInstanceId: kitnap.instanceId,
        targetInstanceId: victim.instanceId,
      },
      metadata,
    )
    expect(
      state.cards.find((candidate) => candidate.instanceId === victim.instanceId)
        ?.controllerId,
    ).toBe('player-1')

    state = applyGameAction(
      state,
      { type: 'MOVE_CARD', instanceId: kitnap.instanceId, toZone: 'graveyard' },
      metadata,
    )
    expect(
      state.cards.find((candidate) => candidate.instanceId === victim.instanceId)
        ?.controllerId,
    ).toBe('player-2')
    expect(state.attachmentControlEffects).toEqual([])
  })

  it('filters player targets through player hexproof/protection', () => {
    let state = createInitialGameState([])
    state = applyGameAction(
      state,
      {
        type: 'ADD_PLAYER_RULE_EFFECT',
        id: 'hexproof-opponent',
        sourceInstanceId: 'shield',
        playerId: 'player-2',
        hexproof: true,
        duration: 'UNTIL_END_OF_TURN',
      },
      metadata,
    )
    expect(
      legalDeclarationTargetOptions(
        state,
        { controllerId: 'player-1', kind: 'SPELL' },
        { playerRelation: 'OPPONENT' },
      ),
    ).toEqual([])
    expect(
      legalDeclarationTargetOptions(
        state,
        { controllerId: 'player-2', kind: 'SPELL' },
        { playerRelation: 'YOU' },
      ),
    ).toEqual([
      expect.objectContaining({ instanceId: 'player-2' }),
    ])
  })

  it('consumes a declared player target into TARGET_PLAYER during resolution', () => {
    const source = instance('spell', card('Player Target Test', 'Instant'), 'stack')
    const ability: Extract<AbilityDefinition, { kind: 'SPELL_EFFECT' }> = {
      id: 'player-target-test',
      sourceCardName: source.card.name,
      kind: 'SPELL_EFFECT',
      effects: [
        {
          type: 'TARGET_SELECTION',
          prompt: 'Elige oponente.',
          constraints: { playerRelation: 'OPPONENT' },
          effects: [
            {
              type: 'GAIN_LIFE_FOR_PLAYER',
              player: 'TARGET_PLAYER',
              amount: { type: 'LITERAL', value: 1 },
            },
          ],
        },
      ],
      automation: 'AUTO',
    }
    const state = createInitialGameState([source])
    const resolution = createSpellEffectResolution(source, ability, {}, [
      {
        targetId: 'player-2',
        constraints: { playerRelation: 'OPPONENT' },
      },
    ])
    const step = advancePendingResolution(state, resolution)
    expect(step.type).toBe('ACTIONS')
    if (step.type === 'ACTIONS')
      expect(step.actions).toEqual(
        expect.arrayContaining([
          { type: 'GAIN_PLAYER_LIFE', playerId: 'player-2', amount: 1 },
        ]),
      )
  })
})
