import type { CardDefinition, CardInstance, ManaColor } from './card'
import type { GameAction } from '../actions/gameActions'
import type { DeckDefinition } from './deck'
import type {
  PendingAbility,
  PendingDecision,
  PendingResolution,
  DelayedEffect,
} from '../abilities/types/abilityTypes'
import type { StackObject } from './stack'
import type { TurnState } from './turn'
import type { CombatState, DamageRecord } from './combat'
import type { CombatPlayerRef } from './combat'
import type { PlayerId, PlayerState } from './player'
import type { BlockingRestriction } from '../abilities/types/abilityTypes'
import type { ReplacementEffect } from '../rules/replacement/replacementTypes'

export type ManaPool = Record<ManaColor, number>
export type HiddenZoneTracking = 'UNTRACKED' | 'COUNTS_ONLY'
/** Controls whether declared spells may use deterministic known mana sources. */
export type AutoManaMode = 'STRICT' | 'SMART' | 'CONFIRM'
export type StackResolutionMode = 'STRICT' | 'TABLETOP_IMPLICIT'
export type GameStatus = 'IN_PROGRESS' | 'LOST' | 'WON' | 'DRAW'
export type GameLossReason =
  'LIFE' | 'EMPTY_LIBRARY' | 'CONCEDED' | 'COMMANDER_DAMAGE'
export type GameActionSource = 'VOICE' | 'TEXT' | 'UI' | 'ENGINE'

export type GameHistoryEntry = {
  actionId: string
  timestamp: number
  transactionId?: string
  source?: GameActionSource
  action: GameAction
  description: string
  turn: number
}

