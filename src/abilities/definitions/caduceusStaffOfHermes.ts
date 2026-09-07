import type { AbilityDefinition } from '../types/abilityTypes'

const thirtyLife = { type: 'SOURCE_CONTROLLER_LIFE_AT_LEAST', value: 30 } as const

export const caduceusStaffOfHermesAbilities: AbilityDefinition[] = [
  {
    id: 'caduceus-equipped',
    sourceCardName: 'Caduceus, Staff of Hermes',
    kind: 'STATIC',
    effects: [
      { type: 'GRANT_KEYWORD', keyword: 'LIFELINK', filter: { attachedToSource: true } },
      {
        type: 'MODIFY_POWER_TOUGHNESS',
        power: 5,
        toughness: 5,
        operation: 'ADD',
        filter: { attachedToSource: true },
        condition: thirtyLife,
      },
      {
        type: 'GRANT_KEYWORD',
        keyword: 'INDESTRUCTIBLE',
        filter: { attachedToSource: true },
        condition: thirtyLife,
      },
      {
        type: 'PREVENT_ALL_DAMAGE',
        filter: { attachedToSource: true },
        condition: thirtyLife,
      },
    ],
  },
  {
    id: 'caduceus-equip',
    sourceCardName: 'Caduceus, Staff of Hermes',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{W}{W}' }],
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
