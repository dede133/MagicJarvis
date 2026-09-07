import type { AbilityDefinition } from '../types/abilityTypes'

export const pippinGuardOfTheCitadelAbilities: AbilityDefinition[] = [
  {
    id: 'pippin-ward',
    sourceCardName: 'Pippin, Guard of the Citadel',
    kind: 'STATIC',
    effects: [{ type: 'WARD', cost: '{1}', filter: { sourceOnly: true } }],
  },
  {
    id: 'pippin-protection-card-type',
    sourceCardName: 'Pippin, Guard of the Citadel',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige otra criatura que controlas.',
        constraints: {
          zones: ['battlefield'],
          controller: 'YOU',
          cardTypes: ['Creature'],
          excludeSource: true,
        },
        effects: [
          {
            type: 'CHOOSE_VALUE',
            prompt: 'Elige un tipo de carta.',
            variableName: 'PIPPIN_CARD_TYPE',
            options: [
              { id: 'artifact', label: 'Artifact', value: 'Artifact' },
              { id: 'battle', label: 'Battle', value: 'Battle' },
              { id: 'creature', label: 'Creature', value: 'Creature' },
              { id: 'enchantment', label: 'Enchantment', value: 'Enchantment' },
              { id: 'instant', label: 'Instant', value: 'Instant' },
              { id: 'kindred', label: 'Kindred', value: 'Kindred' },
              { id: 'land', label: 'Land', value: 'Land' },
              { id: 'planeswalker', label: 'Planeswalker', value: 'Planeswalker' },
              { id: 'sorcery', label: 'Sorcery', value: 'Sorcery' },
            ],
          },
          {
            type: 'GRANT_PROTECTION',
            target: 'SELECTED_TARGET',
            protection: {
              type: 'CARD_TYPE',
              cardType: { type: 'VARIABLE', name: 'PIPPIN_CARD_TYPE' },
            },
            duration: 'UNTIL_END_OF_TURN',
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]
