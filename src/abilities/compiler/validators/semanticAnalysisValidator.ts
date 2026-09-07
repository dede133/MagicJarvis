import type {
  AbilityCompilerInput,
  CapabilityGapCategory,
  SemanticAbilityAnalysis,
  SemanticCardAnalysis,
} from '../types/compilerTypes'
import type { ValidationResult } from './abilityDefinitionValidator'

export const semanticCapabilityCategories: CapabilityGapCategory[] = [
  'DRAW_CARD',
  'DISCARD_CARD',
  'TAP_PERMANENT',
  'TAP_SOURCE',
  'UNTAP_PERMANENT',
  'ADD_COUNTER',
  'REMOVE_COUNTER',
  'GAIN_LIFE',
  'SCRY',
  'SURVEIL',
  'GIFT',
  'PREVENT_DAMAGE',
  'PROTECTION',
  'AIRBEND',
  'RESTRICTED_MANA',
  'CHANNEL',
  'WATERBEND',
  'CHARACTERISTIC_MODIFICATION',
  'GRANT_TRIGGERED_ABILITY',
  'LOSE_LIFE',
  'CREATE_TOKEN',
  'MOVE_ZONE',
  'MANA_PRODUCTION',
  'COST_MODIFICATION',
  'STATIC_EFFECT',
  'STATIC_ABILITY',
  'CONTINUOUS_EFFECT',
  'REPLACEMENT_EFFECT',
  'ACTIVATED_ABILITY',
  'PLAYER_CHOICE',
  'TARGET_SELECTION',
  'CARD_SELECTION',
  'VARIABLE_X',
  'COPY_SPELL',
  'COUNTER_SPELL',
  'TYPE_MODIFICATION',
  'POWER_TOUGHNESS_MODIFICATION',
  'ENTER_BATTLEFIELD',
  'SHUFFLE_LIBRARY',
  'LINKED_OBJECT',
  'TOKEN_KEYWORD_ABILITY',
  'NON_TOKEN_FILTER',
  'COLOR_QUERY',
  'SPELL_CAST_TRIGGER',
  'NONCREATURE_SPELL_CONDITION',
  'BLUE_MANA_SYMBOL_COUNT',
  'BLUE_MERFOLK_TOKEN',
  'OTHER',
]

const abilityKinds = [
  'TRIGGERED',
  'ACTIVATED',
  'STATIC',
  'REPLACEMENT',
  'SPELL_EFFECT',
  'KEYWORD',
  'OTHER',
]
const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const exactKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key))

const abilityKeys = [
  'abilityKind',
  'triggerDescription',
  'costs',
  'conditions',
  'effects',
  'targets',
  'choices',
  'restrictions',
  'duration',
  'referencedObjects',
  'requiredCapabilities',
  'unsupportedOrUnclear',
]

const validateSemanticAbility = (
  value: unknown,
  errors: string[],
): value is SemanticAbilityAnalysis => {
  if (!isRecord(value) || !exactKeys(value, abilityKeys)) {
    errors.push('Semantic ability has missing or unknown fields.')
    return false
  }
  const valid =
    abilityKinds.includes(String(value.abilityKind)) &&
    (typeof value.triggerDescription === 'string' ||
      value.triggerDescription === null) &&
    stringArray(value.costs) &&
    stringArray(value.conditions) &&
    stringArray(value.effects) &&
    stringArray(value.targets) &&
    stringArray(value.choices) &&
    stringArray(value.restrictions) &&
    (typeof value.duration === 'string' || value.duration === null) &&
    stringArray(value.referencedObjects) &&
    Array.isArray(value.requiredCapabilities) &&
    value.requiredCapabilities.every((capability) =>
      semanticCapabilityCategories.includes(
        capability as CapabilityGapCategory,
      ),
    ) &&
    stringArray(value.unsupportedOrUnclear)
  if (!valid) errors.push('Semantic ability fields are invalid.')
  if (value.abilityKind === 'TRIGGERED' && !value.triggerDescription)
    errors.push('Triggered semantic ability requires a trigger description.')
  if (
    value.abilityKind !== 'TRIGGERED' &&
    typeof value.triggerDescription === 'string' &&
    /^\s*(?:when(?:ever)?|at the beginning)\b/i.test(value.triggerDescription)
  )
    errors.push(
      'When/whenever trigger language must be classified as a TRIGGERED semantic ability.',
    )
  if (value.abilityKind === 'ACTIVATED' && !(value.costs as unknown[]).length)
    errors.push(
      'Activated semantic ability requires at least one described cost.',
    )
  return valid
}

/** Validates the non-executable LLM analysis before coverage or mapping. */
export const validateSemanticCardAnalysis = (
  input: AbilityCompilerInput,
  value: unknown,
): ValidationResult<SemanticCardAnalysis> => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['abilities', 'unsupportedOrUnclear'])
  )
    return {
      valid: false,
      errors: ['Semantic analysis has missing or unknown fields.'],
    }
  const errors: string[] = []
  if (!Array.isArray(value.abilities))
    errors.push('Semantic abilities must be an array.')
  else
    value.abilities.forEach((ability) =>
      validateSemanticAbility(ability, errors),
    )
  if (!stringArray(value.unsupportedOrUnclear))
    errors.push('Semantic unsupportedOrUnclear must be an array of strings.')
  if (errors.length) return { valid: false, errors }
  return {
    valid: true,
    value: {
      cardName: input.cardName,
      oracleText: input.oracleText,
      abilities: value.abilities as SemanticAbilityAnalysis[],
      unsupportedOrUnclear: value.unsupportedOrUnclear as string[],
    },
  }
}
