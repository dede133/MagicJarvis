import type { AbilityDefinition } from '../types/abilityTypes'

const GIFT_PROMISED = 'giftPromised'
const GIFT_RECIPIENT = 'giftRecipientPlayerId'

export const crumbAndGetItAbilities: AbilityDefinition[] = [
  {
    id: 'crumb-and-get-it-spell',
    sourceCardName: 'Crumb and Get It',
    kind: 'SPELL_EFFECT',
    gift: {
      promisedVariableName: GIFT_PROMISED,
      recipientVariableName: GIFT_RECIPIENT,
      prompt: '¿Quieres prometer un Food a un oponente?',
      recipientPrompt: 'Elige qué oponente recibirá el Food.',
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
            type: 'CREATE_TOKEN',
            tokenId: 'FOOD_TOKEN',
            amount: { type: 'LITERAL', value: 1 },
            player: { type: 'VARIABLE', name: GIFT_RECIPIENT },
          },
        ],
      },
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
            type: 'TEMPORARY_MODIFIER',
            target: 'SELECTED_TARGET',
            power: 2,
            toughness: 2,
            duration: 'UNTIL_END_OF_TURN',
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
                type: 'TEMPORARY_MODIFIER',
                target: 'SELECTED_TARGET',
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
