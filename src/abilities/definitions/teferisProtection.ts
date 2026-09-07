import type { AbilityDefinition } from '../types/abilityTypes'

export const teferisProtectionAbilities: AbilityDefinition[] = [
  {
    id: 'teferis-protection-spell',
    sourceCardName: "Teferi's Protection",
    kind: 'SPELL_EFFECT',
    effects: [
      {
        type: 'ADD_PLAYER_RULE',
        player: 'SOURCE_CONTROLLER',
        rules: { protectionFromEverything: true, lifeTotalCannotChange: true },
        duration: 'UNTIL_PLAYER_NEXT_TURN',
      },
      {
        type: 'FOR_EACH',
        query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER' },
        effects: [{ type: 'PHASE_OUT_PERMANENT', target: 'CURRENT_OBJECT' }],
      },
      { type: 'MOVE_ZONE', target: 'SOURCE', destination: 'exile' },
    ],
    automation: 'AUTO',
  },
]
