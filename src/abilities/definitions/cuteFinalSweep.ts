import type { AbilityDefinition, EffectDefinition } from '../types/abilityTypes'
import { syggCombatDamageDrawGrantedAbility } from './grantedTriggeredAbilities'

const one = { type: 'LITERAL', value: 1 } as const
const allColors = ['W', 'U', 'B', 'R', 'G'] as const

export const bendersWaterskinAbilities: AbilityDefinition[] = [
  {
    id: 'benders-waterskin-extra-untap',
    sourceCardName: "Bender's Waterskin",
    kind: 'STATIC',
    effects: [
      {
        type: 'UNTAP_DURING_EACH_PLAYERS_UNTAP',
        filter: { sourceOnly: true },
      },
    ],
  },
  {
    id: 'benders-waterskin-mana',
    sourceCardName: "Bender's Waterskin",
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [
      {
        type: 'ADD_MANA_CHOICE',
        player: 'SOURCE_CONTROLLER',
        allowedColors: [...allColors],
        amount: one,
      },
    ],
    isManaAbility: true,
    automation: 'ASSISTED',
  },
]

export const eightAndAHalfTailsAbilities: AbilityDefinition[] = [
  {
    id: 'eight-and-a-half-tails-protection-white',
    sourceCardName: 'Eight-and-a-Half-Tails',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{1}{W}' }],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige un permanente que controlas.',
        constraints: { zones: ['battlefield'], controller: 'YOU' },
        effects: [
          {
            type: 'GRANT_PROTECTION',
            target: 'SELECTED_TARGET',
            protection: { type: 'COLORS', colors: ['W'] },
            duration: 'UNTIL_END_OF_TURN',
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
  {
    id: 'eight-and-a-half-tails-make-white',
    sourceCardName: 'Eight-and-a-Half-Tails',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{1}' }],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige un hechizo o permanente.',
        constraints: {
          anyOf: [{ zones: ['battlefield'] }, { zones: ['stack'], stackKind: 'SPELL' }],
        },
        effects: [
          {
            type: 'SET_COLORS',
            target: 'SELECTED_TARGET',
            colors: ['W'],
            duration: 'UNTIL_END_OF_TURN',
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]

export const emptyCityRuseAbilities: AbilityDefinition[] = [
  {
    id: 'empty-city-ruse-skip-combat',
    sourceCardName: 'Empty City Ruse',
    kind: 'SPELL_EFFECT',
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige un oponente.',
        constraints: { playerRelation: 'OPPONENT' },
        effects: [
          { type: 'SKIP_NEXT_COMBAT_PHASES', player: 'TARGET_PLAYER' },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]

export const fabledPassageAbilities: AbilityDefinition[] = [
  {
    id: 'fabled-passage-search-basic',
    sourceCardName: 'Fabled Passage',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }, { type: 'SACRIFICE_SOURCE' }],
    effects: [
      {
        type: 'SEARCH_LIBRARY_CARD',
        player: 'SOURCE_CONTROLLER',
        prompt: 'Busca una carta de tierra básica.',
        constraints: { cardTypes: ['Basic', 'Land'] },
        reveal: false,
        shuffle: true,
        allowFail: true,
        destination: 'battlefield',
        controller: 'SOURCE_CONTROLLER',
      },
      {
        type: 'CONDITIONAL_EFFECT',
        condition: {
          type: 'OBJECT_MATCHES_QUERY',
          object: 'SELECTED_CARD',
          query: { zones: ['battlefield'], cardTypes: ['Land'] },
        },
        ifTrue: [
          { type: 'TAP_PERMANENT', target: 'SELECTED_CARD' },
          {
            type: 'CONDITIONAL_EFFECT',
            condition: {
              type: 'VALUE_COMPARE',
              left: {
                type: 'COUNT_OBJECTS',
                query: {
                  zones: ['battlefield'],
                  controller: 'SOURCE_CONTROLLER',
                  cardTypes: ['Land'],
                },
              },
              operator: 'GTE',
              right: { type: 'LITERAL', value: 4 },
            },
            ifTrue: [{ type: 'UNTAP_PERMANENT', target: 'SELECTED_CARD' }],
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]

export const heroesPodiumAbilities: AbilityDefinition[] = [
  {
    id: 'heroes-podium-legendary-buff',
    sourceCardName: "Heroes' Podium",
    kind: 'STATIC',
    effects: [
      {
        type: 'MODIFY_POWER_TOUGHNESS',
        operation: 'ADD',
        power: {
          type: 'SUBTRACT',
          left: {
            type: 'COUNT_OBJECTS',
            query: {
              zones: ['battlefield'],
              controller: 'SOURCE_CONTROLLER',
              cardTypes: ['Legendary', 'Creature'],
            },
          },
          right: one,
        },
        toughness: {
          type: 'SUBTRACT',
          left: {
            type: 'COUNT_OBJECTS',
            query: {
              zones: ['battlefield'],
              controller: 'SOURCE_CONTROLLER',
              cardTypes: ['Legendary', 'Creature'],
            },
          },
          right: one,
        },
        filter: { controller: 'YOU', cardType: 'Legendary Creature' },
      },
    ],
  },
  {
    id: 'heroes-podium-look-top-x',
    sourceCardName: "Heroes' Podium",
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{X}' }, { type: 'TAP_SOURCE' }],
    effects: [
      {
        type: 'SELECT_HIDDEN_ZONE_CARD',
        player: 'SOURCE_CONTROLLER',
        zone: 'library',
        prompt: 'Puedes revelar una criatura legendaria entre las X cartas que miraste.',
        constraints: { cardTypes: ['Legendary', 'Creature'] },
        destination: 'hand',
        count: one,
        allowFail: true,
        lookAtTop: { type: 'VARIABLE', name: 'X' },
      },
      {
        type: 'PHYSICAL_CONFIRMATION',
        prompt: 'Pon el resto de esas cartas en el fondo de tu biblioteca en orden aleatorio.',
        effects: [],
      },
    ],
    automation: 'ASSISTED',
  },
]

export const ledgerShredderAbilities: AbilityDefinition[] = [
  {
    id: 'ledger-shredder-connive-second-spell',
    sourceCardName: 'Ledger Shredder',
    kind: 'TRIGGERED',
    trigger: { type: 'SPELL_CAST' },
    conditions: [
      {
        type: 'EVENT_NUMBER_COMPARE',
        field: 'castNumberThisTurn',
        operator: 'EQ',
        value: 2,
      },
    ],
    effects: [
      { type: 'DRAW_FOR_PLAYER', player: 'SOURCE_CONTROLLER', amount: one },
      { type: 'DISCARD_CARD', player: 'YOU', amount: one },
      {
        type: 'CONDITIONAL_EFFECT',
        condition: {
          type: 'OBJECT_MATCHES_QUERY',
          object: 'SELECTED_CARD',
          query: { excludeCardTypes: ['Land'] },
        },
        ifTrue: [
          {
            type: 'ADD_COUNTER',
            target: 'SOURCE',
            counterType: '+1/+1',
            amount: one,
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]

export const pathToRedemptionAbilities: AbilityDefinition[] = [
  {
    id: 'path-to-redemption-cannot-attack-block',
    sourceCardName: 'Path to Redemption',
    kind: 'STATIC',
    effects: [
      {
        type: 'COMBAT_RESTRICTION',
        rule: 'CANNOT_ATTACK_OR_BLOCK',
        filter: { attachedToSource: true, cardType: 'Creature' },
      },
    ],
  },
  {
    id: 'path-to-redemption-redeem',
    sourceCardName: 'Path to Redemption',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{5}' }, { type: 'SACRIFICE_SOURCE' }],
    activationConditions: [{ type: 'SOURCE_CONTROLLER_IS_ACTIVE_PLAYER' }],
    effects: [
      { type: 'MOVE_ZONE', target: 'ATTACHED_OBJECT', destination: 'exile' },
      { type: 'CREATE_TOKEN', tokenId: 'WHITE_ALLY_1_1', amount: one },
    ],
    automation: 'ASSISTED',
  },
]

const pheliaLink = 'phelia-exiled-permanent'
export const pheliaExuberantShepherdAbilities: AbilityDefinition[] = [
  {
    id: 'phelia-attack-flicker',
    sourceCardName: 'Phelia, Exuberant Shepherd',
    kind: 'TRIGGERED',
    trigger: { type: 'CREATURE_ATTACKED' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      {
        type: 'OPTIONAL_EFFECT',
        prompt: '¿Quieres exiliar otro permanente que no sea tierra con Phelia?',
        effects: [
          {
            type: 'TARGET_SELECTION',
            prompt: 'Elige otro permanente que no sea tierra.',
            constraints: {
              zones: ['battlefield'],
              excludeCardTypes: ['Land'],
              excludeSource: true,
            },
            effects: [
              { type: 'LINK_OBJECT', target: 'SELECTED_TARGET', key: pheliaLink },
              { type: 'MOVE_ZONE', target: 'SELECTED_TARGET', destination: 'exile' },
              {
                type: 'DELAYED_EFFECT',
                trigger: { type: 'END_STEP_STARTED' },
                effects: [
                  {
                    type: 'CONDITIONAL_EFFECT',
                    condition: {
                      type: 'OBJECT_MATCHES_QUERY',
                      object: 'SELECTED_TARGET',
                      query: { owner: 'SOURCE_CONTROLLER' },
                    },
                    ifTrue: [
                      {
                        type: 'RETURN_LINKED_OBJECTS',
                        key: pheliaLink,
                        destination: 'battlefield',
                        controller: 'OWNER',
                      },
                      {
                        type: 'ADD_COUNTER',
                        target: 'SOURCE',
                        counterType: '+1/+1',
                        amount: one,
                      },
                    ],
                    ifFalse: [
                      {
                        type: 'RETURN_LINKED_OBJECTS',
                        key: pheliaLink,
                        destination: 'battlefield',
                        controller: 'OWNER',
                      },
                    ],
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

export const secretTunnelAbilities: AbilityDefinition[] = [
  {
    id: 'secret-tunnel-unblockable',
    sourceCardName: 'Secret Tunnel',
    kind: 'STATIC',
    effects: [
      {
        type: 'BLOCKING_RESTRICTION',
        restriction: { type: 'CANNOT_BE_BLOCKED', filter: { sourceOnly: true } },
      },
    ],
  },
  {
    id: 'secret-tunnel-colorless',
    sourceCardName: 'Secret Tunnel',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'C', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'secret-tunnel-two-creatures-unblockable',
    sourceCardName: 'Secret Tunnel',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{4}' }, { type: 'TAP_SOURCE' }],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige dos criaturas que controlas que compartan un tipo de criatura.',
        count: { type: 'LITERAL', value: 2 },
        constraints: {
          zones: ['battlefield'],
          controller: 'YOU',
          cardTypes: ['Creature'],
          sharesCreatureSubtypeWithFirstTarget: true,
        },
        effects: [
          {
            type: 'FOR_EACH_SELECTED',
            selection: 'TARGETS',
            effects: [
              {
                type: 'CANNOT_BE_BLOCKED',
                target: 'CURRENT_OBJECT',
                duration: 'UNTIL_END_OF_TURN',
              },
            ],
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
]

const syggGrantTarget: EffectDefinition[] = [
  {
    type: 'TARGET_SELECTION',
    prompt: 'Elige una criatura para que obtenga la habilidad de robo de Sygg hasta el final del turno.',
    constraints: { zones: ['battlefield'], cardTypes: ['Creature'] },
    effects: [
      {
        type: 'GRANT_TRIGGERED_ABILITY_UNTIL_END_OF_TURN',
        target: 'SELECTED_TARGET',
        ability: syggCombatDamageDrawGrantedAbility,
      },
    ],
  },
]

export const syggWanderwineWisdomAbilities: AbilityDefinition[] = [
  {
    id: 'sygg-wanderwine-unblockable',
    sourceCardName: 'Sygg, Wanderwine Wisdom',
    kind: 'STATIC',
    effects: [
      {
        type: 'BLOCKING_RESTRICTION',
        restriction: { type: 'CANNOT_BE_BLOCKED', filter: { sourceOnly: true } },
      },
    ],
  },
  {
    id: 'sygg-wanderwine-enter-grant',
    sourceCardName: 'Sygg, Wanderwine Wisdom',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: syggGrantTarget,
    automation: 'ASSISTED',
  },
  {
    id: 'sygg-wanderwine-transform-grant',
    sourceCardName: 'Sygg, Wanderwine Wisdom',
    kind: 'TRIGGERED',
    trigger: { type: 'PERMANENT_TRANSFORMED' },
    conditions: [
      { type: 'EVENT_SUBJECT_IS_SOURCE' },
      { type: 'EVENT_TRANSFORMED_TO_NAME', value: 'Sygg, Wanderwine Wisdom' },
    ],
    effects: syggGrantTarget,
    automation: 'ASSISTED',
  },
  {
    id: 'sygg-wanderwine-first-main-transform',
    sourceCardName: 'Sygg, Wanderwine Wisdom',
    kind: 'TRIGGERED',
    trigger: { type: 'MAIN_PHASE_STARTED' },
    conditions: [
      { type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' },
      { type: 'EVENT_TURN_STEP_IS', value: 'MAIN_1' },
    ],
    effects: [
      {
        type: 'PAYMENT_BRANCH',
        payer: 'SOURCE_CONTROLLER',
        cost: { type: 'FIXED_MANA', cost: '{W}' },
        prompt: '¿Pagar {W} para transformar a Sygg?',
        ifPaid: [{ type: 'TRANSFORM_PERMANENT', target: 'SOURCE' }],
        ifNotPaid: [],
      },
    ],
    automation: 'ASSISTED',
  },
]

export const syggWanderbrineShieldAbilities: AbilityDefinition[] = [
  {
    id: 'sygg-wanderbrine-unblockable',
    sourceCardName: 'Sygg, Wanderbrine Shield',
    kind: 'STATIC',
    effects: [
      {
        type: 'BLOCKING_RESTRICTION',
        restriction: { type: 'CANNOT_BE_BLOCKED', filter: { sourceOnly: true } },
      },
    ],
  },
  {
    id: 'sygg-wanderbrine-transform-protection',
    sourceCardName: 'Sygg, Wanderbrine Shield',
    kind: 'TRIGGERED',
    trigger: { type: 'PERMANENT_TRANSFORMED' },
    conditions: [
      { type: 'EVENT_SUBJECT_IS_SOURCE' },
      { type: 'EVENT_TRANSFORMED_TO_NAME', value: 'Sygg, Wanderbrine Shield' },
    ],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige una criatura que controlas.',
        constraints: {
          zones: ['battlefield'],
          controller: 'YOU',
          cardTypes: ['Creature'],
        },
        effects: [
          {
            type: 'GRANT_PROTECTION',
            target: 'SELECTED_TARGET',
            protection: { type: 'COLORS', colors: [...allColors] },
            duration: 'UNTIL_SOURCE_CONTROLLER_NEXT_TURN',
          },
        ],
      },
    ],
    automation: 'ASSISTED',
  },
  {
    id: 'sygg-wanderbrine-first-main-transform',
    sourceCardName: 'Sygg, Wanderbrine Shield',
    kind: 'TRIGGERED',
    trigger: { type: 'MAIN_PHASE_STARTED' },
    conditions: [
      { type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' },
      { type: 'EVENT_TURN_STEP_IS', value: 'MAIN_1' },
    ],
    effects: [
      {
        type: 'PAYMENT_BRANCH',
        payer: 'SOURCE_CONTROLLER',
        cost: { type: 'FIXED_MANA', cost: '{U}' },
        prompt: '¿Pagar {U} para transformar a Sygg?',
        ifPaid: [{ type: 'TRANSFORM_PERMANENT', target: 'SOURCE' }],
        ifNotPaid: [],
      },
    ],
    automation: 'ASSISTED',
  },
]

export const wateryGraspAbilities: AbilityDefinition[] = [
  {
    id: 'watery-grasp-untap-restriction',
    sourceCardName: 'Watery Grasp',
    kind: 'STATIC',
    effects: [
      {
        type: 'UNTAP_RESTRICTION',
        filter: { attachedToSource: true, cardType: 'Creature' },
      },
    ],
  },
  {
    id: 'watery-grasp-waterbend',
    sourceCardName: 'Watery Grasp',
    kind: 'ACTIVATED',
    costs: [{ type: 'WATERBEND', amount: { type: 'LITERAL', value: 5 } }],
    effects: [
      {
        type: 'MOVE_ZONE',
        target: 'ATTACHED_OBJECT',
        destination: 'library',
        controller: 'OWNER',
      },
      { type: 'SHUFFLE_LIBRARY', player: 'ATTACHED_OBJECT_OWNER' },
    ],
    automation: 'ASSISTED',
  },
]
