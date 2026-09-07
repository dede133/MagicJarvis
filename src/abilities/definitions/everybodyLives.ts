import type { AbilityDefinition } from '../types/abilityTypes'

export const everybodyLivesAbilities: AbilityDefinition[] = [
  {
    id: 'everybody-lives-spell',
    sourceCardName: 'Everybody Lives!',
    kind: 'SPELL_EFFECT',
    effects: [
      {
        type: 'FOR_EACH',
        query: { zones: ['battlefield'], cardTypes: ['Creature'] },
        effects: [
          {
            type: 'TEMPORARY_MODIFIER',
            target: 'CURRENT_OBJECT',
            grantKeywords: ['HEXPROOF', 'INDESTRUCTIBLE'],
            duration: 'UNTIL_END_OF_TURN',
          },
        ],
      },
      {
        type: 'FOR_EACH_PLAYER',
        relation: 'ALL_PLAYERS',
        effects: [
          {
            type: 'ADD_PLAYER_RULE',
            player: 'CURRENT_PLAYER',
            rules: { hexproof: true, cannotLoseLife: true, cannotWinOrLose: true },
            duration: 'UNTIL_END_OF_TURN',
          },
        ],
      },
    ],
    automation: 'AUTO',
  },
]
