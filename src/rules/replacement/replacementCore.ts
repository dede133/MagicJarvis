import type { GameAction } from '../../actions/gameActions'
import type { GameState } from '../../types/game'
import type { ReplacementEffect } from './replacementTypes'
import { deriveActiveStaticEffects } from '../../abilities/engine/staticEffects'

export type ReplacementPlan = {
  effect: ReplacementEffect
  markerActions: GameAction[]
  originalAction: GameAction
  replacementActions: GameAction[]
}

const replacementIds = (action: GameAction): string[] => {
  if (
    action.type === 'MOVE_CARD' ||
    action.type === 'CREATE_TOKEN' ||
    action.type === 'CREATE_TOKEN_COPY'
  )
    return action.appliedReplacementIds ?? []
  return []
}

const tagged = (action: GameAction, effectId: string): GameAction => {
  const ids = Array.from(new Set([...replacementIds(action), effectId]))
  if (action.type === 'MOVE_CARD')
    return { ...action, appliedReplacementIds: ids }
  if (action.type === 'CREATE_TOKEN')
    return { ...action, appliedReplacementIds: ids }
  if (action.type === 'CREATE_TOKEN_COPY')
    return { ...action, appliedReplacementIds: ids }
  return action
}

const sourceIsActive = (
  state: GameState,
  effect: ReplacementEffect,
): boolean => {
  if (effect.duration === 'PERSISTENT') return true
  if (effect.duration === 'WHILE_SUBJECT_ON_STACK') {
    const subjectInstanceId =
      effect.event.type === 'MOVE_CARD'
        ? effect.event.subjectInstanceId
        : undefined
    return Boolean(
      subjectInstanceId &&
      state.cards.some(
        (card) =>
          card.instanceId === subjectInstanceId && card.zone === 'stack',
      ),
    )
  }
  return state.cards.some(
    (card) =>
      card.instanceId === effect.sourceInstanceId &&
      card.zone === 'battlefield',
  )
}

const matchesAction = (
  effect: ReplacementEffect,
  action: GameAction,
): boolean => {
  if (replacementIds(action).includes(effect.id)) return false
  if (
    effect.event.type === 'CREATE_TOKENS' &&
    (action.type === 'CREATE_TOKEN' || action.type === 'CREATE_TOKEN_COPY')
  )
    return action.amount > 0
  if (effect.event.type !== 'MOVE_CARD' || action.type !== 'MOVE_CARD')
    return false
  if (effect.event.toZone && action.toZone !== effect.event.toZone) return false
  if (
    effect.event.subjectInstanceId &&
    action.instanceId !== effect.event.subjectInstanceId
  )
    return false
  return true
}

const replacementActions = (
  state: GameState,
  effect: ReplacementEffect,
  action: GameAction,
): GameAction[] | undefined => {
  if (effect.replacement.type === 'MOVE_CARD') {
    if (action.type !== 'MOVE_CARD') return undefined
    return [
      tagged(
        {
          ...action,
          toZone: effect.replacement.toZone,
        },
        effect.id,
      ),
      ...(effect.consumeOnApply
        ? ([
            {
              type: 'REMOVE_REPLACEMENT_EFFECT',
              replacementEffectId: effect.id,
            },
          ] as const)
        : []),
    ]
  }
  if (action.type !== 'CREATE_TOKEN' && action.type !== 'CREATE_TOKEN_COPY')
    return undefined
  const source = state.cards.find(
    (card) => card.instanceId === effect.sourceInstanceId,
  )
  const attachedTo = source?.attachedToInstanceId
  if (!attachedTo) return undefined
  const attached = state.cards.find(
    (card) => card.instanceId === attachedTo && card.zone === 'battlefield',
  )
  if (!attached) return undefined
  return [
    tagged(
      {
        type: 'CREATE_TOKEN_COPY',
        sourceInstanceId: attached.instanceId,
        amount: action.amount,
        controllerId: attached.controllerId ?? state.localPlayerId,
      },
      effect.id,
    ),
  ]
}

/**
 * Finds the next replacement applicable to an action before that action happens.
 * Applied replacement ids travel with the rewritten action so one effect cannot
 * replace the same event twice. Other effects may still replace the rewritten event.
 */
export const planReplacement = (
  state: GameState,
  action: GameAction,
): ReplacementPlan | undefined => {
  const derived: ReplacementEffect[] = (
    deriveActiveStaticEffects(state).tokenReplacementModifiers ?? []
  ).map((modifier) => ({
    id: `static-token-replacement:${modifier.sourceInstanceId}`,
    sourceInstanceId: modifier.sourceInstanceId,
    optional: modifier.optional,
    firstTimeEachTurn: true,
    duration: 'WHILE_SOURCE_ON_BATTLEFIELD',
    event: { type: 'CREATE_TOKENS' },
    replacement: { type: 'CREATE_TOKEN_COPIES_OF_ATTACHED_PERMANENT' },
  }))
  const effect = [...(state.replacementEffects ?? []), ...derived].find(
    (candidate) =>
      sourceIsActive(state, candidate) &&
      (!candidate.firstTimeEachTurn ||
        state.perTurnEventMarkers?.[`REPLACEMENT:${candidate.id}`] !==
          state.turn) &&
      matchesAction(candidate, action),
  )
  if (!effect) return undefined
  const replacement = replacementActions(state, effect, action)
  if (!replacement) return undefined
  const markerActions: GameAction[] = effect.firstTimeEachTurn
    ? [
        {
          type: 'SET_PER_TURN_EVENT_MARKER',
          key: `REPLACEMENT:${effect.id}`,
          turn: state.turn,
        },
      ]
    : []
  return {
    effect,
    markerActions,
    originalAction: tagged(action, effect.id),
    replacementActions: replacement,
  }
}
