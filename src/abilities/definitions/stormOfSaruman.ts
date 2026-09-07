import type { AbilityDefinition } from '../types/abilityTypes'

export const stormOfSarumanAbilities: AbilityDefinition[] = [
  {
    id: 'storm-of-saruman-ward',
    sourceCardName: 'Storm of Saruman',
    kind: 'STATIC',
    effects: [{ type: 'WARD', cost: '{3}', filter: { sourceOnly: true } }],
  },
  {
    id: 'storm-of-saruman-second-spell',
    sourceCardName: 'Storm of Saruman',
    kind: 'TRIGGERED',
    trigger: { type: 'SPELL_CAST' },
    conditions: [
      { type: 'EVENT_CONTROLLER_IS', value: 'YOU' },
      {
        type: 'EVENT_NUMBER_COMPARE',
        field: 'castNumberThisTurn',
        operator: 'EQ',
        value: 2,
      },
    ],
    effects: [
      {
        type: 'COPY_SPELL',
        target: 'EVENT_STACK_OBJECT',
        controller: 'SOURCE_CONTROLLER',
        chooseNewTargets: true,
        removeLegendary: true,
      },
    ],
    automation: 'ASSISTED',
  },
]
