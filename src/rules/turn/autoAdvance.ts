import type { GameAction } from '../../actions/gameActions'
import type { GameState } from '../../types/game'
import type { TurnStep } from '../../types/turn'
import { activePlayerIdOf } from '../players/playerState'
import {
  planCombatDamage,
  validateAttackRequirements,
} from '../combat/combatRules'

export type AutomaticTurnStartAction = Extract<
  GameAction,
  { type: 'NEXT_TURN' | 'START_TURN' }
>

export type AutomaticTurnAdvanceResult = {
  state: GameState
  actions: GameAction[]
  stoppedForInteraction: boolean
}

/**
 * The game must pause whenever its current state requires a player response.
 * This derives from domain state; it never guesses that a player has passed.
 */
export const requiresPlayerInteraction = (state: GameState): boolean =>
  state.stack.length > 0 ||
  state.pendingAbilities.length > 0 ||
  state.pendingResolutions.length > 0 ||
  state.pendingDecisions.length > 0

const withBeginningAutoAdvancePaused = (
  state: GameState,
  paused: boolean,
): GameState =>
  state.autoAdvanceBeginningOfTurnPaused === paused
    ? state
    : { ...state, autoAdvanceBeginningOfTurnPaused: paused }

/**
 * Continues a beginning-of-turn auto-advance that previously stopped for a
 * real player interaction. This is intentionally separate from starting a new
 * turn: resolving an upkeep trigger must resume at the current step, not run
 * untap/upkeep again.
 */
export const resumeAutomaticBeginningOfTurn = ({
  state: initial,
  applyAction,
}: {
  state: GameState
  applyAction: (state: GameState, action: GameAction) => GameState
}): AutomaticTurnAdvanceResult => {
  if (!initial.autoAdvanceBeginningOfTurnPaused)
    return { state: initial, actions: [], stoppedForInteraction: false }
  if (requiresPlayerInteraction(initial))
    return { state: initial, actions: [], stoppedForInteraction: true }

  if (initial.turnState.step === 'MAIN_1')
    return {
      state: withBeginningAutoAdvancePaused(initial, false),
      actions: [],
      stoppedForInteraction: false,
    }

  if (
    initial.turnState.step !== 'UNTAP' &&
    initial.turnState.step !== 'UPKEEP' &&
    initial.turnState.step !== 'DRAW'
  )
    return {
      state: withBeginningAutoAdvancePaused(initial, false),
      actions: [],
      stoppedForInteraction: false,
    }

  let state = initial
  const actions: GameAction[] = []
  while (state.turnState.step !== 'MAIN_1') {
    state = applyAction(state, { type: 'ADVANCE_STEP' })
    actions.push({ type: 'ADVANCE_STEP' })
    if (requiresPlayerInteraction(state))
      return {
        state: withBeginningAutoAdvancePaused(state, true),
        actions,
        stoppedForInteraction: true,
      }
  }

  return {
    state: withBeginningAutoAdvancePaused(state, false),
    actions,
    stoppedForInteraction: false,
  }
}

/**
 * Runs only the beginning-of-turn bookkeeping steps. `applyAction` is supplied
 * by the store so each transition still derives events, triggers and SBAs.
 */
export const advanceUntilPlayerInteraction = ({
  state: initial,
  startAction,
  applyAction,
}: {
  state: GameState
  startAction: AutomaticTurnStartAction
  applyAction: (state: GameState, action: GameAction) => GameState
}): AutomaticTurnAdvanceResult => {
  if (requiresPlayerInteraction(initial))
    return { state: initial, actions: [], stoppedForInteraction: true }

  let state = applyAction(initial, startAction)
  const actions: GameAction[] = [startAction]
  if (requiresPlayerInteraction(state))
    return {
      state: withBeginningAutoAdvancePaused(state, true),
      actions,
      stoppedForInteraction: true,
    }

  while (state.turnState.step !== 'MAIN_1') {
    state = applyAction(state, { type: 'ADVANCE_STEP' })
    actions.push({ type: 'ADVANCE_STEP' })
    if (requiresPlayerInteraction(state))
      return {
        state: withBeginningAutoAdvancePaused(state, true),
        actions,
        stoppedForInteraction: true,
      }
  }
  return {
    state: withBeginningAutoAdvancePaused(state, false),
    actions,
    stoppedForInteraction: false,
  }
}

export type AutomaticTurnPassStop =
  | { kind: 'INTERACTION'; message: string }
  | { kind: 'BLOCKER_DECLARATION'; message: string }
  | { kind: 'RULE'; code: string; message: string }

