import type { AbilityDefinition } from '../../types/abilityTypes'

export const ABILITY_DSL_VERSION = '1'
export const ABILITY_COMPILER_VERSION = '0.2.0'

export type CompilationStatus =
  'COMPILED' | 'PARTIAL' | 'MANUAL' | 'FAILED' | 'NO_RUNTIME_ABILITY'

export type AbilityCompilerInput = {
  cardName: string
  oracleId?: string
  typeLine: string
  manaCost?: string
  oracleText?: string
}

/** Analysis-only gaps. These never add behavior to the game runtime. */
export type CapabilityGapCategory =
  | 'DRAW_CARD'
  | 'DISCARD_CARD'
  | 'TAP_PERMANENT'
  | 'TAP_SOURCE'
  | 'UNTAP_PERMANENT'
  | 'ADD_COUNTER'
  | 'REMOVE_COUNTER'
  | 'GAIN_LIFE'
  | 'SCRY'
  | 'SURVEIL'
  | 'GIFT'
  | 'PREVENT_DAMAGE'
  | 'PROTECTION'
  | 'AIRBEND'
  | 'RESTRICTED_MANA'
  | 'CHANNEL'
  | 'WATERBEND'
  | 'CHARACTERISTIC_MODIFICATION'
  | 'GRANT_TRIGGERED_ABILITY'
  | 'LOSE_LIFE'
  | 'CREATE_TOKEN'
  | 'MOVE_ZONE'
  | 'MANA_PRODUCTION'
  | 'COST_MODIFICATION'
  | 'STATIC_EFFECT'
  | 'STATIC_ABILITY'
  | 'CONTINUOUS_EFFECT'
  | 'REPLACEMENT_EFFECT'
  | 'ACTIVATED_ABILITY'
  | 'PLAYER_CHOICE'
  | 'TARGET_SELECTION'
  | 'CARD_SELECTION'
  | 'VARIABLE_X'
  | 'COPY_SPELL'
  | 'COUNTER_SPELL'
  | 'TYPE_MODIFICATION'
  | 'POWER_TOUGHNESS_MODIFICATION'
  | 'ENTER_BATTLEFIELD'
  | 'SHUFFLE_LIBRARY'
  | 'LINKED_OBJECT'
  | 'TOKEN_KEYWORD_ABILITY'
  | 'NON_TOKEN_FILTER'
  | 'COLOR_QUERY'
  | 'SPELL_CAST_TRIGGER'
  | 'NONCREATURE_SPELL_CONDITION'
  | 'BLUE_MANA_SYMBOL_COUNT'
  | 'BLUE_MERFOLK_TOKEN'
  | 'OTHER'

export type CapabilityGap = {
  category: CapabilityGapCategory
  description: string
  oracleFragment: string
}

export type AbilityCompilerCandidate = {
  abilities: unknown[]
  status: Exclude<CompilationStatus, 'FAILED'>
  unsupportedFragments?: string[]
  warnings?: string[]
  capabilityGaps?: unknown[]
}

export type CompiledCardAbilities = {
  cardName: string
  oracleId?: string
  oracleText?: string
  abilities: AbilityDefinition[]
  status: CompilationStatus
  unsupportedFragments?: string[]
  warnings?: string[]
  capabilityGaps?: CapabilityGap[]
  compilerVersion: string
  abilityDslVersion: typeof ABILITY_DSL_VERSION
}

/**
 * A non-executable interpretation of one Oracle-text ability.
 * Text fields deliberately describe concepts rather than game-engine instructions.
 */
export type SemanticAbilityKind =
  | 'TRIGGERED'
  | 'ACTIVATED'
  | 'STATIC'
  | 'REPLACEMENT'
  | 'SPELL_EFFECT'
  | 'KEYWORD'
  | 'OTHER'

export type SemanticAbilityAnalysis = {
  abilityKind: SemanticAbilityKind
  triggerDescription: string | null
  costs: string[]
  conditions: string[]
  effects: string[]
  targets: string[]
  choices: string[]
  restrictions: string[]
  duration: string | null
  referencedObjects: string[]
  requiredCapabilities: CapabilityGapCategory[]
  unsupportedOrUnclear: string[]
}

export type SemanticCardAnalysis = {
  cardName: string
  oracleText?: string
  abilities: SemanticAbilityAnalysis[]
  unsupportedOrUnclear: string[]
}

/** Future providers return untrusted data that must always pass local validation. */
export interface AbilityCompilerProvider {
  readonly providerId?: string
  readonly model?: string
  compile(input: AbilityCompilerInput): Promise<AbilityCompilerCandidate>
}

/** Providers return untrusted semantic descriptions, never runtime AbilityDefinitions. */
export interface SemanticAbilityAnalysisProvider {
  readonly providerId?: string
  readonly model?: string
  analyze(input: AbilityCompilerInput): Promise<unknown>
}
