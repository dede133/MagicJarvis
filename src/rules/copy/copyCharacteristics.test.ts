import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { applyGameAction } from '../../engine/gameEngine'
import {
  deriveActiveStaticEffects,
  effectiveTypeLine,
  hasEffectiveKeyword,
  modifiedPowerToughness,
} from '../../abilities/engine/staticEffects'
import { getAbilitiesForCard } from '../../abilities/definitions/abilityRegistry'
import { evaluateAbilities } from '../../abilities/engine/abilityEngine'
import type { CardDefinition, CardInstance } from '../../types/card'
import { effectiveCardDefinition } from './copyCharacteristics'

const card = (
  name: string,
  typeLine: string,
  power: string,
  toughness: string,
  oracleText = '',
  colors: CardDefinition['colors'] = ['U'],
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 2,
  typeLine,
  oracleText,
  colors,
  colorIdentity: colors,
  power,
  toughness,
})

const instance = (
  instanceId: string,
  definition: CardDefinition,
): CardInstance => ({
  instanceId,
  card: definition,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  controller: 'YOU',
  controllerId: 'player-1',
  ownerId: 'player-1',
})

const sovereign = card(
  'Merfolk Sovereign',
  'Creature — Merfolk Noble',
  '2',
  '2',
  "Other Merfolk creatures you control get +1/+1.\n{T}: Target Merfolk creature can't be blocked this turn.",
)

const reejerey = card(
  'Merrow Reejerey',
  'Creature — Merfolk Wizard',
  '2',
  '2',
  'Other Merfolk creatures you control get +1/+1.\nWhenever you cast a Merfolk spell, you may tap or untap target permanent.',
)

describe('copy continuous characteristics', () => {
  it('uses the copied name, type, P/T, keywords and abilities after the copied object leaves', () => {
    const original = instance(
      'enchanted',
      card('Ordinary Agent', 'Creature — Human', '1', '1'),
    )
    const copied = instance(
      'copied',
      card('Flying Merfolk', 'Creature — Merfolk Scout', '4', '3', 'Flying'),
    )
    const aura = instance(
      'secret',
      card('Secret Invasion', 'Enchantment — Aura', '0', '0'),
    )
    aura.attachedToInstanceId = original.instanceId
    let state = createInitialGameState([original, copied, aura])
    state = applyGameAction(state, {
      type: 'ADD_COPY_CONTINUOUS_EFFECT',
      sourceInstanceId: aura.instanceId,
      targetInstanceId: original.instanceId,
      copiedFromInstanceId: copied.instanceId,
      copiedCard: copied.card,
      duration: 'WHILE_SOURCE_ON_BATTLEFIELD',
    })
    state = applyGameAction(state, {
      type: 'MOVE_CARD',
      instanceId: copied.instanceId,
      toZone: 'exile',
    })

    const enchanted = state.cards.find(
      (candidate) => candidate.instanceId === original.instanceId,
    )!
    expect(effectiveCardDefinition(state, enchanted).name).toBe(
      'Flying Merfolk',
    )
    expect(effectiveTypeLine(state, enchanted)).toBe('Creature — Merfolk Scout')
    expect(
      modifiedPowerToughness(enchanted, deriveActiveStaticEffects(state)),
    ).toEqual({ power: 4, toughness: 3 })
    expect(hasEffectiveKeyword(state, enchanted, 'FLYING')).toBe(true)
  })

  it('lets a copied permanent provide the copied card static and activated abilities', () => {
    const copiedPermanent = instance(
      'copy-target',
      card('Ordinary Agent', 'Creature — Human', '1', '1'),
    )
    const otherMerfolk = instance(
      'other-merfolk',
      card('Other Merfolk', 'Creature — Merfolk', '1', '1'),
    )
    const aura = instance(
      'secret',
      card('Secret Invasion', 'Enchantment — Aura', '0', '0'),
    )
    let state = createInitialGameState([copiedPermanent, otherMerfolk, aura])
    state = applyGameAction(state, {
      type: 'ADD_COPY_CONTINUOUS_EFFECT',
      sourceInstanceId: aura.instanceId,
      targetInstanceId: copiedPermanent.instanceId,
      copiedFromInstanceId: 'sovereign-reference',
      copiedCard: sovereign,
      duration: 'WHILE_SOURCE_ON_BATTLEFIELD',
    })

    const active = deriveActiveStaticEffects(state)
    const other = state.cards.find(
      (candidate) => candidate.instanceId === 'other-merfolk',
    )!
    expect(modifiedPowerToughness(other, active)).toEqual({
      power: 2,
      toughness: 2,
    })

    const copiedDefinition = effectiveCardDefinition(
      state,
      state.cards.find((candidate) => candidate.instanceId === 'copy-target')!,
    )
    expect(
      getAbilitiesForCard(copiedDefinition).some(
        (ability) => ability.kind === 'ACTIVATED',
      ),
    ).toBe(true)
  })

  it('uses copied triggered abilities and last known copy characteristics', () => {
    const copiedPermanent = instance(
      'copy-target',
      card('Ordinary Agent', 'Creature — Human', '1', '1'),
    )
    const aura = instance(
      'secret',
      card('Secret Invasion', 'Enchantment — Aura', '0', '0'),
    )
    const merfolkSpell = instance(
      'spell',
      card('Test Merfolk', 'Creature — Merfolk', '2', '2'),
    )
    merfolkSpell.zone = 'stack'
    let state = createInitialGameState([copiedPermanent, aura, merfolkSpell])
    state = applyGameAction(state, {
      type: 'ADD_COPY_CONTINUOUS_EFFECT',
      sourceInstanceId: aura.instanceId,
      targetInstanceId: copiedPermanent.instanceId,
      copiedFromInstanceId: 'reejerey-reference',
      copiedCard: reejerey,
      duration: 'WHILE_SOURCE_ON_BATTLEFIELD',
    })

    const pending = evaluateAbilities(state, {
      type: 'SPELL_CAST',
      cardInstanceId: merfolkSpell.instanceId,
      cardName: merfolkSpell.card.name,
      isCreature: true,
      blueManaSymbols: 0,
      controller: 'YOU',
      playerId: 'player-1',
      cardTypes: ['creature'],
      subtypes: ['Merfolk'],
      isToken: false,
    })
    expect(
      pending.some((ability) => ability.sourceInstanceId === 'copy-target'),
    ).toBe(true)
  })
})
