import type {
  ActivatedAbilityDefinition,
  EffectDefinition,
} from '../../abilities/types/abilityTypes'
import type { ActivatedAbilityHint } from '../types/commandTypes'

const effectTreeContains = (
  effects: readonly EffectDefinition[],
  type: EffectDefinition['type'],
): boolean =>
  effects.some((effect) => {
    if (effect.type === type) return true
    if ('effects' in effect && Array.isArray(effect.effects))
      if (effectTreeContains(effect.effects, type)) return true
    if (effect.type === 'CONDITIONAL_EFFECT')
      return (
        effectTreeContains(effect.ifTrue, type) ||
        effectTreeContains(effect.ifFalse ?? [], type)
      )
    if (effect.type === 'PAYMENT_BRANCH')
      return (
        effectTreeContains(effect.ifPaid, type) ||
        effectTreeContains(effect.ifNotPaid, type)
      )
    if (effect.type === 'CHOOSE_MODE')
      return effect.modes.some((mode) => effectTreeContains(mode.effects, type))
    return false
  })

/** Shared semantic classification for already-programmed activated abilities. */
export const activatedAbilityMatchesHint = (
  ability: ActivatedAbilityDefinition,
  hint: ActivatedAbilityHint,
): boolean => {
  if (hint === 'MANA') return ability.isManaAbility === true
  if (hint === 'WATERBEND')
    return ability.costs.some((cost) => cost.type === 'WATERBEND')
  if (hint === 'CHANNEL')
    return (
      ability.activeZones?.includes('hand') === true &&
      ability.costs.some((cost) => cost.type === 'DISCARD_SOURCE')
    )
  return effectTreeContains(ability.effects, 'ATTACH')
}
