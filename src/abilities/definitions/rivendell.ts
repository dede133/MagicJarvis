import type { AbilityDefinition } from '../types/abilityTypes'

export const rivendellAbilities: AbilityDefinition[] = [
  {
    id: 'rivendell-enters-tapped-unless-legendary-creature',
    sourceCardName: 'Rivendell',
    kind: 'AS_ENTERS',
    effects: [
      {
        type: 'CONDITIONAL_EFFECT',
        condition: {
          type: 'VALUE_COMPARE',
          left: {
            type: 'COUNT_OBJECTS',
            query: {
              zones: ['battlefield'],
              controller: 'SOURCE_CONTROLLER',
              cardTypes: ['Legendary', 'Creature'],
            },
          },
          operator: 'EQ',
          right: { type: 'LITERAL', value: 0 },
        },
        ifTrue: [{ type: 'ENTERS_TAPPED' }],
      },
    ],
    automation: 'AUTO',
  },
  {
    id: 'rivendell-tap-add-blue',
    sourceCardName: 'Rivendell',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'U', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'rivendell-scry-two',
    sourceCardName: 'Rivendell',
    kind: 'ACTIVATED',
    costs: [
      { type: 'MANA_COST', cost: '{1}{U}' },
      { type: 'TAP_SOURCE' },
    ],
    activationConditions: [
      {
        type: 'CONTROL_COUNT_AT_LEAST',
        query: {
          zones: ['battlefield'],
          controller: 'SOURCE_CONTROLLER',
          cardTypes: ['Legendary', 'Creature'],
        },
        count: 1,
      },
    ],
    effects: [
      {
        type: 'SCRY_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 2 },
      },
    ],
    automation: 'AUTO',
  },
]
