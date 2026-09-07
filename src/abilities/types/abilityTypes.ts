import type { GameEvent } from '../../events/gameEvents'
import type { GameAction } from '../../actions/gameActions'
import type { ManaColor, Zone } from '../../types/card'
import type { CastNonManaCostDefinition } from '../../casting/types/castingTypes'

export type AutomationLevel = 'AUTO' | 'ASSISTED' | 'MANUAL'
export type PlayerReference =
  | 'SOURCE_CONTROLLER'
  | 'EVENT_PLAYER'
  | 'ACTIVE_PLAYER'
  | 'TARGET_PLAYER'
  | 'DEFENDING_PLAYER'
  | 'CURRENT_PLAYER'
  | 'TARGET_CONTROLLER'
  | 'ATTACHED_OBJECT_OWNER'
  | { type: 'VARIABLE'; name: string }
  | { type: 'SOURCE_VALUE'; key: string }

export type TriggerDefinition =
  | { type: 'SPELL_CAST' }
  | { type: 'CARD_ENTERED_BATTLEFIELD' }
  | { type: 'PLAYER_GAINED_LIFE' }
  | { type: 'PLAYER_SHUFFLED' }
  | { type: 'PERMANENT_BECAME_TAPPED'; oneOrMore?: true }
  | { type: 'PERMANENT_TRANSFORMED' }
  | { type: 'ATTACKERS_DECLARED' }
  | { type: 'COMBAT_STARTED' }
  | { type: 'CREATURE_ATTACKED' }
  | { type: 'CREATURE_ATTACKED_UNBLOCKED' }
  | { type: 'BLOCKERS_DECLARED' }
  | { type: 'CREATURE_BECAME_BLOCKED' }
  | { type: 'CREATURE_BLOCKED' }
  | { type: 'DAMAGE_DEALT' }
  | { type: 'PLAYER_DEALT_DAMAGE' }
  | { type: 'CARD_LEFT_BATTLEFIELD' }
  | { type: 'CARD_DIED' }
  | { type: 'TURN_STARTED' }
  | { type: 'UPKEEP_STARTED' }
  | { type: 'DRAW_STEP_STARTED' }
  | { type: 'MAIN_PHASE_STARTED' }
  | { type: 'END_STEP_STARTED' }
  | { type: 'TURN_ENDED' }

export type RuntimeTextReference =
  | string
  | { type: 'VARIABLE'; name: string }
  | { type: 'SOURCE_VALUE'; key: string }

