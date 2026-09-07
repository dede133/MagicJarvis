import { describe, expect, it } from 'vitest'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import { parseCommand } from '../../commands/parser/parseCommand'
import { resolveCardQuery } from '../../commands/resolver/cardResolver'
import { resolveCommand } from '../../commands/resolver/resolveCommand'
import { useGameStore } from '../../store/gameStore'
import type { CardDefinition } from '../../types/card'
import type { DeckDefinition } from '../../types/deck'
import type { GameState } from '../../types/game'

const card = (
  name: string,
  typeLine: string,
  manaCost?: string,
): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  manaCost,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})
const island = card('Island', 'Basic Land — Island')
const remora = card('Mystic Remora', 'Enchantment', '{U}')
const solRing = {
  ...card('Sol Ring', 'Artifact', '{1}'),
  oracleText: '{T}: Add {C}{C}.',
  localizedAliases: ['anillo solar'],
}
const counterspell = card('Counterspell', 'Instant', '{U}{U}')
const deck: DeckDefinition = {
  name: 'Rules test',
  commander: {
    quantity: 1,
    name: 'Namor the Sub-Mariner',
    card: card('Namor the Sub-Mariner', 'Creature'),
  },
  mainboard: [
    { quantity: 30, name: island.name, card: island },
    { quantity: 1, name: remora.name, card: remora },
    { quantity: 1, name: solRing.name, card: solRing },
    { quantity: 1, name: counterspell.name, card: counterspell },
  ],
}
const game = (): GameState => ({
  ...createInitialGameState([], deck),
  turnState: {
    phase: 'PRECOMBAT_MAIN' as const,
    step: 'MAIN_1' as const,
    priority: 'WINDOW_OPEN' as const,
  },
})
const resolved = (state: ReturnType<typeof game>, input: string) => {
  const parsed = parseCommand(input)
  if (parsed.status !== 'parsed') throw new Error(input)
  return resolveCommand(state, parsed.command)
}
const apply = (state: ReturnType<typeof game>, input: string) => {
  const result = resolved(state, input)
  if (result.status !== 'resolved') throw new Error(JSON.stringify(result))
  return result.actions.reduce(
    (next, action) => applyGameAction(next, action),
    state,
  )
}

