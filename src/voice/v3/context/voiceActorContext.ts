import { deckDefinitionForPlayer } from '../../../game/deckLookup'
import {
  activePlayerIdOf,
  localPlayerIdOf,
  opponentPlayerIds,
} from '../../../rules/players/playerState'
import type { GameState } from '../../../types/game'
import type { DeckDefinition } from '../../../types/deck'
import type { PlayerId } from '../../../types/player'

type VoiceActorDeckState = Pick<
  GameState,
  | 'activePlayerId'
  | 'deckDefinition'
  | 'deckDefinitionsByPlayer'
  | 'localPlayerId'
>

/**
 * Single source of truth for the player whose tabletop action Voice V3 is
 * interpreting. Normal actions belong to the active player; blocking belongs
 * to the defending player because Magic keeps the attacking player active
 * during DECLARE_BLOCKERS.
 */
export const voiceActorPlayerId = (state: GameState): PlayerId =>
  activePlayerIdOf(state)

export const voiceBlockingPlayerId = (state: GameState): PlayerId => {
  const attackingPlayerId =
    state.combatState.attackingPlayerStableId ?? activePlayerIdOf(state)
  return (
    opponentPlayerIds(state, attackingPlayerId)[0] ?? localPlayerIdOf(state)
  )
}

export const voiceStackObjectControlledByPlayer = (
  state: GameState,
  stackObject: GameState['stack'][number],
  playerId: PlayerId = voiceActorPlayerId(state),
): boolean => {
  if (stackObject.controllerId) return stackObject.controllerId === playerId
  const localPlayerId = localPlayerIdOf(state)
  return playerId === localPlayerId
    ? stackObject.controller === 'YOU'
    : stackObject.controller === 'OPPONENT'
}

export const voiceActorDeckDefinition = (
  state: VoiceActorDeckState,
): DeckDefinition | undefined =>
  deckDefinitionForPlayer(
    state,
    state.activePlayerId ?? state.localPlayerId ?? 'player-1',
  )

export const voiceActorControlsCard = (
  state: GameState,
  card: GameState['cards'][number],
  playerId: PlayerId = voiceActorPlayerId(state),
): boolean => {
  if (card.controllerId) return card.controllerId === playerId
  const localPlayerId = localPlayerIdOf(state)
  return playerId === localPlayerId
    ? card.controller !== 'OPPONENT'
    : card.controller === 'OPPONENT'
}

export const voiceActorOwnsCard = (
  state: GameState,
  card: GameState['cards'][number],
  playerId: PlayerId = voiceActorPlayerId(state),
): boolean => {
  if (card.ownerId) return card.ownerId === playerId
  return voiceActorControlsCard(state, card, playerId)
}
