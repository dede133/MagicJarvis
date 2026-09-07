import type { AbilityDefinition } from '../types/abilityTypes'

export const kataraWaterTribesHopeAbilities: AbilityDefinition[] = [
  {
    id: 'katara-enter-ally',
    sourceCardName: "Katara, Water Tribe's Hope",
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      {
        type: 'CREATE_TOKEN',
        tokenId: 'WHITE_ALLY_1_1',
        amount: { type: 'LITERAL', value: 1 },
      },
    ],
    automation: 'AUTO',
  },
  {
    id: 'katara-waterbend-x',
    sourceCardName: "Katara, Water Tribe's Hope",
    kind: 'ACTIVATED',
    costs: [{ type: 'WATERBEND', amount: { type: 'VARIABLE', name: 'X' } }],
    restrictions: ['YOUR_TURN', 'VARIABLE_MIN:X:1'],
    effects: [
      {
        type: 'FOR_EACH',
        query: {
          zones: ['battlefield'],
          controller: 'SOURCE_CONTROLLER',
          cardTypes: ['Creature'],
        },
        effects: [
          {
            type: 'SET_BASE_POWER_TOUGHNESS',
            target: 'CURRENT_OBJECT',
            power: { type: 'VARIABLE', name: 'X' },
            toughness: { type: 'VARIABLE', name: 'X' },
            duration: 'UNTIL_END_OF_TURN',
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]
