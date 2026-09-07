import type { AbilityDefinition } from '../types/abilityTypes'

export const eiganjoSeatOfTheEmpireAbilities: AbilityDefinition[] = [
  {
    id: 'eiganjo-seat-mana',
    sourceCardName: 'Eiganjo, Seat of the Empire',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'W', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'eiganjo-seat-channel',
    sourceCardName: 'Eiganjo, Seat of the Empire',
    kind: 'ACTIVATED',
    activeZones: ['hand'],
    costs: [
      {
        type: 'MANA_COST',
        cost: '{2}{W}',
        genericReduction: {
          type: 'COUNT_OBJECTS',
          query: {
            zones: ['battlefield'],
            controller: 'SOURCE_CONTROLLER',
            cardTypes: ['Legendary', 'Creature'],
          },
        },
      },
      { type: 'DISCARD_SOURCE' },
    ],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige una criatura atacante o bloqueadora.',
        constraints: {
          zones: ['battlefield'],
          cardTypes: ['Creature'],
          combatRole: 'ATTACKING_OR_BLOCKING',
        },
        effects: [
          {
            type: 'DEAL_DAMAGE',
            target: 'SELECTED_TARGET',
            amount: { type: 'LITERAL', value: 4 },
            damageKind: 'NONCOMBAT',
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]
