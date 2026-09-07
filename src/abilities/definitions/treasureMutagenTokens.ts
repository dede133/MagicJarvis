import type { AbilityDefinition } from '../types/abilityTypes'

export const treasureTokenAbilities: AbilityDefinition[] = [
  {
    id: 'treasure-token-mana',
    sourceCardName: 'Treasure Token',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }, { type: 'SACRIFICE_SOURCE' }],
    effects: [{
      type: 'ADD_MANA_CHOICE',
      player: 'SOURCE_CONTROLLER',
      allowedColors: ['W', 'U', 'B', 'R', 'G'],
      amount: { type: 'LITERAL', value: 1 },
    }],
    isManaAbility: true,
    automation: 'ASSISTED',
  },
]

export const mutagenTokenAbilities: AbilityDefinition[] = [
  {
    id: 'mutagen-token-counter',
    sourceCardName: 'Mutagen Token',
    kind: 'ACTIVATED',
    costs: [
      { type: 'MANA_COST', cost: '{1}' },
      { type: 'TAP_SOURCE' },
      { type: 'SACRIFICE_SOURCE' },
    ],
    restrictions: ['SORCERY_SPEED'],
    effects: [{
      type: 'TARGET_SELECTION',
      prompt: 'Elige una criatura.',
      constraints: { zones: ['battlefield'], cardTypes: ['Creature'] },
      effects: [{ type: 'ADD_COUNTER', target: 'SELECTED_TARGET', counterType: '+1/+1', amount: { type: 'LITERAL', value: 1 } }],
    }],
    automation: 'AUTO',
  },
]
