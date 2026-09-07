import type { AbilityDefinition } from '../types/abilityTypes'

const GIFT_PROMISED = 'giftPromised'
const GIFT_RECIPIENT = 'giftRecipientPlayerId'

export const intoTheFloodMawAbilities: AbilityDefinition[] = [
  {
    id: 'into-the-flood-maw-spell',
    sourceCardName: 'Into the Flood Maw',
    kind: 'SPELL_EFFECT',
    gift: {
      promisedVariableName: GIFT_PROMISED,
      recipientVariableName: GIFT_RECIPIENT,
      prompt: '¿Quieres prometer un Fish girado a un oponente?',
      recipientPrompt: 'Elige qué oponente recibirá el Fish.',
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
            tokenId: 'BLUE_FISH_1_1',
            amount: { type: 'LITERAL', value: 1 },
            player: { type: 'VARIABLE', name: GIFT_RECIPIENT },
            tapped: true,
          },
        ],
      },
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige el permanente del oponente que devolverás a la mano.',
        constraints: {
          zones: ['battlefield'],
          controllerRelation: 'NOT_SOURCE_CONTROLLER',
          cardTypes: ['Creature'],
        },
        declarationConstraintOverrides: [
          {
            variableName: GIFT_PROMISED,
            equals: 1,
            constraints: {
              zones: ['battlefield'],
              controllerRelation: 'NOT_SOURCE_CONTROLLER',
              excludeCardTypes: ['Land'],
            },
          },
        ],
        effects: [
          {
            type: 'MOVE_ZONE',
            target: 'SELECTED_TARGET',
            destination: 'hand',
            controller: 'OWNER',
          },
        ],
      },
    ],
    automation: 'AUTO',
  },
]
