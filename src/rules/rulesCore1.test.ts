import { describe, expect, it } from 'vitest'
import { applyGameAction, createInitialGameState } from '../engine/gameEngine'
import { useGameStore } from '../store/gameStore'
import type { CardDefinition, CardInstance } from '../types/card'
import type { GameState } from '../types/game'
import type { DeckDefinition } from '../types/deck'

const card = (
  name: string,
  typeLine: string,
  manaCost?: string,
): CardDefinition => ({
  scryfallId: name,
  name,
  typeLine,
  manaCost,
  cmc: 0,
  colors: [],
  colorIdentity: [],
})
const island = card('Island', 'Basic Land — Island')
const remora = card('Mystic Remora', 'Enchantment', '{U}')
const instant = card('Brainstorm', 'Instant', '{U}')
const commander = card('Namor the Sub-Mariner', 'Legendary Creature', '{U}')
const deck: DeckDefinition = {
  name: 'Core 1',
  commander: { quantity: 1, name: commander.name, card: commander },
  mainboard: [
    { quantity: 2, name: island.name, card: island },
    { quantity: 1, name: remora.name, card: remora },
    { quantity: 1, name: instant.name, card: instant },
  ],
}
const main = <T extends ReturnType<typeof createInitialGameState>>(
  state: T,
): T =>
  ({
    ...state,
    turnState: {
      phase: 'PRECOMBAT_MAIN',
      step: 'MAIN_1',
      priority: 'WINDOW_OPEN',
    },
  }) as T

describe('Rules Core 1', () => {
  it('starts each turn in UNTAP and reaches upkeep, draw, and main one in order', () => {
    let state = createInitialGameState([], deck)
    expect(state.turnState.step).toBe('UNTAP')
    state = applyGameAction(state, { type: 'ADVANCE_STEP' })
    expect(state.turnState).toMatchObject({
      step: 'UPKEEP',
      priority: 'WINDOW_OPEN',
    })
    state = applyGameAction(state, { type: 'ADVANCE_STEP' })
    expect(state.turnState.step).toBe('DRAW')
    state = applyGameAction(state, { type: 'ADVANCE_STEP' })
    expect(state.turnState.step).toBe('MAIN_1')
  })

  it('draw step tracks counts only when known and never skips the first Commander draw', () => {
    let state: GameState = {
      ...createInitialGameState([], deck),
      hiddenZoneTracking: 'COUNTS_ONLY',
      libraryCount: 99,
      handCount: 0,
    }
    state = applyGameAction(state, { type: 'ADVANCE_STEP' })
    state = applyGameAction(state, { type: 'ADVANCE_STEP' })
    expect(state).toMatchObject({
      turn: 1,
      turnState: { step: 'DRAW' },
      libraryCount: 98,
      handCount: 1,
    })
  })

  it('clears mana at step transition and resets land plays only at next turn', () => {
    const state = main({
      ...createInitialGameState([], deck),
      manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 },
      landPlaysUsedThisTurn: 1,
    })
    const step = applyGameAction(state, { type: 'ADVANCE_STEP' })
    expect(step).toMatchObject({ manaPool: { U: 0 }, landPlaysUsedThisTurn: 1 })
    const turn = applyGameAction(step, { type: 'NEXT_TURN' })
    expect(turn).toMatchObject({
      turnState: { step: 'UNTAP' },
      landPlaysUsedThisTurn: 0,
    })
  })

  it('uses a real LIFO stack for spells', () => {
    let state = main(createInitialGameState([], deck))
    state = applyGameAction(state, {
      type: 'CAST_SPELL',
      instanceId: 'a',
      card: remora,
      fromZone: 'hand',
    })
    state = applyGameAction(state, {
      type: 'CAST_SPELL',
      instanceId: 'b',
      card: instant,
      fromZone: 'hand',
    })
    expect(state.stack.map((item) => item.spellInstanceId)).toEqual(['a', 'b'])
    state = applyGameAction(state, { type: 'RESOLVE_SPELL', instanceId: 'b' })
    expect(state.stack.map((item) => item.spellInstanceId)).toEqual(['a'])
  })

  it('marks life zero and a known empty-library draw as losses through the store SBA loop', () => {
    useGameStore.getState().replaceGame(main(createInitialGameState([], deck)))
    useGameStore.getState().dispatch({ type: 'SET_LIFE', amount: 0 })
    expect(useGameStore.getState()).toMatchObject({
      gameStatus: 'LOST',
      gameLossReason: 'LIFE',
    })
    useGameStore.getState().replaceGame(
      main({
        ...createInitialGameState([], deck),
        hiddenZoneTracking: 'COUNTS_ONLY',
        libraryCount: 0,
      }),
    )
    useGameStore.getState().dispatch({ type: 'DRAW_CARD' })
    expect(useGameStore.getState()).toMatchObject({
      gameStatus: 'LOST',
      gameLossReason: 'EMPTY_LIBRARY',
    })
  })

  it('removes tokens which leave the battlefield and cancels opposing counters', () => {
    const token: CardInstance = {
      instanceId: 'token',
      card: card('Merfolk Token', 'Token Creature — Merfolk'),
      zone: 'graveyard',
      tapped: false,
      counters: {},
      isToken: true,
    }
    const creature: CardInstance = {
      instanceId: 'creature',
      card: commander,
      zone: 'battlefield',
      tapped: false,
      counters: { '+1/+1': 3, '-1/-1': 2 },
    }
    useGameStore
      .getState()
      .replaceGame(main({ ...createInitialGameState([token, creature], deck) }))
    useGameStore
      .getState()
      .dispatch({ type: 'ADD_MANA', color: 'U', amount: 1 })
    expect(
      useGameStore.getState().cards.find((item) => item.instanceId === 'token'),
    ).toBeUndefined()
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'creature')?.counters,
    ).toMatchObject({ '+1/+1': 1, '-1/-1': 0 })
  })

  it('offers commander graveyard choice while retaining the same instance identity', () => {
    const command: CardInstance = {
      instanceId: 'commander',
      card: commander,
      zone: 'command',
      tapped: false,
      counters: {},
    }
    useGameStore.getState().replaceGame(
      main({
        ...createInitialGameState([command], deck),
        commanderId: 'commander',
      }),
    )
    useGameStore.getState().dispatch({
      type: 'MOVE_CARD',
      instanceId: 'commander',
      toZone: 'graveyard',
    })
    const decision = useGameStore
      .getState()
      .pendingDecisions.find((item) => item.type === 'COMMANDER_ZONE_CHOICE')
    expect(decision).toBeTruthy()
    useGameStore
      .getState()
      .resolvePendingDecision(decision?.id ?? '', 'MOVE_TO_COMMAND_ZONE')
    expect(useGameStore.getState().cards[0]).toMatchObject({
      instanceId: 'commander',
      zone: 'command',
    })
  })
})
