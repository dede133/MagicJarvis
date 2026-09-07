import type { AbilityDefinition } from '../types/abilityTypes'

export const foodTokenAbilities: AbilityDefinition[] = [
  {
    id: 'food-token-gain-life',
    sourceCardName: 'Food Token',
    kind: 'ACTIVATED',
    costs: [
      { type: 'MANA_COST', cost: '{2}' },
      { type: 'TAP_SOURCE' },
      { type: 'SACRIFICE_SOURCE' },
    ],
    effects: [
      {
        type: 'GAIN_LIFE_FOR_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 3 },
      },
    ],
    automation: 'AUTO',
  },
]
