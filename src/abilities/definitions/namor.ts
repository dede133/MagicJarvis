import type { AbilityDefinition } from '../types/abilityTypes'

/** Data-only definition: the generic runtime has no Namor-specific branch. */
export const namorAbilities: AbilityDefinition[] = [
  {
    id: 'namor-blue-noncreature-merfolk',
    sourceCardName: 'Namor the Sub-Mariner',
    kind: 'TRIGGERED',
    trigger: { type: 'SPELL_CAST' },
    conditions: [
      { type: 'EVENT_CONTROLLER_IS', value: 'YOU' },
      { type: 'SPELL_IS_CREATURE', value: false },
      {
        type: 'EVENT_NUMBER_COMPARE',
        field: 'blueManaSymbols',
        operator: 'GT',
        value: 0,
      },
    ],
    effects: [
      {
        type: 'CREATE_TOKEN',
        tokenId: 'BLUE_MERFOLK_1_1',
        amount: { type: 'EVENT_VALUE', field: 'blueManaSymbols' },
      },
    ],
    automation: 'AUTO',
  },
  {
    id: 'namor-power-equals-merfolk-count',
    sourceCardName: 'Namor the Sub-Mariner',
    kind: 'STATIC',
    effects: [
      {
        type: 'MODIFY_POWER_TOUGHNESS',
        power: {
          type: 'COUNT_OBJECTS',
          query: {
            zones: ['battlefield'],
            controller: 'SOURCE_CONTROLLER',
            subtypes: ['Merfolk'],
          },
        },
        toughness: 0,
        filter: { sourceOnly: true },
      },
    ],
  },
]
