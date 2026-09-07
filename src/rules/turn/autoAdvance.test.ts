import { describe, expect, it } from 'vitest'
import { parseCommand } from '../../commands/parser/parseCommand'
import { resolveCommand } from '../../commands/resolver/resolveCommand'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import { deriveGameEvents } from '../../events/deriveGameEvents'
import { useGameStore } from '../../store/gameStore'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { DeckDefinition } from '../../types/deck'
import type { GameState } from '../../types/game'
import {
  advanceToStepUntilPlayerInteraction,
  advanceTurnPassUntilPlayerInteraction,
  advanceUntilPlayerInteraction,
  requiresPlayerInteraction,
} from './autoAdvance'

const card = (name: string, typeLine: string): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})

const island = card('Island', 'Basic Land — Island')
const namor: CardDefinition = {
  ...card('Namor the Sub-Mariner', 'Legendary Creature — Merfolk'),
  power: '2',
  toughness: '3',
}
const deck: DeckDefinition = {
  name: 'Auto turn test',
  commander: { quantity: 1, name: namor.name, card: namor },
  mainboard: [{ quantity: 30, name: island.name, card: island }],
}

const battlefieldCard = (tapped = false): CardInstance => ({
  instanceId: 'island-1',
  card: island,
  zone: 'battlefield',
  tapped,
  counters: {},
})

const endingTurnState = (overrides: Partial<GameState> = {}): GameState => ({
  ...createInitialGameState([battlefieldCard(true)], deck),
  turn: 3,
  landPlaysUsedThisTurn: 1,
  manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 },
  turnState: { phase: 'ENDING', step: 'END_STEP', priority: 'WINDOW_OPEN' },
  ...overrides,
})

const nextTurn = (state: GameState): GameState => {
  useGameStore.getState().replaceGame(state)
  useGameStore.getState().dispatch({ type: 'NEXT_TURN' })
  return useGameStore.getState()
}

