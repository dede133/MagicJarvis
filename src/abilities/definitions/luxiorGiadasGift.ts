import type { AbilityDefinition } from '../types/abilityTypes'

export const luxiorGiadasGiftAbilities: AbilityDefinition[] = [
  {
    id: 'luxior-equipped-characteristics',
    sourceCardName: "Luxior, Giada's Gift",
    kind: 'STATIC',
    effects: [
      {
        type: 'MODIFY_POWER_TOUGHNESS',
        power: { type: 'TOTAL_COUNTER_COUNT', target: 'ATTACHED_OBJECT' },
        toughness: { type: 'TOTAL_COUNTER_COUNT', target: 'ATTACHED_OBJECT' },
        operation: 'ADD',
        filter: { attachedToSource: true },
      },
      {
        type: 'REMOVE_CARD_TYPE',
        cardType: 'Planeswalker',
        filter: { attachedToSource: true },
      },
      {
        type: 'ADD_CARD_TYPE',
        cardType: 'Creature',
        filter: { attachedToSource: true },
      },
    ],
  },
  {
    id: 'luxior-equip-planeswalker',
    sourceCardName: "Luxior, Giada's Gift",
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{1}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige un planeswalker que controlas.',
        constraints: {
          zones: ['battlefield'],
          controller: 'YOU',
          cardTypes: ['Planeswalker'],
        },
        effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }],
      },
    ],
    automation: 'ASSISTED',
  },
  {
    id: 'luxior-equip',
    sourceCardName: "Luxior, Giada's Gift",
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{3}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige una criatura que controlas.',
        constraints: {
          zones: ['battlefield'],
          controller: 'YOU',
          cardTypes: ['Creature'],
        },
        effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }],
      },
    ],
    automation: 'ASSISTED',
  },
]
