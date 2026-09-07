import type { AbilityDefinition } from '../types/abilityTypes'

export const marchOfOtherworldlyLightAbilities: AbilityDefinition[] = [
  {
    id: 'march-otherworldly-light-spell',
    sourceCardName: 'March of Otherworldly Light',
    kind: 'SPELL_EFFECT',
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt:
          'Elige un artefacto, criatura o encantamiento con valor de maná X o menos.',
        constraints: {
          zones: ['battlefield'],
          cardTypesAnyOf: ['Artifact', 'Creature', 'Enchantment'],
          manaValueMax: { type: 'VARIABLE', name: 'X' },
        },
        effects: [
          {
            type: 'MOVE_ZONE',
            target: 'SELECTED_TARGET',
            destination: 'exile',
          },
        ],
      },
    ],
    automation: 'AUTO',
  },
]

export const marchOfSwirlingMistAbilities: AbilityDefinition[] = [
  {
    id: 'march-swirling-mist-spell',
    sourceCardName: 'March of Swirling Mist',
    kind: 'SPELL_EFFECT',
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige hasta X criaturas para hacer phase out.',
        constraints: { zones: ['battlefield'], cardTypes: ['Creature'] },
        count: { type: 'VARIABLE', name: 'X' },
        allowFewer: true,
        effects: [
          {
            type: 'FOR_EACH_SELECTED',
            selection: 'TARGETS',
            effects: [
              { type: 'PHASE_OUT_PERMANENT', target: 'CURRENT_OBJECT' },
            ],
          },
        ],
      },
    ],
    automation: 'AUTO',
  },
]

export const resourcefulDefenseAbilities: AbilityDefinition[] = [
  {
    id: 'resourceful-defense-leaves',
    sourceCardName: 'Resourceful Defense',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_LEFT_BATTLEFIELD' },
    conditions: [
      { type: 'EVENT_PLAYER_IS_SOURCE_CONTROLLER' },
      { type: 'EVENT_HAS_ANY_COUNTERS' },
    ],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt:
          'Elige un permanente que controlas para recibir los contadores del permanente que salió.',
        constraints: { zones: ['battlefield'], controller: 'YOU' },
        effects: [{ type: 'PUT_EVENT_COUNTERS', target: 'SELECTED_TARGET' }],
      },
    ],
    automation: 'ASSISTED',
  },
  {
    id: 'resourceful-defense-move-counters',
    sourceCardName: 'Resourceful Defense',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{4}{W}' }],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt:
          'Elige primero el permanente origen y después otro permanente que controlas.',
        constraints: { zones: ['battlefield'], controller: 'YOU' },
        count: { type: 'LITERAL', value: 2 },
        effects: [
          {
            type: 'MOVE_COUNTERS_BETWEEN_TARGETS',
            from: 'FIRST_SELECTED_TARGET',
            to: 'SECOND_SELECTED_TARGET',
            prompt: 'Elige qué contadores quieres mover.',
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]

export const windbornMuseAbilities: AbilityDefinition[] = [
  {
    id: 'windborn-muse-attack-tax',
    sourceCardName: 'Windborn Muse',
    kind: 'STATIC',
    effects: [
      {
        type: 'ATTACK_TAX',
        defendingPlayer: 'SOURCE_CONTROLLER',
        genericPerAttacker: 2,
      },
    ],
  },
]

export const thaliaHereticCatharAbilities: AbilityDefinition[] = [
  {
    id: 'thalia-heretic-cathar-enters-tapped',
    sourceCardName: 'Thalia, Heretic Cathar',
    kind: 'STATIC',
    effects: [
      {
        type: 'ENTERS_TAPPED_FILTER',
        filter: {
          controller: 'OPPONENT',
          cardType: 'Creature',
        },
      },
      {
        type: 'ENTERS_TAPPED_FILTER',
        filter: {
          controller: 'OPPONENT',
          nonbasicLand: true,
        },
      },
    ],
  },
]

export const crashingWaveAbilities: AbilityDefinition[] = [
  {
    id: 'crashing-wave-spell',
    sourceCardName: 'Crashing Wave',
    kind: 'SPELL_EFFECT',
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige hasta X criaturas para girar.',
        constraints: { zones: ['battlefield'], cardTypes: ['Creature'] },
        count: { type: 'VARIABLE', name: 'X' },
        allowFewer: true,
        effects: [
          {
            type: 'FOR_EACH_SELECTED',
            selection: 'TARGETS',
            effects: [{ type: 'TAP_PERMANENT', target: 'CURRENT_OBJECT' }],
          },
          {
            type: 'DISTRIBUTE_COUNTERS',
            counterType: 'stun',
            amount: { type: 'LITERAL', value: 3 },
            query: {
              zones: ['battlefield'],
              controllerRelation: 'NOT_SOURCE_CONTROLLER',
              cardTypes: ['Creature'],
              tapped: true,
            },
            prompt:
              'Distribuye tres stun counters entre criaturas giradas que controlen tus oponentes.',
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]
