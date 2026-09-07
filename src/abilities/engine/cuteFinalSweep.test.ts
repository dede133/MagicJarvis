import { describe, expect, it } from 'vitest'
import { validateAbilityDefinitions } from '../compiler/validators/abilityDefinitionValidator'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import {
  combatRestrictionFor,
  protectionColorsFor,
} from './staticEffects'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import { effectiveCardDefinition } from '../../rules/copy/copyCharacteristics'
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

const finalSweepCards = [
  ["Bender's Waterskin", 'Artifact'],
  ['Eight-and-a-Half-Tails', 'Legendary Creature — Fox Cleric'],
  ['Empty City Ruse', 'Instant'],
  ['Fabled Passage', 'Land'],
  ["Heroes' Podium", 'Legendary Artifact'],
  ['Ledger Shredder', 'Creature — Bird Advisor'],
  ['Path to Redemption', 'Enchantment — Aura'],
  ['Phelia, Exuberant Shepherd', 'Legendary Creature — Dog'],
  ['Secret Tunnel', 'Land'],
  ['Sygg, Wanderwine Wisdom', 'Legendary Creature — Merfolk Wizard'],
  ['Sygg, Wanderbrine Shield', 'Legendary Creature — Merfolk Rogue'],
  ['Watery Grasp', 'Enchantment — Aura'],
  ['The Grey Havens', 'Legendary Land'],
] as const

describe('Cute patch 12 - final sweep', () => {
  it('keeps every final-sweep definition validator-clean', () => {
    for (const [name, typeLine] of finalSweepCards)
      expect(
        validateAbilityDefinitions(getAbilitiesForCard(card(name, typeLine))),
        name,
      ).toMatchObject({ valid: true })
  })

  it("untaps Bender's Waterskin during an opponent untap step", () => {
    const waterskin = permanent('waterskin', card("Bender's Waterskin", 'Artifact'))
    waterskin.tapped = true
    const state = stateWithPlayers([waterskin])

    const next = applyGameAction(state, { type: 'NEXT_TURN' })

    expect(next.activePlayerId).toBe('player-2')
    expect(next.cards.find((entry) => entry.instanceId === 'waterskin')?.tapped).toBe(false)
  })

  it("Watery Grasp stops the controller untap step but not a spell or ability from untapping", () => {
    const creature = permanent('creature', card('Target', 'Creature — Human'))
    creature.tapped = true
    const grasp = permanent('grasp', card('Watery Grasp', 'Enchantment — Aura'))
    grasp.attachedToInstanceId = creature.instanceId
    let state = stateWithPlayers([creature, grasp])

    state = applyGameAction(state, { type: 'START_TURN' })
    expect(state.cards.find((entry) => entry.instanceId === 'creature')?.tapped).toBe(true)

    state = applyGameAction(state, { type: 'UNTAP_CARD', instanceId: 'creature' })
    expect(state.cards.find((entry) => entry.instanceId === 'creature')?.tapped).toBe(false)
  })

  it('applies Path to Redemption attack and block restrictions only to the enchanted creature', () => {
    const enchanted = permanent('enchanted', card('Enchanted', 'Creature — Human'))
    const other = permanent('other', card('Other', 'Creature — Human'))
    const path = permanent('path', card('Path to Redemption', 'Enchantment — Aura'))
    path.attachedToInstanceId = enchanted.instanceId
    const state = stateWithPlayers([enchanted, other, path])

    expect(combatRestrictionFor(state, enchanted)).toEqual({
      cannotAttack: true,
      cannotBlock: true,
    })
    expect(combatRestrictionFor(state, other)).toEqual({
      cannotAttack: false,
      cannotBlock: false,
    })
  })

  it('supports temporary color-setting and protection from a color for Eight-and-a-Half-Tails', () => {
    const tails = permanent('tails', card('Eight-and-a-Half-Tails', 'Legendary Creature — Fox Cleric'))
    const target = permanent('target', card('Target', 'Artifact', { colors: ['U'] }))
    let state = stateWithPlayers([tails, target])

    state = applyGameAction(state, {
      type: 'ADD_TEMPORARY_CHARACTERISTIC_EFFECT',
      sourceInstanceId: tails.instanceId,
      targetInstanceId: target.instanceId,
      setColors: ['W'],
      duration: 'UNTIL_END_OF_TURN',
    })
    state = applyGameAction(state, {
      type: 'ADD_TEMPORARY_PROTECTION_EFFECT',
      sourceInstanceId: tails.instanceId,
      targetInstanceId: target.instanceId,
      colors: ['W'],
      duration: 'UNTIL_END_OF_TURN',
    })

    const currentTarget = state.cards.find((entry) => entry.instanceId === target.instanceId)!
    expect(effectiveCardDefinition(state, currentTarget).colors).toEqual(['W'])
    expect(protectionColorsFor(state, currentTarget)).toContain('W')
  })

  it('skips the complete represented combat phase of the chosen opponent next turn', () => {
    let state = stateWithPlayers([])
    state = applyGameAction(state, {
      type: 'SKIP_NEXT_COMBAT_PHASES',
      playerId: 'player-2',
    })
    state = applyGameAction(state, { type: 'NEXT_TURN' })
    expect(state.activePlayerId).toBe('player-2')
    expect(state.skipCombatPhasesThisTurnForPlayerId).toBe('player-2')

    state = applyGameAction(state, { type: 'ADVANCE_STEP' }) // upkeep
    state = applyGameAction(state, { type: 'ADVANCE_STEP' }) // draw
    state = applyGameAction(state, { type: 'ADVANCE_STEP' }) // main 1
    expect(state.turnState.step).toBe('MAIN_1')
    state = applyGameAction(state, { type: 'ADVANCE_STEP' })
    expect(state.turnState.step).toBe('MAIN_2')
  })

  it('keeps The Grey Havens dynamic graveyard-color mana ability explicit', () => {
    expect(
      getAbilitiesForCard(card('The Grey Havens', 'Legendary Land')),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'grey-havens-legendary-graveyard-mana',
          effects: [
            expect.objectContaining({
              type: 'ADD_MANA_FROM_PUBLIC_ZONE_COLORS',
              query: expect.objectContaining({
                zones: ['graveyard'],
                cardTypes: ['Legendary', 'Creature'],
              }),
            }),
          ],
        }),
      ]),
    )
  })

  it('requires Secret Tunnel targets to share a creature subtype', () => {
    expect(
      getAbilitiesForCard(card('Secret Tunnel', 'Land')),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'secret-tunnel-two-creatures-unblockable',
          effects: [
            expect.objectContaining({
              type: 'TARGET_SELECTION',
              count: { type: 'LITERAL', value: 2 },
              constraints: expect.objectContaining({
                sharesCreatureSubtypeWithFirstTarget: true,
              }),
            }),
          ],
        }),
      ]),
    )
  })
})
