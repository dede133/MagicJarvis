import type { HiddenZoneTracking, ManaPool } from './game'

/** Stable, serializable identity for a participant in a game. */
export type PlayerId = string

/**
 * Public/player-scoped state. Hidden-zone identities are deliberately absent:
 * only optional counts are stored when the table chooses to track them.
 */
export type PlayerState = {
  id: PlayerId
  name?: string
  isLocal?: boolean
  life: number
  manaPool: ManaPool
  hiddenZoneTracking?: HiddenZoneTracking
  libraryCount?: number
  handCount?: number
  maxHandSizeOverride?: number | 'UNLIMITED'
  landPlaysUsedThisTurn?: number
  landPlayLimit?: number
  commanderCastsFromCommandZone?: Record<string, number>
}
