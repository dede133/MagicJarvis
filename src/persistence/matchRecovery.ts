import type { MatchTransaction } from '../observability/matchTrace'
import type { GameState } from '../types/game'

export const MATCH_RECOVERY_SCHEMA_VERSION = 1 as const
export const MATCH_RECOVERY_STORAGE_KEY =
  'magicjarvis:match-recovery:v1' as const
export const MAX_RECOVERY_TRANSACTIONS = 500

export type MatchRecoverySnapshot = {
  schemaVersion: typeof MATCH_RECOVERY_SCHEMA_VERSION
  savedAt: number
  game: GameState
  transactions: MatchTransaction[]
}

const browserStorage = (): Storage | undefined => {
  try {
    return typeof globalThis.localStorage === 'undefined'
      ? undefined
      : globalThis.localStorage
  } catch {
    return undefined
  }
}

export const isRecoverableMatch = (game: GameState): boolean =>
  Boolean(
    game.deckDefinition ||
    Object.keys(game.deckDefinitionsByPlayer ?? {}).length ||
    game.history.length ||
    game.cards.length > 0,
  )

const isRecoverySnapshot = (value: unknown): value is MatchRecoverySnapshot => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MatchRecoverySnapshot>
  return (
    candidate.schemaVersion === MATCH_RECOVERY_SCHEMA_VERSION &&
    typeof candidate.savedAt === 'number' &&
    Boolean(candidate.game) &&
    Array.isArray(candidate.transactions) &&
    Array.isArray(candidate.game?.players) &&
    Array.isArray(candidate.game?.cards) &&
    Array.isArray(candidate.game?.stack) &&
    Boolean(candidate.game?.turnState)
  )
}

export const loadMatchRecoverySnapshot = ():
  MatchRecoverySnapshot | undefined => {
  const storage = browserStorage()
  if (!storage) return undefined
  try {
    const raw = storage.getItem(MATCH_RECOVERY_STORAGE_KEY)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (!isRecoverySnapshot(parsed)) {
      storage.removeItem(MATCH_RECOVERY_STORAGE_KEY)
      return undefined
    }
    return {
      ...parsed,
      transactions: parsed.transactions.slice(-MAX_RECOVERY_TRANSACTIONS),
    }
  } catch {
    try {
      storage.removeItem(MATCH_RECOVERY_STORAGE_KEY)
    } catch {
      // Ignore storage failures while discarding an unreadable snapshot.
    }
    return undefined
  }
}

export const saveMatchRecoverySnapshot = (
  game: GameState,
  transactions: readonly MatchTransaction[],
): boolean => {
  if (!isRecoverableMatch(game)) return false
  const storage = browserStorage()
  if (!storage) return false
  const transactionLimits = [MAX_RECOVERY_TRANSACTIONS, 100, 0] as const
  for (const limit of transactionLimits) {
    const snapshot: MatchRecoverySnapshot = {
      schemaVersion: MATCH_RECOVERY_SCHEMA_VERSION,
      savedAt: Date.now(),
      game,
      transactions: limit === 0 ? [] : transactions.slice(-limit),
    }
    try {
      storage.setItem(MATCH_RECOVERY_STORAGE_KEY, JSON.stringify(snapshot))
      return true
    } catch {
      // Prefer a recoverable GameState over losing the save because verbose
      // diagnostics exceeded the browser's storage quota.
    }
  }
  return false
}

export const clearMatchRecoverySnapshot = (): void => {
  const storage = browserStorage()
  if (!storage) return
  try {
    storage.removeItem(MATCH_RECOVERY_STORAGE_KEY)
  } catch {
    // Recovery is best-effort and must never make the tabletop runtime fail.
  }
}
