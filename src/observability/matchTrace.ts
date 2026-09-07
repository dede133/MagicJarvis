import type { ParsedCommand } from '../commands/types/commandTypes'
import type { GameState, GameActionSource } from '../types/game'
import type { PlayerId } from '../types/player'

export type TabletopCommandContext = {
  source?: GameActionSource
  actorPlayerId?: PlayerId
  rawInput?: string
  normalizedInput?: string
  provider?: string
  confidence?: number
}

export type MatchActionTrace = {
  actionId: string
  type: string
  description: string
  timestamp: number
}

export type MatchStateSummary = {
  turn: number
  step: GameState['turnState']['step']
  activePlayerId: PlayerId
  gameStatus: GameState['gameStatus']
  players: Array<{
    id: PlayerId
    life: number
    handCount: number
    libraryCount: number
    manaPool: GameState['manaPool']
  }>
  stack: Array<{
    stackObjectId: string
    kind: GameState['stack'][number]['kind']
    sourceInstanceId: string
    cardName?: string
  }>
  pending: {
    abilities: number
    resolutions: number
    decisions: number
  }
  battlefield: Array<{
    instanceId: string
    name: string
    controllerId?: PlayerId
    tapped: boolean
  }>
}

export type MatchTransactionStatus =
  'EXECUTED' | 'PAUSED' | 'ERROR' | 'UNDO' | 'MUTATION'

export type MatchTransaction = {
  id: string
  startedAt: number
  finishedAt: number
  source: GameActionSource
  actorPlayerId: PlayerId
  commandType: string
  command?: ParsedCommand
  rawInput?: string
  normalizedInput?: string
  provider?: string
  confidence?: number
  status: MatchTransactionStatus
  description?: string
  error?: { code: string; message: string }
  implicitResolutions: string[]
  actions: MatchActionTrace[]
  before: MatchStateSummary
  after: MatchStateSummary
}

const stackCardName = (
  state: GameState,
  object: GameState['stack'][number],
): string | undefined => {
  const instanceId = object.spellInstanceId ?? object.sourceInstanceId
  return state.cards.find((card) => card.instanceId === instanceId)?.card.name
}

export const summarizeGameState = (state: GameState): MatchStateSummary => ({
  turn: state.turn,
  step: state.turnState.step,
  activePlayerId: state.activePlayerId,
  gameStatus: state.gameStatus,
  players: state.players.map((player) => ({
    id: player.id,
    life: player.life,
    handCount: player.handCount ?? 0,
    libraryCount: player.libraryCount ?? 0,
    manaPool: { ...player.manaPool },
  })),
  stack: [...state.stack]
    .sort((left, right) => right.order - left.order)
    .map((object) => ({
      stackObjectId: object.stackObjectId,
      kind: object.kind,
      sourceInstanceId: object.sourceInstanceId,
      cardName: stackCardName(state, object),
    })),
  pending: {
    abilities: state.pendingAbilities.length,
    resolutions: state.pendingResolutions.length,
    decisions: state.pendingDecisions.length,
  },
  battlefield: state.cards
    .filter((card) => card.zone === 'battlefield' && !card.phasedOut)
    .map((card) => ({
      instanceId: card.instanceId,
      name: card.card.name,
      controllerId: card.controllerId,
      tapped: card.tapped,
    })),
})

export const serializeMatchLog = (
  state: GameState,
  transactions: readonly MatchTransaction[],
): string =>
  JSON.stringify(
    {
      format: 'MagicJarvis MATCH_LOG',
      schemaVersion: 1,
      exportedAt: Date.now(),
      finalState: summarizeGameState(state),
      transactions,
    },
    null,
    2,
  )
