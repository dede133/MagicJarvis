import type { Zone } from '../types/card'
import type { TurnPhase, TurnStep } from '../types/turn'

export type SpellCastEvent = {
  type: 'SPELL_CAST'
  cardInstanceId: string
  stackObjectId?: string
  cardName: string
  isCreature: boolean
  manaCost?: string
  blueManaSymbols: number
  /** 1-based ordinal for this controller in the current turn. */
  castNumberThisTurn?: number
  /** Total mana actually spent to cast this spell after reductions/alternate payments. */
  manaSpent?: number
  controller: 'YOU' | 'OPPONENT'
  playerId?: import('../types/player').PlayerId
  cardTypes: string[]
  subtypes: string[]
  isToken: false
}

export type CardEnteredBattlefieldEvent = {
  type: 'CARD_ENTERED_BATTLEFIELD'
  cardInstanceId: string
  cardName: string
  controller: 'YOU' | 'OPPONENT'
  playerId?: import('../types/player').PlayerId
  cardTypes: string[]
  subtypes: string[]
  isToken: boolean
  previousZone: Zone | 'created'
}

export type PlayerShuffledEvent = {
  type: 'PLAYER_SHUFFLED'
  player: 'local' | 'opponent'
  controller: 'YOU' | 'OPPONENT'
  playerId?: import('../types/player').PlayerId
}

export type PlayerGainedLifeEvent = {
  type: 'PLAYER_GAINED_LIFE'
  playerId?: import('../types/player').PlayerId
  controller: 'YOU' | 'OPPONENT'
  amount: number
}

export type PermanentBecameTappedEvent = {
  type: 'PERMANENT_BECAME_TAPPED'
  cardInstanceId: string
  cardName: string
  controller: 'YOU' | 'OPPONENT'
  playerId?: import('../types/player').PlayerId
  cardTypes: string[]
  subtypes: string[]
  isToken: boolean
  sourceAction: 'TAP_CARD'
  eventGroupId?: string
}

export type StepStartedEvent = {
  type:
    | 'TURN_STARTED'
    | 'STEP_STARTED'
    | 'UPKEEP_STARTED'
    | 'DRAW_STEP_STARTED'
    | 'MAIN_PHASE_STARTED'
    | 'END_STEP_STARTED'
    | 'TURN_ENDED'
  turn: number
  phase: TurnPhase
  step: TurnStep
  activePlayerId?: import('../types/player').PlayerId
}


export type PermanentTransformedEvent = {
  type: 'PERMANENT_TRANSFORMED'
  cardInstanceId: string
  fromFaceName: string
  toFaceName: string
  playerId?: import('../types/player').PlayerId
}

export type CardDrawnEvent = {
  type: 'CARD_DRAWN'
  knownIdentity: false
  playerId?: import('../types/player').PlayerId
  controller?: 'YOU' | 'OPPONENT'
}

export type CombatEvent =
  | {
      type: 'COMBAT_STARTED'
      combatId: string
      activePlayerId?: import('../types/player').PlayerId
    }
  | {
      type: 'CREATURE_ATTACKED'
      cardInstanceId: string
      cardName: string
      eventGroupId: string
      controller: 'YOU' | 'OPPONENT'
      playerId?: import('../types/player').PlayerId
      cardTypes: string[]
      subtypes: string[]
      isToken: boolean
    }
  | {
      type: 'CREATURE_ATTACKED_UNBLOCKED'
      cardInstanceId: string
      cardName: string
      eventGroupId: string
      controller: 'YOU' | 'OPPONENT'
      playerId?: import('../types/player').PlayerId
      cardTypes: string[]
      subtypes: string[]
      isToken: boolean
    }
  | {
      type: 'CREATURES_ATTACKED' | 'ATTACKERS_DECLARED'
      attackerInstanceIds: string[]
      eventGroupId: string
      playerId?: import('../types/player').PlayerId
    }
  | {
      type: 'BLOCKERS_DECLARED'
      blockerInstanceIds: string[]
      attackerInstanceIds: string[]
      eventGroupId: string
      playerId?: import('../types/player').PlayerId
    }
  | {
      /** Subject is the attacking creature that became blocked. */
      type: 'CREATURE_BECAME_BLOCKED'
      cardInstanceId: string
      blockerInstanceIds: string[]
      eventGroupId: string
      controller: 'YOU' | 'OPPONENT'
      playerId?: import('../types/player').PlayerId
      cardTypes: string[]
      subtypes: string[]
      isToken: boolean
    }
  | {
      /** Subject is the blocking creature; attackerInstanceId is what it blocks. */
      type: 'CREATURE_BLOCKED'
      cardInstanceId: string
      attackerInstanceId: string
      eventGroupId: string
      controller: 'YOU' | 'OPPONENT'
      playerId?: import('../types/player').PlayerId
      cardTypes: string[]
      subtypes: string[]
      isToken: boolean
    }

export type DamageEvent = {
  type:
    | 'DAMAGE_DEALT'
    | 'COMBAT_DAMAGE_DEALT'
    | 'CREATURE_DEALT_DAMAGE'
    | 'PLANESWALKER_DEALT_DAMAGE'
    | 'PLAYER_DEALT_DAMAGE'
    | 'COMMANDER_COMBAT_DAMAGE_DEALT'
  sourceInstanceId?: string
  amount: number
  damageKind: 'COMBAT' | 'NONCOMBAT'
  sourcePlayerId?: import('../types/player').PlayerId
  targetPlayerId?: import('../types/player').PlayerId
  targetPermanentInstanceId?: string
}

/** Designed as an extensible event union; only SPELL_CAST has runtime support now. */
export type GameEvent =
  | SpellCastEvent
  | CardEnteredBattlefieldEvent
  | PlayerGainedLifeEvent
  | PlayerShuffledEvent
  | PermanentBecameTappedEvent
  | PermanentTransformedEvent
  | StepStartedEvent
  | CardDrawnEvent
  | CombatEvent
  | DamageEvent
  | {
      type: 'CARD_LEFT_BATTLEFIELD'
      cardInstanceId: string
      cardName: string
      previousZone: 'battlefield'
      nextZone: Zone
      controller: 'YOU' | 'OPPONENT'
      playerId?: import('../types/player').PlayerId
      cardTypes: string[]
      subtypes: string[]
      isToken: boolean
      counters: Record<string, number>
    }
  | {
      type: 'CARD_DIED'
      cardInstanceId: string
      cardName: string
      controller: 'YOU' | 'OPPONENT'
      playerId?: import('../types/player').PlayerId
      cardTypes: string[]
      subtypes: string[]
      isToken: boolean
      counters: Record<string, number>
    }
  | { type: 'ATTACK_DECLARED' }
  | { type: 'TOKEN_CREATED' }
  | { type: 'ABILITY_ACTIVATED' }