export type GameState = {
  /** Stable local participant identity; absent only in legacy snapshots. */
  localPlayerId?: PlayerId
  /** Legacy bridge for the local player. Canonical multiplayer state lives in players[]. */
  playerState?: PlayerState
  /** Canonical serializable participant state. Public objects reference these stable ids. */
  players: PlayerState[]
  /** Stable active participant; unlike activePlayer this supports N players. */
  activePlayerId: PlayerId
  /** Normal turn order. Extra turns are stored separately and do not mutate this order. */
  turnOrder: PlayerId[]
  life: number
  turn: number
  /** Legacy two-seat projection retained for existing UI/tests. */
  activePlayer: 'local' | 'opponent'
  turnState: TurnState
  /** Beginning-of-turn auto-advance paused for a real player interaction. */
  autoAdvanceBeginningOfTurnPaused?: boolean
  gameStatus: GameStatus
  gameLossReason?: GameLossReason
  manaPool: ManaPool
  autoManaMode: AutoManaMode
  stackResolutionMode: StackResolutionMode
  /** Counts are optional bookkeeping; never evidence that a card is unavailable. */
  hiddenZoneTracking: HiddenZoneTracking
  /** Physical library count only when the player elects to track it. */
  libraryCount: number
  /** Physical hand count only when the player elects to track it. */
  handCount: number
  /** Publicly-known top card only (for example after a revealed tutor). */
  knownLibraryTopInstanceId?: string
  /** Persistent player rule created by one-shot effects; independent of a battlefield source. */
  maxHandSizeOverride?: number | 'UNLIMITED'
  /** Normal land plays declared this turn; effects that put lands down do not use it. */
  landPlaysUsedThisTurn: number
  /** Derived modifiers may change this later; the Commander default is one. */
  landPlayLimit: number
  failedDrawFromEmptyLibrary: boolean
  failedDrawFromEmptyLibraryByPlayer?: Record<PlayerId, boolean>
  commanderCastsFromCommandZone: Record<string, number>
  /** Reserved for Combat Core: keyed by the dealing commander instance. */
  commanderDamageReceivedBySource: Record<string, number>
  /** Commander combat damage, partitioned by the player that received it. */
  commanderDamageByPlayer: Record<CombatPlayerRef, Record<string, number>>
  opponentLife: number
  combatState: CombatState
  damageRecords: DamageRecord[]
  commanderZoneChoiceAcknowledged: Array<{ instanceId: string; zone: string }>
  /** One-shot acknowledgement for the command-zone replacement before a move. */
  commanderReplacementChoiceAcknowledged: Array<{
    instanceId: string
    destination: string
  }>
  /** Only cards whose identity is known or revealed to the player. */
  cards: CardInstance[]
  stack: StackObject[]
  /** Legacy local-player deck recipe. Prefer deckDefinitionsByPlayer for match-aware code. */
  deckDefinition?: DeckDefinition
  /** Static public deck recipes used only for identity/vocabulary, never hidden-zone possession. */
  deckDefinitionsByPlayer?: Record<PlayerId, DeckDefinition>
  /** All commanders for the local deck; commanderId remains the primary legacy alias. */
  commanderIds?: string[]
  commanderId?: string
  /** Commander physical-object ids partitioned by participant. */
  commanderIdsByPlayer?: Record<PlayerId, string[]>
  pendingAbilities: PendingAbility[]
  pendingResolutions: PendingResolution[]
  pendingDecisions: PendingDecision[]
  delayedEffects?: DelayedEffect[]
  linkedObjectGroups?: Array<{
    sourceInstanceId: string
    key: string
    linkedInstanceIds: string[]
    returnOnSourceLeaves?: {
      fromZone: import('./card').Zone
      destination: import('./card').Zone
      controller?: 'OWNER' | 'PRESERVE'
    }
  }>
  temporaryContinuousEffects?: Array<{
    sourceInstanceId: string
    targetInstanceId: string
    power?: number
    toughness?: number
    grantKeywords?: string[]
    duration: 'UNTIL_END_OF_TURN'
  }>
  /** Triggered abilities granted to a specific object until cleanup. */
  temporaryGrantedTriggeredAbilities?: Array<{
    id: string
    sourceInstanceId: string
    targetInstanceId: string
    ability: Omit<
      import('../abilities/types/abilityTypes').TriggeredAbilityDefinition,
      'sourceCardName'
    >
    duration: 'UNTIL_END_OF_TURN'
  }>
  /** Layer-like temporary characteristic changes, applied before P/T modifiers and counters. */
  temporaryCharacteristicEffects?: Array<{
    sourceInstanceId: string
    targetInstanceId: string
    setBasePower?: number
    setBaseToughness?: number
    addCardTypes?: string[]
    removeCardTypes?: string[]
    setCreatureSubtypes?: string[]
    addCreatureSubtypes?: string[]
    setName?: string
    setColors?: ManaColor[]
    loseAllAbilities?: boolean
    duration: 'UNTIL_END_OF_TURN'
  }>
  temporaryProtectionEffects?: Array<{
    sourceInstanceId: string
    targetInstanceId: string
    protectionFromEverything?: boolean
    cardTypes?: string[]
    colors?: ManaColor[]
    duration: 'UNTIL_END_OF_TURN' | 'UNTIL_SOURCE_CONTROLLER_NEXT_TURN'
    expiresAtPlayerId?: PlayerId
  }>
  /** One-shot damage shields created by resolved spells/abilities. */
  damagePreventionEffects?: Array<{
    id: string
    sourceInstanceId: string
    targetInstanceId: string
    remainingAmount?: number
    preventAll?: boolean
    duration: 'UNTIL_END_OF_TURN'
  }>
  /** Temporary player-level rules such as Teferi's Protection / Everybody Lives. */
  playerRuleEffects?: Array<{
    id: string
    sourceInstanceId: string
    playerId: PlayerId
    hexproof?: boolean
    protectionFromEverything?: boolean
    lifeTotalCannotChange?: boolean
    cannotLoseLife?: boolean
    cannotWinOrLose?: boolean
    duration: 'UNTIL_END_OF_TURN' | 'UNTIL_PLAYER_NEXT_TURN'
    createdTurn: number
  }>
  /** Permission produced by airbend; valid only while the exact card remains exiled. */
  airbendPermissions?: Array<{
    cardInstanceId: string
    ownerId: PlayerId
    alternativeManaCost: string
  }>
  /** Mana with a spending restriction; manaPool remains the total visible pool. */
  restrictedMana?: Array<{
    id: string
    playerId: PlayerId
    color: ManaColor
    amount: number
    restriction: 'CREATURE_SPELLS_ONLY'
  }>
  untapRestrictions?: Array<{
    sourceInstanceId: string
    /** Controller whose continuous duration created this restriction. */
    sourceControllerId?: PlayerId
    targetInstanceId: string
    duration: 'WHILE_SOURCE_CONTROLLED'
  }>
  typeContinuousEffects?: Array<{
    sourceInstanceId: string
    targetInstanceId: string
    mode: 'ADD' | 'SET'
    landSubtype: string
    duration: 'UNTIL_END_OF_TURN' | 'WHILE_COUNTER_PRESENT'
    counterType?: string
  }>
  playerControlEffects?: Array<{
    targetPlayerId: PlayerId
    controllerPlayerId: PlayerId
    duration: 'NEXT_COMBAT' | 'NEXT_TURN'
    createdTurn: number
  }>
  attachmentControlEffects?: Array<{
    sourceInstanceId: string
    targetInstanceId?: string
    controllerId: PlayerId
    baselineControllerId?: PlayerId
    sequence: number
  }>
  copyContinuousEffects?: Array<{
    sourceInstanceId: string
    targetInstanceId: string
    copiedFromInstanceId: string
    /** Snapshot of copiable values at the moment the copy effect is created. */
    copiedCard?: import('./card').CardDefinition
    copiedKeywords?: import('../tokens/tokenTypes').KeywordAbility[]
    duration: 'WHILE_SOURCE_ON_BATTLEFIELD'
  }>
  /** Active replacement rules; sources can make them conditional on remaining in play. */
  replacementEffects?: ReplacementEffect[]
  /** Per-source/event turn markers for first-event-per-turn replacement effects. */
  perTurnEventMarkers?: Record<string, number>
  extraTurnsQueued?: number
  /** Exact player identities for queued extra turns. */
  extraTurnQueue?: PlayerId[]
  /** Number of future turns for each player whose combat phases must be skipped. */
  pendingCombatPhaseSkipsByPlayer?: Record<PlayerId, number>
  /** Active only during the currently-started turn after consuming a pending skip. */
  skipCombatPhasesThisTurnForPlayerId?: PlayerId
  spellsCastThisTurn?: number
  /** Cast ordinal per participant; used by effects such as 'your second spell'. */
  spellsCastThisTurnByPlayer?: Record<PlayerId, number>
  /** Public spell characteristics retained only for current-turn rule checks. */
  spellCastHistoryThisTurn?: Array<{
    playerId: PlayerId
    card: CardDefinition
  }>
  /** Successful draws this turn, including identity-free physical draws. */
  cardsDrawnThisTurnByPlayer?: Record<PlayerId, number>
  /** Public history needed by 'entered this turn' activation conditions. */
  permanentsEnteredThisTurn?: Array<{
    instanceId: string
    playerId: PlayerId
    cardTypes: string[]
    subtypes: string[]
  }>
  /** Distinct creature objects that attacked for each player this turn. */
  creaturesAttackedThisTurnByPlayer?: Record<PlayerId, string[]>
  /** Once-each-turn trigger markers keyed by source object + ability id. */
  triggeredAbilityTurnMarkers?: Record<string, number>
  temporaryBlockingRestrictions?: Array<{
    restriction: BlockingRestriction
    targetInstanceId: string
    sourceInstanceId: string
  }>
  /** One-turn attack requirements such as Encore's "attacks that opponent if able". */
  attackRequirements?: Array<{
    attackerInstanceId: string
    defendingPlayerId: PlayerId
    turn: number
  }>
  /** One-combat block requirements such as 'must block if able'. */
  blockRequirements?: Array<{
    blockerInstanceId: string
    attackerInstanceId?: string
    turn: number
    combatId?: string
  }>
  history: GameHistoryEntry[]
}
