import type { AbilityDefinition } from '../types/abilityTypes'

const GIFT_PROMISED = 'giftPromised'
const GIFT_RECIPIENT = 'giftRecipientPlayerId'

/**
 * Gift declaration, ETB/stun and the continuous control clause are executable.
 */
export const kitnapAbilities: AbilityDefinition[] = [
  {
    id: 'kitnap-gift-declaration',
    sourceCardName: 'Kitnap',
    kind: 'SPELL_EFFECT',
    gift: {
      promisedVariableName: GIFT_PROMISED,
      recipientVariableName: GIFT_RECIPIENT,
      prompt: '¿Quieres prometer una carta a un oponente?',
      recipientPrompt: 'Elige qué oponente robará la carta cuando Kitnap entre.',
    },
    effects: [],
    automation: 'AUTO',
  },
  {
    id: 'kitnap-gift-draw-on-enter',
    sourceCardName: 'Kitnap',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      {
        type: 'CONDITIONAL_EFFECT',
        condition: {
          type: 'VALUE_COMPARE',
          left: { type: 'SOURCE_VALUE', key: GIFT_PROMISED },
          operator: 'EQ',
          right: { type: 'LITERAL', value: 1 },
        },
        ifTrue: [
          {
            type: 'DRAW_FOR_PLAYER',
            player: { type: 'SOURCE_VALUE', key: GIFT_RECIPIENT },
            amount: { type: 'LITERAL', value: 1 },
          },
        ],
      },
    ],
    automation: 'AUTO',
  },
  {
    id: 'kitnap-tap-and-stun-on-enter',
    sourceCardName: 'Kitnap',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      { type: 'TAP_PERMANENT', target: 'ATTACHED_OBJECT' },
      {
        type: 'CONDITIONAL_EFFECT',
        condition: {
          type: 'VALUE_COMPARE',
          left: { type: 'SOURCE_VALUE', key: GIFT_PROMISED },
          operator: 'EQ',
          right: { type: 'LITERAL', value: 0 },
        },
        ifTrue: [
          {
            type: 'ADD_COUNTER',
            target: 'ATTACHED_OBJECT',
            counterType: 'stun',
            amount: { type: 'LITERAL', value: 3 },
          },
        ],
      },
    ],
    automation: 'AUTO',
  },
  {
    id: 'kitnap-control-enchanted-creature',
    sourceCardName: 'Kitnap',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      {
        type: 'CONTROL_ATTACHED_OBJECT',
        controller: 'SOURCE_CONTROLLER',
      },
    ],
    automation: 'AUTO',
  },
]
