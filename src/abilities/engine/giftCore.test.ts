import { describe, expect, it } from 'vitest'
import type { GameAction } from '../../actions/gameActions'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import type { CardDefinition, CardInstance } from '../../types/card'
import { resolvePreparedCast } from '../../commands/resolver/resolveCommand'
import { declarationTargetRequirement } from '../../rules/targeting/declarationTargets'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import { validateAbilityDefinitions } from '../compiler/validators/abilityDefinitionValidator'
import {
  advancePendingResolution,
  createPendingResolution,
  createSpellEffectResolution,
  evaluateAbilities,
} from './abilityEngine'
import { hasEffectiveKeyword } from './staticEffects'

const card = (
  name: string,
  typeLine: string,
  manaCost = '{U}',
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
  name,
  cmc: 1,
  manaCost,
  typeLine,
  colors: [],
  colorIdentity: [],
})

const permanent = (
  instanceId: string,
  definition: CardDefinition,
  controllerId = 'player-1',
): CardInstance => ({
  instanceId,
  card: definition,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  controllerId,
  ownerId: controllerId,
  controller: controllerId === 'player-1' ? 'YOU' : 'OPPONENT',
})

const spellAbility = (definition: CardDefinition) => {
  const ability = getAbilitiesForCard(definition).find(
    (candidate) => candidate.kind === 'SPELL_EFFECT',
  )
  if (!ability || ability.kind !== 'SPELL_EFFECT')
    throw new Error(`Missing spell effect for ${definition.name}`)
  return ability
}

const castAction = (
  definition: CardDefinition,
  variables?: Record<string, string | number | boolean>,
): Extract<GameAction, { type: 'CAST_SPELL' }> => ({
  type: 'CAST_SPELL',
  instanceId: `spell-${definition.scryfallId}`,
  card: definition,
  fromZone: 'hand',
  actorPlayerId: 'player-1',
  ...(variables ? { variables } : {}),
})

