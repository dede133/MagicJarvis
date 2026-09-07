import type { CapabilityGapCategory } from '../types/compilerTypes'

/** These are analysis labels, not additions to the Ability DSL or game engine. */
export const supportedRuntimeCapabilities: CapabilityGapCategory[] = [
  'CREATE_TOKEN',
  'SPELL_CAST_TRIGGER',
  'NONCREATURE_SPELL_CONDITION',
  'BLUE_MANA_SYMBOL_COUNT',
  'BLUE_MERFOLK_TOKEN',
  'ENTER_BATTLEFIELD',
  'DRAW_CARD',
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
  'MOVE_ZONE',
  'UNTAP_PERMANENT',
  'PLAYER_CHOICE',
  'TARGET_SELECTION',
  'ADD_COUNTER',
  'SHUFFLE_LIBRARY',
  'TAP_PERMANENT',
  'NON_TOKEN_FILTER',
  // Token keyword data is preserved and participates in the effective-keyword rules path.
  'TOKEN_KEYWORD_ABILITY',
  'ACTIVATED_ABILITY',
  'TAP_SOURCE',
  'MANA_PRODUCTION',
  'STATIC_ABILITY',
  'COUNTER_SPELL',
  'DISCARD_CARD',
]

export type CapabilityCoverage = {
  supported: CapabilityGapCategory[]
  missing: CapabilityGapCategory[]
}

export const getCapabilityCoverage = (
  requiredCapabilities: CapabilityGapCategory[],
): CapabilityCoverage => {
  const required = [...new Set(requiredCapabilities)]
  return {
    supported: required.filter((capability) =>
      supportedRuntimeCapabilities.includes(capability),
    ),
    missing: required.filter(
      (capability) => !supportedRuntimeCapabilities.includes(capability),
    ),
  }
}
