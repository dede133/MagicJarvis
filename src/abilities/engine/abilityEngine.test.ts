import { beforeEach, describe, expect, it } from 'vitest'
import {
  evaluateAbilities,
  resolvePendingAbilityEffects,
} from './abilityEngine'
import { countBlueManaSymbols } from './manaSymbols'
import { deriveGameEvents } from '../../events/deriveGameEvents'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import { useGameStore } from '../../store/gameStore'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { DeckDefinition } from '../../types/deck'
import type { GameState } from '../../types/game'

const card = (
  name: string,
  manaCost: string,
  typeLine: string,
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  manaCost,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})
const namor = card(
  'Namor the Sub-Mariner',
  '{1}{U}',
  'Legendary Creature — Human Mutant',
)
const counterspell = card('Counterspell', '{U}{U}', 'Instant')
const aetherize = card('Aetherize', '{3}{U}', 'Instant')
const signet = card('Arcane Signet', '{2}', 'Artifact')
const blueCreature = card('Blue Creature', '{U}', 'Creature — Merfolk')
const deck: DeckDefinition = {
  name: 'Ability tests',
  commander: { quantity: 1, name: namor.name, card: namor },
  mainboard: [
    { quantity: 1, name: counterspell.name, card: counterspell },
    { quantity: 1, name: aetherize.name, card: aetherize },
    { quantity: 1, name: signet.name, card: signet },
    { quantity: 1, name: blueCreature.name, card: blueCreature },
  ],
}
const namorInstance = (
  zone: CardInstance['zone'] = 'battlefield',
): CardInstance => ({
  instanceId: 'namor-instance',
  card: namor,
  zone,
  tapped: false,
  counters: {},
})
const stateWithNamor = (
  zone: CardInstance['zone'] = 'battlefield',
): GameState => ({
  ...createInitialGameState([namorInstance(zone)], deck),
  hiddenZoneTracking: 'COUNTS_ONLY',
  libraryCount: 90,
  handCount: 2,
})
const cast = (
  state: GameState,
  definition: CardDefinition,
  id = 'spell-instance',
) => {
  const action = {
    type: 'CAST_SPELL' as const,
    instanceId: id,
    card: definition,
    fromZone: 'hand' as const,
  }
  const next = applyGameAction(state, action)
  return { action, next, events: deriveGameEvents(state, action, next) }
}

