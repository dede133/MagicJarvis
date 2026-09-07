import type { AbilityDefinition } from '../types/abilityTypes'

export const wreckingBallArmAbilities: AbilityDefinition[] = [
  {
    id: 'wrecking-ball-arm-equipped',
    sourceCardName: 'Wrecking Ball Arm',
    kind: 'STATIC',
    effects: [
      {
        type: 'SET_BASE_POWER_TOUGHNESS',
        power: 7,
        toughness: 7,
        filter: { attachedToSource: true },
      },
      {
        type: 'BLOCKING_RESTRICTION',
        restriction: {
          type: 'CANNOT_BE_BLOCKED_BY_POWER_AT_MOST',
          power: 2,
          filter: { attachedToSource: true },
        },
      },
    ],
  },
  {
    id: 'wrecking-ball-arm-equip-legendary',
    sourceCardName: 'Wrecking Ball Arm',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{3}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige una criatura legendaria que controlas.',
        constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Legendary', 'Creature'] },
        effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }],
      },
    ],
    automation: 'ASSISTED',
  },
  {
    id: 'wrecking-ball-arm-equip',
    sourceCardName: 'Wrecking Ball Arm',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{7}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige una criatura que controlas.',
        constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] },
        effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }],
      },
    ],
    automation: 'ASSISTED',
  },
]
