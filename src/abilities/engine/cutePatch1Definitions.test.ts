import { describe, expect, it } from 'vitest'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import { deriveGameEvents } from '../../events/deriveGameEvents'
import type { CardDefinition, CardInstance } from '../../types/card'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import { validateAbilityDefinitions } from '../compiler/validators/abilityDefinitionValidator'
import { evaluateAbilities } from './abilityEngine'
import { resolveActivatedAbility } from './activationEngine'
import { deriveActiveStaticEffects } from './staticEffects'

const card = (
  name: string,
  typeLine: string,
  oracleText = '',
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 2,
  typeLine,
  oracleText,
  colors: name === 'Aqueous Form' ? ['U'] : [],
  colorIdentity: name === 'Aqueous Form' ? ['U'] : [],
})

const permanent = (
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
})

const literalEventCardDetails = {
  controller: 'YOU' as const,
  playerId: 'player-1',
  cardTypes: ['Creature'],
  subtypes: ['Human'],
  isToken: false,
}

describe('Cute definitions unlocked by runtime patch 1', () => {
  it('keeps every explicit Patch-1 definition validator-clean', () => {
    const cards = [
      card('Aqueous Form', 'Enchantment — Aura'),
      card('Curious Farm Animals', 'Creature — Boar Elk Bird Ox'),
      card('Rivendell', 'Legendary Land'),
      card('Senu, Keen-Eyed Protector', 'Legendary Creature — Bird Scout'),
      card('The Grey Havens', 'Legendary Land'),
    ]

    for (const definition of cards) {
      const abilities = getAbilitiesForCard(definition)
      expect(abilities.length).toBeGreaterThan(0)
      expect(validateAbilityDefinitions(abilities)).toMatchObject({
        valid: true,
      })
    }
  })

  it('Aqueous Form makes only its attached creature unblockable and scries when it attacks', () => {
    const aura = {
      ...permanent('aqueous', card('Aqueous Form', 'Enchantment — Aura')),
      attachedToInstanceId: 'enchanted',
    }
    const enchanted = permanent(
      'enchanted',
      card('Enchanted Creature', 'Creature — Human'),
    )
    const other = permanent('other', card('Other Creature', 'Creature — Human'))
    const state = createInitialGameState([aura, enchanted, other])
    const staticEffects = deriveActiveStaticEffects(state)

    expect(staticEffects.blockingRestrictions).toContainEqual(
      expect.objectContaining({
        type: 'CANNOT_BE_BLOCKED',
        sourceInstanceId: 'aqueous',
        filter: { attachedToSource: true },
      }),
    )

    const attachedAttack = evaluateAbilities(state, {
      type: 'CREATURE_ATTACKED',
      cardInstanceId: 'enchanted',
      cardName: 'Enchanted Creature',
      eventGroupId: 'combat-1',
      ...literalEventCardDetails,
    })
    expect(attachedAttack).toHaveLength(1)
    expect(attachedAttack[0].resolvedEffects).toEqual([
      {
        type: 'SCRY_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 1 },
      },
    ])

    const otherAttack = evaluateAbilities(state, {
      type: 'CREATURE_ATTACKED',
      cardInstanceId: 'other',
      cardName: 'Other Creature',
      eventGroupId: 'combat-1',
      ...literalEventCardDetails,
    })
    expect(otherAttack).toHaveLength(0)
  })

  it('Curious Farm Animals turns its own death into a real gain-life trigger', () => {
    const source = permanent(
      'animals',
      card('Curious Farm Animals', 'Creature — Boar Elk Bird Ox'),
    )
    const before = createInitialGameState([source])
    const action = {
      type: 'MOVE_CARD' as const,
      instanceId: 'animals',
      toZone: 'graveyard' as const,
    }
    const after = applyGameAction(before, action)
    const died = deriveGameEvents(before, action, after).find(
      (event) => event.type === 'CARD_DIED',
    )
    expect(died).toBeDefined()

    const pending = evaluateAbilities(after, died!, before)
    expect(pending).toHaveLength(1)
    expect(pending[0].resolvedEffects).toEqual([
      {
        type: 'GAIN_LIFE_FOR_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 3 },
      },
    ])
  })

  it('Rivendell only allows its scry activation while its controller has a legendary creature', () => {
    const rivendell = permanent('rivendell', card('Rivendell', 'Legendary Land'))
    const ability = getAbilitiesForCard(rivendell.card).find(
      (candidate) => candidate.id === 'rivendell-scry-two',
    )
    expect(ability?.kind).toBe('ACTIVATED')
    if (!ability || ability.kind !== 'ACTIVATED') return

    const base = {
      ...createInitialGameState([rivendell]),
      manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 1 },
    }
    expect(resolveActivatedAbility(base, 'rivendell', ability)).toEqual({
      ok: false,
      code: 'INVALID_TIMING',
    })

    const legend = permanent(
      'legend',
      card('Legend', 'Legendary Creature — Human'),
    )
    const allowed = resolveActivatedAbility(
      { ...base, cards: [rivendell, legend] },
      'rivendell',
      ability,
    )
    expect(allowed).toMatchObject({ ok: true })
    if (allowed.ok)
      expect(allowed.costActions).toEqual(
        expect.arrayContaining([
          { type: 'TAP_CARD', instanceId: 'rivendell' },
          { type: 'SPEND_MANA', color: 'U', amount: 1 },
        ]),
      )
  })

  it('Senu can pay tap + exile from battlefield before gain-life and scry effects', () => {
    const senu = {
      ...permanent(
        'senu',
        card('Senu, Keen-Eyed Protector', 'Legendary Creature — Bird Scout'),
      ),
      controlledSinceTurn: 0,
    }
    const ability = getAbilitiesForCard(senu.card).find(
      (candidate) => candidate.id === 'senu-exile-gain-life-scry',
    )
    expect(ability?.kind).toBe('ACTIVATED')
    if (!ability || ability.kind !== 'ACTIVATED') return

    const result = resolveActivatedAbility(
      { ...createInitialGameState([senu]), turn: 2 },
      'senu',
      ability,
    )
    expect(result).toMatchObject({ ok: true })
    if (result.ok)
      expect(result.costActions).toEqual(
        expect.arrayContaining([
          { type: 'TAP_CARD', instanceId: 'senu' },
          { type: 'MOVE_CARD', instanceId: 'senu', toZone: 'exile' },
        ]),
      )
  })

  it('The Grey Havens gets its ETB scry while leaving dynamic graveyard-color mana for later', () => {
    const havens = permanent(
      'havens',
      card('The Grey Havens', 'Legendary Land'),
    )
    const state = createInitialGameState([havens])
    const pending = evaluateAbilities(state, {
      type: 'CARD_ENTERED_BATTLEFIELD',
      cardInstanceId: 'havens',
      cardName: 'The Grey Havens',
      controller: 'YOU',
      playerId: 'player-1',
      cardTypes: ['Legendary', 'Land'],
      subtypes: [],
      isToken: false,
      previousZone: 'stack',
    })
    expect(pending).toHaveLength(1)
    expect(pending[0].resolvedEffects).toEqual([
      {
        type: 'SCRY_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 1 },
      },
    ])
  })
})
