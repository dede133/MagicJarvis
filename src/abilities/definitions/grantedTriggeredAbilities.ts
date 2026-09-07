import type {
  AbilityDefinition,
  TriggeredAbilityDefinition,
} from '../types/abilityTypes'

const one = { type: 'LITERAL', value: 1 } as const

/** Reusable payload for Sygg's temporary "combat damage -> draw" grant. */
export const syggCombatDamageDrawGrantedAbility: Omit<
  TriggeredAbilityDefinition,
  'sourceCardName'
> = {
  id: 'sygg-granted-combat-damage-draw',
  kind: 'TRIGGERED',
  trigger: { type: 'DAMAGE_DEALT' },
  conditions: [
    { type: 'EVENT_SUBJECT_IS_SOURCE' },
    { type: 'EVENT_DAMAGE_KIND_IS', value: 'COMBAT' },
    { type: 'EVENT_DAMAGE_TARGET_IS_PLAYER_OR_PLANESWALKER' },
  ],
  effects: [
    {
      type: 'DRAW_FOR_PLAYER',
      player: 'SOURCE_CONTROLLER',
      amount: one,
    },
  ],
  automation: 'AUTO',
}

export const flamingFistAbilities: AbilityDefinition[] = [
  {
    id: 'flaming-fist-grant-commander-attack-double-strike',
    sourceCardName: 'Flaming Fist',
    kind: 'STATIC',
    effects: [
      {
        type: 'GRANT_TRIGGERED_ABILITY',
        filter: {
          owner: 'YOU',
          isCommander: true,
          cardType: 'Creature',
        },
        ability: {
          id: 'flaming-fist-granted-attack-double-strike',
          kind: 'TRIGGERED',
          trigger: { type: 'CREATURE_ATTACKED' },
          conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
          effects: [
            {
              type: 'TEMPORARY_MODIFIER',
              target: 'SOURCE',
              grantKeywords: ['DOUBLE_STRIKE'],
              duration: 'UNTIL_END_OF_TURN',
            },
          ],
          automation: 'AUTO',
        },
      },
    ],
  },
]

export const swordCoastSailorAbilities: AbilityDefinition[] = [
  {
    id: 'sword-coast-sailor-grant-commander-attack-evasion',
    sourceCardName: 'Sword Coast Sailor',
    kind: 'STATIC',
    effects: [
      {
        type: 'GRANT_TRIGGERED_ABILITY',
        filter: {
          owner: 'YOU',
          isCommander: true,
          cardType: 'Creature',
        },
        ability: {
          id: 'sword-coast-sailor-granted-attack-evasion',
          kind: 'TRIGGERED',
          trigger: { type: 'CREATURE_ATTACKED' },
          conditions: [
            { type: 'EVENT_SUBJECT_IS_SOURCE' },
            {
              type: 'EVENT_ATTACKS_PLAYER_WITH_GREATEST_LIFE_AMONG_OPPONENTS',
            },
          ],
          effects: [
            {
              type: 'CANNOT_BE_BLOCKED',
              target: 'SOURCE',
              duration: 'UNTIL_END_OF_TURN',
            },
          ],
          automation: 'AUTO',
        },
      },
    ],
  },
]
