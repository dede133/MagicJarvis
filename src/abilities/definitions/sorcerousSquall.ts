import type { AbilityDefinition } from '../types/abilityTypes'

const graveyardSpellLinkKey = 'sorcerous-squall-graveyard-spell'

/**
 * Physical-table contract: the rival mills the cards physically. Jarvis updates
 * the known library count, then the local player may declare the instant or
 * sorcery chosen from that public graveyard. Only that relevant card must become
 * known to the digital state.
 */
export const sorcerousSquallAbilities: AbilityDefinition[] = [
  {
    id: 'sorcerous-squall-spell',
    sourceCardName: 'Sorcerous Squall',
    kind: 'SPELL_EFFECT',
    automation: 'ASSISTED',
    effects: [
      {
        type: 'PLAYER_SELECTION',
        prompt: 'Elige el oponente objetivo de Sorcerous Squall.',
        relation: 'OPPONENT',
        effects: [
          {
            type: 'MILL_PLAYER',
            player: 'TARGET_PLAYER',
            amount: { type: 'LITERAL', value: 9 },
          },
          {
            type: 'SELECT_PUBLIC_ZONE_CARD',
            player: 'TARGET_PLAYER',
            zone: 'graveyard',
            prompt:
              'El rival ha molido nueve cartas. Declara el instantáneo o conjuro de su cementerio que quieres lanzar, o no elijas ninguno.',
            constraints: { cardTypesAnyOf: ['Instant', 'Sorcery'] },
            allowFail: true,
            linkKey: graveyardSpellLinkKey,
            knownBecause: 'MILLED',
          },
          {
            type: 'CAST_LINKED_CARD_WITHOUT_PAYING_MANA_COST',
            key: graveyardSpellLinkKey,
            fromZone: 'graveyard',
            exileIfWouldEnterGraveyard: true,
          },
        ],
      },
    ],
  },
]
