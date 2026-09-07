import type { AbilityDefinition } from '../types/abilityTypes'

export const lilypadVillageAbilities: AbilityDefinition[] = [
  {
    id: 'lilypad-village-colorless',
    sourceCardName: 'Lilypad Village',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'C', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'lilypad-village-restricted-blue',
    sourceCardName: 'Lilypad Village',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [
      {
        type: 'ADD_RESTRICTED_MANA',
        color: 'U',
        amount: 1,
        restriction: 'CREATURE_SPELLS_ONLY',
      },
    ],
    isManaAbility: true,
    automation: 'AUTO',
  },
]

export const lupinflowerVillageAbilities: AbilityDefinition[] = [
  {
    id: 'lupinflower-village-colorless',
    sourceCardName: 'Lupinflower Village',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'C', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'lupinflower-village-restricted-white',
    sourceCardName: 'Lupinflower Village',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [
      {
        type: 'ADD_RESTRICTED_MANA',
        color: 'W',
        amount: 1,
        restriction: 'CREATURE_SPELLS_ONLY',
      },
    ],
    isManaAbility: true,
    automation: 'AUTO',
  },
]

// The non-mana abilities stay in the same definitions so the villages are
// complete cards rather than a mana-only partial implementation.
lilypadVillageAbilities.push({
  id: 'lilypad-village-surveil',
  sourceCardName: 'Lilypad Village',
  kind: 'ACTIVATED',
  costs: [{ type: 'MANA_COST', cost: '{U}' }, { type: 'TAP_SOURCE' }],
  activationConditions: [{
    type: 'PERMANENT_ENTERED_THIS_TURN',
    query: { subtypesAnyOf: ['Bird', 'Frog', 'Otter', 'Rat'] },
  }],
  effects: [{ type: 'SURVEIL_PLAYER', player: 'SOURCE_CONTROLLER', amount: { type: 'LITERAL', value: 2 } }],
  automation: 'ASSISTED',
})

lupinflowerVillageAbilities.push({
  id: 'lupinflower-village-look-six',
  sourceCardName: 'Lupinflower Village',
  kind: 'ACTIVATED',
  costs: [
    { type: 'MANA_COST', cost: '{1}{W}' },
    { type: 'TAP_SOURCE' },
    { type: 'SACRIFICE_SOURCE' },
  ],
  effects: [
    {
      type: 'SELECT_HIDDEN_ZONE_CARD',
      player: 'SOURCE_CONTROLLER',
      zone: 'library',
      prompt: 'Mira las seis primeras. Puedes revelar un Bat, Bird, Mouse o Rabbit.',
      constraints: { subtypesAnyOf: ['Bat', 'Bird', 'Mouse', 'Rabbit'] },
      destination: 'hand',
      count: { type: 'LITERAL', value: 1 },
      allowFail: true,
      lookAtTop: { type: 'LITERAL', value: 6 },
    },
    {
      type: 'PHYSICAL_CONFIRMATION',
      prompt: 'Pon el resto de las cartas miradas en el fondo de tu biblioteca en orden aleatorio.',
      effects: [],
    },
  ],
  automation: 'ASSISTED',
})
