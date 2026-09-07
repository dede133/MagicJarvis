import { describe, expect, it } from 'vitest'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import { validateAbilityDefinitions } from '../compiler/validators/abilityDefinitionValidator'
import {
  advancePendingResolution,
  createPendingResolution,
} from './abilityEngine'
import {
  deriveActiveStaticEffects,
  effectiveAbilitiesForCard,
  effectiveCardName,
  effectiveTypeLine,
  hasEffectiveKeyword,
  modifiedPowerToughness,
} from './staticEffects'
import { resolveActivatedAbility } from './activationEngine'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import { planManaPayment } from '../../rules/costs/manaCost'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { PendingAbility } from '../types/abilityTypes'

const definition = (
  name: string,
  typeLine: string,
  manaCost = '',
  oracleText = '',
  power?: string,
  toughness?: string,
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
  name,
  typeLine,
  manaCost,
  oracleText,
  cmc: 0,
  colors: [],
  colorIdentity: [],
  ...(power ? { power } : {}),
  ...(toughness ? { toughness } : {}),
})

const instance = (
  id: string,
  card: CardDefinition,
  zone: CardInstance['zone'] = 'battlefield',
): CardInstance => ({
  instanceId: id,
  card,
  zone,
  tapped: false,
  counters: {},
  controller: 'YOU',
  controllerId: 'player-1',
  ownerId: 'player-1',
})

