import { describe, expect, it } from 'vitest'
import { resolveCommand } from '../commands/resolver/resolveCommand'
import { applyGameAction, createInitialGameState } from '../engine/gameEngine'
import { useGameStore } from '../store/gameStore'
import type { CardDefinition, CardInstance } from '../types/card'
import type { DeckDefinition } from '../types/deck'
import type { GameState } from '../types/game'

const definition = (name: string, typeLine: string): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})
const island = definition('Island', 'Basic Land — Island')
const counterspell = definition('Counterspell', 'Instant')
const namor = definition('Namor the Sub-Mariner', 'Legendary Creature')
const deck: DeckDefinition = {
  name: 'Hidden-zone test',
  commander: { quantity: 1, name: namor.name, card: namor },
  mainboard: [
    { quantity: 30, name: island.name, card: island },
    { quantity: 1, name: counterspell.name, card: counterspell },
  ],
}

const state = (tracking: GameState['hiddenZoneTracking'] = 'UNTRACKED') => ({
  ...createInitialGameState([], deck),
  turnState: {
    phase: 'PRECOMBAT_MAIN' as const,
    step: 'MAIN_1' as const,
    priority: 'WINDOW_OPEN' as const,
  },
  hiddenZoneTracking: tracking,
})

const applyResolved = (
  game: GameState,
  cardQuery: string,
  type: 'PLAY_CARD' | 'CAST_SPELL' | 'DISCARD_CARD',
) => {
  const command =
    type === 'DISCARD_CARD'
      ? ({ type, cardQuery, amount: 1 } as const)
      : type === 'PLAY_CARD'
        ? ({ type, cardQuery } as const)
        : ({ type, cardQuery } as const)
  const result = resolveCommand(game, command)
  if (result.status !== 'resolved')
    throw new Error(
      `Expected declaration to resolve: ${JSON.stringify(result)}`,
    )
  return result.actions.reduce(
    (next, action) => applyGameAction(next, action),
    game,
  )
}

describe('untracked hidden zones', () => {
  it('plays Island with handCount 0 without changing untracked counts', () => {
    const next = applyResolved(state(), 'island', 'PLAY_CARD')
    expect(next.cards).toMatchObject([
      { card: { name: 'Island' }, zone: 'battlefield' },
    ])
    expect(next.handCount).toBe(0)
  })

  it('casts Counterspell with handCount 0', () => {
    const next = applyResolved(state(), 'counterspell', 'CAST_SPELL')
    expect(next.cards).toMatchObject([
      { card: { name: 'Counterspell' }, zone: 'stack' },
    ])
    expect(next.handCount).toBe(0)
  })

  it('does not create a second known Counterspell', () => {
    const first = applyResolved(state(), 'counterspell', 'CAST_SPELL')
    const inGraveyard = applyGameAction(first, {
      type: 'MOVE_CARD',
      instanceId: first.cards[0].instanceId,
      toZone: 'graveyard',
    })
    expect(
      resolveCommand(inGraveyard, {
        type: 'CAST_SPELL',
        cardQuery: 'counterspell',
      }),
    ).toMatchObject({
      status: 'error',
      error: { code: 'CARD_COPY_UNAVAILABLE' },
    })
  })

  it('materializes thirty distinct Islands, but no thirty-first copy', () => {
    const thirty = Array.from({ length: 30 }).reduce<GameState>(
      (game, _, index) =>
        applyGameAction(game, {
          type: 'MATERIALIZE_CARD',
          instanceId: `known-island-${index}`,
          card: island,
          fromZone: 'hand',
          toZone: 'battlefield',
        }),
      state(),
    )
    const islands = thirty.cards.filter((card) => card.card.name === 'Island')
    expect(new Set(islands.map((card) => card.instanceId)).size).toBe(30)
    expect(
      resolveCommand(thirty, { type: 'PLAY_CARD', cardQuery: 'island' }),
    ).toMatchObject({
      status: 'error',
      error: { code: 'CARD_COPY_UNAVAILABLE' },
    })
  })

  it('preserves the identity of a public card returned to hand', () => {
    const publicIsland: CardInstance = {
      instanceId: 'island-public',
      card: island,
      zone: 'battlefield',
      tapped: false,
      counters: {},
    }
    const next = applyGameAction(
      { ...state(), cards: [publicIsland] },
      {
        type: 'MOVE_CARD',
        instanceId: 'island-public',
        toZone: 'hand',
      },
    )
    expect(next.cards[0]).toMatchObject({
      instanceId: 'island-public',
      card: { name: 'Island' },
      zone: 'hand',
    })
  })

  it('records an untracked draw without assigning a card identity or changing counts', () => {
    const game = { ...state(), libraryCount: 99, handCount: 7 }
    const next = applyGameAction(game, { type: 'DRAW_CARD' })
    expect(next.cards).toEqual([])
    expect(next).toMatchObject({ libraryCount: 99, handCount: 7 })
    expect(next.history[0].action).toEqual({ type: 'DRAW_CARD' })
  })

  it('materializes an identified declared discard without a hand count', () => {
    const next = applyResolved(state(), 'counterspell', 'DISCARD_CARD')
    expect(next.cards).toMatchObject([
      { card: { name: 'Counterspell' }, zone: 'graveyard' },
    ])
    expect(next.handCount).toBe(0)
  })

  it('keeps declaration and undo atomic in untracked mode', () => {
    useGameStore.getState().replaceGame(state())
    const result = resolveCommand(useGameStore.getState(), {
      type: 'PLAY_CARD',
      cardQuery: 'island',
    })
    if (result.status !== 'resolved')
      throw new Error('Expected Island declaration.')
    useGameStore.getState().dispatchMany(result.actions)
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState().cards).toEqual([])
  })

  it('COUNTS_ONLY may track counts but never blocks a declaration at handCount 0', () => {
    const next = applyResolved(
      { ...state('COUNTS_ONLY'), handCount: 0 },
      'counterspell',
      'CAST_SPELL',
    )
    expect(next.cards[0]).toMatchObject({
      card: { name: 'Counterspell' },
      zone: 'stack',
    })
    expect(next.handCount).toBe(0)
  })
})