describe('Gift core', () => {
  it('keeps all five Cute Gift definitions validator-clean', () => {
    const definitions = [
      card('Crumb and Get It', 'Instant', '{W}'),
      card("Dawn's Truce", 'Instant', '{1}{W}'),
      card('Into the Flood Maw', 'Instant', '{U}'),
      card('Kitnap', 'Enchantment — Aura', '{2}{U}{U}'),
      card("Long River's Pull", 'Instant', '{U}{U}'),
    ]

    for (const definition of definitions)
      expect(validateAbilityDefinitions(getAbilitiesForCard(definition))).toMatchObject({
        valid: true,
      })
  })

  it('asks whether Gift is promised before targets or mana payment', () => {
    const definition = card('Crumb and Get It', 'Instant', '{W}')
    const state = createInitialGameState([
      permanent('friendly', card('Friendly', 'Creature — Human')),
    ])
    expect(
      resolvePreparedCast(state, definition.name, definition.manaCost, castAction(definition), {
        generic: 0,
        colors: { W: 1 },
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'ADD_PENDING_DECISION',
          decision: { type: 'CAST_GIFT_SELECTION' },
        },
      ],
    })
  })

  it('asks for the promised opponent before declaring Gift-dependent targets', () => {
    const definition = card('Into the Flood Maw', 'Instant', '{U}')
    const state = createInitialGameState()
    expect(
      resolvePreparedCast(
        state,
        definition.name,
        definition.manaCost,
        castAction(definition, { giftPromised: 1 }),
        { generic: 0, colors: { U: 1 } },
      ),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'ADD_PENDING_DECISION',
          decision: {
            type: 'CAST_GIFT_RECIPIENT_SELECTION',
            options: [{ instanceId: 'player-2' }],
          },
        },
      ],
    })
  })

  it('changes Into the Flood Maw target legality only when Gift was promised', () => {
    const definition = card('Into the Flood Maw', 'Instant', '{U}')
    const ability = spellAbility(definition)

    expect(
      declarationTargetRequirement(ability, { giftPromised: 0 })?.constraints,
    ).toMatchObject({
      cardTypes: ['Creature'],
      controllerRelation: 'NOT_SOURCE_CONTROLLER',
    })
    expect(
      declarationTargetRequirement(ability, { giftPromised: 1 })?.constraints,
    ).toMatchObject({
      excludeCardTypes: ['Land'],
      controllerRelation: 'NOT_SOURCE_CONTROLLER',
    })
  })

  it("changes Long River's Pull from creature spell to any spell when Gift was promised", () => {
    const definition = card("Long River's Pull", 'Instant', '{U}{U}')
    const ability = spellAbility(definition)

    expect(
      declarationTargetRequirement(ability, { giftPromised: 0 })?.constraints,
    ).toMatchObject({ stackKind: 'SPELL', cardTypes: ['Creature'] })
    expect(
      declarationTargetRequirement(ability, { giftPromised: 1 })?.constraints,
    ).toEqual({ zones: ['stack'], stackKind: 'SPELL' })
  })

  it('creates the promised Fish tapped under the chosen opponent before returning the target', () => {
    const definition = card('Into the Flood Maw', 'Instant', '{U}')
    const source: CardInstance = {
      ...permanent('flood-maw', definition),
      zone: 'stack',
      stackObjectId: 'stack-flood-maw',
    }
    const target = permanent(
      'opponent-artifact',
      card('Opponent Artifact', 'Artifact'),
      'player-2',
    )
    const state = createInitialGameState([source, target])
    const ability = spellAbility(definition)
    const resolution = createSpellEffectResolution(
      source,
      ability,
      { giftPromised: 1, giftRecipientPlayerId: 'player-2' },
      [
        {
          targetId: target.instanceId,
          constraints: {
            zones: ['battlefield'],
            controllerRelation: 'NOT_SOURCE_CONTROLLER',
            excludeCardTypes: ['Land'],
          },
        },
      ],
    )
    const step = advancePendingResolution(state, resolution)
    expect(step.type).toBe('ACTIONS')
    if (step.type !== 'ACTIONS') return
    expect(step.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CREATE_TOKEN',
          controllerId: 'player-2',
          ownerId: 'player-2',
          tapped: true,
        }),
        {
          type: 'MOVE_CARD',
          instanceId: target.instanceId,
          toZone: 'hand',
          controllerId: 'player-2',
        },
      ]),
    )

    const after = step.actions.reduce(
      (current, action) => applyGameAction(current, action),
      state,
    )
    const fish = after.cards.find((entry) => entry.tokenDefinitionId === 'BLUE_FISH_1_1')
    expect(fish).toMatchObject({
      controllerId: 'player-2',
      ownerId: 'player-2',
      controller: 'OPPONENT',
      tapped: true,
    })
  })

  it('Kitnap can use cast-time Gift memory after entering the battlefield', () => {
    const definition = card('Kitnap', 'Enchantment — Aura', '{2}{U}{U}')
    const victim = permanent('victim', card('Victim', 'Creature — Human'), 'player-2')
    const kitnap: CardInstance = {
      ...permanent('kitnap', definition),
      attachedToInstanceId: victim.instanceId,
      runtimeValues: {
        giftPromised: 0,
        giftRecipientPlayerId: 'player-2',
      },
    }
    const state = createInitialGameState([victim, kitnap])
    const pending = evaluateAbilities(state, {
      type: 'CARD_ENTERED_BATTLEFIELD',
      cardInstanceId: kitnap.instanceId,
      cardName: kitnap.card.name,
      controller: 'YOU',
      playerId: 'player-1',
      cardTypes: ['Enchantment'],
      subtypes: ['Aura'],
      isToken: false,
      previousZone: 'stack',
    }).find((entry) => entry.abilityId === 'kitnap-tap-and-stun-on-enter')
    expect(pending).toBeDefined()
    if (!pending) return

    const step = advancePendingResolution(state, createPendingResolution(pending))
    expect(step.type).toBe('ACTIONS')
    if (step.type !== 'ACTIONS') return
    expect(step.actions).toEqual(
      expect.arrayContaining([
        { type: 'TAP_CARD', instanceId: victim.instanceId },
        {
          type: 'ADD_COUNTER',
          instanceId: victim.instanceId,
          counter: 'stun',
          amount: 3,
        },
      ]),
    )
  })

  it('Dawn\'s Truce grants the implemented permanent protections without hardcoding cards', () => {
    const definition = card("Dawn's Truce", 'Instant', '{1}{W}')
    const creature = permanent('protected-creature', card('Protected', 'Creature — Human'))
    const source: CardInstance = {
      ...permanent('dawns-truce', definition),
      zone: 'stack',
      stackObjectId: 'stack-dawns-truce',
    }
    let state = createInitialGameState([source, creature])
    const resolution = createSpellEffectResolution(
      source,
      spellAbility(definition),
      { giftPromised: 1, giftRecipientPlayerId: 'player-2' },
    )
    const step = advancePendingResolution(state, resolution)
    expect(step.type).toBe('ACTIONS')
    if (step.type !== 'ACTIONS') return
    state = step.actions.reduce(
      (current, action) => applyGameAction(current, action),
      state,
    )
    const protectedCreature = state.cards.find((entry) => entry.instanceId === creature.instanceId)
    expect(protectedCreature && hasEffectiveKeyword(state, protectedCreature, 'HEXPROOF')).toBe(true)
    expect(protectedCreature && hasEffectiveKeyword(state, protectedCreature, 'INDESTRUCTIBLE')).toBe(true)
  })
})
