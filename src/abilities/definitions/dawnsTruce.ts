import type { AbilityDefinition } from '../types/abilityTypes'

const GIFT_PROMISED = 'giftPromised'
const GIFT_RECIPIENT = 'giftRecipientPlayerId'

export const dawnsTruceAbilities: AbilityDefinition[] = [
  {
    id: 'dawns-truce-spell',
    sourceCardName: "Dawn's Truce",
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
        type: 'ADD_PLAYER_RULE',
        player: 'SOURCE_CONTROLLER',
        rules: { hexproof: true },
        duration: 'UNTIL_END_OF_TURN',
      },
      {
        type: 'FOR_EACH',
        query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER' },
        effects: [
          {
            type: 'TEMPORARY_MODIFIER',
            target: 'CURRENT_OBJECT',
            grantKeywords: ['HEXPROOF'],
            duration: 'UNTIL_END_OF_TURN',
          },
        ],
      },
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
            type: 'FOR_EACH',
            query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER' },
            effects: [
              {
                type: 'TEMPORARY_MODIFIER',
                target: 'CURRENT_OBJECT',
                grantKeywords: ['INDESTRUCTIBLE'],
                duration: 'UNTIL_END_OF_TURN',
              },
            ],
          },
        ],
      },
    ],
    automation: 'AUTO',
  },
]