export type ConditionDefinition =
  | { type: 'EVENT_SUBJECT_IS_SOURCE' }
  | { type: 'EVENT_SUBJECT_IS_NOT_SOURCE' }
  | { type: 'EVENT_SOURCE_IS_ATTACHED_OBJECT' }
  | { type: 'EVENT_SUBJECT_IS_ATTACHED_OBJECT' }
  | { type: 'EVENT_PLAYER_IS_SOURCE_CONTROLLER' }
  | { type: 'EVENT_PLAYER_IS_OPPONENT_OF_SOURCE_CONTROLLER' }
  | { type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' }
  | { type: 'SPELL_IS_CREATURE'; value: boolean }
  | {
      type: 'EVENT_NUMBER_COMPARE'
      field:
        | 'blueManaSymbols'
        | 'castNumberThisTurn'
        | 'manaSpent'
        | 'damageAmount'
      operator: 'GT' | 'GTE' | 'EQ'
      value: number
    }
  | { type: 'EVENT_CONTROLLER_IS'; value: 'YOU' | 'OPPONENT' }
  | { type: 'EVENT_IS_TOKEN'; value: boolean }
  | { type: 'EVENT_DAMAGE_KIND_IS'; value: 'COMBAT' | 'NONCOMBAT' }
  | { type: 'EVENT_DAMAGE_TARGET_IS_PLAYER_OR_PLANESWALKER' }
  | { type: 'EVENT_ATTACKS_PLAYER_WITH_GREATEST_LIFE_AMONG_OPPONENTS' }
  | { type: 'EVENT_HAS_TYPE'; value: string }
  | { type: 'EVENT_HAS_KEYWORD'; value: string }
  | { type: 'EVENT_IS_HISTORIC' }
  | { type: 'EVENT_HAS_COUNTER'; counterType: string; atLeast?: number }
  | { type: 'EVENT_HAS_ANY_COUNTERS' }
  | { type: 'EVENT_HAS_SUBTYPE'; value: RuntimeTextReference }
  | { type: 'EVENT_TURN_STEP_IS'; value: import('../../types/turn').TurnStep }
  | { type: 'EVENT_TRANSFORMED_TO_NAME'; value: string }

export type EffectReference =
  | 'SOURCE'
  | 'EVENT_SUBJECT'
  | 'SELECTED_TARGET'
  | 'FIRST_SELECTED_TARGET'
  | 'SECOND_SELECTED_TARGET'
  | 'SELECTED_CARD'
  | 'SELECTED_STACK_OBJECT'
  | 'EVENT_STACK_OBJECT'
  | 'CURRENT_OBJECT'
  | 'ATTACHED_OBJECT'

export type ObjectQuery = {
  zones?: Zone[]
  controller?: PlayerReference
  owner?: PlayerReference
  controllerRelation?: 'NOT_SOURCE_CONTROLLER'
  /** Stable player reference for per-opponent iteration. */
  controllerPlayer?: PlayerReference
  cardTypes?: string[]
  cardTypesAnyOf?: string[]
  excludeCardTypes?: string[]
  subtypes?: RuntimeTextReference[]
  subtypesAnyOf?: RuntimeTextReference[]
  excludeSubtypes?: RuntimeTextReference[]
  historic?: boolean
  hasCounterType?: string
  counterCountAtLeast?: number
  hasAnyCounters?: boolean
  powerAtLeast?: number
  toughnessAtLeast?: number
  colors?: ManaColor[]
  colorsAnyOf?: ManaColor[]
  excludeColors?: ManaColor[]
  isToken?: boolean
  attacking?: boolean
  tapped?: boolean
  excludeSource?: boolean
  manaValueMax?: ValueExpression
}

export type ValueExpression =
  | { type: 'LITERAL'; value: number }
  | { type: 'VARIABLE'; name: string }
  | { type: 'SOURCE_VALUE'; key: string }
  | {
      type: 'EVENT_VALUE'
      field: 'blueManaSymbols' | 'castNumberThisTurn' | 'manaSpent' | 'damageAmount'
    }
  | { type: 'COUNTER_COUNT'; target: EffectReference; counterType: string }
  | { type: 'EVENT_COUNTER_COUNT'; counterType: string }
  | { type: 'TOTAL_COUNTER_COUNT'; target: EffectReference }
  | { type: 'COUNT_OBJECTS'; query: ObjectQuery }
  | { type: 'MANA_VALUE'; target: EffectReference }
  | { type: 'ADD'; values: ValueExpression[] }
  | { type: 'SUBTRACT'; left: ValueExpression; right: ValueExpression }
  | { type: 'MULTIPLY'; values: ValueExpression[] }
  | { type: 'POWER'; base: ValueExpression; exponent: ValueExpression }
  | { type: 'MAX_SHARED_CREATURE_SUBTYPE_COUNT'; controller: PlayerReference }

export type EffectAmount = ValueExpression
export type RuntimeVariableValue = string | number | boolean
export type ChooseValueOption = {
  id: string
  label: string
  value: RuntimeVariableValue
}
export type RuntimeValueSource =
  | { type: 'VARIABLE'; name: string }
  | { type: 'LITERAL'; value: RuntimeVariableValue }
export type ConditionExpression =
  | { type: 'CURRENT_TURN_STEP_IS_MAIN_PHASE' }
  | { type: 'SOURCE_CONTROLLER_IS_ACTIVE_PLAYER' }
  | {
      type: 'VALUE_COMPARE'
      left: ValueExpression
      operator: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ'
      right: ValueExpression
    }
  | {
      type: 'OBJECT_MATCHES_QUERY'
      object: EffectReference
      query: ObjectQuery
    }
export type PaymentCost =
  | { type: 'FIXED_MANA'; cost: string }
  | { type: 'GENERIC_FROM_VALUE'; value: ValueExpression }

/** A deliberately small, serializable candidate filter for an explicit choice. */
export type SelectionConstraints = {
  zones?: Zone[]
  cardTypes?: string[]
  cardTypesAnyOf?: string[]
  excludeCardTypes?: string[]
  subtypes?: string[]
  subtypesAnyOf?: string[]
  historic?: boolean
  hasCounterType?: string
  counterCountAtLeast?: number
  hasAnyCounters?: boolean
  powerAtLeast?: number
  toughnessAtLeast?: number
  colors?: ManaColor[]
  colorsAnyOf?: ManaColor[]
  excludeColors?: ManaColor[]
  controller?: 'YOU' | 'OPPONENT' | 'ANY'
  owner?: 'YOU' | 'OPPONENT' | 'ANY'
  controllerRelation?: 'NOT_SOURCE_CONTROLLER'
  /** Stable player reference for per-opponent iteration. */
  controllerPlayer?: PlayerReference
  /** A TARGET_SELECTION may target a player instead of a card/stack object. */
  playerRelation?: PlayerSelectionRelation
  isToken?: boolean
  attacking?: boolean
  /** Matches the commander's physical card instance for the referenced player. */
  isCommander?: boolean
  excludeSource?: boolean
  /** Excludes the permanent currently enchanted/equipped by the source. */
  excludeAttachedToSource?: boolean
  stackKind?: 'SPELL'
  combatRole?: 'ATTACKING_OR_BLOCKING'
  /** Dynamic upper bound used by effects such as kicker-X artifact theft. */
  manaValueMax?: ValueExpression
  /** For multi-target declarations, targets after the first must share a creature subtype with the first. */
  sharesCreatureSubtypeWithFirstTarget?: boolean
  /** Logical OR over reusable target clauses. Common fields outside anyOf still apply. */
  anyOf?: SelectionConstraints[]
}

/** Target identity and legality snapshot chosen while declaring a spell/ability. */
export type DeclaredTarget = {
  targetId: string
  constraints: SelectionConstraints
}

export type DeclarationConstraintOverride = {
  variableName: string
  equals: RuntimeVariableValue
  constraints: SelectionConstraints
}

export type GiftDeclarationDefinition = {
  promisedVariableName: string
  recipientVariableName: string
  prompt?: string
  recipientPrompt?: string
}

export type LibrarySearchDestination =
  'TOP_OF_LIBRARY' | 'hand' | 'battlefield' | 'graveyard' | 'exile'

export type PlayerSelectionRelation = 'YOU' | 'OPPONENT' | 'ANY'

export type StaticCondition =
  | {
      type: 'CONTROL_COUNT_AT_LEAST'
      query: ObjectQuery
      count: number
    }
  | {
      type: 'DEVOTION_COMPARE'
      color: Exclude<ManaColor, 'C'>
      operator: 'LT' | 'GTE'
      value: number
    }
  | {
      type: 'SOURCE_CONTROLLER_LIFE_AT_LEAST'
      value: number
    }
  | { type: 'SOURCE_CONTROLLER_IS_ACTIVE_PLAYER' }
  | { type: 'SOURCE_IS_UNTAPPED' }
  | {
      type: 'PERMANENT_ENTERED_THIS_TURN'
      query: ObjectQuery
    }
  | { type: 'ATTACKED_WITH_CREATURES_AT_LEAST'; count: number }

export type EffectDefinition =
  | {
      type: 'PLAYER_SELECTION'
      prompt: string
      relation: PlayerSelectionRelation
      effects: EffectDefinition[]
    }
  | {
      type: 'FOR_EACH_PLAYER'
      relation: 'OPPONENTS_OF_SOURCE_CONTROLLER' | 'ALL_PLAYERS'
      effects: EffectDefinition[]
    }
  | {
      type: 'DRAW_FOR_PLAYER'
      player: PlayerReference
      amount: ValueExpression
    }
  | {
      type: 'GAIN_LIFE_FOR_PLAYER'
      player: PlayerReference
      amount: ValueExpression
    }
  | {
      type: 'SCRY_PLAYER'
      player: PlayerReference
      amount: ValueExpression
    }
  | {
      type: 'SURVEIL_PLAYER'
      player: PlayerReference
      amount: ValueExpression
    }
  | { type: 'MILL_PLAYER'; player: PlayerReference; amount: ValueExpression }
  | {
      type: 'SHUFFLE_PLAYER_ZONES_INTO_LIBRARY'
      player: PlayerReference
      zones: Array<'hand' | 'graveyard'>
    }
  | {
      type: 'CONTROL_PLAYER'
      player: PlayerReference
      controller: PlayerReference
      duration: 'NEXT_COMBAT' | 'NEXT_TURN'
    }
  | {
      /** Continuous control of the object enchanted/equipped by the source. */
      type: 'CONTROL_ATTACHED_OBJECT'
      controller: PlayerReference
    }
  | {
      type: 'COPY_OBJECT_CHARACTERISTICS'
      target: EffectReference
      source: EffectReference
      duration: 'WHILE_SOURCE_ON_BATTLEFIELD'
    }
  | {
      type: 'CREATE_TOKEN'
      tokenId: string
      amount: EffectAmount
      player?: PlayerReference
      tapped?: boolean
    }
  | { type: 'DRAW_CARD'; amount: EffectAmount }
  | {
      type: 'MOVE_ZONE'
      target: EffectReference
      destination: Zone
      controller?: 'OWNER' | 'PRESERVE'
    }
  | { type: 'UNTAP_PERMANENT'; target: EffectReference }
  | { type: 'TAP_PERMANENT'; target: EffectReference }
  | { type: 'TRANSFORM_PERMANENT'; target: EffectReference }
  | { type: 'PHASE_OUT_PERMANENT'; target: EffectReference }
  | { type: 'PHASE_IN_PERMANENT'; target: EffectReference }
  | {
      type: 'ADD_COUNTER'
      target: EffectReference
      counterType: string
      amount: EffectAmount
    }
  | {
      /** Copies the full LKI counter map from the triggering leave/dies event. */
      type: 'PUT_EVENT_COUNTERS'
      target: EffectReference
    }
  | {
      /** Interactive public-zone transfer; targets must already have been declared. */
      type: 'MOVE_COUNTERS_BETWEEN_TARGETS'
      from: EffectReference
      to: EffectReference
      prompt?: string
    }
  | {
      /** Explicitly distribute a fixed counter total among matching public objects. */
      type: 'DISTRIBUTE_COUNTERS'
      counterType: string
      amount: EffectAmount
      query: ObjectQuery
      prompt?: string
    }
  | {
      type: 'ADD_MANA'
      color: 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
      amount: number
    }
  | {
      type: 'ADD_MANA_CHOICE'
      player: PlayerReference
      allowedColors: ManaColor[] | { type: 'COMMANDER_COLOR_IDENTITY' }
      amount: ValueExpression
    }
  | {
      type: 'ADD_MANA_FROM_LINKED_COLORS'
      player: PlayerReference
      key: string
      amount: ValueExpression
    }
  | {
      type: 'ADD_MANA_FROM_PUBLIC_ZONE_COLORS'
      player: PlayerReference
      query: ObjectQuery
      amount: ValueExpression
    }
  | {
      type: 'SELECT_HIDDEN_ZONE_CARD'
      player: PlayerReference
      zone: 'hand' | 'library'
      prompt: string
      constraints: SelectionConstraints
      destination: Zone
      count?: EffectAmount
      allowFail?: boolean
      linkKey?: string
      /** Physical-library hint: only this many top cards were inspected. */
      lookAtTop?: EffectAmount
    }
  | {
      type: 'SELECT_PUBLIC_ZONE_CARD'
      player: PlayerReference
      zone: 'graveyard' | 'exile'
      prompt: string
      constraints: SelectionConstraints
      allowFail?: boolean
      linkKey?: string
      knownBecause?: 'DECLARED' | 'REVEALED' | 'SEARCHED' | 'MILLED'
    }
  | {
      type: 'CAST_LINKED_CARD_WITHOUT_PAYING_MANA_COST'
      key: string
      fromZone?: 'exile' | 'graveyard'
      exileIfWouldEnterGraveyard?: boolean
    }
  | {
      type: 'COUNTER_SPELL'
      target: EffectReference
      destination?: 'graveyard' | 'exile'
    }
  | { type: 'DESTROY_PERMANENT'; target: EffectReference }
  | {
      type: 'CHANGE_CONTROLLER'
      target: EffectReference
      controller: PlayerReference
    }
  | {
      type: 'ATTACH'
      attachment: EffectReference
      target: EffectReference
    }
  | { type: 'DETACH'; attachment: EffectReference }
  | {
      type: 'CREATE_TOKEN_COPY'
      target: EffectReference
      amount: EffectAmount
      removeLegendary?: boolean
      overrides?: {
        power?: string
        toughness?: string
        colors?: ManaColor[]
        addSubtypes?: string[]
        removeLegendary?: boolean
      }
    }
  | {
      /** Encore creates one hasty token copy per opponent, with attack requirements and delayed sacrifice. */
      type: 'ENCORE'
    }
  | {
      type: 'COPY_SPELL'
      target: EffectReference
      controller?: PlayerReference
      chooseNewTargets?: boolean
      removeLegendary?: boolean
    }
  | { type: 'RESET_STACK_TARGETS'; target: EffectReference }
  | { type: 'RETARGET_STACK_OBJECT'; target: EffectReference }
  | {
      type: 'LINK_OBJECT'
      target: EffectReference
      key: string
      returnOnSourceLeaves?: {
        fromZone: Zone
        destination: Zone
        controller?: 'OWNER' | 'PRESERVE'
      }
    }
  | {
      type: 'RETURN_LINKED_OBJECTS'
      key: string
      destination: Zone
      controller?: 'OWNER' | 'PRESERVE'
    }
  | {
      type: 'DEAL_DAMAGE'
      target: EffectReference
      amount: ValueExpression
      damageKind: 'NONCOMBAT'
    }
  | {
      type: 'SET_BASE_POWER_TOUGHNESS'
      target: EffectReference
      power: ValueExpression
      toughness: ValueExpression
      duration: 'UNTIL_END_OF_TURN'
    }
  | { type: 'REMOVE_ALL_COUNTERS'; target: EffectReference }
  | {
      type: 'ADD_CREATURE_SUBTYPE'
      target: EffectReference
      subtype: RuntimeTextReference
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'SET_COLORS'
      target: EffectReference
      colors: ManaColor[]
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'GRANT_PROTECTION'
      target: EffectReference
      protection:
        | { type: 'EVERYTHING' }
        | { type: 'CARD_TYPE'; cardType: RuntimeTextReference }
        | { type: 'COLORS'; colors: ManaColor[] }
      duration: 'UNTIL_END_OF_TURN' | 'UNTIL_SOURCE_CONTROLLER_NEXT_TURN'
    }
  | {
      type: 'PREVENT_NEXT_DAMAGE'
      target: EffectReference
      amount: ValueExpression
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'ADD_PLAYER_RULE'
      player: PlayerReference
      rules: {
        hexproof?: boolean
        protectionFromEverything?: boolean
        lifeTotalCannotChange?: boolean
        cannotLoseLife?: boolean
        cannotWinOrLose?: boolean
      }
      duration: 'UNTIL_END_OF_TURN' | 'UNTIL_PLAYER_NEXT_TURN'
    }
  | { type: 'AIRBEND'; target: EffectReference }
  | {
      /** Put the source onto the battlefield already attacking the chosen defender. */
      type: 'PUT_SOURCE_ONTO_BATTLEFIELD_ATTACKING'
      defendingTarget:
        | { type: 'PLAYER'; player: PlayerReference }
        | { type: 'PERMANENT'; target: EffectReference }
    }
  | {
      type: 'ADD_RESTRICTED_MANA'
      color: 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
      amount: number
      restriction: 'CREATURE_SPELLS_ONLY'
    }
  | {
      type: 'TEMPORARY_MODIFIER'
      target: EffectReference
      power?: number
      toughness?: number
      grantKeywords?: string[]
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'GRANT_TRIGGERED_ABILITY_UNTIL_END_OF_TURN'
      target: EffectReference
      ability: Omit<TriggeredAbilityDefinition, 'sourceCardName'>
    }
  | {
      type: 'ADD_UNTAP_RESTRICTION'
      target: EffectReference
      duration: 'WHILE_SOURCE_CONTROLLED'
    }
  | { type: 'QUEUE_EXTRA_TURN'; player: PlayerReference }
  | { type: 'END_TURN' }
  | { type: 'SKIP_NEXT_COMBAT_PHASES'; player: PlayerReference }
  | { type: 'ENTERS_TAPPED' }
  | {
      type: 'CHANGE_LAND_SUBTYPE'
      target: EffectReference
      subtype: RuntimeTextReference
      mode: 'ADD' | 'SET'
      duration: 'UNTIL_END_OF_TURN' | 'WHILE_COUNTER_PRESENT'
      counterType?: string
    }
  | {
      type: 'CANNOT_BE_BLOCKED'
      target: EffectReference
      duration: 'UNTIL_END_OF_TURN'
    }
  | { type: 'DISCARD_CARD'; player: 'YOU'; amount: EffectAmount }
  | { type: 'SACRIFICE'; target: EffectReference }
  | { type: 'SET_VARIABLE'; variableName: string; value: ValueExpression }
  | { type: 'FOR_EACH'; query: ObjectQuery; effects: EffectDefinition[] }
  | {
      type: 'FOR_EACH_SELECTED'
      selection: 'TARGETS' | 'CARDS'
      filter?: ObjectQuery
      effects: EffectDefinition[]
    }
  | {
      type: 'DELAYED_EFFECT'
      trigger: TriggerDefinition
      triggerPlayer?: PlayerReference
      effects: EffectDefinition[]
    }
  | {
      type: 'CONDITIONAL_EFFECT'
      condition: ConditionExpression
      ifTrue: EffectDefinition[]
      ifFalse?: EffectDefinition[]
    }
  | {
      type: 'PAYMENT_BRANCH'
      payer: PlayerReference
      cost: PaymentCost
      ifPaid: EffectDefinition[]
      ifNotPaid: EffectDefinition[]
      prompt?: string
    }
  | {
      type: 'CHOOSE_MODE'
      prompt: string
      modes: Array<{ id: string; label: string; effects: EffectDefinition[] }>
    }
  | {
      type: 'CHOOSE_VALUE'
      prompt: string
      variableName: string
      options?: ChooseValueOption[]
      allowCustomValue?: boolean
      customValueLabel?: string
    }
  | {
      type: 'STORE_SOURCE_VALUE'
      key: string
      value: RuntimeValueSource
    }
  | {
      type: 'SEARCH_LIBRARY_CARD'
      player: PlayerReference
      prompt: string
      constraints: SelectionConstraints
      reveal: boolean
      shuffle: boolean
      /** Hidden-zone searches with a stated quality may legally fail to find. */
      allowFail?: boolean
      destination: LibrarySearchDestination
      controller?: 'SOURCE_CONTROLLER' | 'OWNER'
    }
  | {
      type: 'PHYSICAL_CONFIRMATION'
      prompt: string
      effects: EffectDefinition[]
    }
  | {
      type: 'MOVE_UNKNOWN_HIDDEN_CARDS'
      fromZone: 'library' | 'hand'
      toZone: 'library' | 'hand'
      amount: EffectAmount
    }
  | { type: 'SHUFFLE_LIBRARY'; player: PlayerReference }
  | {
      type: 'SET_PLAYER_MAX_HAND_SIZE'
      player: PlayerReference
      value: number | 'UNLIMITED'
    }
  | {
      type: 'OPTIONAL_EFFECT'
      prompt: string
      effects: EffectDefinition[]
    }
  | {
      type: 'TARGET_SELECTION'
      prompt: string
      constraints: SelectionConstraints
      declarationConstraintOverrides?: DeclarationConstraintOverride[]
      count?: ValueExpression
      /** Allows declaring any number from zero up to count. */
      allowFewer?: boolean
      effects: EffectDefinition[]
    }
  | {
      type: 'CARD_SELECTION'
      prompt: string
      constraints: SelectionConstraints
      count?: ValueExpression
      effects: EffectDefinition[]
    }

export type ResolvedEffect =
  | { type: 'COUNTER_SOURCE_STACK_OBJECT' }
  | { type: 'COUNTER_STACK_OBJECT'; stackObjectId: string }
  | { type: 'SET_CURRENT_PLAYER'; playerId: string }
  | {
      type: 'PLAYER_SELECTION'
      prompt: string
      relation: PlayerSelectionRelation
      effects: ResolvedEffect[]
    }
  | {
      type: 'FOR_EACH_PLAYER'
      relation: 'OPPONENTS_OF_SOURCE_CONTROLLER' | 'ALL_PLAYERS'
      effects: ResolvedEffect[]
    }
  | {
      type: 'DRAW_FOR_PLAYER'
      player: PlayerReference
      amount: ValueExpression
    }
  | {
      type: 'GAIN_LIFE_FOR_PLAYER'
      player: PlayerReference
      amount: ValueExpression
    }
  | {
      type: 'SCRY_PLAYER'
      player: PlayerReference
      amount: ValueExpression
    }
  | {
      type: 'SURVEIL_PLAYER'
      player: PlayerReference
      amount: ValueExpression
    }
  | { type: 'MILL_PLAYER'; player: PlayerReference; amount: ValueExpression }
  | {
      type: 'SHUFFLE_PLAYER_ZONES_INTO_LIBRARY'
      player: PlayerReference
      zones: Array<'hand' | 'graveyard'>
    }
  | {
      type: 'CONTROL_PLAYER'
      player: PlayerReference
      controller: PlayerReference
      duration: 'NEXT_COMBAT' | 'NEXT_TURN'
    }
  | {
      type: 'CONTROL_ATTACHED_OBJECT'
      controller: PlayerReference
    }
  | {
      type: 'COPY_OBJECT_CHARACTERISTICS'
      target: EffectReference
      source: EffectReference
      duration: 'WHILE_SOURCE_ON_BATTLEFIELD'
    }
  | {
      type: 'CREATE_TOKEN'
      tokenId: string
      amount: number
      player?: PlayerReference
      tapped?: boolean
    }
  | { type: 'DRAW_CARD'; amount: number }
  | {
      type: 'MOVE_ZONE'
      target: EffectReference
      destination: Zone
      controller?: 'OWNER' | 'PRESERVE'
    }
  | { type: 'UNTAP_PERMANENT'; target: EffectReference }
  | { type: 'TAP_PERMANENT'; target: EffectReference }
  | { type: 'TRANSFORM_PERMANENT'; target: EffectReference }
  | { type: 'PHASE_OUT_PERMANENT'; target: EffectReference }
  | { type: 'PHASE_IN_PERMANENT'; target: EffectReference }
  | {
      type: 'ADD_COUNTER'
      target: EffectReference
      counterType: string
      amount: number
    }
  | {
      type: 'PUT_EVENT_COUNTERS'
      target: EffectReference
    }
  | {
      type: 'MOVE_COUNTERS_BETWEEN_TARGETS'
      from: EffectReference
      to: EffectReference
      prompt?: string
    }
  | {
      type: 'DISTRIBUTE_COUNTERS'
      counterType: string
      amount: number
      query: ObjectQuery
      prompt?: string
    }
  | {
      type: 'ADD_MANA'
      color: 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
      amount: number
    }
  | {
      type: 'ADD_MANA_CHOICE'
      player: PlayerReference
      allowedColors: ManaColor[] | { type: 'COMMANDER_COLOR_IDENTITY' }
      amount: ValueExpression
    }
  | {
      type: 'ADD_MANA_FROM_LINKED_COLORS'
      player: PlayerReference
      key: string
      amount: ValueExpression
    }
  | {
      type: 'ADD_MANA_FROM_PUBLIC_ZONE_COLORS'
      player: PlayerReference
      query: ObjectQuery
      amount: ValueExpression
    }
  | {
      type: 'SELECT_HIDDEN_ZONE_CARD'
      player: PlayerReference
      zone: 'hand' | 'library'
      prompt: string
      constraints: SelectionConstraints
      destination: Zone
      count: number
      allowFail?: boolean
      linkKey?: string
      /** Physical-library hint: only this many top cards were inspected. */
      lookAtTop?: number
    }
  | {
      type: 'SELECT_PUBLIC_ZONE_CARD'
      player: PlayerReference
      zone: 'graveyard' | 'exile'
      prompt: string
      constraints: SelectionConstraints
      allowFail?: boolean
      linkKey?: string
      knownBecause?: 'DECLARED' | 'REVEALED' | 'SEARCHED' | 'MILLED'
    }
  | {
      type: 'CAST_LINKED_CARD_WITHOUT_PAYING_MANA_COST'
      key: string
      fromZone?: 'exile' | 'graveyard'
      exileIfWouldEnterGraveyard?: boolean
    }
  | {
      type: 'COUNTER_SPELL'
      target: EffectReference
      destination?: 'graveyard' | 'exile'
    }
  | { type: 'DESTROY_PERMANENT'; target: EffectReference }
  | {
      type: 'CHANGE_CONTROLLER'
      target: EffectReference
      controller: PlayerReference
    }
  | {
      type: 'ATTACH'
      attachment: EffectReference
      target: EffectReference
    }
  | { type: 'DETACH'; attachment: EffectReference }
  | {
      type: 'CREATE_TOKEN_COPY'
      target: EffectReference
      amount: number
      removeLegendary?: boolean
      overrides?: {
        power?: string
        toughness?: string
        colors?: ManaColor[]
        addSubtypes?: string[]
        removeLegendary?: boolean
      }
    }
  | {
      /** Encore creates one hasty token copy per opponent, with attack requirements and delayed sacrifice. */
      type: 'ENCORE'
    }
  | {
      type: 'COPY_SPELL'
      target: EffectReference
      controller?: PlayerReference
      chooseNewTargets?: boolean
      removeLegendary?: boolean
    }
  | { type: 'RESET_STACK_TARGETS'; target: EffectReference }
  | { type: 'RETARGET_STACK_OBJECT'; target: EffectReference }
  | {
      type: 'LINK_OBJECT'
      target: EffectReference
      key: string
      returnOnSourceLeaves?: {
        fromZone: Zone
        destination: Zone
        controller?: 'OWNER' | 'PRESERVE'
      }
    }
  | {
      type: 'RETURN_LINKED_OBJECTS'
      key: string
      destination: Zone
      controller?: 'OWNER' | 'PRESERVE'
    }
  | {
      type: 'DEAL_DAMAGE'
      target: EffectReference
      amount: ValueExpression
      damageKind: 'NONCOMBAT'
    }
  | {
      type: 'SET_BASE_POWER_TOUGHNESS'
      target: EffectReference
      power: ValueExpression
      toughness: ValueExpression
      duration: 'UNTIL_END_OF_TURN'
    }
  | { type: 'REMOVE_ALL_COUNTERS'; target: EffectReference }
  | {
      type: 'ADD_CREATURE_SUBTYPE'
      target: EffectReference
      subtype: RuntimeTextReference
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'SET_COLORS'
      target: EffectReference
      colors: ManaColor[]
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'GRANT_PROTECTION'
      target: EffectReference
      protection:
        | { type: 'EVERYTHING' }
        | { type: 'CARD_TYPE'; cardType: RuntimeTextReference }
        | { type: 'COLORS'; colors: ManaColor[] }
      duration: 'UNTIL_END_OF_TURN' | 'UNTIL_SOURCE_CONTROLLER_NEXT_TURN'
    }
  | {
      type: 'PREVENT_NEXT_DAMAGE'
      target: EffectReference
      amount: ValueExpression
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'ADD_PLAYER_RULE'
      player: PlayerReference
      rules: {
        hexproof?: boolean
        protectionFromEverything?: boolean
        lifeTotalCannotChange?: boolean
        cannotLoseLife?: boolean
        cannotWinOrLose?: boolean
      }
      duration: 'UNTIL_END_OF_TURN' | 'UNTIL_PLAYER_NEXT_TURN'
    }
  | { type: 'AIRBEND'; target: EffectReference }
  | {
      type: 'PUT_SOURCE_ONTO_BATTLEFIELD_ATTACKING'
      defendingTarget:
        | { type: 'PLAYER'; player: PlayerReference }
        | { type: 'PERMANENT'; target: EffectReference }
    }
  | {
      type: 'ADD_RESTRICTED_MANA'
      color: 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
      amount: number
      restriction: 'CREATURE_SPELLS_ONLY'
    }
  | {
      type: 'TEMPORARY_MODIFIER'
      target: EffectReference
      power?: number
      toughness?: number
      grantKeywords?: string[]
      duration: 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'GRANT_TRIGGERED_ABILITY_UNTIL_END_OF_TURN'
      target: EffectReference
      ability: Omit<TriggeredAbilityDefinition, 'sourceCardName'>
    }
  | {
      type: 'ADD_UNTAP_RESTRICTION'
      target: EffectReference
      duration: 'WHILE_SOURCE_CONTROLLED'
    }
  | { type: 'QUEUE_EXTRA_TURN'; player: PlayerReference }
  | { type: 'END_TURN' }
  | { type: 'SKIP_NEXT_COMBAT_PHASES'; player: PlayerReference }
  | { type: 'ENTERS_TAPPED' }
  | {
      type: 'CHANGE_LAND_SUBTYPE'
      target: EffectReference
      subtype: RuntimeTextReference
      mode: 'ADD' | 'SET'
      duration: 'UNTIL_END_OF_TURN' | 'WHILE_COUNTER_PRESENT'
      counterType?: string
    }
  | {
      type: 'CANNOT_BE_BLOCKED'
      target: EffectReference
      duration: 'UNTIL_END_OF_TURN'
    }
  | { type: 'DISCARD_CARD'; player: 'YOU'; amount: number }
  | { type: 'SACRIFICE'; target: EffectReference }
  | { type: 'SET_VARIABLE'; variableName: string; value: ValueExpression }
  | { type: 'FOR_EACH'; query: ObjectQuery; effects: ResolvedEffect[] }
  | {
      type: 'FOR_EACH_SELECTED'
      selection: 'TARGETS' | 'CARDS'
      filter?: ObjectQuery
      effects: ResolvedEffect[]
    }
  | {
      type: 'DELAYED_EFFECT'
      trigger: TriggerDefinition
      triggerPlayer?: PlayerReference
      effects: EffectDefinition[]
    }
  | {
      type: 'CONDITIONAL_EFFECT'
      condition: ConditionExpression
      ifTrue: ResolvedEffect[]
      ifFalse?: ResolvedEffect[]
    }
  | {
      type: 'PAYMENT_BRANCH'
      payer: PlayerReference
      cost: PaymentCost
      ifPaid: ResolvedEffect[]
      ifNotPaid: ResolvedEffect[]
      prompt?: string
    }
  | {
      type: 'CHOOSE_MODE'
      prompt: string
      modes: Array<{ id: string; label: string; effects: ResolvedEffect[] }>
    }
  | {
      type: 'CHOOSE_VALUE'
      prompt: string
      variableName: string
      options?: ChooseValueOption[]
      allowCustomValue?: boolean
      customValueLabel?: string
    }
  | {
      type: 'STORE_SOURCE_VALUE'
      key: string
      value: RuntimeValueSource
    }
  | {
      type: 'SEARCH_LIBRARY_CARD'
      player: PlayerReference
      prompt: string
      constraints: SelectionConstraints
      reveal: boolean
      shuffle: boolean
      allowFail?: boolean
      destination: LibrarySearchDestination
      controller?: 'SOURCE_CONTROLLER' | 'OWNER'
    }
  | {
      type: 'PHYSICAL_CONFIRMATION'
      prompt: string
      effects: ResolvedEffect[]
    }
  | {
      type: 'MOVE_UNKNOWN_HIDDEN_CARDS'
      fromZone: 'library' | 'hand'
      toZone: 'library' | 'hand'
      amount: number
    }
  | { type: 'SHUFFLE_LIBRARY'; player: PlayerReference }
  | {
      type: 'SET_PLAYER_MAX_HAND_SIZE'
      player: PlayerReference
      value: number | 'UNLIMITED'
    }
  | {
      type: 'OPTIONAL_EFFECT'
      prompt: string
      effects: ResolvedEffect[]
    }
  | {
      type: 'TARGET_SELECTION'
      prompt: string
      constraints: SelectionConstraints
      count?: number
      /** Allows declaring any number from zero up to count. */
      allowFewer?: boolean
      effects: ResolvedEffect[]
    }
  | {
      type: 'CARD_SELECTION'
      prompt: string
      constraints: SelectionConstraints
      count?: number
      effects: ResolvedEffect[]
    }

export type TriggeredAbilityDefinition = {
  id: string
  sourceCardName: string
  kind: 'TRIGGERED'
  trigger: TriggerDefinition
  conditions: ConditionDefinition[]
  effects: EffectDefinition[]
  automation: AutomationLevel
  /** Zones where this triggered ability functions; battlefield is the default. */
  activeZones?: Zone[]
  /** Generic once-per-turn trigger guard keyed by source object + ability. */
  triggerLimit?: 'ONCE_EACH_TURN'
}

export type ActivationCost =
  | { type: 'TAP_SOURCE' }
  | { type: 'MANA_COST'; cost: string; genericReduction?: ValueExpression }
  | { type: 'WATERBEND'; amount: ValueExpression }
  | { type: 'DISCARD_SOURCE' }
  | { type: 'SACRIFICE_SOURCE' }
  | {
      type: 'SACRIFICE_PERMANENT'
      constraints: SelectionConstraints
      prompt: string
    }
  | { type: 'EXILE_SOURCE_FROM_GRAVEYARD' }
  | { type: 'EXILE_SOURCE_FROM_BATTLEFIELD' }
  | { type: 'REMOVE_COUNTERS_FROM_SOURCE'; counterType: string; amount: ValueExpression }
  | {
      /** Signed loyalty change paid as an activation cost (+ adds, - removes). */
      type: 'LOYALTY'
      amount: number
    }

export type StaticObjectFilter = {
  controller?: 'YOU' | 'OPPONENT'
  owner?: 'YOU' | 'OPPONENT'
  cardType?: string
  excludeCardType?: string
  subtype?: RuntimeTextReference
  excludeSubtype?: RuntimeTextReference
  subtypesAnyOf?: RuntimeTextReference[]
  hasKeyword?: string
  colors?: ManaColor[]
  excludeColors?: ManaColor[]
  excludeSource?: boolean
  sourceOnly?: boolean
  /** Matches lands without the Basic supertype. */
  nonbasicLand?: boolean
  /** Matches the permanent currently attached to this static source. */
  attachedToSource?: boolean
  isCommander?: boolean
  hasCounterType?: string
  counterCountAtLeast?: number
}

export type BlockingRestriction =
  | {
      type: 'CANNOT_BE_BLOCKED'
      filter: StaticObjectFilter
      duration?: 'STATIC' | 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'LANDWALK'
      filter: StaticObjectFilter
      landSubtype: string
      duration?: 'STATIC' | 'UNTIL_END_OF_TURN'
    }
  | {
      type: 'CANNOT_BE_BLOCKED_BY_POWER_AT_MOST'
      filter: StaticObjectFilter
      power: number
      duration?: 'STATIC' | 'UNTIL_END_OF_TURN'
    }

export type StaticEffectDefinition =
  | {
      type: 'MODIFY_COST'
      operation: 'INCREASE_GENERIC_COST' | 'REDUCE_GENERIC_COST'
      amount: number
      filter: StaticObjectFilter
      condition?: StaticCondition
      spellOrdinal?: 'FIRST_MATCHING_EACH_TURN'
    }
  | {
      type: 'CAST_RESTRICTION'
      filter: StaticObjectFilter
      rule: 'MANA_VALUE_AT_MOST_LANDS_CONTROLLED'
    }
  | {
      type: 'DRAW_LIMIT'
      player: 'OPPONENT'
      maxPerTurn: number
    }
  | {
      /** Replacement-like static rule evaluated immediately before entry. */
      type: 'ENTERS_TAPPED_FILTER'
      filter: StaticObjectFilter
    }
  | {
      /** Declaration-wide attack tax such as Windborn Muse/Propaganda. */
      type: 'ATTACK_TAX'
      defendingPlayer: 'SOURCE_CONTROLLER'
      genericPerAttacker: number
    }
  | {
      /** Generic declaration-wide blocking tax for blockers assigned to this controller's attackers. */
      type: 'BLOCK_TAX'
      attackingPlayer: 'SOURCE_CONTROLLER'
      genericPerBlocker: number
    }
  | {
      type: 'COMBAT_RESTRICTION'
      rule: 'CANNOT_ATTACK' | 'CANNOT_BLOCK' | 'CANNOT_ATTACK_OR_BLOCK'
      filter: StaticObjectFilter
    }
  | {
      type: 'UNTAP_RESTRICTION'
      filter: StaticObjectFilter
    }
  | {
      type: 'UNTAP_DURING_EACH_PLAYERS_UNTAP'
      filter: StaticObjectFilter
    }
  | {
      type: 'MODIFY_POWER_TOUGHNESS'
      power: number | ValueExpression
      toughness: number | ValueExpression
      /** Existing definitions keep legacy semantics; ADD makes both values additive. */
      operation?: 'ADD'
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | { type: 'BLOCKING_RESTRICTION'; restriction: BlockingRestriction }
  | {
      type: 'GRANT_KEYWORD'
      keyword: string
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'WARD'
      cost: string
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'PROTECTION_FROM_COLORS'
      colors: ManaColor[] | { type: 'NOT_IN_COMMANDER_COLOR_IDENTITY' }
      filter: StaticObjectFilter
    }
  | {
      type: 'SET_BASE_POWER_TOUGHNESS'
      power: number | ValueExpression
      toughness: number | ValueExpression
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'ADD_CARD_TYPE'
      cardType: string
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'REMOVE_CARD_TYPE'
      cardType: string
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'SET_CREATURE_SUBTYPES'
      subtypes: string[]
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'ADD_CREATURE_SUBTYPE'
      subtype: RuntimeTextReference
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'SET_NAME'
      name: string
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'LOSE_ALL_ABILITIES'
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'GRANT_ACTIVATED_ABILITY'
      ability: Omit<ActivatedAbilityDefinition, 'sourceCardName'>
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'GRANT_TRIGGERED_ABILITY'
      ability: Omit<TriggeredAbilityDefinition, 'sourceCardName'>
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'PREVENT_ALL_DAMAGE'
      filter: StaticObjectFilter
      condition?: StaticCondition
    }
  | {
      type: 'PROTECTION_FROM_CARD_TYPES'
      cardTypes: string[]
      filter: StaticObjectFilter
    }
  | {
      type: 'PROTECTION_FROM_EVERYTHING'
      filter: StaticObjectFilter
    }
  | {
      type: 'MODIFY_TARGETING_COST'
      amount: number
      appliesTo: 'SPELL' | 'ACTIVATED_ABILITY' | 'BOTH'
      targetFilter: StaticObjectFilter
      sourceController: 'OPPONENT'
    }
  | {
      /** Sets the land subtype while this static source remains on the battlefield. */
      type: 'SET_LAND_SUBTYPE'
      subtype: string
      filter: StaticObjectFilter
    }
  | {
      type: 'SET_MAX_HAND_SIZE'
      player: PlayerReference
      value: number | 'UNLIMITED'
    }
  | {
      /** Permission for declaration-driven casts from the physical library top. */
      type: 'ALLOW_CAST_FROM_LIBRARY_TOP'
      filter: StaticObjectFilter
    }
  | {
      /** Optional first token event replacement used by attached-copy effects. */
      type: 'REPLACE_FIRST_TOKEN_CREATION_WITH_ATTACHED_COPIES'
      optional: boolean
    }

export type ActivatedAbilityDefinition = {
  id: string
  sourceCardName: string
  kind: 'ACTIVATED'
  costs: ActivationCost[]
  effects: EffectDefinition[]
  restrictions?: string[]
  /** Board-state restrictions that must be true to activate this ability. */
  activationConditions?: StaticCondition[]
  /** Zones where this ability functions; battlefield is the default. */
  activeZones?: Zone[]
  /** Generic per-object activation limit used by mechanics such as exhaust. */
  activationLimit?: 'ONCE_PER_OBJECT'
  isManaAbility?: boolean
  automation: AutomationLevel
}

export type StaticAbilityDefinition = {
  id: string
  sourceCardName: string
  kind: 'STATIC'
  effects: StaticEffectDefinition[]
}

export type AsEntersAbilityDefinition = {
  id: string
  sourceCardName: string
  kind: 'AS_ENTERS'
  effects: EffectDefinition[]
  automation: AutomationLevel
}

export type AbilityDefinition =
  | TriggeredAbilityDefinition
  | ActivatedAbilityDefinition
  | StaticAbilityDefinition
  | AsEntersAbilityDefinition
  | SpellEffectDefinition

/** A spell's declarative instructions. It is resolved from the stack, not the battlefield. */
export type SpellEffectDefinition = {
  id: string
  sourceCardName: string
  kind: 'SPELL_EFFECT'
  effects: EffectDefinition[]
  /** Optional declaration-time Gift promise. The choice is made before targets/costs. */
  gift?: GiftDeclarationDefinition
  cannotBeCountered?: true
  automation: AutomationLevel
}

export type CapturedResolutionContext = Pick<
  ResolutionContext,
  | 'selectedTargets'
  | 'selectedCards'
  | 'selectedStackObjects'
  | 'selectedPlayers'
  | 'variables'
  | 'declaredTargets'
>

export type DelayedEffect = {
  id: string
  sourceAbilityId: string
  sourceInstanceId: string
  sourceCardName: string
  sourceControllerId?: string
  trigger: TriggerDefinition
  triggerPlayer?: PlayerReference
  effects: EffectDefinition[]
  capturedContext: CapturedResolutionContext
  automation: AutomationLevel
}

export type PendingAbility = {
  id: string
  abilityId: string
  sourceInstanceId: string
  sourceCardName: string
  /** Controller of the ability on the stack when it differs from source lookup. */
  controllerId?: string
  createdFromEvent: GameEvent
  resolvedEffects: ResolvedEffect[]
  automation: AutomationLevel
  triggerLimit?: 'ONCE_EACH_TURN'
  capturedContext?: CapturedResolutionContext
}

export type ResolutionContext = {
  sourceInstanceId: string
  triggeringEvent: GameEvent
  selectedTargets: string[]
  /** Constraints captured when each target was declared; used to revalidate on resolution. */
  selectedTargetConstraints?: SelectionConstraints[]
  /** Targets chosen before costs/stack placement, consumed by the first direct TARGET_SELECTION. */
  declaredTargets?: DeclaredTarget[]
  declaredTargetsConsumed?: boolean
  selectedCards: string[]
  selectedStackObjects: string[]
  selectedPlayers?: string[]
  currentObjectId?: string
  currentPlayerId?: string
  variables: Record<string, RuntimeVariableValue>
}

/** Serializable paused resolution. It is data, never a callback into React. */
export type PendingResolution = {
  id: string
  sourceAbilityId: string
  sourceInstanceId: string
  sourceCardName: string
  effects: ResolvedEffect[]
  currentEffectIndex: number
  context: ResolutionContext
  /** Actions applied exactly once after this resolution finishes. */
  completionActions?: GameAction[]
}

export type PendingDecision = {
  id: string
  sourceAbilityId: string
  sourceInstanceId: string
  /** Participant responsible for answering; omitted in legacy/local decisions. */
  decisionPlayerId?: string
  type:
    | 'OPTIONAL_EFFECT'
    | 'TARGET_SELECTION'
    | 'CARD_SELECTION'
    | 'ABILITY_SELECTION'
    | 'MANA_PAYMENT_SELECTION'
    | 'MANA_SOURCE_SELECTION'
    | 'TRIGGER_ORDER_SELECTION'
    | 'TRIGGER_TARGET_SELECTION'
    | 'STACK_COPY_RETARGET_SELECTION'
    | 'STACK_RETARGET_SELECTION'
    | 'REPLACEMENT_EFFECT'
    | 'LEGEND_RULE_SELECTION'
    | 'COMMANDER_ZONE_CHOICE'
    | 'COMMANDER_REPLACEMENT_CHOICE'
    | 'CLEANUP_DISCARD_SELECTION'
    | 'ATTACK_TARGET_SELECTION'
    | 'COMBAT_DAMAGE_ASSIGNMENT'
    | 'PAYMENT_CHOICE'
    | 'CHOOSE_MODE'
    | 'CHOOSE_VALUE'
    | 'NUMBER_SELECTION'
    | 'CAST_OPTION_SELECTION'
    | 'CAST_MODE_SELECTION'
    | 'CAST_GIFT_SELECTION'
    | 'CAST_GIFT_RECIPIENT_SELECTION'
    | 'CAST_TARGET_SELECTION'
    | 'EXTERNAL_SPELL_TARGET_SELECTION'
    | 'ACTIVATION_MODE_SELECTION'
    | 'ACTIVATION_TARGET_SELECTION'
    | 'ACTIVATION_VARIABLE_SELECTION'
    | 'CAST_COST_CARD_SELECTION'
    | 'CAST_GENERIC_CONTRIBUTION_COUNT'
    | 'CAST_GENERIC_CONTRIBUTION_SELECTION'
    | 'HIDDEN_ZONE_CARD_SELECTION'
    | 'PUBLIC_ZONE_CARD_SELECTION'
    | 'LINKED_FREE_CAST_SELECTION'
    | 'PHYSICAL_CONFIRMATION'
    | 'PLAYER_SELECTION'
    | 'ACTIVATION_COST_PERMANENT_SELECTION'
    | 'ACTIVATION_WATERBEND_COUNT'
    | 'ACTIVATION_WATERBEND_SELECTION'
    | 'COUNTER_MOVE_TYPE_SELECTION'
    | 'COUNTER_MOVE_AMOUNT_SELECTION'
    | 'COUNTER_DISTRIBUTION_SELECTION'
  prompt: string
  options?: Array<{ instanceId: string; label: string }>
  /** Allows a typed text value in addition to listed options. */
  acceptsTextValue?: boolean
  textValueLabel?: string
  constraints?: SelectionConstraints
  continuation: {
    resolutionId?: string
    effectsToExecute: ResolvedEffect[]
    resumeEffectIndex: number
    activationSourceInstanceId?: string
    castGiftDeclaration?: {
      cardName: string
      displayedManaCost?: string
      castAction: Extract<GameAction, { type: 'CAST_SPELL' }>
      cost: { generic: number; colors: Partial<Record<ManaColor, number>> }
      promisedVariableName: string
      recipientVariableName: string
      prompt?: string
      recipientPrompt?: string
    }
    castModeDeclaration?: {
      cardName: string
      displayedManaCost?: string
      castAction: Extract<GameAction, { type: 'CAST_SPELL' }>
      cost: { generic: number; colors: Partial<Record<ManaColor, number>> }
      abilityId: string
      modes: Array<{ id: string; label: string }>
    }
    activationModeDeclaration?: {
      sourceInstanceId: string
      abilityId: string
      variables: Record<string, RuntimeVariableValue>
      modes: Array<{ id: string; label: string }>
      declaredTargets: DeclaredTarget[]
    }
    castTargetDeclaration?: {
      cardName: string
      displayedManaCost?: string
      castAction: Extract<GameAction, { type: 'CAST_SPELL' }>
      cost: { generic: number; colors: Partial<Record<ManaColor, number>> }
      prompt: string
      constraints: SelectionConstraints
      requiredCount: number
      minimumCount?: number
      allowFewer?: boolean
      abilityId?: string
      selectedTargets: DeclaredTarget[]
      nonManaCosts?: CastNonManaCostDefinition[]
    }
    externalSpellDeclaration?: {
      castAction: Extract<GameAction, { type: 'CAST_SPELL' }>
      prompt: string
      constraints: SelectionConstraints
      requiredCount: number
      selectedTargets: DeclaredTarget[]
    }
    activationTargetDeclaration?: {
      sourceInstanceId: string
      abilityId: string
      variables: Record<string, RuntimeVariableValue>
      prompt: string
      constraints: SelectionConstraints
      requiredCount: number
      selectedTargets: DeclaredTarget[]
    }
    /** Serializable cast continuation; never a function or UI callback. */
    manaPayment?: {
      castAction: Extract<GameAction, { type: 'CAST_SPELL' }>
      options: Array<{ id: string; actions: GameAction[] }>
    }
    /** Serializable automatic-mana continuation; no callback is stored. */
    manaSourcePayment?: {
      castAction: Extract<GameAction, { type: 'CAST_SPELL' }>
      options: Array<{ id: string; actions: GameAction[] }>
    }
    /** Generic mana payment followed by non-cast actions (for example attack taxes). */
    actionPayment?: {
      options: Array<{ id: string; actions: GameAction[] }>
      completionActions: GameAction[]
    }
    triggerOrder?: {
      pendingAbilityIds: string[]
      /** Choices already made from bottom to top of the stack. */
      orderedPendingAbilityIds?: string[]
    }
    triggerTargetDeclaration?: {
      pendingAbilityId: string
      prompt: string
      constraints: SelectionConstraints
      requiredCount: number
      selectedTargets: DeclaredTarget[]
      optional: boolean
      /** Triggers still to place, already ordered from bottom to top. */
      remainingPendingAbilityIds: string[]
    }
    stackCopyRetarget?: {
      stackObjectId: string
      targetIndex: number
      declaredTargets: DeclaredTarget[]
    }
    stackRetarget?: {
      stackObjectId: string
      targetIndex: number
      declaredTargets: DeclaredTarget[]
      resumeEffectIndex: number
    }
    replacement?: {
      effectId: string
      originalAction: GameAction
      replacementActions: GameAction[]
      deferredActions: GameAction[]
    }
    legendRule?: { keepOptions: string[]; moveToGraveyard: string[] }
    cleanupDiscard?: { maxHandSize: number }
    commanderZone?: {
      instanceId: string
      currentZone: Zone
      moveAction?: GameAction
      /** Remaining atomic action sequence, resumed after the replacement choice. */
      deferredActions?: GameAction[]
    }
    combatDamage?: {
      options: Array<{
        id: string
        label: string
        damages: import('../../types/combat').DamageRecord[]
      }>
      accumulatedDamages: import('../../types/combat').DamageRecord[]
      remainingAssignments: Array<{
        sourceInstanceId: string
        sourceCardName: string
        power: number
        options: Array<{
          id: string
          label: string
          damages: import('../../types/combat').DamageRecord[]
        }>
      }>
      completionActions: GameAction[]
    }
    payment?: {
      payer: PlayerReference
      cost: PaymentCost
      ifPaid: ResolvedEffect[]
      ifNotPaid: ResolvedEffect[]
      options?: Array<{ id: string; actions: GameAction[] }>
    }
    modes?: Array<{ id: string; effects: ResolvedEffect[] }>
    selectionBatch?: {
      kind: 'TARGET' | 'CARD'
      prompt: string
      constraints: SelectionConstraints
      requiredCount: number
      selectedIds: string[]
      effects: ResolvedEffect[]
    }
    chooseValue?: {
      variableName: string
      options: Array<{ id: string; value: RuntimeVariableValue }>
      allowCustomValue?: boolean
    }
    activationVariable?: {
      sourceInstanceId: string
      abilityId: string
      variableName: string
      options: number[]
    }
    activationWaterbend?: {
      sourceInstanceId: string
      abilityId: string
      variables: Record<string, RuntimeVariableValue>
      declaredTargets: DeclaredTarget[]
      requiredAmount: number
      selectedIds: string[]
      requiredCount?: number
    }
    /** Precomputed legal continuations for a numeric casting variable such as X. */
    castVariable?: {
      variableName: string
      options: Array<{ id: string; value: number; actions: GameAction[] }>
    }
    /** Precomputed complete action sequences for a casting-cost mode. */
    castOptions?: Array<{ id: string; actions: GameAction[] }>
    /** Hidden-hand declaration used while paying a non-mana casting cost. */
    castCardCost?: {
      pendingActions: GameAction[]
      costActions: GameAction[]
      requiredCount: number
      selected: Array<{
        instanceId: string
        scryfallId: string
        materialize: boolean
      }>
      colors?: ManaColor[]
      excludeSourceInstanceId?: string
      sourceScryfallId: string
      /** Hidden contribution selected before mana payment is planned. */
      genericReductionContribution?: {
        cardName: string
        displayedManaCost?: string
        castAction: Extract<GameAction, { type: 'CAST_SPELL' }>
        cost: { generic: number; colors: Partial<Record<ManaColor, number>> }
        genericReductionPerCard: number
      }
    }
    castContribution?: {
      cardName: string
      displayedManaCost?: string
      castAction: Extract<GameAction, { type: 'CAST_SPELL' }>
      cost: { generic: number; colors: Partial<Record<ManaColor, number>> }
      contributionType:
        | 'TAP_PERMANENTS'
        | 'EXILE_CARDS_FROM_GRAVEYARD'
        | 'EXILE_DECLARED_CARDS_FROM_HAND'
      candidateIds: string[]
      countOptions?: number[]
      requiredCount?: number
      selectedIds?: string[]
      colors?: ManaColor[]
      excludeSource?: boolean
      genericReductionPerCard?: number
    }
    counterMove?: {
      sourceInstanceId: string
      targetInstanceId: string
      available: Record<string, number>
      moved: Record<string, number>
      selectedCounterType?: string
    }
    counterDistribution?: {
      counterType: string
      remaining: number
      candidateIds: string[]
      allocations: Record<string, number>
      prompt?: string
    }
    playerSelection?: {
      relation: PlayerSelectionRelation
      effects: ResolvedEffect[]
    }
    activationCostSelection?: {
      sourceInstanceId: string
      abilityId: string
      constraints: SelectionConstraints
      variables: Record<string, RuntimeVariableValue>
      declaredTargets?: DeclaredTarget[]
    }
    linkedFreeCast?: {
      cardInstanceId: string
      fromZone: 'exile' | 'graveyard'
      actorPlayerId: string
      exileIfWouldEnterGraveyard?: boolean
      /** This primitive is terminal: finish the current ability before declaring the cast. */
      finishResolution: true
    }
    publicZoneSelection?: {
      playerId: string
      zone: 'graveyard' | 'exile'
      constraints: SelectionConstraints
      allowFail?: boolean
      linkKey?: string
      knownBecause: 'DECLARED' | 'REVEALED' | 'SEARCHED' | 'MILLED'
    }
    hiddenZoneSelection?: {
      player: PlayerReference
      zone: 'hand' | 'library'
      constraints: SelectionConstraints
      destination: Zone
      requiredCount: number
      selected: Array<{
        instanceId: string
        scryfallId: string
        materialize: boolean
      }>
      allowFail?: boolean
      linkKey?: string
    }
    librarySearch?: {
      player: PlayerReference
      /** Resolved owner of the searched physical library. */
      playerId?: string
      constraints: SelectionConstraints
      reveal: boolean
      shuffle: boolean
      allowFail?: boolean
      destination: LibrarySearchDestination
      controller?: 'SOURCE_CONTROLLER' | 'OWNER'
    }
  }
}
