import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { useGameStore } from '../../store/gameStore'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { DeckDefinition } from '../../types/deck'
import type { GameState } from '../../types/game'
import { requiresAttentionAfterImplicitResolution } from './implicitResolution'

const card = (
  name: string,
  typeLine: string,
  manaCost?: string,
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  manaCost,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})

const island = card('Island', 'Basic Land — Island')
const remora = card('Mystic Remora', 'Enchantment', '{U}')
const counterspell = card('Counterspell', 'Instant', '{U}{U}')
const simpleInstant = card('Simple Instant', 'Instant', '{U}')
const solRing = card('Sol Ring', 'Artifact', '{1}')
const deck: DeckDefinition = {
  name: 'Implicit resolution fixture',
  commander: {
    quantity: 1,
    name: 'Commander',
    card: card('Commander', 'Creature'),
  },
  mainboard: [
    { quantity: 2, name: island.name, card: island },
    { quantity: 1, name: remora.name, card: remora },
    { quantity: 1, name: counterspell.name, card: counterspell },
    { quantity: 1, name: simpleInstant.name, card: simpleInstant },
    { quantity: 1, name: solRing.name, card: solRing },
  ],
}

const stackSpell = (
  instanceId: string,
  definition: CardDefinition,
): CardInstance => ({
  instanceId,
  card: definition,
  zone: 'stack',
  tapped: false,
  counters: {},
  stackObjectId: `stack-${instanceId}`,
  controller: 'YOU',
})

const gameWithStack = (
  cards: CardInstance[] = [stackSpell('remora', remora)],
): GameState => {
  const state = createInitialGameState(cards, deck)
  return {
    ...state,
    turn: 2,
    turnState: {
      phase: 'PRECOMBAT_MAIN',
      step: 'MAIN_1',
      priority: 'WINDOW_OPEN',
    },
    stack: cards
      .filter((entry) => entry.zone === 'stack')
      .map((entry, index) => ({
        stackObjectId: entry.stackObjectId as string,
        kind: 'SPELL' as const,
        controller: 'YOU' as const,
        sourceInstanceId: entry.instanceId,
        spellInstanceId: entry.instanceId,
        targets: [],
        order: index + 1,
      })),
  }
}

beforeEach(() => useGameStore.getState().replaceGame(gameWithStack()))