export type AutomaticTurnPassResult = AutomaticTurnAdvanceResult & {
  completedTurn: boolean
  stop?: AutomaticTurnPassStop
}

/**
 * Implements the tabletop shortcut "pass turn" without skipping turn-based
 * actions. It advances only through deterministic state and stops whenever a
 * player must make a real choice. The atomic NEXT_TURN engine action remains a
 * low-level primitive; this function is the high-level table shortcut.
 */
export const advanceTurnPassUntilPlayerInteraction = ({
  state: initial,
  applyAction,
}: {
  state: GameState
  applyAction: (state: GameState, action: GameAction) => GameState
}): AutomaticTurnPassResult => {
  if (requiresPlayerInteraction(initial))
    return {
      state: initial,
      actions: [],
      stoppedForInteraction: true,
      completedTurn: false,
      stop: {
        kind: 'INTERACTION',
        message:
          'Resuelve la interacción pendiente antes de terminar el turno.',
      },
    }

  const startingTurn = initial.turn
  let state = initial
  const actions: GameAction[] = []

  const completedTurn = () => state.turn > startingTurn
  const stopForInteraction = (message: string): AutomaticTurnPassResult => ({
    state:
      completedTurn() &&
      (state.turnState.step === 'UNTAP' ||
        state.turnState.step === 'UPKEEP' ||
        state.turnState.step === 'DRAW')
        ? withBeginningAutoAdvancePaused(state, true)
        : state,
    actions,
    stoppedForInteraction: true,
    completedTurn: completedTurn(),
    stop: { kind: 'INTERACTION', message },
  })
  const apply = (action: GameAction): void => {
    state = applyAction(state, action)
    actions.push(action)
  }

  for (let guard = 0; guard < 48; guard += 1) {
    if (completedTurn() && state.turnState.step === 'MAIN_1')
      return {
        state: withBeginningAutoAdvancePaused(state, false),
        actions,
        stoppedForInteraction: false,
        completedTurn: true,
      }

    if (requiresPlayerInteraction(state))
      return stopForInteraction(
        completedTurn()
          ? `El nuevo turno se detuvo en ${state.turnState.step} por una interacción.`
          : `El turno se detuvo en ${state.turnState.step} por una interacción.`,
      )

    switch (state.turnState.step) {
      case 'UNTAP':
      case 'UPKEEP':
      case 'DRAW':
      case 'MAIN_1':
      case 'BEGIN_COMBAT':
      case 'MAIN_2':
      case 'END_STEP': {
        apply({ type: 'ADVANCE_STEP' })
        break
      }

      case 'DECLARE_ATTACKERS': {
        if (!state.combatState.attackersDeclared) {
          const requirement = validateAttackRequirements(state, [])
          if (!requirement.legal)
            return {
              state,
              actions,
              stoppedForInteraction: true,
              completedTurn: false,
              stop: {
                kind: 'RULE',
                code: requirement.code,
                message: requirement.message,
              },
            }
          apply({
            type: 'DECLARE_ATTACKERS',
            actorPlayerId: activePlayerIdOf(state),
            attackers: [],
            eventGroupId: `attack-${state.turn}-pass-turn`,
          })
          if (requiresPlayerInteraction(state))
            return stopForInteraction(
              'Declarar cero atacantes creó una interacción que debe resolverse.',
            )
        }
        apply({ type: 'ADVANCE_STEP' })
        break
      }

      case 'DECLARE_BLOCKERS': {
        if (!state.combatState.blockersDeclared) {
          if (state.combatState.attackers.length === 0) {
            apply({ type: 'ADVANCE_STEP' })
            break
          }
          return {
            state,
            actions,
            stoppedForInteraction: true,
            completedTurn: false,
            stop: {
              kind: 'BLOCKER_DECLARATION',
              message:
                'El jugador defensor debe declarar bloqueadores antes de continuar.',
            },
          }
        }
        apply({ type: 'ADVANCE_STEP' })
        break
      }

      case 'COMBAT_DAMAGE': {
        if (state.combatState.damageStep === 'COMPLETE') {
          apply({ type: 'ADVANCE_STEP' })
          break
        }
        const plan = planCombatDamage(state)
        if (plan.type === 'ERROR')
          return {
            state,
            actions,
            stoppedForInteraction: true,
            completedTurn: false,
            stop: { kind: 'RULE', code: plan.code, message: plan.message },
          }
        if (plan.type === 'DECISION') {
          apply({ type: 'ADD_PENDING_DECISION', decision: plan.decision })
          return stopForInteraction(
            'El daño de combate necesita una decisión antes de continuar.',
          )
        }
        for (const action of plan.actions) apply(action)
        if (requiresPlayerInteraction(state))
          return stopForInteraction(
            'El daño de combate creó una interacción que debe resolverse.',
          )
        break
      }

      case 'END_COMBAT': {
        apply({ type: 'ADVANCE_STEP' })
        break
      }

      case 'CLEANUP': {
        // Entering cleanup already ran cleanup turn-based actions and produced
        // any cleanup discard decision through the normal store pipeline. Only
        // when cleanup is stable may the next turn actually begin.
        apply({ type: 'NEXT_TURN' })
        break
      }
    }

    if (requiresPlayerInteraction(state))
      return stopForInteraction(
        completedTurn()
          ? `El nuevo turno se detuvo en ${state.turnState.step} por una interacción.`
          : `El turno se detuvo en ${state.turnState.step} por una interacción.`,
      )
  }

  return {
    state,
    actions,
    stoppedForInteraction: true,
    completedTurn: completedTurn(),
    stop: {
      kind: 'RULE',
      code: 'TURN_ADVANCE_LIMIT',
      message: 'El avance automático del turno alcanzó el límite de seguridad.',
    },
  }
}