describe('automatic beginning-of-turn progression', () => {
  it('takes a trivial next turn through untap, upkeep and draw to MAIN_1', () => {
    const next = nextTurn(endingTurnState())

    expect(next).toMatchObject({
      turn: 4,
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
      landPlaysUsedThisTurn: 0,
      manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    })
    expect(
      next.cards.find((entry) => entry.instanceId === 'island-1')?.tapped,
    ).toBe(false)
    expect(next.cards).toHaveLength(1)
    expect(next.history.map((entry) => entry.action.type)).toEqual([
      'ADVANCE_STEP',
      'ADVANCE_STEP',
      'ADVANCE_STEP',
      'NEXT_TURN',
      'ADVANCE_STEP',
    ])
  })

  it('keeps an untracked draw identity-free while proceeding to main one', () => {
    const next = nextTurn(endingTurnState({ libraryCount: 99, handCount: 7 }))
    expect(next.turnState.step).toBe('MAIN_1')
    expect(next.cards).toHaveLength(1)
    expect(next).toMatchObject({ libraryCount: 99, handCount: 7 })
  })

  it('derives upkeep, draw-step and main-phase events during the real transitions', () => {
    let state = endingTurnState()
    const eventTypes: string[] = []
    for (const action of [
      { type: 'NEXT_TURN' as const },
      { type: 'ADVANCE_STEP' as const },
      { type: 'ADVANCE_STEP' as const },
      { type: 'ADVANCE_STEP' as const },
    ]) {
      const next = applyGameAction(state, action)
      eventTypes.push(
        ...deriveGameEvents(state, action, next).map((event) => event.type),
      )
      state = next
    }
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        'UPKEEP_STARTED',
        'DRAW_STEP_STARTED',
        'CARD_DRAWN',
        'MAIN_PHASE_STARTED',
      ]),
    )
  })

  it('reproduces the reported flow: paso turno then bajar isla is legal', () => {
    const state = endingTurnState({ cards: [] })
    useGameStore.getState().replaceGame(state)
    const pass = parseCommand('paso turno')
    if (pass.status !== 'parsed') throw new Error('Expected next turn command')
    const passing = resolveCommand(useGameStore.getState(), pass.command)
    if (passing.status !== 'resolved')
      throw new Error('Expected legal next turn')
    useGameStore.getState().dispatchMany(passing.actions)

    const land = parseCommand('bajo isla')
    if (land.status !== 'parsed') throw new Error('Expected land declaration')
    expect(resolveCommand(useGameStore.getState(), land.command)).toMatchObject(
      {
        status: 'resolved',
        actions: [{ type: 'PLAY_LAND' }],
      },
    )
  })

  it('reproduces the Execute UI path: paso turno then bajar isla executes', () => {
    useGameStore.getState().replaceGame(endingTurnState({ cards: [] }))

    const pass = parseCommand('paso turno')
    if (pass.status !== 'parsed') throw new Error('Expected next turn command')
    expect(
      useGameStore.getState().executeTabletopCommand(pass.command),
    ).toMatchObject({ status: 'executed' })
    expect(useGameStore.getState().turnState).toMatchObject({
      phase: 'PRECOMBAT_MAIN',
      step: 'MAIN_1',
      priority: 'WINDOW_OPEN',
    })

    const land = parseCommand('bajo isla')
    if (land.status !== 'parsed') throw new Error('Expected land declaration')
    expect(
      useGameStore.getState().executeTabletopCommand(land.command),
    ).toMatchObject({ status: 'executed' })
    expect(useGameStore.getState().landPlaysUsedThisTurn).toBe(1)
  })

  it('self-heals a paused beginning of turn before Execute validates a land', () => {
    useGameStore.getState().replaceGame(
      endingTurnState({
        cards: [],
        turnState: {
          phase: 'BEGINNING',
          step: 'UPKEEP',
          priority: 'WINDOW_OPEN',
        },
        autoAdvanceBeginningOfTurnPaused: true,
      }),
    )

    const land = parseCommand('bajo isla')
    if (land.status !== 'parsed') throw new Error('Expected land declaration')
    expect(
      useGameStore.getState().executeTabletopCommand(land.command),
    ).toMatchObject({ status: 'executed' })
    expect(useGameStore.getState().turnState).toMatchObject({
      phase: 'PRECOMBAT_MAIN',
      step: 'MAIN_1',
      priority: 'WINDOW_OPEN',
    })
  })

  it('reports an upkeep interaction instead of a misleading land timing error', () => {
    const state = endingTurnState({
      cards: [],
      turnState: {
        phase: 'BEGINNING',
        step: 'UPKEEP',
        priority: 'WINDOW_OPEN',
      },
      stack: [
        {
          stackObjectId: 'upkeep-trigger',
          kind: 'TRIGGERED_ABILITY',
          controller: 'YOU',
          sourceInstanceId: 'fixture',
          pendingAbilityId: 'fixture-upkeep',
          targets: [],
          order: 1,
        },
      ],
    })
    const land = parseCommand('bajo isla')
    if (land.status !== 'parsed') throw new Error('Expected land declaration')
    expect(resolveCommand(state, land.command)).toMatchObject({
      status: 'error',
      error: {
        code: 'STACK_NOT_EMPTY',
        message: expect.stringContaining('interacción pendiente en UPKEEP'),
      },
    })
  })

  it('does not treat UNTAP itself as a priority window', () => {
    const state = applyGameAction(endingTurnState(), { type: 'NEXT_TURN' })
    expect(state.turnState).toMatchObject({ step: 'UNTAP', priority: 'NONE' })
  })

  it('stops after upkeep when its post-event processing creates a stack object', () => {
    const initial = endingTurnState()
    const result = advanceUntilPlayerInteraction({
      state: initial,
      startAction: { type: 'NEXT_TURN' },
      applyAction: (state, action) => {
        const next = applyGameAction(state, action)
        return next.turnState.step === 'UPKEEP'
          ? applyGameAction(next, {
              type: 'ADD_STACK_OBJECT',
              stackObject: {
                stackObjectId: 'upkeep-trigger',
                kind: 'TRIGGERED_ABILITY',
                controller: 'YOU',
                sourceInstanceId: 'fixture',
                pendingAbilityId: 'fixture-upkeep',
                targets: [],
                order: 1,
              },
            })
          : next
      },
    })

    expect(result).toMatchObject({ stoppedForInteraction: true })
    expect(result.state.turnState.step).toBe('UPKEEP')
    expect(result.state.stack).toHaveLength(1)
    expect(result.actions).toEqual([
      { type: 'NEXT_TURN' },
      { type: 'ADVANCE_STEP' },
    ])
  })

  it('stops for a pending decision without resolving it automatically', () => {
    const result = advanceUntilPlayerInteraction({
      state: endingTurnState(),
      startAction: { type: 'NEXT_TURN' },
      applyAction: (state, action) => {
        const next = applyGameAction(state, action)
        return next.turnState.step === 'UPKEEP'
          ? applyGameAction(next, {
              type: 'ADD_PENDING_DECISION',
              decision: {
                id: 'upkeep-choice',
                sourceAbilityId: 'fixture',
                sourceInstanceId: 'fixture',
                type: 'OPTIONAL_EFFECT',
                prompt: 'Fixture choice',
                continuation: { effectsToExecute: [], resumeEffectIndex: 0 },
              },
            })
          : next
      },
    })
    expect(requiresPlayerInteraction(result.state)).toBe(true)
    expect(result.state.pendingDecisions).toHaveLength(1)
    expect(result.state.turnState.step).toBe('UPKEEP')
  })

  it('blocks passing a turn when an existing stack object needs attention', () => {
    const state = endingTurnState({
      stack: [
        {
          stackObjectId: 'existing-spell',
          kind: 'SPELL',
          controller: 'YOU',
          sourceInstanceId: 'existing-spell',
          spellInstanceId: 'existing-spell',
          targets: [],
          order: 1,
        },
      ],
    })
    expect(resolveCommand(state, { type: 'NEXT_TURN' })).toMatchObject({
      status: 'error',
      error: { code: 'STACK_NOT_EMPTY' },
    })
  })

  it('keeps the whole automatic turn progression as one undo snapshot', () => {
    const before = endingTurnState()
    nextTurn(before)
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState()).toMatchObject({
      turn: before.turn,
      turnState: before.turnState,
      manaPool: before.manaPool,
      landPlaysUsedThisTurn: before.landPlaysUsedThisTurn,
    })
    expect(useGameStore.getState().cards).toEqual(before.cards)
  })

  it('treats empieza turno as the same automatic beginning-of-turn flow', () => {
    useGameStore.getState().replaceGame(endingTurnState({ turn: 1 }))
    useGameStore.getState().dispatch({ type: 'START_TURN' })
    expect(useGameStore.getState()).toMatchObject({
      turn: 1,
      turnState: { step: 'MAIN_1', priority: 'WINDOW_OPEN' },
    })
  })

  it('pass turn from MAIN_1 declares zero attackers, runs end step and cleanup, then reaches the next MAIN_1', () => {
    const damagedCreature: CardInstance = {
      instanceId: 'namor-1',
      card: namor,
      zone: 'battlefield',
      tapped: false,
      counters: {},
      ownerId: 'player-1',
      controllerId: 'player-1',
      controller: 'YOU',
      controlledSinceTurn: 1,
      damageMarked: 2,
    }
    const state: GameState = {
      ...createInitialGameState([damagedCreature], deck),
      turn: 3,
      activePlayerId: 'player-1',
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    }
    useGameStore.getState().replaceGame(state)

    const result = useGameStore
      .getState()
      .executeTabletopCommand({ type: 'NEXT_TURN' })

    expect(result).toMatchObject({ status: 'executed' })
    const next = useGameStore.getState()
    expect(next.activePlayerId).toBe('player-2')
    expect(next.turnState.step).toBe('MAIN_1')
    expect(
      next.cards.find((entry) => entry.instanceId === 'namor-1')?.damageMarked,
    ).toBe(0)
    expect(
      next.history.some((entry) => entry.action.type === 'DECLARE_ATTACKERS'),
    ).toBe(true)
  })

  it('pass turn stops at declare attackers when an attack requirement must be satisfied', () => {
    const requiredAttacker: CardInstance = {
      instanceId: 'required-attacker',
      card: namor,
      zone: 'battlefield',
      tapped: false,
      counters: {},
      ownerId: 'player-1',
      controllerId: 'player-1',
      controller: 'YOU',
      controlledSinceTurn: 1,
    }
    const state: GameState = {
      ...createInitialGameState([requiredAttacker], deck),
      turn: 4,
      activePlayerId: 'player-1',
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
      attackRequirements: [
        {
          attackerInstanceId: requiredAttacker.instanceId,
          defendingPlayerId: 'player-2',
          turn: 4,
        },
      ],
    }
    useGameStore.getState().replaceGame(state)

    const result = useGameStore
      .getState()
      .executeTabletopCommand({ type: 'NEXT_TURN' })

    expect(result).toMatchObject({
      status: 'paused',
      description: expect.stringContaining('debe atacar'),
    })
    expect(useGameStore.getState().turnState.step).toBe('DECLARE_ATTACKERS')
    expect(useGameStore.getState().activePlayerId).toBe('player-1')
  })

  it('pass turn never chooses blockers for the defending player', () => {
    const attacker: CardInstance = {
      instanceId: 'attacker-1',
      card: namor,
      zone: 'battlefield',
      tapped: true,
      counters: {},
      ownerId: 'player-1',
      controllerId: 'player-1',
      controller: 'YOU',
      controlledSinceTurn: 1,
    }
    const state: GameState = {
      ...createInitialGameState([attacker], deck),
      turn: 5,
      activePlayerId: 'player-1',
      turnState: {
        phase: 'COMBAT',
        step: 'DECLARE_ATTACKERS',
        priority: 'WINDOW_OPEN',
      },
      combatState: {
        combatId: 'combat-5',
        active: true,
        attackingPlayerId: 'local',
        attackingPlayerStableId: 'player-1',
        attackersDeclared: true,
        blockersDeclared: false,
        attackers: [
          {
            attackerInstanceId: attacker.instanceId,
            defendingTarget: {
              kind: 'PLAYER',
              id: 'opponent',
              playerId: 'player-2',
            },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
        blockers: [],
        externalParticipants: [],
        damageStep: 'PENDING',
        firstStrikeDamageStepRequired: false,
        firstStrikeParticipantIds: [],
      },
    }
    useGameStore.getState().replaceGame(state)

    const result = useGameStore
      .getState()
      .executeTabletopCommand({ type: 'NEXT_TURN' })

    expect(result).toMatchObject({
      status: 'paused',
      description: expect.stringContaining('declarar bloqueadores'),
    })
    expect(useGameStore.getState().turnState.step).toBe('DECLARE_BLOCKERS')
    expect(useGameStore.getState().combatState.blockersDeclared).toBe(false)
    expect(useGameStore.getState().activePlayerId).toBe('player-1')
  })

  it('pass turn stops on an end-step interaction before cleanup', () => {
    const initial: GameState = {
      ...endingTurnState(),
      turnState: {
        phase: 'POSTCOMBAT_MAIN',
        step: 'MAIN_2',
        priority: 'WINDOW_OPEN',
      },
    }
    const result = advanceTurnPassUntilPlayerInteraction({
      state: initial,
      applyAction: (state, action) => {
        const next = applyGameAction(state, action)
        return action.type === 'ADVANCE_STEP' &&
          next.turnState.step === 'END_STEP'
          ? applyGameAction(next, {
              type: 'ADD_STACK_OBJECT',
              stackObject: {
                stackObjectId: 'end-step-trigger',
                kind: 'TRIGGERED_ABILITY',
                controller: 'YOU',
                sourceInstanceId: 'fixture',
                pendingAbilityId: 'fixture-end-step',
                targets: [],
                order: 1,
              },
            })
          : next
      },
    })

    expect(result).toMatchObject({
      stoppedForInteraction: true,
      completedTurn: false,
    })
    expect(result.state.turnState.step).toBe('END_STEP')
    expect(result.state.stack).toHaveLength(1)
    expect(result.actions).toEqual([{ type: 'ADVANCE_STEP' }])
  })

  it('pass turn emits cleanup before the next turn starts', () => {
    const eventTypes: string[] = []
    const result = advanceTurnPassUntilPlayerInteraction({
      state: endingTurnState(),
      applyAction: (state, action) => {
        const next = applyGameAction(state, action)
        eventTypes.push(
          ...deriveGameEvents(state, action, next).map((event) => event.type),
        )
        return next
      },
    })

    expect(result.completedTurn).toBe(true)
    expect(eventTypes).toContain('TURN_ENDED')
    expect(eventTypes).toContain('TURN_STARTED')
    expect(eventTypes.indexOf('TURN_ENDED')).toBeLessThan(
      eventTypes.indexOf('TURN_STARTED'),
    )
  })

  it('pass turn pauses in cleanup when the active player must discard to hand size', () => {
    const base = endingTurnState()
    const state: GameState = {
      ...base,
      players: base.players.map((player) =>
        player.id === 'player-1'
          ? { ...player, hiddenZoneTracking: 'COUNTS_ONLY', handCount: 8 }
          : player,
      ),
      hiddenZoneTracking: 'COUNTS_ONLY',
      handCount: 8,
    }
    useGameStore.getState().replaceGame(state)

    const result = useGameStore
      .getState()
      .executeTabletopCommand({ type: 'NEXT_TURN' })

    expect(result).toMatchObject({ status: 'paused' })
    expect(useGameStore.getState().turnState.step).toBe('CLEANUP')
    expect(useGameStore.getState().activePlayerId).toBe('player-1')
    expect(useGameStore.getState().pendingDecisions).toContainEqual(
      expect.objectContaining({ type: 'CLEANUP_DISCARD_SELECTION' }),
    )
  })

  it('targeted step advance stops on an interaction created before the requested step', () => {
    const initial: GameState = {
      ...endingTurnState(),
      turnState: {
        phase: 'POSTCOMBAT_MAIN',
        step: 'MAIN_2',
        priority: 'WINDOW_OPEN',
      },
    }
    const result = advanceToStepUntilPlayerInteraction({
      state: initial,
      targetStep: 'CLEANUP',
      applyAction: (state, action) => {
        const next = applyGameAction(state, action)
        return action.type === 'ADVANCE_STEP' &&
          next.turnState.step === 'END_STEP'
          ? applyGameAction(next, {
              type: 'ADD_STACK_OBJECT',
              stackObject: {
                stackObjectId: 'end-step-stop',
                kind: 'TRIGGERED_ABILITY',
                controller: 'YOU',
                sourceInstanceId: 'fixture',
                pendingAbilityId: 'fixture-end-step-stop',
                targets: [],
                order: 1,
              },
            })
          : next
      },
    })

    expect(result).toMatchObject({
      stoppedForInteraction: true,
      reachedTarget: false,
    })
    expect(result.state.turnState.step).toBe('END_STEP')
    expect(result.actions).toEqual([{ type: 'ADVANCE_STEP' }])
  })

  it('targeted step advance never skips an undeclared attackers step', () => {
    const state: GameState = {
      ...createInitialGameState([], deck),
      turn: 6,
      activePlayerId: 'player-1',
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    }

    const result = advanceToStepUntilPlayerInteraction({
      state,
      targetStep: 'MAIN_2',
      applyAction: (current, action) => applyGameAction(current, action),
    })

    expect(result).toMatchObject({
      stoppedForInteraction: true,
      reachedTarget: false,
      stopMessage: expect.stringContaining('declarar atacantes'),
    })
    expect(result.state.turnState.step).toBe('DECLARE_ATTACKERS')
    expect(result.state.combatState.attackersDeclared).toBe(false)
  })
})
