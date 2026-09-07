import type { GameState } from '../../types/game'
import type { ManaColor } from '../../types/card'
import type { PlayerId } from '../../types/player'
import { deckDefinitionForPlayer } from '../../game/deckLookup'

/** Stable commander identities for the current game; commanderId remains a legacy alias. */
export const commanderInstanceIds = (
  state: GameState,
  playerId?: PlayerId,
): string[] => {
  if (playerId) {
    const configured = state.commanderIdsByPlayer?.[playerId]
    if (configured?.length) return [...new Set(configured)]
    const localId = state.localPlayerId ?? 'player-1'
    if (playerId !== localId) return []
    const legacy = state.commanderIds?.length
      ? state.commanderIds
      : state.commanderId
        ? [state.commanderId]
        : []
    return [...new Set(legacy)]
  }
  const configuredForAll = Object.values(state.commanderIdsByPlayer ?? {}).flat()
  const legacy = state.commanderIds?.length
    ? state.commanderIds
    : state.commanderId
      ? [state.commanderId]
      : []
  return [...new Set([...configuredForAll, ...legacy])]
}

export const isCommanderInstance = (
  state: GameState,
  instanceId: string | undefined,
): boolean => Boolean(instanceId && commanderInstanceIds(state).includes(instanceId))

export const controlledCommanderIds = (
  state: GameState,
  controllerId: PlayerId,
): string[] =>
  commanderInstanceIds(state).filter((instanceId) =>
    state.cards.some(
      (card) =>
        card.instanceId === instanceId &&
        card.zone === 'battlefield' &&
        (card.controllerId ?? state.localPlayerId ?? 'player-1') === controllerId,
    ),
  )

/** Commander color identity is combined when a deck has multiple commanders. */
export const combinedCommanderColorIdentity = (
  state: GameState,
  playerId: PlayerId = state.localPlayerId ?? 'player-1',
): ManaColor[] => {
  const ids = state.commanderIdsByPlayer?.[playerId] ?? commanderInstanceIds(state)
  const fromInstances = ids.flatMap(
    (instanceId) =>
      state.cards.find((card) => card.instanceId === instanceId)?.card
        .colorIdentity ?? [],
  )
  const deck = deckDefinitionForPlayer(state, playerId)
  const fromDeck = deck
    ? (deck.commanders?.length
        ? deck.commanders
        : [deck.commander]
      ).flatMap((entry) => entry.card.colorIdentity)
    : []
  return [...new Set(fromInstances.length ? fromInstances : fromDeck)]
}
