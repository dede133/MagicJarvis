import type { AbilityDefinition } from '../types/abilityTypes'

export const curiousFarmAnimalsAbilities: AbilityDefinition[] = [
  {
    id: 'curious-farm-animals-dies-gain-life',
    sourceCardName: 'Curious Farm Animals',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_DIED' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      {
        type: 'GAIN_LIFE_FOR_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 3 },
      },
    ],
    automation: 'AUTO',
  },
  {
    id: 'curious-farm-animals-sacrifice-destroy',
    sourceCardName: 'Curious Farm Animals',
    kind: 'ACTIVATED',
    costs: [
      { type: 'MANA_COST', cost: '{2}' },
      { type: 'SACRIFICE_SOURCE' },
    ],
    effects: [
      {
        type: 'CHOOSE_MODE',
        prompt: '¿Quieres elegir objetivo para “hasta uno”?',
        modes: [
          { id: 'none', label: 'Ningún objetivo', effects: [] },
          {
            id: 'destroy',
            label: 'Destruir un artefacto o encantamiento',
            effects: [
              {
                type: 'TARGET_SELECTION',
                prompt: 'Elige un artefacto o encantamiento.',
                constraints: {
                  zones: ['battlefield'],
                  cardTypesAnyOf: ['Artifact', 'Enchantment'],
                },
                effects: [
                  { type: 'DESTROY_PERMANENT', target: 'SELECTED_TARGET' },
                ],
              },
            ],
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]
