import type {
  CapabilityGap,
  CapabilityGapCategory,
} from '../types/compilerTypes'
import type { ValidationResult } from './abilityDefinitionValidator'

const categories: CapabilityGapCategory[] = [
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Capability gaps are diagnostics only and never expand the runtime DSL. */
export const validateCapabilityGaps = (
  values: unknown,
): ValidationResult<CapabilityGap[]> => {
  if (!Array.isArray(values))
    return { valid: false, errors: ['capabilityGaps must be an array.'] }
  const errors: string[] = []
  const gaps = values.filter((value): value is CapabilityGap => {
    const valid =
      isRecord(value) &&
      Object.keys(value).length === 3 &&
      Object.keys(value).every((key) =>
        ['category', 'description', 'oracleFragment'].includes(key),
      ) &&
      categories.includes(value.category as CapabilityGapCategory) &&
      typeof value.description === 'string' &&
      value.description.trim().length > 0 &&
      typeof value.oracleFragment === 'string' &&
      value.oracleFragment.trim().length > 0
    if (!valid) errors.push('Invalid capability gap.')
    return valid
  })
  return errors.length ? { valid: false, errors } : { valid: true, value: gaps }
}
