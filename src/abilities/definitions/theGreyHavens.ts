import type { AbilityDefinition } from '../types/abilityTypes'

export const theGreyHavensAbilities: AbilityDefinition[] = [
  {
    id: 'grey-havens-enter-scry',
    sourceCardName: 'The Grey Havens',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      {
        type: 'SCRY_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 1 },
      },
    ],
    automation: 'AUTO',
  },
  {
    id: 'grey-havens-tap-add-colorless',
    sourceCardName: 'The Grey Havens',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'C', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'grey-havens-tap-add-legendary-graveyard-color',
    sourceCardName: 'The Grey Havens',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [
      {
        type: 'ADD_MANA_FROM_PUBLIC_ZONE_COLORS',
        player: 'SOURCE_CONTROLLER',
        query: {
          zones: ['graveyard'],
          owner: 'SOURCE_CONTROLLER',
          cardTypes: ['Legendary', 'Creature'],
        },
        amount: { type: 'LITERAL', value: 1 },
      },
    ],
    isManaAbility: true,
    automation: 'ASSISTED',
  },
]
