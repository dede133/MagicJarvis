import type { AbilityDefinition } from '../types/abilityTypes'

export const eiganjoCastleAbilities: AbilityDefinition[] = [
  {
    id: 'eiganjo-castle-mana',
    sourceCardName: 'Eiganjo Castle',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'W', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'eiganjo-castle-prevent-two',
    sourceCardName: 'Eiganjo Castle',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{W}' }, { type: 'TAP_SOURCE' }],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige una criatura legendaria.',
        constraints: { zones: ['battlefield'], cardTypes: ['Legendary', 'Creature'] },
        effects: [
          {
            type: 'PREVENT_NEXT_DAMAGE',
            target: 'SELECTED_TARGET',
            amount: { type: 'LITERAL', value: 2 },
            duration: 'UNTIL_END_OF_TURN',
          },
        ],
      },
    ],
    automation: 'AUTO',
  },
]
