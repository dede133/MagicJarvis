import type { CardDefinition, ManaColor, Zone } from '../types/card'
import type { HiddenZoneTracking } from '../types/game'
import type {
  PendingAbility,
  PendingDecision,
  PendingResolution,
  DelayedEffect,
  DeclaredTarget,
} from '../abilities/types/abilityTypes'
import type { KeywordAbility, TokenDefinition } from '../tokens/tokenTypes'
import type { StackObject } from '../types/stack'
import type {
  CombatDamageStep,
  CombatAttacker,
  CombatBlocker,
  DamageRecord,
  ExternalCombatParticipant,
  DefendingTarget,
} from '../types/combat'
import type { PlayerId, PlayerState } from '../types/player'
import type { ReplacementEffect } from '../rules/replacement/replacementTypes'

type GameActionPayload =
  | { type: 'SET_PLAYERS'; players: PlayerState[]; turnOrder?: PlayerId[] }
  | { type: 'SET_ACTIVE_PLAYER'; playerId: PlayerId }
  | { type: 'GAIN_PLAYER_LIFE'; playerId: PlayerId; amount: number }
  | {
      type: 'ADD_RESTRICTED_MANA'
      playerId: PlayerId
      color: ManaColor
      amount: number
      restriction: 'CREATURE_SPELLS_ONLY'
      sourceInstanceId?: string
    }
  | {
      type: 'SPEND_RESTRICTED_MANA'
      playerId: PlayerId
      color: ManaColor
      amount: number
      restriction: 'CREATURE_SPELLS_ONLY'
    }
  | { type: 'LOSE_PLAYER_LIFE'; playerId: PlayerId; amount: number }
  | {
      type: 'ADD_PLAYER_MANA'
      playerId: PlayerId
      color: ManaColor
      amount: number
    }
  | {
      type: 'SPEND_PLAYER_MANA'
      playerId: PlayerId
      color: ManaColor
      amount: number
    }
  | {
      type: 'SET_PLAYER_MAX_HAND_SIZE'
      playerId: PlayerId
      value?: number | 'UNLIMITED'
    }
  | { type: 'SET_PLAYER_HAND_COUNT'; playerId: PlayerId; count: number }
  | { type: 'SET_PLAYER_LIBRARY_COUNT'; playerId: PlayerId; count: number }
  | { type: 'MILL_PLAYER'; playerId: PlayerId; count: number }
  | {
      type: 'SHUFFLE_PLAYER_ZONES_INTO_LIBRARY'
      playerId: PlayerId
      zones: Array<'hand' | 'graveyard'>
    }
  | {
      type: 'ADD_PLAYER_CONTROL_EFFECT'
      targetPlayerId: PlayerId
      controllerPlayerId: PlayerId
      duration: 'NEXT_COMBAT' | 'NEXT_TURN'
    }
  | {
      type: 'REMOVE_PLAYER_CONTROL_EFFECT'
      targetPlayerId: PlayerId
      duration: 'NEXT_COMBAT' | 'NEXT_TURN'
    }
  | {
      type: 'ADD_COPY_CONTINUOUS_EFFECT'
      sourceInstanceId: string
      targetInstanceId: string
      copiedFromInstanceId: string
      copiedCard?: CardDefinition
      copiedKeywords?: import('../tokens/tokenTypes').KeywordAbility[]
      duration: 'WHILE_SOURCE_ON_BATTLEFIELD'
    }
  | { type: 'SET_PER_TURN_EVENT_MARKER'; key: string; turn: number }
  | {
      type: 'RECORD_PERMANENT_ENTERED_THIS_TURN'
      instanceId: string
      playerId: PlayerId
      cardTypes: string[]
      subtypes: string[]
    }
  | {
      type: 'RECORD_CREATURE_ATTACKED_THIS_TURN'
      instanceId: string
      playerId: PlayerId
    }
  | { type: 'SET_TRIGGERED_ABILITY_TURN_MARKER'; key: string; turn: number }
  | {
      /** A physical opposing card becomes known because the player explicitly declared it. */
      type: 'DECLARE_EXTERNAL_CARD'
      instanceId: string
      card: CardDefinition
      zone: Exclude<Zone, 'stack' | 'command'>
      controllerId?: PlayerId
      knownBecause: 'DECLARED' | 'REVEALED' | 'SEARCHED' | 'MILLED'
    }
  | {
      /** Physical-table bridge: a known opposing creature is currently attacking the local player. */
      type: 'DECLARE_EXTERNAL_ATTACKER'
      instanceId: string
      defendingPlayerId?: PlayerId
      /** Cumulative generic attack tax paid for the staged physical declaration. */
      genericTaxPaid?: number
    }
  | { type: 'ADD_REPLACEMENT_EFFECT'; replacementEffect: ReplacementEffect }
  | { type: 'REMOVE_REPLACEMENT_EFFECT'; replacementEffectId: string }
  | {
      type: 'MOVE_CARD'
      instanceId: string
      toZone: Zone
      /** Optional controller assignment for effects such as return under owner's control. */
      controllerId?: PlayerId
      /** Internal guard: a replacement cannot apply twice to the same event. */
      appliedReplacementIds?: string[]
    }
  | {
      /** Internal atomic batch used for objective state-based actions. */
      type: 'APPLY_STATE_BASED_ACTIONS'
      moves: Array<{ instanceId: string; toZone: Zone }>
      removeInstanceIds: string[]
      detachInstanceIds?: string[]
      counterRemovals: Array<{
        instanceId: string
        counter: string
        amount: number
      }>
    }
  | { type: 'TAP_CARD'; instanceId: string; eventGroupId?: string }
  | { type: 'UNTAP_CARD'; instanceId: string }
  | { type: 'TRANSFORM_CARD'; instanceId: string }
  | { type: 'PHASE_OUT_CARD'; instanceId: string }
  | { type: 'PHASE_IN_CARD'; instanceId: string }
  | { type: 'ADD_MANA'; color: ManaColor; amount: number }
  | { type: 'SPEND_MANA'; color: ManaColor; amount: number }
  | { type: 'GAIN_LIFE'; amount: number }
  | { type: 'LOSE_LIFE'; amount: number }
  | { type: 'SET_LIFE'; amount: number }
  | { type: 'SET_HAND_COUNT'; count: number; playerId?: string }
  | { type: 'SET_LIBRARY_COUNT'; count: number; playerId?: PlayerId }
  | { type: 'SET_HIDDEN_ZONE_TRACKING'; tracking: HiddenZoneTracking }
  | {
      type: 'MOVE_UNKNOWN_HIDDEN_CARDS'
      fromZone: 'library' | 'hand'
      toZone: 'library' | 'hand'
      count: number
    }
  | { type: 'SET_KNOWN_LIBRARY_TOP'; instanceId?: string }
  | {
      type: 'SET_MAX_HAND_SIZE_OVERRIDE'
      value?: number | 'UNLIMITED'
    }
  | { type: 'SET_CARD_TAPPED_STATE'; instanceId: string; tapped: boolean }
  | {
      type: 'SET_CARD_RUNTIME_VALUE'
      instanceId: string
      key: string
      value: string | number | boolean
    }
  | {
      type: 'SET_CARD_CONTROLLER'
      instanceId: string
      controllerId: PlayerId
    }
  | {
      type: 'ADD_ATTACHMENT_CONTROL_EFFECT'
      sourceInstanceId: string
      targetInstanceId: string
      controllerId: PlayerId
    }
  | {
      type: 'ADD_ATTACKING_CREATURE_TO_COMBAT'
      instanceId: string
      defendingTarget: DefendingTarget
    }
  | {
      type: 'ATTACH_CARD'
      attachmentInstanceId: string
      targetInstanceId: string
    }
  | { type: 'DETACH_CARD'; attachmentInstanceId: string }
  | {
      type: 'CREATE_TOKEN_COPY'
      sourceInstanceId: string
      amount: number
      controllerId?: PlayerId
      /** Optional stable IDs for mechanics that must reference the created copies later. */
      instanceIds?: string[]
      /** Non-copy effect granted to the created tokens (for example Encore's haste). */
      grantKeywords?: KeywordAbility[]
      /** Per-copy player attack requirement, aligned with instanceIds. */
      attackPlayerIds?: PlayerId[]
      removeLegendary?: boolean
      overrides?: {
        power?: string
        toughness?: string
        colors?: ManaColor[]
        addSubtypes?: string[]
        removeLegendary?: boolean
      }
      appliedReplacementIds?: string[]
    }
  | {
      type: 'COPY_STACK_SPELL'
      sourceStackObjectId: string
      controllerId?: PlayerId
      /** Fresh target selection is performed by the copied Runtime program. */
      chooseNewTargets?: boolean
      removeLegendary?: boolean
    }
  | { type: 'CLEAR_STACK_TARGETS'; stackObjectId: string }
  | {
      type: 'SET_STACK_TARGETS'
      stackObjectId: string
      declaredTargets: DeclaredTarget[]
    }
  | {
      type: 'LINK_CARD'
      sourceInstanceId: string
      key: string
      linkedInstanceId: string
      returnOnSourceLeaves?: {
        fromZone: Zone
        destination: Zone
        controller?: 'OWNER' | 'PRESERVE'
      }
    }
  | { type: 'CLEAR_LINKED_CARDS'; sourceInstanceId: string; key: string }
  | {
      type: 'ADD_TEMPORARY_CHARACTERISTIC_EFFECT'
      sourceInstanceId: string
      targetInstanceId: string
      setBasePower?: number
      setBaseToughness?: number
      addCardTypes?: string[]
      removeCardTypes?: string[]
      setCreatureSubtypes?: string[]
      addCreatureSubtypes?: string[]
      setName?: string
      setColors?: import('../types/card').ManaColor[]
      loseAllAbilities?: boolean
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'ADD_TEMPORARY_PROTECTION_EFFECT'
      sourceInstanceId: string
      targetInstanceId: string
      protectionFromEverything?: boolean
      cardTypes?: string[]
      colors?: import('../types/card').ManaColor[]
      duration: 'UNTIL_END_OF_TURN' | 'UNTIL_SOURCE_CONTROLLER_NEXT_TURN'
      expiresAtPlayerId?: PlayerId
    }
  | {
      type: 'ADD_DAMAGE_PREVENTION_EFFECT'
      id: string
      sourceInstanceId: string
      targetInstanceId: string
      remainingAmount?: number
      preventAll?: boolean
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'ADD_PLAYER_RULE_EFFECT'
      id: string
      sourceInstanceId: string
      playerId: PlayerId
      hexproof?: boolean
      protectionFromEverything?: boolean
      lifeTotalCannotChange?: boolean
      cannotLoseLife?: boolean
      cannotWinOrLose?: boolean
      duration: 'UNTIL_END_OF_TURN' | 'UNTIL_PLAYER_NEXT_TURN'
    }
  | {
      type: 'ADD_AIRBEND_PERMISSION'
      cardInstanceId: string
      ownerId: PlayerId
      alternativeManaCost: string
    }
  | {
      type: 'ADD_TEMPORARY_CONTINUOUS_EFFECT'
      sourceInstanceId: string
      targetInstanceId: string
      power?: number
      toughness?: number
      grantKeywords?: string[]
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'ADD_TEMPORARY_GRANTED_TRIGGERED_ABILITY'
      id: string
      sourceInstanceId: string
      targetInstanceId: string
      ability: Omit<
        import('../abilities/types/abilityTypes').TriggeredAbilityDefinition,
        'sourceCardName'
      >
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'ADD_UNTAP_RESTRICTION'
      sourceInstanceId: string
      sourceControllerId: PlayerId
      targetInstanceId: string
      duration: 'WHILE_SOURCE_CONTROLLED'
    }
  | {
      type: 'ADD_TYPE_CONTINUOUS_EFFECT'
      sourceInstanceId: string
      targetInstanceId: string
      mode: 'ADD' | 'SET'
      landSubtype: string
      duration: 'UNTIL_END_OF_TURN' | 'WHILE_COUNTER_PRESENT'
      counterType?: string
    }
  | { type: 'QUEUE_EXTRA_TURN'; playerId?: PlayerId }
  | { type: 'END_TURN' }
  | { type: 'SKIP_NEXT_COMBAT_PHASES'; playerId: PlayerId }
  /** Reveals a specific physical card without inventing a draw identity. */
  | {
      type: 'MATERIALIZE_CARD'
      instanceId: string
      card: CardDefinition
      fromZone: 'library' | 'hand'
      toZone: Zone
    }
  | {
      type: 'CAST_SPELL'
      instanceId: string
      card: CardDefinition
      fromZone: Zone
      targetStackObjectId?: string
      /** Targets are chosen before costs are finalized and are public stack information. */
      declaredTargets?: DeclaredTarget[]
      /** Declared variable values such as X; persisted onto the stack object. */
      variables?: Record<string, string | number | boolean>
    }
  | {
      type: 'PLAY_LAND'
      instanceId: string
      card: CardDefinition
      fromZone: Zone
    }
  | {
      type: 'RESOLVE_SPELL'
      instanceId: string
      /** Internal continuation after AS_ENTERS choices have completed. */
      asEntersHandled?: boolean
      /** Carries choices made as this permanent enters onto the new object. */
      preserveRuntimeValues?: boolean
    }
  | { type: 'RESOLVE_STACK_OBJECT'; stackObjectId: string }
  | { type: 'ADVANCE_STEP' }
  | { type: 'START_TURN' }
  | { type: 'ADD_STACK_OBJECT'; stackObject: StackObject }
  | { type: 'REMOVE_STACK_OBJECT'; stackObjectId: string }
  | {
      type: 'SET_GAME_STATUS'
      status: import('../types/game').GameStatus
      reason?: import('../types/game').GameLossReason
    }
  | { type: 'CONCEDE' }
  | { type: 'BEGIN_COMBAT' }
  | {
      type: 'DECLARE_ATTACKERS'
      attackers: Array<Omit<CombatAttacker, 'blockedBy' | 'externalBlockedBy'>>
      eventGroupId: string
      /** Generic attack tax paid for the whole declaration. */
      genericTaxPaid?: number
    }
  | {
      type: 'DECLARE_BLOCKERS'
      blockers: CombatBlocker[]
      /** Generic blocking tax paid for the whole declaration. */
      genericTaxPaid?: number
    }
  | {
      type: 'ADD_BLOCK_REQUIREMENT'
      blockerInstanceId: string
      attackerInstanceId?: string
      turn?: number
      combatId?: string
    }
  | {
      type: 'DECLARE_ASSISTED_BLOCKER'
      attackerInstanceId: string
      participant: ExternalCombatParticipant
    }
  | { type: 'CLEAR_COMBAT' }
  | {
      type: 'SET_COMBAT_DAMAGE_STEP'
      step: CombatDamageStep
      firstStrikeParticipantIds?: string[]
    }
  | { type: 'DEAL_DAMAGE'; damage: DamageRecord }
  | { type: 'DEAL_DAMAGE_BATCH'; damages: DamageRecord[] }
  | { type: 'REMOVE_CARD_INSTANCE'; instanceId: string }
  | {
      type: 'CREATE_TOKEN'
      token: TokenDefinition
      amount: number
      controllerId?: string
      ownerId?: string
      tapped?: boolean
      appliedReplacementIds?: string[]
    }
  | { type: 'ACTIVATE_ABILITY'; instanceId: string; abilityId?: string }
  | {
      type: 'DECLARE_PLAYER_SHUFFLED'
      player: 'local' | 'opponent'
      playerId?: PlayerId
    }
  | { type: 'ADD_PENDING_ABILITIES'; pending: PendingAbility[] }
  | { type: 'UPDATE_PENDING_ABILITY'; pending: PendingAbility }
  | { type: 'REMOVE_PENDING_ABILITY'; pendingId: string }
  | { type: 'ADD_PENDING_RESOLUTION'; resolution: PendingResolution }
  | { type: 'UPDATE_PENDING_RESOLUTION'; resolution: PendingResolution }
  | { type: 'REMOVE_PENDING_RESOLUTION'; resolutionId: string }
  | { type: 'ADD_PENDING_DECISION'; decision: PendingDecision }
  | { type: 'REMOVE_PENDING_DECISION'; decisionId: string }
  | { type: 'ADD_DELAYED_EFFECT'; delayedEffect: DelayedEffect }
  | { type: 'REMOVE_DELAYED_EFFECT'; delayedEffectId: string }
  | { type: 'ADD_COUNTER'; instanceId: string; counter: string; amount: number }
  | {
      type: 'REMOVE_COUNTER'
      instanceId: string
      counter: string
      amount: number
    }
  | {
      /** Atomic counter movement; SBAs are checked only after all counters moved. */
      type: 'MOVE_COUNTERS'
      fromInstanceId: string
      toInstanceId: string
      moves: Array<{ counter: string; amount: number }>
    }
  | {
      /** Atomic distribution; all allocations are applied before SBAs are checked. */
      type: 'DISTRIBUTE_COUNTERS'
      counter: string
      allocations: Array<{ instanceId: string; amount: number }>
    }
  | { type: 'DRAW_CARD'; playerId?: PlayerId }
  | { type: 'NEXT_TURN' }
  | { type: 'UNTAP_ALL' }
  | {
      type: 'ADD_TEMPORARY_BLOCKING_RESTRICTION'
      restriction: import('../abilities/types/abilityTypes').BlockingRestriction
      targetInstanceId: string
      sourceInstanceId: string
    }

/** Optional actor metadata keeps existing actions compatible and future actions player-aware. */
export type GameAction = GameActionPayload & { actorPlayerId?: PlayerId }
