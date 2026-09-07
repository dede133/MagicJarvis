import { describe, expect, it } from 'vitest'
import { validateAbilityDefinitions } from '../compiler/validators/abilityDefinitionValidator'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import { evaluateAbilities } from './abilityEngine'
import { castRestrictionViolation, drawLimitForPlayer } from './staticEffects'
import { calculateSpellManaCost } from '../../rules/costs/manaCost'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import type { PlayerState } from '../../types/player'

const emptyMana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }

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

const player = (
  id: string,
  options: Partial<PlayerState> = {},
): PlayerState => ({
  id,
  life: 40,
  manaPool: { ...emptyMana },
  hiddenZoneTracking: 'COUNTS_ONLY',
  libraryCount: 20,
  handCount: 0,
  ...options,
})

const multiplayerState = (cards: CardInstance[]): GameState => {
  const base = createInitialGameState(cards)
  return {
    ...base,
    localPlayerId: 'player-1',
    activePlayerId: 'player-1',
    players: [
      player('player-1', { isLocal: true }),
      player('player-2'),
      player('player-3'),
    ],
    turnOrder: ['player-1', 'player-2', 'player-3'],
  }
}

describe('Cute patch 10 - restrictions and permissions', () => {
  it('keeps Lavinia, Narset and Momo validator-clean and Narset includes her loyalty ability', () => {
    for (const [name, typeLine] of [
      ['Lavinia, Azorius Renegade', 'Legendary Creature — Human Soldier'],
      ['Narset, Parter of Veils', 'Legendary Planeswalker — Narset'],
      ['Momo, Friendly Flier', 'Legendary Creature — Lemur Bat Ally'],
    ] as const)
      expect(
        validateAbilityDefinitions(getAbilitiesForCard(card(name, typeLine))),
      ).toMatchObject({ valid: true })

    expect(
      getAbilitiesForCard(
        card('Narset, Parter of Veils', 'Legendary Planeswalker — Narset'),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'ACTIVATED',
          costs: [{ type: 'LOYALTY', amount: -2 }],
          effects: expect.arrayContaining([
            expect.objectContaining({
              type: 'SELECT_HIDDEN_ZONE_CARD',
              lookAtTop: { type: 'LITERAL', value: 4 },
              constraints: { excludeCardTypes: ['Creature', 'Land'] },
            }),
          ]),
        }),
      ]),
    )
  })

  it('Lavinia blocks only opposing noncreature spells whose mana value exceeds that player lands', () => {
    const lavinia = permanent(
      'lavinia',
      card('Lavinia, Azorius Renegade', 'Legendary Creature — Human Soldier'),
    )
    const opponentLand = permanent(
      'land-1',
      card('Island', 'Basic Land — Island'),
      'player-2',
    )
    const state = multiplayerState([lavinia, opponentLand])
    const noncreature = card('Big Instant', 'Instant', {
      manaCost: '{1}{U}',
      cmc: 2,
      colors: ['U'],
      colorIdentity: ['U'],
    })
    const creature = card('Big Creature', 'Creature — Bird', {
      manaCost: '{1}{U}',
      cmc: 2,
      colors: ['U'],
      colorIdentity: ['U'],
    })

    expect(castRestrictionViolation(state, noncreature, 'player-2')).toContain(
      'mayor que las 1 tierras',
    )
    expect(
      castRestrictionViolation(state, creature, 'player-2'),
    ).toBeUndefined()
    expect(
      castRestrictionViolation(state, noncreature, 'player-1'),
    ).toBeUndefined()
  })

  it('Lavinia only triggers on an opposing spell known to have spent zero mana', () => {
    const lavinia = permanent(
      'lavinia',
      card('Lavinia, Azorius Renegade', 'Legendary Creature — Human Soldier'),
    )
    const state = multiplayerState([lavinia])
    const event = {
      type: 'SPELL_CAST' as const,
      cardInstanceId: 'free-spell',
      stackObjectId: 'stack-free-spell',
      cardName: 'Free Spell',
      isCreature: false,
      manaCost: '{3}{U}',
      blueManaSymbols: 1,
      castNumberThisTurn: 1,
      manaSpent: 0,
      controller: 'OPPONENT' as const,
      playerId: 'player-2',
      cardTypes: ['Instant'],
      subtypes: [],
      isToken: false as const,
    }

    expect(evaluateAbilities(state, event)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceInstanceId: 'lavinia',
          abilityId: 'lavinia-counter-no-mana-spell',
        }),
      ]),
    )
    expect(evaluateAbilities(state, { ...event, manaSpent: 1 })).toHaveLength(0)
    const unknownManaEvent: Omit<typeof event, 'manaSpent'> & {
      manaSpent?: number
    } = { ...event }
    delete unknownManaEvent.manaSpent
    expect(evaluateAbilities(state, unknownManaEvent)).toHaveLength(0)
  })

  it('Narset allows each opponent only one successful draw per turn', () => {
    const narset = permanent(
      'narset',
      card('Narset, Parter of Veils', 'Legendary Planeswalker — Narset'),
    )
    let state = multiplayerState([narset])
    expect(drawLimitForPlayer(state, 'player-2')).toBe(1)
    expect(drawLimitForPlayer(state, 'player-1')).toBeUndefined()

    state = applyGameAction(state, { type: 'DRAW_CARD', playerId: 'player-2' })
    expect(
      state.players.find((entry) => entry.id === 'player-2'),
    ).toMatchObject({
      libraryCount: 19,
      handCount: 1,
    })
    expect(state.cardsDrawnThisTurnByPlayer?.['player-2']).toBe(1)

    const afterSecond = applyGameAction(state, {
      type: 'DRAW_CARD',
      playerId: 'player-2',
    })
    expect(
      afterSecond.players.find((entry) => entry.id === 'player-2'),
    ).toMatchObject({
      libraryCount: 19,
      handCount: 1,
    })
    expect(afterSecond.cardsDrawnThisTurnByPlayer?.['player-2']).toBe(1)
  })

  it('Momo reduces only the first matching spell during its controller turn', () => {
    const momo = permanent(
      'momo',
      card('Momo, Friendly Flier', 'Legendary Creature — Lemur Bat Ally', {
        oracleText:
          'Flying\nThe first non-Lemur creature spell with flying you cast during each of your turns costs {1} less to cast.',
      }),
    )
    const flyer = card('Sky Friend', 'Creature — Bird', {
      manaCost: '{2}{W}',
      cmc: 3,
      colors: ['W'],
      colorIdentity: ['W'],
      oracleText: 'Flying',
    })
    const lemur = card('Sky Lemur', 'Creature — Lemur', {
      manaCost: '{2}{W}',
      cmc: 3,
      colors: ['W'],
      colorIdentity: ['W'],
      oracleText: 'Flying',
    })
    let state = multiplayerState([momo])

    expect(calculateSpellManaCost(state, flyer)?.generic).toBe(1)
    expect(calculateSpellManaCost(state, lemur)?.generic).toBe(2)

    state = {
      ...state,
      spellCastHistoryThisTurn: [{ playerId: 'player-1', card: flyer }],
    }
    expect(calculateSpellManaCost(state, flyer)?.generic).toBe(2)

    state = { ...state, activePlayerId: 'player-2' }
    expect(calculateSpellManaCost(state, flyer)?.generic).toBe(2)
  })

  it('Momo gets +1/+1 when another flying creature it controls enters', () => {
    const momo = permanent(
      'momo',
      card('Momo, Friendly Flier', 'Legendary Creature — Lemur Bat Ally', {
        oracleText: 'Flying',
      }),
    )
    const flyer = permanent(
      'flyer',
      card('Sky Friend', 'Creature — Bird', { oracleText: 'Flying' }),
    )
    const state = multiplayerState([momo, flyer])
    const pending = evaluateAbilities(state, {
      type: 'CARD_ENTERED_BATTLEFIELD',
      cardInstanceId: 'flyer',
      cardName: 'Sky Friend',
      controller: 'YOU',
      playerId: 'player-1',
      cardTypes: ['Creature'],
      subtypes: ['Bird'],
      isToken: false,
      previousZone: 'hand',
    })
    expect(pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          abilityId: 'momo-flying-creature-entered',
          resolvedEffects: [
            expect.objectContaining({
              type: 'TEMPORARY_MODIFIER',
              target: 'SOURCE',
              power: 1,
              toughness: 1,
            }),
          ],
        }),
      ]),
    )
  })

  it('fixes existing cost modifiers so Grand Arbiter filters apply to the actual spell', () => {
    const arbiter = permanent(
      'arbiter',
      card('Grand Arbiter Augustin IV', 'Legendary Creature — Human Advisor'),
    )
    const state = multiplayerState([arbiter])
    const whiteSpell = card('White Spell', 'Instant', {
      manaCost: '{2}{W}',
      cmc: 3,
      colors: ['W'],
      colorIdentity: ['W'],
    })
    const colorlessSpell = card('Colorless Spell', 'Artifact', {
      manaCost: '{2}',
      cmc: 2,
    })

    expect(calculateSpellManaCost(state, whiteSpell)?.generic).toBe(1)
    expect(calculateSpellManaCost(state, colorlessSpell)?.generic).toBe(2)
  })
})
