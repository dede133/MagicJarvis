import type { AbilityDefinition } from '../types/abilityTypes'

export const aangSwiftSaviorAbilities: AbilityDefinition[] = [
  {
    id: 'aang-swift-savior-enter-airbend',
    sourceCardName: 'Aang, Swift Savior',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      {
        type: 'OPTIONAL_EFFECT',
        prompt: '¿Quieres airbendear hasta una criatura o hechizo?',
        effects: [
          {
            type: 'TARGET_SELECTION',
            prompt: 'Elige otra criatura o un hechizo.',
            constraints: {
              anyOf: [
                { zones: ['battlefield'], cardTypes: ['Creature'], excludeSource: true },
                { zones: ['stack'], stackKind: 'SPELL' },
              ],
            },
            effects: [{ type: 'AIRBEND', target: 'SELECTED_TARGET' }],
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
  {
    id: 'aang-swift-savior-waterbend-transform',
    sourceCardName: 'Aang, Swift Savior',
    kind: 'ACTIVATED',
    costs: [{ type: 'WATERBEND', amount: { type: 'LITERAL', value: 8 } }],
    effects: [{ type: 'TRANSFORM_PERMANENT', target: 'SOURCE' }],
    automation: 'ASSISTED',
  },
]

export const aangTheLastAirbenderAbilities: AbilityDefinition[] = [
  {
    id: 'aang-last-airbender-enter-airbend',
    sourceCardName: 'Aang, the Last Airbender',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      {
        type: 'OPTIONAL_EFFECT',
        prompt: '¿Quieres airbendear hasta un permanente no tierra?',
        effects: [
          {
            type: 'TARGET_SELECTION',
            prompt: 'Elige otro permanente no tierra.',
            constraints: {
              zones: ['battlefield'],
              excludeCardTypes: ['Land'],
              excludeSource: true,
            },
            effects: [{ type: 'AIRBEND', target: 'SELECTED_TARGET' }],
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
  {
    id: 'aang-last-airbender-lesson-lifelink',
    sourceCardName: 'Aang, the Last Airbender',
    kind: 'TRIGGERED',
    trigger: { type: 'SPELL_CAST' },
    conditions: [
      { type: 'EVENT_CONTROLLER_IS', value: 'YOU' },
      { type: 'EVENT_HAS_SUBTYPE', value: 'Lesson' },
    ],
    effects: [
      {
        type: 'TEMPORARY_MODIFIER',
        target: 'SOURCE',
        grantKeywords: ['LIFELINK'],
        duration: 'UNTIL_END_OF_TURN',
      },
    ],
    automation: 'AUTO',
  },
]

export const aangAndLaOceansFuryAbilities: AbilityDefinition[] = [
  {
    id: 'aang-and-la-attack-counters',
    sourceCardName: "Aang and La, Ocean's Fury",
    kind: 'TRIGGERED',
    trigger: { type: 'CREATURE_ATTACKED' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      {
        type: 'FOR_EACH',
        query: {
          zones: ['battlefield'],
          controller: 'SOURCE_CONTROLLER',
          cardTypes: ['Creature'],
          tapped: true,
        },
        effects: [
          {
            type: 'ADD_COUNTER',
            target: 'CURRENT_OBJECT',
            counterType: '+1/+1',
            amount: { type: 'LITERAL', value: 1 },
          },
        ],
      },
    ],
    automation: 'AUTO',
  },
]
