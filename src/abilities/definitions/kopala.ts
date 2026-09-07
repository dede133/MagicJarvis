import type { AbilityDefinition } from '../types/abilityTypes'

/**
 * Kopala is expressed as two target-aware static cost modifiers.  The runtime
 * still chooses targets later than paper Magic for some declarative effects,
 * so payment timing remains assisted, but the amount and affected objects are
 * derived from battlefield state instead of card-specific branches.
 */
export const kopalaAbilities: AbilityDefinition[] = [
  {
    id: 'kopala-spell-target-tax',
    sourceCardName: 'Kopala, Warden of Waves',
    kind: 'STATIC',
    effects: [
      {
        type: 'MODIFY_TARGETING_COST',
        amount: 2,
        appliesTo: 'SPELL',
        targetFilter: { controller: 'YOU', subtype: 'Merfolk' },
        sourceController: 'OPPONENT',
      },
    ],
  },
  {
    id: 'kopala-ability-target-tax',
    sourceCardName: 'Kopala, Warden of Waves',
    kind: 'STATIC',
    effects: [
      {
        type: 'MODIFY_TARGETING_COST',
        amount: 2,
        appliesTo: 'ACTIVATED_ABILITY',
        targetFilter: { controller: 'YOU', subtype: 'Merfolk' },
        sourceController: 'OPPONENT',
      },
    ],
  },
]
