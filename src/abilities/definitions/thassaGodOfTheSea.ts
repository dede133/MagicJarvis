import type { AbilityDefinition } from '../types/abilityTypes'

export const thassaGodOfTheSeaAbilities: AbilityDefinition[] = [
  {
    id: 'thassa-devotion-characteristics',
    sourceCardName: 'Thassa, God of the Sea',
    kind: 'STATIC',
    effects: [
      { type: 'GRANT_KEYWORD', keyword: 'INDESTRUCTIBLE', filter: { sourceOnly: true } },
      {
        type: 'REMOVE_CARD_TYPE',
        cardType: 'Creature',
        filter: { sourceOnly: true },
        condition: { type: 'DEVOTION_COMPARE', color: 'U', operator: 'LT', value: 5 },
      },
    ],
  },
  {
    id: 'thassa-upkeep-scry',
    sourceCardName: 'Thassa, God of the Sea',
    kind: 'TRIGGERED',
    trigger: { type: 'UPKEEP_STARTED' },
    conditions: [{ type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' }],
    effects: [
      {
        type: 'SCRY_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 1 },
      },
    ],
    automation: 'AUTO',
  },
  {
    id: 'thassa-unblockable',
    sourceCardName: 'Thassa, God of the Sea',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{1}{U}' }],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige una criatura que controlas.',
        constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] },
        effects: [
          { type: 'CANNOT_BE_BLOCKED', target: 'SELECTED_TARGET', duration: 'UNTIL_END_OF_TURN' },
        ],
      },
    ],
    automation: 'AUTO',
  },
]
