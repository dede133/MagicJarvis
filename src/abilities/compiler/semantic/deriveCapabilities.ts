import type {
  CapabilityGapCategory,
  SemanticAbilityAnalysis,
  SemanticCardAnalysis,
} from '../types/compilerTypes'

const joinAbilityText = (ability: SemanticAbilityAnalysis): string =>
  [
    ability.triggerDescription,
    ...ability.costs,
    ...ability.conditions,
    ...ability.effects,
    ...ability.targets,
    ...ability.choices,
    ...ability.restrictions,
    ability.duration,
    ...ability.referencedObjects,
    ...ability.unsupportedOrUnclear,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase()

/** Deterministic diagnostics derived locally from non-executable semantic IR. */
export const deriveCapabilitiesForSemanticAbility = (
  ability: SemanticAbilityAnalysis,
): CapabilityGapCategory[] => {
  const text = joinAbilityText(ability)
  const capabilities = new Set<CapabilityGapCategory>()
  if (ability.abilityKind === 'ACTIVATED') capabilities.add('ACTIVATED_ABILITY')
  if (ability.abilityKind === 'STATIC') capabilities.add('STATIC_ABILITY')
  if (ability.abilityKind === 'REPLACEMENT')
    capabilities.add('REPLACEMENT_EFFECT')
  if (/\bmay\b/.test(text) || ability.choices.length > 0)
    capabilities.add('PLAYER_CHOICE')
  if (ability.costs.some((cost) => /\{t\}/i.test(cost)))
    capabilities.add('TAP_SOURCE')
  if (/shuffle/.test(text)) capabilities.add('SHUFFLE_LIBRARY')
  if (/\benter(?:s|ed)?\b/.test(text)) capabilities.add('ENTER_BATTLEFIELD')
  if (/become tapped/.test(text)) capabilities.add('TAP_PERMANENT')
  if (/\buntap\b/.test(text)) capabilities.add('UNTAP_PERMANENT')
  if (/\bdraw\b/.test(text)) capabilities.add('DRAW_CARD')
  if (/\bgain(?:s|ed)?\b[^.]*\blife\b/.test(text))
    capabilities.add('GAIN_LIFE')
  if (/\bscry\b/.test(text)) capabilities.add('SCRY')
  if (/\bsurveil\b/.test(text)) capabilities.add('SURVEIL')
  if (/\bgift\b/.test(text)) capabilities.add('GIFT')
  if (/\bprevent(?:s|ed|ing)?\b[^.]*\bdamage\b/.test(text)) capabilities.add('PREVENT_DAMAGE')
  if (/\bprotection from\b/.test(text)) capabilities.add('PROTECTION')
  if (/\bairbend\b/.test(text)) capabilities.add('AIRBEND')
  if (/spend this mana only/.test(text)) capabilities.add('RESTRICTED_MANA')
  if (/\bchannel\b/.test(text)) capabilities.add('CHANNEL')
  if (/\bwaterbend\b/.test(text)) capabilities.add('WATERBEND')
  if (/loses all abilities|base power and toughness|isn['’]t a planeswalker|in addition to its other types|loses all other creature types|named [a-z]/.test(text))
    capabilities.add('CHARACTERISTIC_MODIFICATION')
  if (/\b(?:have|gains?)\s+["“]whenever\b/.test(text))
    capabilities.add('GRANT_TRIGGERED_ABILITY')
  if (/\bdiscard\b/.test(text)) capabilities.add('DISCARD_CARD')
  if (/counter target spell/.test(text)) capabilities.add('COUNTER_SPELL')
  if (/\+1\/\+1 counter|put .* counter|remove .* counter/.test(text))
    capabilities.add('ADD_COUNTER')
  if (/token/.test(text)) capabilities.add('CREATE_TOKEN')
  if (/token/.test(text) && /hexproof|flying/.test(text))
    capabilities.add('TOKEN_KEYWORD_ABILITY')
  if (/exile/.test(text)) capabilities.add('MOVE_ZONE')
  if (/mana/.test(text)) capabilities.add('MANA_PRODUCTION')
  if (/nonartifact|nonland|from your hand|search your library/.test(text))
    capabilities.add('CARD_SELECTION')
  if (/exiled card/.test(text)) capabilities.add('LINKED_OBJECT')
  if (/color/.test(text)) capabilities.add('COLOR_QUERY')
  if (/target/.test(text)) capabilities.add('TARGET_SELECTION')
  if (/\bx\b.*target|target.*\bx\b/.test(text)) capabilities.add('VARIABLE_X')
  if (/nontoken/.test(text)) capabilities.add('NON_TOKEN_FILTER')
  if (/\battacks?\b|threshold|beginning of your next main phase/.test(text))
    capabilities.add('OTHER')
  return [...capabilities]
}

export const deriveCapabilitiesForSemanticAnalysis = (
  analysis: SemanticCardAnalysis,
): CapabilityGapCategory[] => [
  ...new Set(analysis.abilities.flatMap(deriveCapabilitiesForSemanticAbility)),
]
