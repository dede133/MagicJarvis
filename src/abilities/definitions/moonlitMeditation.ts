import type { AbilityDefinition } from '../types/abilityTypes'

/**
 * Moonlit Meditation's token replacement is derived from battlefield state.
 * The generic replacement core handles the first token event each turn and
 * asks before substituting copies of the enchanted permanent.
 */
export const moonlitMeditationAbilities: AbilityDefinition[] = [
  {
    id: 'moonlit-meditation-token-replacement',
    sourceCardName: 'Moonlit Meditation',
    kind: 'STATIC',
    effects: [
      {
        type: 'REPLACE_FIRST_TOKEN_CREATION_WITH_ATTACHED_COPIES',
        optional: true,
      },
    ],
  },
]
