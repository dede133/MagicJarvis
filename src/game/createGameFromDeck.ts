import { applyGameAction, createInitialGameState } from '../engine/gameEngine'
import type { CardInstance } from '../types/card'
import { getResolvedDeckCommanders } from '../types/deck'
import type { DeckCard, DeckDefinition } from '../types/deck'
import type { GameState } from '../types/game'
import type { PlayerId, PlayerState } from '../types/player'
import { updatePlayer, localPlayerIdOf } from '../rules/players/playerState'
import { turnStateFor } from '../types/turn'

const createInstances = (
  entry: DeckCard,
  zone: CardInstance['zone'],
  prefix: string,
  playerId: PlayerId,
): CardInstance[] =>
  Array.from({ length: entry.quantity }, (_, index) => ({
    instanceId: `${prefix}-${entry.card.scryfallId}-${index + 1}`,
    card: entry.card,
    zone,
    tapped: false,
    counters: {},
    ownerId: playerId,
    controllerId: playerId,
    ...(playerId !== 'player-1' ? { controller: 'OPPONENT' as const } : {}),
  }))

const libraryCountFor = (deck: DeckDefinition): number =>
  deck.mainboard.reduce((total, entry) => total + entry.quantity, 0)

const playerForDeck = (
  id: PlayerId,
  name: string,
  deck: DeckDefinition,
  isLocal = false,
): PlayerState => ({
  id,
  name,
  ...(isLocal ? { isLocal: true } : {}),
  life: 40,
  manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
  hiddenZoneTracking: 'UNTRACKED',
  libraryCount: libraryCountFor(deck),
  handCount: 0,
  landPlaysUsedThisTurn: 0,
  landPlayLimit: 1,
  commanderCastsFromCommandZone: {},
})

export type TwoPlayerMatchSetup = {
  player1Deck: DeckDefinition
  player2Deck: DeckDefinition
  startingPlayerId?: PlayerId
}

/** Creates a two-seat physical-table state without inventing either player's hidden zones. */
export const createGameFromMatch = ({
  player1Deck,
  player2Deck,
  startingPlayerId = 'player-1',
}: TwoPlayerMatchSetup): GameState => {
  const player1Commanders = getResolvedDeckCommanders(player1Deck).flatMap(
    (entry, index) =>
      createInstances(entry, 'command', `player-1-commander-${index + 1}`, 'player-1'),
  )
  const player2Commanders = getResolvedDeckCommanders(player2Deck).flatMap(
    (entry, index) =>
      createInstances(entry, 'command', `player-2-commander-${index + 1}`, 'player-2'),
  )
  const cards = [...player1Commanders, ...player2Commanders]
  const base = createInitialGameState(cards, player1Deck)
  const players = [
    playerForDeck('player-1', player1Deck.name, player1Deck, true),
    playerForDeck('player-2', player2Deck.name, player2Deck),
  ]
  const validStarter = players.some((player) => player.id === startingPlayerId)
    ? startingPlayerId
    : 'player-1'
  const player1CommanderIds = player1Commanders.map((card) => card.instanceId)
  const player2CommanderIds = player2Commanders.map((card) => card.instanceId)
  const player1 = players[0]
  return {
    ...base,
    localPlayerId: 'player-1',
    players,
    playerState: player1,
    activePlayerId: validStarter,
    activePlayer: validStarter === 'player-1' ? 'local' : 'opponent',
    turnOrder: ['player-1', 'player-2'],
    life: player1.life,
    opponentLife: players[1].life,
    libraryCount: player1.libraryCount ?? 0,
    handCount: player1.handCount ?? 0,
    deckDefinition: player1Deck,
    deckDefinitionsByPlayer: {
      'player-1': player1Deck,
      'player-2': player2Deck,
    },
    commanderIds: player1CommanderIds,
    commanderId: player1CommanderIds[0],
    commanderIdsByPlayer: {
      'player-1': player1CommanderIds,
      'player-2': player2CommanderIds,
    },
  }
}

/** Creates the digital parallel state for the legacy single-deck entry point. */
export const createGameFromDeck = (deck: DeckDefinition): GameState => {
  const commanders = getResolvedDeckCommanders(deck).flatMap((entry, index) =>
    createInstances(entry, 'command', `commander-${index + 1}`, 'player-1'),
  )
  const libraryCount = libraryCountFor(deck)
  const state = createInitialGameState(commanders, deck)
  const synced = updatePlayer(state, localPlayerIdOf(state), (player) => ({
    ...player,
    libraryCount,
  }))
  const commanderIds = commanders.map((card) => card.instanceId)
  return {
    ...synced,
    commanderIds,
    commanderId: commanderIds[0],
    commanderIdsByPlayer: { [localPlayerIdOf(synced)]: commanderIds },
    deckDefinitionsByPlayer: { [localPlayerIdOf(synced)]: deck },
  }
}

const advanceToFirstMain = (initial: GameState): GameState => {
  const state = applyGameAction(initial, { type: 'START_TURN' })
  return {
    ...state,
    turnState: turnStateFor('MAIN_1'),
    cardsDrawnThisTurnByPlayer: {
      ...(state.cardsDrawnThisTurnByPlayer ?? {}),
      [state.activePlayerId]: 0,
    },
  }
}

/** Starts a configured 1v1 match at the selected player's first main phase. */
export const createStartedGameFromMatch = (
  setup: TwoPlayerMatchSetup,
): GameState => advanceToFirstMain(createGameFromMatch(setup))

/** Backwards-compatible single-deck UI/test helper. */
export const createStartedGameFromDeck = (deck: DeckDefinition): GameState =>
  advanceToFirstMain(createGameFromDeck(deck))
