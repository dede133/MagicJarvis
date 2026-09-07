import type { AbilityDefinition } from '../../types/abilityTypes'
import type { AbilityCompilerInput } from '../types/compilerTypes'

export const validateAbilitySemantics = (
  ability: AbilityDefinition,
  input: AbilityCompilerInput,
): string[] => {
  const errors: string[] = []
  if (ability.sourceCardName !== input.cardName)
    errors.push('sourceCardName must match the compiled card.')
  if (ability.kind !== 'TRIGGERED') return errors
  if (
    ![
      'SPELL_CAST',
      'CARD_ENTERED_BATTLEFIELD',
      'PLAYER_SHUFFLED',
      'PERMANENT_BECAME_TAPPED',
    ].includes(ability.trigger.type)
  )
    errors.push('Unsupported trigger event.')
  ability.conditions.forEach((condition) => {
    if (
      condition.type === 'EVENT_NUMBER_COMPARE' &&
      (ability.trigger.type !== 'SPELL_CAST' ||
        condition.field !== 'blueManaSymbols')
    )
      errors.push('Condition reads an unavailable SPELL_CAST field.')
  })
  ability.effects.forEach((effect) => {
    if (
      'amount' in effect &&
      typeof effect.amount === 'object' &&
      effect.amount.type === 'EVENT_VALUE' &&
      (ability.trigger.type !== 'SPELL_CAST' ||
        effect.amount.field !== 'blueManaSymbols')
    )
      errors.push('Effect reads an unavailable SPELL_CAST field.')
  })
  return errors
}