describe('Ability Engine', () => {
  it.each([
    ['{U}', 1],
    ['{U}{U}', 2],
    ['{3}{U}{U}', 2],
    ['{2}', 0],
  ])('counts blue symbols in %s', (manaCost, expected) => {
    expect(countBlueManaSymbols(manaCost)).toBe(expected)
  })

  it('derives SPELL_CAST with Counterspell blue symbols', () => {
    const state = stateWithNamor()
    const { next, events } = cast(state, counterspell, 'counterspell-instance')
    expect(
      next.cards.find(
        (instance) => instance.instanceId === 'counterspell-instance',
      )?.zone,
    ).toBe('stack')
    expect(events).toEqual([
      expect.objectContaining({
        type: 'SPELL_CAST',
        cardName: 'Counterspell',
        blueManaSymbols: 2,
        isCreature: false,
      }),
    ])
  })

  it('creates one Namor pending ability with a two-token effect', () => {
    const state = stateWithNamor()
    const { events } = cast(state, counterspell)
    const pending = evaluateAbilities(state, events[0])
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      sourceCardName: 'Namor the Sub-Mariner',
      resolvedEffects: [
        { type: 'CREATE_TOKEN', tokenId: 'BLUE_MERFOLK_1_1', amount: 2 },
      ],
    })
  })

  it('resolves a pending ability into distinct blue 1/1 Merfolk tokens', () => {
    const state = stateWithNamor()
    const { next, events } = cast(state, counterspell)
    const pending = evaluateAbilities(next, events[0])[0]
    const withTokens = resolvePendingAbilityEffects(pending).reduce(
      (current, action) => applyGameAction(current, action),
      next,
    )
    const tokens = withTokens.cards.filter((instance) => instance.isToken)
    expect(tokens).toHaveLength(2)
    expect(new Set(tokens.map((token) => token.instanceId)).size).toBe(2)
    expect(
      tokens.map((token) => ({
        name: token.card.name,
        colors: token.card.colors,
        power: token.card.power,
        toughness: token.card.toughness,
        typeLine: token.card.typeLine,
      })),
    ).toEqual([
      {
        name: 'Merfolk Token',
        colors: ['U'],
        power: '1',
        toughness: '1',
        typeLine: 'Token Creature — Merfolk',
      },
      {
        name: 'Merfolk Token',
        colors: ['U'],
        power: '1',
        toughness: '1',
        typeLine: 'Token Creature — Merfolk',
      },
    ])
  })

  it('uses event blue symbol count for Aetherize', () => {
    const state = stateWithNamor()
    const { events } = cast(state, aetherize)
    expect(
      evaluateAbilities(state, events[0])[0].resolvedEffects[0],
    ).toMatchObject({ amount: 1 })
  })

  it.each([
    ['a spell with no blue symbols', signet],
    ['a blue creature spell', blueCreature],
  ])('does not trigger Namor for %s', (_label, spell) => {
    const state = stateWithNamor()
    const { events } = cast(state, spell)
    expect(evaluateAbilities(state, events[0])).toHaveLength(0)
  })

  it('does not trigger when Namor is outside the battlefield', () => {
    const state = stateWithNamor('command')
    const { events } = cast(state, counterspell)
    expect(evaluateAbilities(state, events[0])).toHaveLength(0)
  })

  it('resolves instant/sorcery spells to graveyard and permanents to battlefield', () => {
    const state = stateWithNamor()
    const instant = applyGameAction(
      cast(state, counterspell, 'counterspell').next,
      { type: 'RESOLVE_SPELL', instanceId: 'counterspell' },
    )
    expect(
      instant.cards.find((instance) => instance.instanceId === 'counterspell')
        ?.zone,
    ).toBe('graveyard')
    const permanent = applyGameAction(cast(state, signet, 'signet').next, {
      type: 'RESOLVE_SPELL',
      instanceId: 'signet',
    })
    expect(
      permanent.cards.find((instance) => instance.instanceId === 'signet')
        ?.zone,
    ).toBe('battlefield')
  })

  it('casts only the declared unknown-hand card and decrements hand count', () => {
    const state = stateWithNamor()
    const { next } = cast(state, counterspell, 'known-counterspell')
    expect(next.handCount).toBe(1)
    expect(next.cards.map((instance) => instance.card.name)).toEqual([
      'Namor the Sub-Mariner',
      'Counterspell',
    ])
  })

  describe('store orchestration and undo', () => {
    beforeEach(() => useGameStore.getState().replaceGame(stateWithNamor()))

    it('adds pending ability after CAST and ignores it without tokens', () => {
      useGameStore.getState().dispatch({
        type: 'CAST_SPELL',
        instanceId: 'counterspell',
        card: counterspell,
        fromZone: 'hand',
      })
      const pending = useGameStore.getState().pendingAbilities[0]
      expect(pending).toBeDefined()
      useGameStore.getState().ignorePendingAbility(pending.id)
      expect(useGameStore.getState().pendingAbilities).toHaveLength(0)
      expect(
        useGameStore.getState().cards.filter((instance) => instance.isToken),
      ).toHaveLength(0)
    })

    it('resolves tokens and undo restores the pre-resolution snapshot', () => {
      useGameStore.getState().dispatch({
        type: 'CAST_SPELL',
        instanceId: 'counterspell',
        card: counterspell,
        fromZone: 'hand',
      })
      const pending = useGameStore.getState().pendingAbilities[0]
      useGameStore.getState().resolvePendingAbility(pending.id)
      expect(
        useGameStore.getState().cards.filter((instance) => instance.isToken),
      ).toHaveLength(2)
      useGameStore.getState().undoLastAction()
      expect(
        useGameStore.getState().cards.filter((instance) => instance.isToken),
      ).toHaveLength(0)
      expect(useGameStore.getState().pendingAbilities).toHaveLength(1)
    })

    it('undoes CAST together with its derived pending ability', () => {
      useGameStore.getState().dispatch({
        type: 'CAST_SPELL',
        instanceId: 'counterspell',
        card: counterspell,
        fromZone: 'hand',
      })
      useGameStore.getState().undoLastAction()
      expect(useGameStore.getState().cards).toEqual([namorInstance()])
      expect(useGameStore.getState().handCount).toBe(2)
      expect(useGameStore.getState().pendingAbilities).toHaveLength(0)
    })
  })
})
