import type { AbilityDefinition } from '../types/abilityTypes'

const GIFT_PROMISED = 'giftPromised'
const GIFT_RECIPIENT = 'giftRecipientPlayerId'

export const longRiversPullAbilities: AbilityDefinition[] = [
  {
    id: 'long-rivers-pull-spell',
    sourceCardName: "Long River's Pull",
    kind: 'SPELL_EFFECT',
    gift: {
      promisedVariableName: GIFT_PROMISED,
      recipientVariableName: GIFT_RECIPIENT,
      prompt: '¿Quieres prometer una carta a un oponente?',
      recipientPrompt: 'Elige qué oponente robará la carta del Gift.',
    },
    effects: [
      {
        type: 'CONDITIONAL_EFFECT',
        condition: {
          type: 'VALUE_COMPARE',
          left: { type: 'VARIABLE', name: GIFT_PROMISED },
          operator: 'EQ',
          right: { type: 'LITERAL', value: 1 },
        },
        ifTrue: [
          {
            type: 'DRAW_FOR_PLAYER',
            player: { type: 'VARIABLE', name: GIFT_RECIPIENT },
            amount: { type: 'LITERAL', value: 1 },
          },
        ],
      },
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige el spell que quieres contrarrestar.',
        constraints: {
          zones: ['stack'],
          stackKind: 'SPELL',
          cardTypes: ['Creature'],
        },
        declarationConstraintOverrides: [
          {
            variableName: GIFT_PROMISED,
            equals: 1,
            constraints: { zones: ['stack'], stackKind: 'SPELL' },
          },
        ],
        effects: [{ type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' }],
      },
    ],
    automation: 'AUTO',
  },
]
