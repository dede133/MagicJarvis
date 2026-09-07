import {
  deriveActiveStaticEffects,
  derivedMaxHandSize,
} from '../../abilities/engine/staticEffects'
import type { PendingDecision } from '../../abilities/types/abilityTypes'
import type { GameState } from '../../types/game'
import {
  activePlayerIdOf,
  localPlayerIdOf,
  playerStateFor,
} from '../players/playerState'
import { commanderInstanceIds } from '../commander/commanderRules'

/** Cleanup discard is a turn-based action, not a state-based action. */
export const cleanupDiscardDecision = (
  state: GameState,
): PendingDecision | undefined => {
  if (state.turnState.step !== 'CLEANUP') return undefined
  const playerId = activePlayerIdOf(state)
  const player = playerStateFor(state, playerId)
  const isLocal = playerId === localPlayerIdOf(state)
  const tracking =
    player?.hiddenZoneTracking ?? (isLocal ? state.hiddenZoneTracking : undefined)
  if (tracking !== 'COUNTS_ONLY') return undefined

  const handCount = player?.handCount ?? (isLocal ? state.handCount : 0)
  const override =
    player?.maxHandSizeOverride ?? (isLocal ? state.maxHandSizeOverride : undefined)
  const max =
    override ?? derivedMaxHandSize(deriveActiveStaticEffects(state), 7, playerId)
  if (max === 'UNLIMITED' || handCount <= max) return undefined

  const knownHand = state.cards.filter(
    (card) =>
      card.zone === 'hand' &&
      (card.ownerId ?? localPlayerIdOf(state)) === playerId,
  )
  const unknownCount = Math.max(0, handCount - knownHand.length)
  const excess = handCount - max
  return {
    id: `cleanup-discard-${playerId}-${state.turn}-${handCount}-${max}`,
    sourceAbilityId: 'cleanup-hand-size',
    sourceInstanceId: commanderInstanceIds(state, playerId)[0] ?? 'game-rule',
    decisionPlayerId: playerId,
    type: 'CLEANUP_DISCARD_SELECTION',
    prompt: `Cleanup: discard ${excess} card${excess === 1 ? '' : 's'} to your maximum hand size (${max}).`,
    options: [
      ...knownHand.map((card) => ({
        instanceId: card.instanceId,
        label: card.card.name,
      })),
      ...(unknownCount > 0
        ? [{ instanceId: 'UNKNOWN_CARD', label: 'Discard an untracked card' }]
        : []),
    ],
    continuation: {
      effectsToExecute: [],
      resumeEffectIndex: 0,
      cleanupDiscard: { maxHandSize: max },
    },
  }
}