describe('tabletop implicit resolution', () => {
  it('resolves an older spell only when the new land declaration needs an empty stack', () => {
    const result = useGameStore
      .getState()
      .executeTabletopCommand({ type: 'DECLARE_CARD', cardQuery: 'island' })

    expect(result).toMatchObject({
      status: 'executed',
      implicitResolutions: ['Mystic Remora'],
    })
    const next = useGameStore.getState()
    expect(next.stack).toHaveLength(0)
    expect(next.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          card: expect.objectContaining({ name: 'Mystic Remora' }),
          zone: 'battlefield',
        }),
        expect.objectContaining({
          card: expect.objectContaining({ name: 'Island' }),
          zone: 'battlefield',
        }),
      ]),
    )
  })

  it('resolves a permanent spell before retrying a battlefield action that needs it', () => {
    useGameStore
      .getState()
      .replaceGame(gameWithStack([stackSpell('sol-ring', solRing)]))

    const result = useGameStore
      .getState()
      .executeTabletopCommand(
        { type: 'TAP_CARD', cardQuery: 'sol ring' },
        { source: 'VOICE', rawInput: 'gira sol ring' },
      )

    expect(result).toMatchObject({
      status: 'executed',
      implicitResolutions: ['Sol Ring'],
    })
    const next = useGameStore.getState()
    expect(next.stack).toHaveLength(0)
    expect(
      next.cards.find((entry) => entry.card.name === 'Sol Ring'),
    ).toMatchObject({ zone: 'battlefield', tapped: true })
    const transaction = next.matchTransactions.at(-1)
    expect(transaction).toMatchObject({
      source: 'VOICE',
      rawInput: 'gira sol ring',
      commandType: 'TAP_CARD',
      implicitResolutions: ['Sol Ring'],
      status: 'EXECUTED',
    })
    expect(transaction?.actions.map((action) => action.type)).toContain(
      'TAP_CARD',
    )
  })

  it('defaults legacy states without stackResolutionMode to tabletop implicit resolution', () => {
    const legacy = gameWithStack([stackSpell('sol-ring-legacy-mode', solRing)])
    delete (
      legacy as unknown as {
        stackResolutionMode?: GameState['stackResolutionMode']
      }
    ).stackResolutionMode
    useGameStore.getState().replaceGame(legacy)

    const result = useGameStore
      .getState()
      .executeTabletopCommand({ type: 'TAP_CARD', cardQuery: 'sol ring' })

    expect(result).toMatchObject({
      status: 'executed',
      implicitResolutions: ['Sol Ring'],
    })
    expect(useGameStore.getState().stack).toHaveLength(0)
    expect(
      useGameStore
        .getState()
        .cards.find((entry) => entry.instanceId === 'sol-ring-legacy-mode'),
    ).toMatchObject({ zone: 'battlefield', tapped: true })
  })

  it('keeps an instant response on top instead of resolving the spell it responds to', () => {
    useGameStore.getState().replaceGame({
      ...gameWithStack(),
      manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 },
    })
    const result = useGameStore.getState().executeTabletopCommand({
      type: 'CAST_SPELL',
      cardQuery: 'counterspell',
      targetQuery: 'mystic remora',
    })

    expect(result).toMatchObject({
      status: 'executed',
      implicitResolutions: [],
    })
    const next = useGameStore.getState()
    expect(next.stack.map((object) => object.spellInstanceId)).toEqual([
      'remora',
      expect.any(String),
    ])
    expect(
      next.cards.find((entry) => entry.instanceId === 'remora')?.zone,
    ).toBe('stack')
  })

  it('can resolve several old spells in real LIFO order before a sorcery-timed action', () => {
    useGameStore
      .getState()
      .replaceGame(
        gameWithStack([
          stackSpell('remora', remora),
          stackSpell('simple-instant', simpleInstant),
        ]),
      )

    const result = useGameStore
      .getState()
      .executeTabletopCommand({ type: 'DECLARE_CARD', cardQuery: 'island' })

    expect(result).toMatchObject({
      status: 'executed',
      implicitResolutions: ['Simple Instant', 'Mystic Remora'],
    })
    expect(useGameStore.getState().stack).toHaveLength(0)
  })

  it('continues through a newly-created deterministic trigger already placed on the stack', () => {
    const before = gameWithStack()
    const after = {
      ...before,
      stack: [
        {
          stackObjectId: 'new-trigger',
          kind: 'TRIGGERED_ABILITY' as const,
          controller: 'YOU' as const,
          sourceInstanceId: 'fixture',
          pendingAbilityId: 'fixture-trigger',
          targets: [],
          order: 2,
        },
      ],
    }
    expect(requiresAttentionAfterImplicitResolution(before, after)).toBe(false)
  })

  it('keeps strict mode explicit', () => {
    useGameStore.getState().setStackResolutionMode('STRICT')

    const result = useGameStore
      .getState()
      .executeTabletopCommand({ type: 'DECLARE_CARD', cardQuery: 'island' })

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'STACK_NOT_EMPTY' },
    })
    expect(useGameStore.getState().cards[0]?.zone).toBe('stack')
  })

  it('keeps explicit resolve available in both modes', () => {
    const result = useGameStore
      .getState()
      .executeTabletopCommand({ type: 'RESOLVE_SPELL' })
    expect(result.status).toBe('executed')
    expect(useGameStore.getState().stack).toHaveLength(0)
  })

  it('undoes both the implicit resolution and final declaration as one command snapshot', () => {
    const before = gameWithStack()
    useGameStore.getState().replaceGame(before)
    useGameStore
      .getState()
      .executeTabletopCommand({ type: 'DECLARE_CARD', cardQuery: 'island' })

    useGameStore.getState().undoLastAction()
    const restored = useGameStore.getState()
    expect(restored.stack).toEqual(before.stack)
    expect(restored.cards).toEqual(before.cards)
    expect(restored.landPlaysUsedThisTurn).toBe(0)
  })
})
