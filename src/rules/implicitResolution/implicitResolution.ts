import type {
  ParsedCommand,
  ResolvedCommand,
} from '../../commands/types/commandTypes'
import type { GameState } from '../../types/game'

export type TabletopExecutionResult =
  | {
      status: 'executed'
      description: string
      implicitResolutions: string[]
    }
  | {
      status: 'paused'
      description: string
      implicitResolutions: string[]
    }
  | { status: 'undo'; description: string }
  | {
      status: 'error'
      error: { code: string; message: string }
      implicitResolutions: string[]
    }

const isExplicitResponse = (command: ParsedCommand): boolean =>
  'inResponse' in command && command.inResponse === true

export const usesTabletopImplicitResolution = (
  state: Pick<GameState, 'stackResolutionMode'>,
): boolean => state.stackResolutionMode !== 'STRICT'

const topStackObjectCanResolveImplicitly = (state: GameState): boolean => {
  // Legacy/in-memory games created before stackResolutionMode existed can carry
  // an undefined runtime value even though the current type makes it required.
  // TABLETOP_IMPLICIT is the product default, so only an explicit STRICT value
  // disables implicit stack resolution.
  if (!usesTabletopImplicitResolution(state)) return false
  if (state.pendingDecisions.length > 0 || state.pendingResolutions.length > 0)
    return false
  const top = state.stack.at(-1)
  if (!top) return false
  if (top.kind === 'SPELL') return Boolean(top.spellInstanceId)
  if (
    (top.kind === 'TRIGGERED_ABILITY' || top.kind === 'ACTIVATED_ABILITY') &&
    top.pendingAbilityId
  )
    return state.pendingAbilities.some(
      (ability) => ability.id === top.pendingAbilityId,
    )
  return false
}

const topStackRelevantIds = (state: GameState): Set<string> => {
  const top = state.stack.at(-1)
  if (!top) return new Set()
  return new Set(
    [
      top.stackObjectId,
      top.sourceInstanceId,
      top.spellInstanceId,
      ...(top.targets ?? []),
      ...(top.declaredTargets ?? []).map((target) => target.targetId),
    ].filter((value): value is string => Boolean(value)),
  )
}

const valueReferencesAnyId = (
  value: unknown,
  ids: ReadonlySet<string>,
): boolean => {
  if (typeof value === 'string') return ids.has(value)
  if (Array.isArray(value))
    return value.some((entry) => valueReferencesAnyId(entry, ids))
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some((entry) => valueReferencesAnyId(entry, ids))
}

export const resolvedCommandInteractsWithTopStack = (
  state: GameState,
  resolution: ResolvedCommand,
): boolean => {
  if (resolution.status !== 'resolved') return false
  const relevantIds = topStackRelevantIds(state)
  if (relevantIds.size === 0) return false
  return resolution.actions.some((action) =>
    valueReferencesAnyId(action, relevantIds),
  )
}

const missingPublicObjectCanAppearAfterTopResolves = (
  command: ParsedCommand,
): boolean =>
  [
    'ACTIVATE_ABILITY',
    'ACTIVATE_MANA',
    'TAP_CARD',
    'UNTAP_CARD',
    'MOVE_CARD',
    'DECLARE_ATTACKERS',
    'DECLARE_BLOCKERS',
    'DECLARE_DAMAGE',
  ].includes(command.type)

export const shouldResolveTopBeforeCommand = (
  state: GameState,
  command: ParsedCommand,
  resolution: ResolvedCommand,
): boolean => {
  if (!topStackObjectCanResolveImplicitly(state) || isExplicitResponse(command))
    return false
  if (resolution.status === 'error') {
    if (resolution.error.code === 'STACK_NOT_EMPTY') return true
    // A common tabletop sequence is "cast permanent" followed immediately by
    // an action that uses that permanent. Before the spell resolves the resolver
    // correctly cannot find the object on the battlefield. In implicit mode that
    // later, non-response declaration means priority was passed: resolve the top
    // object, rebuild public state, then retry the original command.
    return (
      resolution.error.code === 'CARD_NOT_FOUND' &&
      missingPublicObjectCanAppearAfterTopResolves(command)
    )
  }
  if (resolution.status !== 'resolved') return false
  return !resolvedCommandInteractsWithTopStack(state, resolution)
}

/**
 * Existing objects below the resolved spell are precisely the objects that we
 * may continue resolving. Only newly-created stack objects or decisions pause
 * tabletop resolution.
 */
export const requiresAttentionAfterImplicitResolution = (
  before: GameState,
  after: GameState,
): boolean => {
  const newDecision = after.pendingDecisions.some(
    (item) =>
      !before.pendingDecisions.some((previous) => previous.id === item.id),
  )
  const newResolution = after.pendingResolutions.some(
    (item) =>
      !before.pendingResolutions.some((previous) => previous.id === item.id),
  )
  if (newDecision || newResolution) return true

  return after.pendingAbilities.some(
    (item) =>
      !before.pendingAbilities.some((previous) => previous.id === item.id) &&
      !after.stack.some((object) => object.pendingAbilityId === item.id),
  )
}
