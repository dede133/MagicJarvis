import { describe, expect, it } from 'vitest'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import { validateAbilityDefinitions } from '../compiler/validators/abilityDefinitionValidator'
import { advancePendingResolution, createPendingResolution } from './abilityEngine'
import { staticConditionMatches } from './staticEffects'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import { deriveGameEvents } from '../../events/deriveGameEvents'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { PendingAbility } from '../types/abilityTypes'

const card = (
  name: string,
  typeLine: string,
  colorIdentity: CardDefinition['colorIdentity'] = [],
  oracleText = '',
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
  name,
  typeLine,
  manaCost: '',
  oracleText,
  cmc: 0,
  colors: [],
  colorIdentity,
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
  ownerId: controllerId,
  controllerId,
  controller: controllerId === 'player-1' ? 'YOU' : 'OPPONENT',
})

describe('Cute green + yellow sweep', () => {
  it('keeps the newly explicit definitions validator-clean', () => {
    const names = [
      ['Ishai, Ojutai Dragonspeaker', 'Legendary Creature — Bird Monk'],
      ['Yoshimaru, Ever Faithful', 'Legendary Creature — Dog'],
      ['Aerith Gainsborough', 'Legendary Creature — Human Cleric'],
      ['Animal Sanctuary', 'Land'],
      ['Arcane Signet', 'Artifact'],
      ['Blackblade Reforged', 'Legendary Artifact — Equipment'],
      ['Brotherhood Regalia', 'Artifact — Equipment'],
      ['Command Tower', 'Land'],
      ["Dovin's Veto", 'Instant'],
      ['Flowering of the White Tree', 'Legendary Enchantment'],
      ['Herald of Secret Streams', 'Creature — Merfolk Warrior'],
      ['K-9, Mark I', 'Legendary Artifact Creature — Robot Dog'],
      ['Lilypad Village', 'Land'],
      ['Lupinflower Village', 'Land'],
      ['Minas Tirith', 'Legendary Land'],
      ['The Ooze', 'Legendary Artifact'],
      ['Trenzalore Clocktower', 'Legendary Artifact'],
      ['Ty Lee, Chi Blocker', 'Legendary Creature — Human Warrior'],
      ['Urdnan, Dromoka Warrior', 'Creature — Human Warrior'],
      ['Venat, Heart of Hydaelyn', 'Legendary Creature — Human Wizard'],
    ] as const
    for (const [name, typeLine] of names)
      expect(
        validateAbilityDefinitions(getAbilitiesForCard(card(name, typeLine))),
      ).toMatchObject({ valid: true })
  })

  it('overrides the old mono-blue Arcane Signet definition with commander-identity mana', () => {
    const abilities = getAbilitiesForCard(card('Arcane Signet', 'Artifact'))
    expect(abilities).toHaveLength(1)
    expect(abilities[0]).toMatchObject({
      kind: 'ACTIVATED',
      effects: [
        expect.objectContaining({
          type: 'ADD_MANA_CHOICE',
          allowedColors: { type: 'COMMANDER_COLOR_IDENTITY' },
        }),
      ],
    })
  })

  it("does not let COUNTER_SPELL counter Dovin's Veto", () => {
    const veto: CardInstance = {
      ...permanent('veto', card("Dovin's Veto", 'Instant')),
      zone: 'stack',
      stackObjectId: 'stack-veto',
    }
    const state = createInitialGameState([veto])
    const pending: PendingAbility = {
      id: 'pending-counter-veto',
      abilityId: 'test-counter',
      sourceInstanceId: 'counter-source',
      sourceCardName: 'Counter source',
      createdFromEvent: { type: 'CARD_DRAWN', knownIdentity: false },
      resolvedEffects: [{ type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' }],
      automation: 'AUTO',
    }
    const resolution = createPendingResolution(pending)
    resolution.context.selectedStackObjects.push('stack-veto')
    const step = advancePendingResolution(state, resolution)
    expect(step.type).toBe('COMPLETE')
    if (step.type === 'ACTIONS')
      expect(step.actions).not.toContainEqual(
        expect.objectContaining({ type: 'MOVE_CARD', instanceId: veto.instanceId }),
      )
  })

  it('keeps counters in leave-the-battlefield LKI for Aerith/The Ooze style effects', () => {
    const aerith = {
      ...permanent('aerith', card('Aerith Gainsborough', 'Legendary Creature — Human Cleric')),
      counters: { '+1/+1': 4 },
    }
    const state = createInitialGameState([aerith])
    const action = { type: 'MOVE_CARD' as const, instanceId: aerith.instanceId, toZone: 'graveyard' as const }
    const next = applyGameAction(state, action)
    expect(deriveGameEvents(state, action, next)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CARD_DIED',
          cardInstanceId: aerith.instanceId,
          counters: { '+1/+1': 4 },
        }),
      ]),
    )
  })

  it('tracks subtype entries and attackers for yellow activation conditions', () => {
    const lilypad = permanent('lilypad', card('Lilypad Village', 'Land'))
    let state = createInitialGameState([lilypad])
    state = applyGameAction(state, {
      type: 'RECORD_PERMANENT_ENTERED_THIS_TURN',
      instanceId: 'bird',
      playerId: 'player-1',
      cardTypes: ['Creature'],
      subtypes: ['Bird'],
    })
    expect(
      staticConditionMatches(state, lilypad, {
        type: 'PERMANENT_ENTERED_THIS_TURN',
        query: { subtypesAnyOf: ['Bird', 'Frog', 'Otter', 'Rat'] },
      }),
    ).toBe(true)

    state = applyGameAction(state, {
      type: 'RECORD_CREATURE_ATTACKED_THIS_TURN',
      instanceId: 'attacker-a',
      playerId: 'player-1',
    })
    state = applyGameAction(state, {
      type: 'RECORD_CREATURE_ATTACKED_THIS_TURN',
      instanceId: 'attacker-b',
      playerId: 'player-1',
    })
    expect(
      staticConditionMatches(state, lilypad, {
        type: 'ATTACKED_WITH_CREATURES_AT_LEAST',
        count: 2,
      }),
    ).toBe(true)
  })

})
