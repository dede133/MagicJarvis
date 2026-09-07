import type { GameState, ManaPool } from '../../types/game'
import type { PlayerId, PlayerState } from '../../types/player'

export const localPlayerIdOf = (state: GameState): PlayerId =>
  state.localPlayerId ??
  state.players?.find((player) => player.isLocal)?.id ??
  'player-1'

export const playerStateFor = (
  state: GameState,
  playerId: PlayerId | undefined,
): PlayerState | undefined => {
  if (!playerId) return undefined
  return (
    state.players?.find((player) => player.id === playerId) ??
    (state.playerState?.id === playerId ? state.playerState : undefined)
  )
}

export const opponentPlayerIds = (
  state: GameState,
  sourcePlayerId: PlayerId = localPlayerIdOf(state),
): PlayerId[] => {
  const orderedIds = state.turnOrder?.length
    ? state.turnOrder
    : (state.players?.map((player) => player.id) ?? [])
  const ids = orderedIds.filter(
    (id, index, all) => id !== sourcePlayerId && all.indexOf(id) === index,
  )
  if (ids.length) return ids
  const playerIds = (state.players ?? [])
    .map((player) => player.id)
    .filter(
      (id, index, all) => id !== sourcePlayerId && all.indexOf(id) === index,
    )
  return playerIds.length ? playerIds : ['player-2']
}

export const controllerLabelForPlayer = (
  state: GameState,
  playerId: PlayerId | undefined,
): 'YOU' | 'OPPONENT' =>
  !playerId || playerId === localPlayerIdOf(state) ? 'YOU' : 'OPPONENT'

export const activePlayerIdOf = (state: GameState): PlayerId =>
  state.activePlayerId ??
  (state.activePlayer === 'local'
    ? localPlayerIdOf(state)
    : (opponentPlayerIds(state)[0] ?? 'player-2'))

export const nextTurnPlayerId = (state: GameState): PlayerId => {
  const queued = state.extraTurnQueue?.[0]
  if (queued) return queued
  const order = state.turnOrder?.length
    ? state.turnOrder
    : (state.players?.map((player) => player.id) ?? [
        localPlayerIdOf(state),
        'player-2',
      ])
  if (!order.length) return localPlayerIdOf(state)
  const active = activePlayerIdOf(state)
  const index = order.indexOf(active)
  return (
    order[(index < 0 ? 0 : index + 1) % order.length] ?? localPlayerIdOf(state)
  )
}

/**
 * Updates canonical players[] and mirrors the legacy single-player fields so
 * old UI/tests remain valid while multiplayer-aware rules use stable ids.
 */
export const updatePlayer = (
  state: GameState,
  playerId: PlayerId,
  update: (player: PlayerState) => PlayerState,
): GameState => {
  const localId = localPlayerIdOf(state)
  const existingPlayers = state.players?.length
    ? state.players
    : [
        state.playerState ?? {
          id: localId,
          isLocal: true,
          life: state.life,
          manaPool: state.manaPool,
        },
        {
          id: 'player-2',
          life: state.opponentLife,
          manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
        },
      ]
  const found = existingPlayers.some((player) => player.id === playerId)
  const seed: PlayerState = {
    id: playerId,
    life: playerId === localId ? state.life : 40,
    manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
  }
  const players = found
    ? existingPlayers.map((player) =>
        player.id === playerId ? update(player) : player,
      )
    : [...existingPlayers, update(seed)]
  const local = players.find((player) => player.id === localId)
  const firstOpponent = players.find((player) => player.id !== localId)
  return {
    ...state,
    players,
    ...(local
      ? {
          playerState: local,
          life: local.life,
          manaPool: local.manaPool,
          landPlaysUsedThisTurn:
            local.landPlaysUsedThisTurn ?? state.landPlaysUsedThisTurn,
          landPlayLimit: local.landPlayLimit ?? state.landPlayLimit,
          commanderCastsFromCommandZone:
            local.commanderCastsFromCommandZone ??
            state.commanderCastsFromCommandZone,
          hiddenZoneTracking:
            local.hiddenZoneTracking ?? state.hiddenZoneTracking,
          libraryCount: local.libraryCount ?? state.libraryCount,
          handCount: local.handCount ?? state.handCount,
          maxHandSizeOverride:
            local.maxHandSizeOverride ?? state.maxHandSizeOverride,
        }
      : {}),
    ...(firstOpponent ? { opponentLife: firstOpponent.life } : {}),
  }
}

export const playerManaPool = (
  state: GameState,
  playerId: PlayerId,
): ManaPool =>
  playerId === localPlayerIdOf(state)
    ? state.manaPool
    : (playerStateFor(state, playerId)?.manaPool ?? {
        W: 0,
        U: 0,
        B: 0,
        R: 0,
        G: 0,
        C: 0,
      })