describe('declared card rules', () => {
  it('routes a natural declaration by card type and enforces one normal land play', () => {
    const first = apply(game(), 'bajo island')
    expect(first).toMatchObject({ landPlaysUsedThisTurn: 1 })
    expect(first.cards[0]).toMatchObject({
      card: { name: 'Island' },
      zone: 'battlefield',
    })
    expect(resolved(first, 'bajo island')).toMatchObject({
      status: 'error',
      error: { code: 'LAND_PLAY_LIMIT_REACHED' },
    })
    const nextTurn = applyGameAction(first, { type: 'NEXT_TURN' })
    expect(nextTurn).toMatchObject({
      landPlaysUsedThisTurn: 0,
      manaPool: { U: 0 },
    })
    const main = {
      ...nextTurn,
      turnState: {
        phase: 'PRECOMBAT_MAIN' as const,
        step: 'MAIN_1' as const,
        priority: 'WINDOW_OPEN' as const,
      },
    }
    expect(resolved(main, 'bajo island')).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'PLAY_LAND' }],
    })
  })

  it('casts natural nonlands only after costs are payable and never materializes a failed cast', () => {
    expect(resolved(game(), 'bajo remora')).toMatchObject({
      status: 'error',
      error: { code: 'NOT_ENOUGH_MANA' },
    })
    const paid = { ...game(), manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } }
    const result = resolved(paid, 'bajo remora')
    expect(result).toMatchObject({
      status: 'resolved',
      actions: [
        { type: 'SPEND_MANA', color: 'U', amount: 1 },
        { type: 'CAST_SPELL', card: { name: 'Mystic Remora' } },
      ],
    })
    const cast =
      result.status === 'resolved'
        ? result.actions.reduce(
            (next, action) => applyGameAction(next, action),
            paid,
          )
        : paid
    expect(cast).toMatchObject({ manaPool: { U: 0 } })
    expect(cast.cards[0]).toMatchObject({
      card: { name: 'Mystic Remora' },
      zone: 'stack',
    })
  })

  it('uses a uniquely safe known mana source before casting a declared spell', () => {
    const withIsland: GameState = {
      ...game(),
      cards: [
        {
          instanceId: 'island-1',
          card: island,
          zone: 'battlefield' as const,
          tapped: false,
          counters: {},
        },
      ],
    }
    const result = resolved(withIsland, 'bajo remora')
    expect(result).toMatchObject({
      status: 'resolved',
      actions: [
        { type: 'TAP_CARD', instanceId: 'island-1' },
        { type: 'ADD_MANA', color: 'U', amount: 1 },
        { type: 'SPEND_MANA', color: 'U', amount: 1 },
        { type: 'CAST_SPELL', card: { name: 'Mystic Remora' } },
      ],
    })
    if (result.status !== 'resolved') throw new Error('Expected resolved cast')
    const afterCast = result.actions.reduce<GameState>(
      (current, action) => applyGameAction(current, action),
      withIsland,
    )
    expect(afterCast.cards).toMatchObject([
      { instanceId: 'island-1', tapped: true },
      { card: { name: 'Mystic Remora' }, zone: 'stack' },
    ])
    expect(afterCast.manaPool).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 })
  })

  it('asks for a source choice instead of arbitrarily tapping one of two Islands', () => {
    const selectionState = {
      ...game(),
      cards: [
        {
          instanceId: 'island-1',
          card: island,
          zone: 'battlefield' as const,
          tapped: false,
          counters: {},
        },
        {
          instanceId: 'island-2',
          card: island,
          zone: 'battlefield' as const,
          tapped: false,
          counters: {},
        },
      ],
    }
    const result = resolved(selectionState, 'bajo remora')
    expect(result).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'ADD_PENDING_DECISION',
          decision: { type: 'MANA_SOURCE_SELECTION' },
        },
      ],
    })
    if (result.status !== 'resolved') throw new Error('Expected source choice')
    useGameStore.getState().replaceGame(selectionState)
    useGameStore.getState().dispatchMany(result.actions)
    const decision = useGameStore.getState().pendingDecisions[0]
    expect(decision.type).toBe('MANA_SOURCE_SELECTION')
    useGameStore
      .getState()
      .resolvePendingDecision(
        decision.id,
        decision.options?.[0].instanceId ?? '',
      )
    expect(
      useGameStore
        .getState()
        .cards.filter((card) => card.card.name === 'Island' && card.tapped),
    ).toHaveLength(1)
    expect(
      useGameStore
        .getState()
        .cards.find((card) => card.card.name === 'Mystic Remora'),
    ).toMatchObject({ zone: 'stack' })
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState().pendingDecisions).toHaveLength(1)
  })

  it('uses two known Islands when both are required for Counterspell', () => {
    const result = resolved(
      {
        ...game(),
        cards: [
          {
            instanceId: 'island-1',
            card: island,
            zone: 'battlefield' as const,
            tapped: false,
            counters: {},
          },
          {
            instanceId: 'island-2',
            card: island,
            zone: 'battlefield' as const,
            tapped: false,
            counters: {},
          },
        ],
      },
      'lanzo counterspell',
    )
    expect(result).toMatchObject({
      status: 'resolved',
      actions: [
        { type: 'TAP_CARD', instanceId: 'island-1' },
        { type: 'ADD_MANA', color: 'U', amount: 1 },
        { type: 'TAP_CARD', instanceId: 'island-2' },
        { type: 'ADD_MANA', color: 'U', amount: 1 },
        { type: 'SPEND_MANA', color: 'U', amount: 2 },
        { type: 'CAST_SPELL', card: { name: 'Counterspell' } },
      ],
    })
  })

  it('resolves Spanish aliases and only auto-pays a unique generic allocation', () => {
    expect(resolveCardQuery(deck, 'anillo solar')).toEqual({
      status: 'resolved',
      name: 'Sol Ring',
    })
    expect(resolveCardQuery(deck, 'remora')).toEqual({
      status: 'resolved',
      name: 'Mystic Remora',
    })
    const paid = { ...game(), manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 } }
    expect(resolved(paid, 'bajo anillo solar')).toMatchObject({
      status: 'resolved',
      actions: [
        { type: 'SPEND_MANA', color: 'C', amount: 1 },
        { type: 'CAST_SPELL' },
      ],
    })
    const ambiguous = {
      ...game(),
      manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 1 },
    }
    expect(resolved(ambiguous, 'bajo sol ring')).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'ADD_PENDING_DECISION',
          decision: { type: 'MANA_PAYMENT_SELECTION' },
        },
      ],
    })
  })

  it('uses a basic land subtype for explicit mana activation while bare tap remains tap only', () => {
    const board = {
      ...game(),
      cards: [
        {
          instanceId: 'island-1',
          card: island,
          zone: 'battlefield' as const,
          tapped: false,
          counters: {},
        },
      ],
    }
    const tap = resolved(board, 'giro island')
    expect(tap).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'TAP_CARD' }],
    })
    const mana = resolved(board, 'giro island para azul')
    expect(mana).toMatchObject({
      status: 'resolved',
      actions: [
        { type: 'TAP_CARD' },
        { type: 'ADD_MANA', color: 'U', amount: 1 },
      ],
    })
  })

  it('resolves the only spell on stack without guessing among several', () => {
    const cast = apply(
      { ...game(), manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } },
      'bajo remora',
    )
    const next = apply(cast, 'resuelve')
    expect(next.cards[0].zone).toBe('battlefield')
  })

  it('does not spend a normal land play for a direct zone movement', () => {
    const moved = applyGameAction(
      {
        ...game(),
        cards: [
          {
            instanceId: 'land-in-hand',
            card: island,
            zone: 'hand',
            tapped: false,
            counters: {},
          },
        ],
      },
      { type: 'MOVE_CARD', instanceId: 'land-in-hand', toZone: 'battlefield' },
    )
    expect(moved.landPlaysUsedThisTurn).toBe(0)
  })

  it('undoes a normal land play together with its land-play counter', () => {
    useGameStore.getState().replaceGame(game())
    const result = resolved(useGameStore.getState(), 'bajo island')
    if (result.status !== 'resolved')
      throw new Error('Expected legal land play')
    useGameStore.getState().dispatchMany(result.actions)
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState()).toMatchObject({
      landPlaysUsedThisTurn: 0,
      cards: [],
    })
  })

  it('keeps a failed cast out of every public zone', () => {
    const result = resolved(game(), 'bajo remora')
    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'NOT_ENOUGH_MANA' },
    })
    expect(game().cards).toEqual([])
  })

  it('undoes an atomic paid cast including its mana payment', () => {
    useGameStore.getState().replaceGame({
      ...game(),
      manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 },
    })
    const result = resolved(useGameStore.getState(), 'bajo remora')
    if (result.status !== 'resolved') throw new Error('Expected paid cast')
    useGameStore.getState().dispatchMany(result.actions)
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState()).toMatchObject({
      manaPool: { U: 1 },
      cards: [],
    })
  })

  it('undoes automatic mana, the cast, and resulting cast triggers together', () => {
    const state = {
      ...game(),
      cards: [
        {
          instanceId: 'namor',
          card: deck.commander.card,
          zone: 'battlefield' as const,
          tapped: false,
          counters: {},
        },
        {
          instanceId: 'island-1',
          card: island,
          zone: 'battlefield' as const,
          tapped: false,
          counters: {},
        },
        {
          instanceId: 'island-2',
          card: island,
          zone: 'battlefield' as const,
          tapped: false,
          counters: {},
        },
      ],
    }
    useGameStore.getState().replaceGame(state)
    const result = resolved(useGameStore.getState(), 'lanzo counterspell')
    if (result.status !== 'resolved') throw new Error('Expected auto-mana cast')
    useGameStore.getState().dispatchMany(result.actions)
    expect(
      useGameStore
        .getState()
        .cards.find((card) => card.instanceId === 'island-1')?.tapped,
    ).toBe(true)
    expect(useGameStore.getState().pendingAbilities).toHaveLength(1)
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState()).toMatchObject({
      manaPool: { U: 0 },
      pendingAbilities: [],
      stack: [],
    })
    expect(
      useGameStore
        .getState()
        .cards.filter((card) => card.instanceId.startsWith('island-')),
    ).toEqual([
      expect.objectContaining({ instanceId: 'island-1', tapped: false }),
      expect.objectContaining({ instanceId: 'island-2', tapped: false }),
    ])
  })

  it('resets both floating mana and land-play bookkeeping on next turn', () => {
    const next = applyGameAction(
      {
        ...game(),
        landPlaysUsedThisTurn: 1,
        manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 },
      },
      { type: 'NEXT_TURN' },
    )
    expect(next).toMatchObject({ landPlaysUsedThisTurn: 0, manaPool: { U: 0 } })
  })

  it('parses “otra Island” as the same natural land declaration entity', () => {
    expect(parseCommand('bajo otra island')).toMatchObject({
      status: 'parsed',
      command: { type: 'DECLARE_CARD', cardQuery: 'island' },
    })
  })

  it('casts a known commander from command rather than inventing another copy', () => {
    const commander = deck.commander.card
    const state = {
      ...game(),
      cards: [
        {
          instanceId: 'namor-command',
          card: commander,
          zone: 'command' as const,
          tapped: false,
          counters: {},
        },
      ],
    }
    expect(resolved(state, 'bajo namor')).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'CAST_SPELL',
          instanceId: 'namor-command',
          fromZone: 'command',
        },
      ],
    })
  })
})
