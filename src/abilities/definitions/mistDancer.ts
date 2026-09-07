import type { AbilityDefinition } from '../types/abilityTypes'

/**
 * Encore is executed against the stable player model.  The current MVP has one
 * opponent placeholder; once multiplayer is enabled the same effect creates one
 * copy per opponentPlayerIds(...) entry without changing the card definition.
 */
export const mistDancerAbilities: AbilityDefinition[] = [
  {
    id: 'mist-dancer-lord',
    sourceCardName: 'Mist Dancer',
    kind: 'STATIC',
    effects: [
      {
        type: 'MODIFY_POWER_TOUGHNESS',
        power: 1,
        toughness: 0,
        filter: {
          controller: 'YOU',
          subtype: 'Merfolk',
          excludeSource: true,
        },
      },
      {
        type: 'GRANT_KEYWORD',
        keyword: 'FLYING',
        filter: {
          controller: 'YOU',
          subtype: 'Merfolk',
          excludeSource: true,
        },
      },
    ],
  },
  {
    id: 'mist-dancer-encore',
    sourceCardName: 'Mist Dancer',
    kind: 'ACTIVATED',
    costs: [
      { type: 'MANA_COST', cost: '{5}{U}{U}' },
      { type: 'EXILE_SOURCE_FROM_GRAVEYARD' },
    ],
    restrictions: ['SORCERY_SPEED'],
    effects: [{ type: 'ENCORE' }],
    automation: 'AUTO',
  },
]
