import type { AbilityDefinition } from '../types/abilityTypes'

/** Patch-1 coverage: Aura attachment itself is handled by the generic Aura core. */
export const aqueousFormAbilities: AbilityDefinition[] = [
  {
    id: 'aqueous-form-unblockable',
    sourceCardName: 'Aqueous Form',
    kind: 'STATIC',
    effects: [
      {
        type: 'BLOCKING_RESTRICTION',
        restriction: {
          type: 'CANNOT_BE_BLOCKED',
          filter: { attachedToSource: true },
        },
      },
    ],
  },
  {
    id: 'aqueous-form-attack-scry',
    sourceCardName: 'Aqueous Form',
    kind: 'TRIGGERED',
    trigger: { type: 'CREATURE_ATTACKED' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_ATTACHED_OBJECT' }],
    effects: [
      {
        type: 'SCRY_PLAYER',
        player: 'SOURCE_CONTROLLER',
        amount: { type: 'LITERAL', value: 1 },
      },
    ],
    automation: 'AUTO',
  },
]
