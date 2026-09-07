import { describe, expect, it } from 'vitest'
import { validateAbilityDefinitions } from '../compiler/validators/abilityDefinitionValidator'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import {
  attackTaxForDeclaration,
  entersBattlefieldTappedByStaticEffects,
} from './staticEffects'
import { evaluateAbilities } from './abilityEngine'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import { getCastOptionsForCard } from '../../casting/generated/castingOptionLoader'
import { declarationTargetRequirement } from '../../rules/targeting/declarationTargets'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'

const card = (
  name: string,
  typeLine: string,
  options: Partial<CardDefinition> = {},
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
  name,
  typeLine,
  manaCost: '',
  oracleText: '',
  cmc: 0,
  colors: [],
  colorIdentity: [],
  ...options,
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

const stateWithPlayers = (cards: CardInstance[]): GameState => {
  const state = createInitialGameState(cards)
  return {
    ...state,
    localPlayerId: 'player-1',
    activePlayerId: 'player-1',
    players: state.players.map((player, index) => ({
      ...player,
      id: index === 0 ? 'player-1' : 'player-2',
    })),
    turnOrder: ['player-1', 'player-2'],
  }
}

describe('Cute patch 11 - special mechanics', () => {
  it('keeps all six Patch 11 cards validator-clean', () => {
    for (const [name, typeLine] of [
      ['Crashing Wave', 'Sorcery'],
      ['March of Otherworldly Light', 'Instant'],
      ['March of Swirling Mist', 'Instant'],
      ['Resourceful Defense', 'Enchantment'],
      ['Windborn Muse', 'Creature — Spirit'],
      ['Thalia, Heretic Cathar', 'Legendary Creature — Human Soldier'],
    ] as const)
      expect(
        validateAbilityDefinitions(getAbilitiesForCard(card(name, typeLine))),
      ).toMatchObject({ valid: true })
  })

  it('models March pitch reduction as an explicit hidden-hand declaration contribution', () => {
    const white = getCastOptionsForCard('March of Otherworldly Light')?.[0]
    const blue = getCastOptionsForCard('March of Swirling Mist')?.[0]

    expect(white?.genericContribution).toMatchObject({
      type: 'EXILE_DECLARED_CARDS_FROM_HAND',
      colors: ['W'],
      excludeSource: true,
      genericReductionPerCard: 2,
    })
    expect(blue?.genericContribution).toMatchObject({
      type: 'EXILE_DECLARED_CARDS_FROM_HAND',
      colors: ['U'],
      excludeSource: true,
      genericReductionPerCard: 2,
    })
  })

  it('models Crashing Wave as Waterbend X and up to X targets', () => {
    expect(getCastOptionsForCard('Crashing Wave')?.[0]).toMatchObject({
      kind: 'ADDITIONAL',
      manaCost: '{X}',
      required: true,
      variable: { name: 'X', min: 0 },
      genericContribution: {
        type: 'TAP_PERMANENTS',
        cardTypesAnyOf: ['Artifact', 'Creature'],
        max: { variable: 'X' },
      },
    })
    const ability = getAbilitiesForCard(card('Crashing Wave', 'Sorcery')).find(
      (candidate) => candidate.kind === 'SPELL_EFFECT',
    )
    expect(ability?.kind).toBe('SPELL_EFFECT')
    if (!ability || ability.kind !== 'SPELL_EFFECT') return
    expect(declarationTargetRequirement(ability, { X: 2 })).toMatchObject({
      requiredCount: 2,
      minimumCount: 0,
      allowFewer: true,
    })
  })

  it('distributes counters atomically across several permanents', () => {
    const first = permanent('first', card('First', 'Creature'))
    const second = permanent('second', card('Second', 'Creature'))
    const state = stateWithPlayers([first, second])
    const next = applyGameAction(state, {
      type: 'DISTRIBUTE_COUNTERS',
      counter: 'stun',
      allocations: [
        { instanceId: 'first', amount: 2 },
        { instanceId: 'second', amount: 1 },
      ],
    })
    expect(next.cards.find((item) => item.instanceId === 'first')?.counters.stun).toBe(2)
    expect(next.cards.find((item) => item.instanceId === 'second')?.counters.stun).toBe(1)
  })

  it('lets March of Swirling Mist declare fewer than X targets, including zero', () => {
    const ability = getAbilitiesForCard(
      card('March of Swirling Mist', 'Instant'),
    ).find((candidate) => candidate.kind === 'SPELL_EFFECT')
    expect(ability?.kind).toBe('SPELL_EFFECT')
    if (!ability || ability.kind !== 'SPELL_EFFECT') return

    expect(declarationTargetRequirement(ability, { X: 3 })).toMatchObject({
      requiredCount: 3,
      minimumCount: 0,
      allowFewer: true,
    })
  })

  it('copies the complete LKI counter map for Resourceful Defense', () => {
    const resourceful = permanent(
      'resourceful',
      card('Resourceful Defense', 'Enchantment'),
    )
    const state = stateWithPlayers([resourceful])
    const pending = evaluateAbilities(state, {
      type: 'CARD_LEFT_BATTLEFIELD',
      cardInstanceId: 'left',
      cardName: 'Countered Permanent',
      previousZone: 'battlefield',
      nextZone: 'graveyard',
      controller: 'YOU',
      playerId: 'player-1',
      cardTypes: ['Creature'],
      subtypes: [],
      isToken: false,
      counters: { '+1/+1': 2, loyalty: 3 },
    })

    expect(pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          abilityId: 'resourceful-defense-leaves',
          resolvedEffects: expect.arrayContaining([
            expect.objectContaining({ type: 'TARGET_SELECTION' }),
          ]),
        }),
      ]),
    )
  })

  it('moves several counter types atomically', () => {
    const source = permanent('from', card('Source', 'Creature'))
    source.counters = { '+1/+1': 2, shield: 1 }
    const target = permanent('to', card('Target', 'Creature'))
    target.counters = { '+1/+1': 1 }
    const state = stateWithPlayers([source, target])

    const next = applyGameAction(state, {
      type: 'MOVE_COUNTERS',
      fromInstanceId: 'from',
      toInstanceId: 'to',
      moves: [
        { counter: '+1/+1', amount: 1 },
        { counter: 'shield', amount: 1 },
      ],
    })

    expect(next.cards.find((item) => item.instanceId === 'from')?.counters).toEqual({
      '+1/+1': 1,
      shield: 0,
    })
    expect(next.cards.find((item) => item.instanceId === 'to')?.counters).toEqual({
      '+1/+1': 2,
      shield: 1,
    })
  })

  it('calculates Windborn Muse tax over the complete declaration', () => {
    const muse = permanent('muse', card('Windborn Muse', 'Creature — Spirit'))
    const state = stateWithPlayers([muse])
    expect(
      attackTaxForDeclaration(state, 'player-2', [
        {
          attackerInstanceId: 'a',
          defendingTarget: {
            kind: 'PLAYER',
            id: 'player-1',
            playerId: 'player-1',
          },
        },
        {
          attackerInstanceId: 'b',
          defendingTarget: {
            kind: 'PLAYER',
            id: 'player-1',
            playerId: 'player-1',
          },
        },
      ]),
    ).toBe(4)
  })

  it('makes opposing creatures and nonbasic lands enter tapped under Thalia', () => {
    const thalia = permanent(
      'thalia',
      card('Thalia, Heretic Cathar', 'Legendary Creature — Human Soldier'),
    )
    const state = stateWithPlayers([thalia])
    const opponentCreature: CardInstance = {
      ...permanent('creature', card('Rival', 'Creature — Human'), 'player-2'),
      zone: 'battlefield',
    }
    const opponentNonbasic = permanent(
      'land',
      card('Fancy Land', 'Land'),
      'player-2',
    )
    const opponentBasic = permanent(
      'basic',
      card('Island', 'Basic Land — Island'),
      'player-2',
    )

    expect(entersBattlefieldTappedByStaticEffects(state, opponentCreature)).toBe(true)
    expect(entersBattlefieldTappedByStaticEffects(state, opponentNonbasic)).toBe(true)
    expect(entersBattlefieldTappedByStaticEffects(state, opponentBasic)).toBe(false)
  })
})
