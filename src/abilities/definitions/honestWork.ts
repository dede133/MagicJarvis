import type { AbilityDefinition } from '../types/abilityTypes'

export const honestWorkAbilities: AbilityDefinition[] = [
  {
    id: 'honest-work-enter',
    sourceCardName: 'Honest Work',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      { type: 'TAP_PERMANENT', target: 'ATTACHED_OBJECT' },
      { type: 'REMOVE_ALL_COUNTERS', target: 'ATTACHED_OBJECT' },
    ],
    automation: 'AUTO',
  },
  {
    id: 'honest-work-characteristics',
    sourceCardName: 'Honest Work',
    kind: 'STATIC',
    effects: [
      { type: 'LOSE_ALL_ABILITIES', filter: { attachedToSource: true } },
      {
        type: 'SET_CREATURE_SUBTYPES',
        subtypes: ['Citizen'],
        filter: { attachedToSource: true },
      },
      {
        type: 'SET_BASE_POWER_TOUGHNESS',
        power: 1,
        toughness: 1,
        filter: { attachedToSource: true },
      },
      {
        type: 'SET_NAME',
        name: 'Humble Merchant',
        filter: { attachedToSource: true },
      },
      {
        type: 'GRANT_ACTIVATED_ABILITY',
        filter: { attachedToSource: true },
        ability: {
          id: 'honest-work-humble-merchant-mana',
          kind: 'ACTIVATED',
          costs: [{ type: 'TAP_SOURCE' }],
          effects: [{ type: 'ADD_MANA', color: 'C', amount: 1 }],
          isManaAbility: true,
          automation: 'AUTO',
        },
      },
    ],
  },
]
