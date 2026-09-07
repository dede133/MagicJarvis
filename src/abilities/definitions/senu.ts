import type { AbilityDefinition } from '../types/abilityTypes'

export const senuAbilities: AbilityDefinition[] = [
  {
    id: 'senu-exile-gain-life-scry',
    sourceCardName: 'Senu, Keen-Eyed Protector',
    kind: 'ACTIVATED',
    costs: [
      { type: 'TAP_SOURCE' },
      { type: 'EXILE_SOURCE_FROM_BATTLEFIELD' },
    ],
    effects: [
      {
        type: 'GAIN_LIFE_FOR_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 2 },
      },
      {
        type: 'SCRY_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 2 },
      },
    ],
    automation: 'AUTO',
  },
  {
    id: 'senu-return-from-exile-unblocked-legendary',
    sourceCardName: 'Senu, Keen-Eyed Protector',
    kind: 'TRIGGERED',
    activeZones: ['exile'],
    trigger: { type: 'CREATURE_ATTACKED_UNBLOCKED' },
    conditions: [
      { type: 'EVENT_PLAYER_IS_SOURCE_CONTROLLER' },
      { type: 'EVENT_HAS_TYPE', value: 'Legendary' },
    ],
    effects: [
      {
        type: 'CHOOSE_MODE',
        prompt: 'Elige qué defender ataca Senu.',
        modes: [
          {
            id: 'player',
            label: 'Jugador oponente',
            effects: [
              {
                type: 'PLAYER_SELECTION',
                relation: 'OPPONENT',
                prompt: 'Elige al oponente que ataca Senu.',
                effects: [
                  {
                    type: 'PUT_SOURCE_ONTO_BATTLEFIELD_ATTACKING',
                    defendingTarget: {
                      type: 'PLAYER',
                      player: 'TARGET_PLAYER',
                    },
                  },
                ],
              },
            ],
          },
          {
            id: 'planeswalker',
            label: 'Planeswalker de un oponente',
            effects: [
              {
                type: 'CARD_SELECTION',
                prompt: 'Elige un planeswalker de un oponente.',
                constraints: {
                  zones: ['battlefield'],
                  controllerRelation: 'NOT_SOURCE_CONTROLLER',
                  cardTypes: ['Planeswalker'],
                },
                effects: [
                  {
                    type: 'PUT_SOURCE_ONTO_BATTLEFIELD_ATTACKING',
                    defendingTarget: {
                      type: 'PERMANENT',
                      target: 'SELECTED_CARD',
                    },
                  },
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