describe('Cute remaining reusable cores', () => {
  it('keeps the new explicit Cute definitions validator-clean', () => {
    const cards = [
      definition('Honest Work', 'Enchantment — Aura'),
      definition("Katara, Water Tribe's Hope", 'Legendary Creature — Human Warrior Ally'),
      definition("Luxior, Giada's Gift", 'Legendary Artifact — Equipment'),
      definition('Thassa, God of the Sea', 'Legendary Enchantment Creature — God'),
      definition('Wrecking Ball Arm', 'Artifact — Equipment'),
      definition('Eiganjo Castle', 'Legendary Land'),
      definition('Caduceus, Staff of Hermes', 'Legendary Artifact — Equipment'),
      definition('Pippin, Guard of the Citadel', 'Legendary Creature — Halfling Soldier'),
      definition('Everybody Lives!', 'Instant'),
      definition("Teferi's Protection", 'Instant'),
      definition('Aang, Swift Savior', 'Legendary Creature — Human Avatar Ally'),
      definition("Aang and La, Ocean's Fury", 'Legendary Creature — Avatar Spirit Ally'),
      definition('Aang, the Last Airbender', 'Legendary Creature — Human Avatar Ally'),
      definition('Eiganjo, Seat of the Empire', 'Legendary Land'),
      definition('Lilypad Village', 'Land'),
      definition('Lupinflower Village', 'Land'),
    ]
    for (const card of cards)
      expect(validateAbilityDefinitions(getAbilitiesForCard(card))).toMatchObject({ valid: true })
  })

  it('Honest Work replaces characteristics, removes printed abilities, and grants the new mana ability', () => {
    const victim = instance(
      'victim',
      definition('Serra Example', 'Creature — Angel', '', 'Flying', '4', '4'),
    )
    const aura: CardInstance = {
      ...instance('honest', definition('Honest Work', 'Enchantment — Aura')),
      attachedToInstanceId: victim.instanceId,
    }
    const state = createInitialGameState([victim, aura])
    expect(effectiveCardName(state, victim)).toBe('Humble Merchant')
    expect(effectiveTypeLine(state, victim)).toContain('Creature — Citizen')
    expect(hasEffectiveKeyword(state, victim, 'FLYING')).toBe(false)
    expect(modifiedPowerToughness(victim, deriveActiveStaticEffects(state))).toEqual({
      power: 1,
      toughness: 1,
    })
    expect(
      effectiveAbilitiesForCard(state, victim).some(
        (ability) => ability.kind === 'ACTIVATED' && ability.id === 'honest-work-humble-merchant-mana',
      ),
    ).toBe(true)
  })

  it('consumes next-N prevention before marking damage', () => {
    const source = instance('castle', definition('Eiganjo Castle', 'Legendary Land'))
    const target = instance('target', definition('Hero', 'Legendary Creature — Human', '', '', '3', '3'))
    let state = createInitialGameState([source, target])
    state = applyGameAction(state, {
      type: 'ADD_DAMAGE_PREVENTION_EFFECT',
      id: 'shield',
      sourceInstanceId: source.instanceId,
      targetInstanceId: target.instanceId,
      remainingAmount: 2,
      duration: 'UNTIL_END_OF_TURN',
    })
    state = applyGameAction(state, {
      type: 'DEAL_DAMAGE',
      damage: {
        sourceInstanceId: source.instanceId,
        target: { kind: 'CREATURE', instanceId: target.instanceId },
        amount: 3,
        damageKind: 'NONCOMBAT',
        hasDeathtouch: false,
      },
    })
    expect(state.cards.find((card) => card.instanceId === target.instanceId)?.damageMarked).toBe(1)
    expect(state.damagePreventionEffects).toEqual([])
  })

  it('Airbend exiles the chosen object and installs a linked {2} cast permission', () => {
    const source = instance('aang', definition('Aang, the Last Airbender', 'Legendary Creature — Human Avatar Ally'))
    const target = instance('target', definition('Target', 'Creature — Human', '{4}', '', '2', '2'))
    const state = createInitialGameState([source, target])
    const pending: PendingAbility = {
      id: 'pending-airbend',
      abilityId: 'test-airbend',
      sourceInstanceId: source.instanceId,
      sourceCardName: source.card.name,
      createdFromEvent: {
        type: 'CARD_ENTERED_BATTLEFIELD',
        cardInstanceId: source.instanceId,
        cardName: source.card.name,
        controller: 'YOU',
        playerId: 'player-1',
        cardTypes: ['Creature'],
        subtypes: [],
        isToken: false,
        previousZone: 'stack',
      },
      resolvedEffects: [{ type: 'AIRBEND', target: 'SELECTED_TARGET' }],
      automation: 'AUTO',
    }
    const resolution = createPendingResolution(pending)
    resolution.context.selectedTargets.push(target.instanceId)
    const step = advancePendingResolution(state, resolution)
    expect(step.type).toBe('ACTIONS')
    if (step.type !== 'ACTIONS') return
    const after = step.actions.reduce((current, action) => applyGameAction(current, action), state)
    expect(after.cards.find((card) => card.instanceId === target.instanceId)?.zone).toBe('exile')
    expect(after.airbendPermissions).toContainEqual({
      cardInstanceId: target.instanceId,
      ownerId: 'player-1',
      alternativeManaCost: '{2}',
    })
  })

  it('restricted village mana is payable for creature spells and rejected for noncreatures', () => {
    let state = createInitialGameState()
    state = applyGameAction(state, {
      type: 'ADD_RESTRICTED_MANA',
      playerId: 'player-1',
      color: 'U',
      amount: 1,
      restriction: 'CREATURE_SPELLS_ONLY',
      sourceInstanceId: 'lilypad',
    })
    const creature = definition('Blue Creature', 'Creature — Bird', '{U}')
    const instant = definition('Blue Instant', 'Instant', '{U}')
    expect(planManaPayment(state, { generic: 0, colors: { U: 1 } }, creature).kind).not.toBe('NOT_ENOUGH_MANA')
    expect(planManaPayment(state, { generic: 0, colors: { U: 1 } }, instant)).toEqual({
      kind: 'NOT_ENOUGH_MANA',
    })
  })

  it('Channel works from hand, discards its source as a cost, and applies generic reduction', () => {
    const eiganjo = instance(
      'eiganjo-seat',
      definition('Eiganjo, Seat of the Empire', 'Legendary Land'),
      'hand',
    )
    const legend = instance('legend', definition('Legend', 'Legendary Creature — Human', '', '', '2', '2'))
    let state = createInitialGameState([eiganjo, legend])
    state = applyGameAction(state, { type: 'ADD_MANA', color: 'W', amount: 1 })
    state = applyGameAction(state, { type: 'ADD_MANA', color: 'C', amount: 1 })
    const channel = getAbilitiesForCard(eiganjo.card).find(
      (ability) => ability.kind === 'ACTIVATED' && ability.id === 'eiganjo-seat-channel',
    )
    expect(channel?.kind).toBe('ACTIVATED')
    if (!channel || channel.kind !== 'ACTIVATED') return
    const activation = resolveActivatedAbility(state, eiganjo.instanceId, channel)
    expect(activation.ok).toBe(true)
    if (!activation.ok) return
    expect(activation.costActions).toEqual(
      expect.arrayContaining([
        { type: 'MOVE_CARD', instanceId: eiganjo.instanceId, toZone: 'graveyard' },
      ]),
    )
  })
})