export type AutomaticStepAdvanceResult = AutomaticTurnAdvanceResult & {
  reachedTarget: boolean
  stopMessage?: string
}

/**
 * Advances to an explicitly requested step one transition at a time. Unlike
 * the legacy resolver plan, this never crosses a newly-created interaction and
 * never invents combat declarations just to reach a later phase.
 */
export const advanceToStepUntilPlayerInteraction = ({
  state: initial,
  targetStep,
  applyAction,
}: {
  state: GameState
  targetStep: TurnStep
  applyAction: (state: GameState, action: GameAction) => GameState
}): AutomaticStepAdvanceResult => {
  if (initial.turnState.step === targetStep)
    return {
      state: initial,
      actions: [],
      stoppedForInteraction: false,
      reachedTarget: true,
    }
  if (requiresPlayerInteraction(initial))
    return {
      state: initial,
      actions: [],
      stoppedForInteraction: true,
      reachedTarget: false,
      stopMessage:
        'Resuelve la interacción pendiente antes de avanzar de paso.',
    }

  let state = initial
  const actions: GameAction[] = []
  const apply = (action: GameAction): void => {
    state = applyAction(state, action)
    actions.push(action)
  }

  for (let guard = 0; guard < 32; guard += 1) {
    if (state.turnState.step === targetStep)
      return {
        state,
        actions,
        stoppedForInteraction: false,
        reachedTarget: true,
      }
    if (requiresPlayerInteraction(state))
      return {
        state,
        actions,
        stoppedForInteraction: true,
        reachedTarget: false,
        stopMessage: `El avance se detuvo en ${state.turnState.step} por una interacción.`,
      }

    if (
      state.turnState.step === 'DECLARE_ATTACKERS' &&
      !state.combatState.attackersDeclared
    )
      return {
        state,
        actions,
        stoppedForInteraction: true,
        reachedTarget: false,
        stopMessage:
          'Debes declarar atacantes antes de avanzar más allá de este paso.',
      }

    if (
      state.turnState.step === 'DECLARE_BLOCKERS' &&
      state.combatState.attackers.length > 0 &&
      !state.combatState.blockersDeclared
    )
      return {
        state,
        actions,
        stoppedForInteraction: true,
        reachedTarget: false,
        stopMessage:
          'El jugador defensor debe declarar bloqueadores antes de avanzar.',
      }

    if (
      state.turnState.step === 'COMBAT_DAMAGE' &&
      state.combatState.damageStep !== 'COMPLETE'
    )
      return {
        state,
        actions,
        stoppedForInteraction: true,
        reachedTarget: false,
        stopMessage:
          'Resuelve el daño de combate antes de avanzar más allá de este paso.',
      }

    if (state.turnState.step === 'CLEANUP') apply({ type: 'NEXT_TURN' })
    else apply({ type: 'ADVANCE_STEP' })

    if (requiresPlayerInteraction(state))
      return {
        state,
        actions,
        stoppedForInteraction: true,
        reachedTarget: state.turnState.step === targetStep,
        stopMessage: `El avance se detuvo en ${state.turnState.step} por una interacción.`,
      }
  }

  return {
    state,
    actions,
    stoppedForInteraction: true,
    reachedTarget: state.turnState.step === targetStep,
    stopMessage: 'El avance de fase alcanzó el límite de seguridad.',
  }
}
