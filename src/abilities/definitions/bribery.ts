import type { AbilityDefinition } from '../types/abilityTypes'

/**
 * Physical-table contract: Jarvis never infers the contents of the opponent's
 * library.  The local player performs the search physically and declares only
 * the creature card they actually found.  That card becomes known at that
 * point, keeps the opponent as its owner, and enters under the local player's
 * control.  The opponent shuffle is then recorded normally.
 */
export const briberyAbilities: AbilityDefinition[] = [
  {
    id: 'bribery-spell',
    sourceCardName: 'Bribery',
    kind: 'SPELL_EFFECT',
    automation: 'ASSISTED',
    effects: [
      {
        type: 'PLAYER_SELECTION',
        prompt: 'Elige el oponente objetivo de Bribery.',
        relation: 'OPPONENT',
        effects: [
          {
            type: 'SEARCH_LIBRARY_CARD',
            player: 'TARGET_PLAYER',
            prompt:
              'Busca físicamente en la biblioteca de ese oponente una criatura y declara la que has encontrado.',
            constraints: { cardTypesAnyOf: ['Creature'] },
            reveal: false,
            shuffle: true,
            allowFail: true,
            destination: 'battlefield',
            controller: 'SOURCE_CONTROLLER',
          },
        ],
      },
    ],
  },
]
