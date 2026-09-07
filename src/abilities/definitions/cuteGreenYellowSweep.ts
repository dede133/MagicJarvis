import type { AbilityDefinition } from '../types/abilityTypes'

const one = { type: 'LITERAL', value: 1 } as const
const two = { type: 'LITERAL', value: 2 } as const

export const ishaiAbilities: AbilityDefinition[] = [
  {
    id: 'ishai-opponent-cast-counter',
    sourceCardName: 'Ishai, Ojutai Dragonspeaker',
    kind: 'TRIGGERED',
    trigger: { type: 'SPELL_CAST' },
    conditions: [{ type: 'EVENT_CONTROLLER_IS', value: 'OPPONENT' }],
    effects: [{ type: 'ADD_COUNTER', target: 'SOURCE', counterType: '+1/+1', amount: one }],
    automation: 'AUTO',
  },
]

export const yoshimaruAbilities: AbilityDefinition[] = [
  {
    id: 'yoshimaru-other-legendary-enters-counter',
    sourceCardName: 'Yoshimaru, Ever Faithful',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [
      { type: 'EVENT_CONTROLLER_IS', value: 'YOU' },
      { type: 'EVENT_HAS_TYPE', value: 'Legendary' },
      { type: 'EVENT_SUBJECT_IS_NOT_SOURCE' },
    ],
    effects: [{ type: 'ADD_COUNTER', target: 'SOURCE', counterType: '+1/+1', amount: one }],
    automation: 'AUTO',
  },
]

export const abandonedAirTempleAbilities: AbilityDefinition[] = [
  {
    id: 'abandoned-air-temple-enters-tapped-unless-basic',
    sourceCardName: 'Abandoned Air Temple',
    kind: 'AS_ENTERS',
    effects: [{
      type: 'CONDITIONAL_EFFECT',
      condition: {
        type: 'VALUE_COMPARE',
        left: { type: 'COUNT_OBJECTS', query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', cardTypes: ['Basic', 'Land'] } },
        operator: 'EQ',
        right: { type: 'LITERAL', value: 0 },
      },
      ifTrue: [{ type: 'ENTERS_TAPPED' }],
    }],
    automation: 'AUTO',
  },
  {
    id: 'abandoned-air-temple-white-mana',
    sourceCardName: 'Abandoned Air Temple',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'W', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'abandoned-air-temple-team-counter',
    sourceCardName: 'Abandoned Air Temple',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{3}{W}' }, { type: 'TAP_SOURCE' }],
    effects: [{
      type: 'FOR_EACH',
      query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', cardTypes: ['Creature'] },
      effects: [{ type: 'ADD_COUNTER', target: 'CURRENT_OBJECT', counterType: '+1/+1', amount: one }],
    }],
    automation: 'AUTO',
  },
]

export const agnaQelaAbilities: AbilityDefinition[] = [
  {
    id: 'agna-qela-enters-tapped-unless-basic',
    sourceCardName: "Agna Qel'a",
    kind: 'AS_ENTERS',
    effects: [{
      type: 'CONDITIONAL_EFFECT',
      condition: {
        type: 'VALUE_COMPARE',
        left: { type: 'COUNT_OBJECTS', query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', cardTypes: ['Basic', 'Land'] } },
        operator: 'EQ',
        right: { type: 'LITERAL', value: 0 },
      },
      ifTrue: [{ type: 'ENTERS_TAPPED' }],
    }],
    automation: 'AUTO',
  },
  {
    id: 'agna-qela-blue-mana',
    sourceCardName: "Agna Qel'a",
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'U', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'agna-qela-loot',
    sourceCardName: "Agna Qel'a",
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{2}{U}' }, { type: 'TAP_SOURCE' }],
    effects: [
      { type: 'DRAW_FOR_PLAYER', player: 'SOURCE_CONTROLLER', amount: one },
      { type: 'DISCARD_CARD', player: 'YOU', amount: one },
    ],
    automation: 'ASSISTED',
  },
]

export const anOfferYouCantRefuseAbilities: AbilityDefinition[] = [
  {
    id: 'an-offer-you-cant-refuse-spell',
    sourceCardName: "An Offer You Can't Refuse",
    kind: 'SPELL_EFFECT',
    effects: [{
      type: 'TARGET_SELECTION',
      prompt: 'Elige un hechizo no criatura.',
      constraints: { zones: ['stack'], stackKind: 'SPELL', excludeCardTypes: ['Creature'] },
      effects: [
        { type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' },
        { type: 'CREATE_TOKEN', tokenId: 'TREASURE_TOKEN', amount: two, player: 'TARGET_CONTROLLER' },
      ],
    }],
    automation: 'AUTO',
  },
]

export const animalSanctuaryAbilities: AbilityDefinition[] = [
  {
    id: 'animal-sanctuary-colorless',
    sourceCardName: 'Animal Sanctuary',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'C', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'animal-sanctuary-counter',
    sourceCardName: 'Animal Sanctuary',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{2}' }, { type: 'TAP_SOURCE' }],
    effects: [{
      type: 'TARGET_SELECTION',
      prompt: 'Elige un Bird, Cat, Dog, Goat, Ox o Snake.',
      constraints: {
        zones: ['battlefield'],
        cardTypes: ['Creature'],
        subtypesAnyOf: ['Bird', 'Cat', 'Dog', 'Goat', 'Ox', 'Snake'],
      },
      effects: [{ type: 'ADD_COUNTER', target: 'SELECTED_TARGET', counterType: '+1/+1', amount: one }],
    }],
    automation: 'AUTO',
  },
]

const commanderIdentityMana = (sourceCardName: string): AbilityDefinition => ({
  id: `${sourceCardName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}-commander-identity-mana`,
  sourceCardName,
  kind: 'ACTIVATED',
  costs: [{ type: 'TAP_SOURCE' }],
  effects: [{
    type: 'ADD_MANA_CHOICE',
    player: 'SOURCE_CONTROLLER',
    allowedColors: { type: 'COMMANDER_COLOR_IDENTITY' },
    amount: one,
  }],
  isManaAbility: true,
  automation: 'ASSISTED',
})

export const arcaneSignetAbilities: AbilityDefinition[] = [commanderIdentityMana('Arcane Signet')]
export const commandTowerAbilities: AbilityDefinition[] = [commanderIdentityMana('Command Tower')]

export const blackbladeReforgedAbilities: AbilityDefinition[] = [
  {
    id: 'blackblade-land-buff',
    sourceCardName: 'Blackblade Reforged',
    kind: 'STATIC',
    effects: [{
      type: 'MODIFY_POWER_TOUGHNESS',
      power: { type: 'COUNT_OBJECTS', query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', cardTypes: ['Land'] } },
      toughness: { type: 'COUNT_OBJECTS', query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', cardTypes: ['Land'] } },
      operation: 'ADD',
      filter: { attachedToSource: true },
    }],
  },
  {
    id: 'blackblade-equip-legendary',
    sourceCardName: 'Blackblade Reforged',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{3}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura legendaria que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Legendary', 'Creature'] }, effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }] }],
    automation: 'ASSISTED',
  },
  {
    id: 'blackblade-equip',
    sourceCardName: 'Blackblade Reforged',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{7}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] }, effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }] }],
    automation: 'ASSISTED',
  },
]

export const brotherhoodRegaliaAbilities: AbilityDefinition[] = [
  {
    id: 'brotherhood-regalia-equipped',
    sourceCardName: 'Brotherhood Regalia',
    kind: 'STATIC',
    effects: [
      { type: 'WARD', cost: '{2}', filter: { attachedToSource: true } },
      { type: 'ADD_CREATURE_SUBTYPE', subtype: 'Assassin', filter: { attachedToSource: true } },
      { type: 'BLOCKING_RESTRICTION', restriction: { type: 'CANNOT_BE_BLOCKED', filter: { attachedToSource: true } } },
    ],
  },
  {
    id: 'brotherhood-regalia-equip-legendary',
    sourceCardName: 'Brotherhood Regalia',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{1}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura legendaria que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Legendary', 'Creature'] }, effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }] }],
    automation: 'ASSISTED',
  },
  {
    id: 'brotherhood-regalia-equip',
    sourceCardName: 'Brotherhood Regalia',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{3}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] }, effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }] }],
    automation: 'ASSISTED',
  },
]

export const dayOfDestinyAbilities: AbilityDefinition[] = [{
  id: 'day-of-destiny-legendary-buff',
  sourceCardName: 'Day of Destiny',
  kind: 'STATIC',
  effects: [{ type: 'MODIFY_POWER_TOUGHNESS', power: 2, toughness: 2, operation: 'ADD', filter: { controller: 'YOU', cardType: 'Legendary Creature' } }],
}]

export const desynchronizationAbilities: AbilityDefinition[] = [{
  id: 'desynchronization-spell',
  sourceCardName: 'Desynchronization',
  kind: 'SPELL_EFFECT',
  effects: [{
    type: 'FOR_EACH',
    query: { zones: ['battlefield'], excludeCardTypes: ['Land'], historic: false },
    effects: [{ type: 'MOVE_ZONE', target: 'CURRENT_OBJECT', destination: 'hand', controller: 'OWNER' }],
  }],
  automation: 'AUTO',
}]

export const dovinsVetoAbilities: AbilityDefinition[] = [{
  id: 'dovins-veto-spell',
  sourceCardName: "Dovin's Veto",
  kind: 'SPELL_EFFECT',
  cannotBeCountered: true,
  effects: [{
    type: 'TARGET_SELECTION',
    prompt: 'Elige un hechizo no criatura.',
    constraints: { zones: ['stack'], stackKind: 'SPELL', excludeCardTypes: ['Creature'] },
    effects: [{ type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' }],
  }],
  automation: 'AUTO',
}]

export const enterTheAvatarStateAbilities: AbilityDefinition[] = [{
  id: 'enter-the-avatar-state-spell',
  sourceCardName: 'Enter the Avatar State',
  kind: 'SPELL_EFFECT',
  effects: [{
    type: 'TARGET_SELECTION',
    prompt: 'Elige una criatura que controlas.',
    constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] },
    effects: [
      { type: 'ADD_CREATURE_SUBTYPE', target: 'SELECTED_TARGET', subtype: 'Avatar', duration: 'UNTIL_END_OF_TURN' },
      { type: 'TEMPORARY_MODIFIER', target: 'SELECTED_TARGET', grantKeywords: ['FLYING', 'FIRST_STRIKE', 'LIFELINK', 'HEXPROOF'], duration: 'UNTIL_END_OF_TURN' },
    ],
  }],
  automation: 'AUTO',
}]

export const esiorAbilities: AbilityDefinition[] = [{
  id: 'esior-commander-targeting-tax',
  sourceCardName: 'Esior, Wardwing Familiar',
  kind: 'STATIC',
  effects: [{ type: 'MODIFY_TARGETING_COST', amount: 3, appliesTo: 'SPELL', targetFilter: { controller: 'YOU', isCommander: true }, sourceController: 'OPPONENT' }],
}]

export const floweringWhiteTreeAbilities: AbilityDefinition[] = [{
  id: 'flowering-white-tree-buffs',
  sourceCardName: 'Flowering of the White Tree',
  kind: 'STATIC',
  effects: [
    { type: 'MODIFY_POWER_TOUGHNESS', power: 2, toughness: 1, operation: 'ADD', filter: { controller: 'YOU', cardType: 'Legendary Creature' } },
    { type: 'WARD', cost: '{1}', filter: { controller: 'YOU', cardType: 'Legendary Creature' } },
    { type: 'MODIFY_POWER_TOUGHNESS', power: 1, toughness: 1, operation: 'ADD', filter: { controller: 'YOU', cardType: 'Creature', excludeCardType: 'Legendary' } },
  ],
}]

const conditionalDualLand = (sourceCardName: string, subtypesAnyOf: string[]): AbilityDefinition[] => [
  {
    id: `${sourceCardName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}-enters`,
    sourceCardName,
    kind: 'AS_ENTERS',
    effects: [{ type: 'CONDITIONAL_EFFECT', condition: { type: 'VALUE_COMPARE', left: { type: 'COUNT_OBJECTS', query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', subtypesAnyOf } }, operator: 'EQ', right: { type: 'LITERAL', value: 0 } }, ifTrue: [{ type: 'ENTERS_TAPPED' }] }],
    automation: 'AUTO',
  },
  {
    id: `${sourceCardName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}-mana`,
    sourceCardName,
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA_CHOICE', player: 'SOURCE_CONTROLLER', allowedColors: ['W', 'U'], amount: one }],
    isManaAbility: true,
    automation: 'ASSISTED',
  },
]

export const glacialFortressAbilities = conditionalDualLand('Glacial Fortress', ['Plains', 'Island'])

export const prairieStreamAbilities: AbilityDefinition[] = [
  {
    id: 'prairie-stream-enters',
    sourceCardName: 'Prairie Stream',
    kind: 'AS_ENTERS',
    effects: [{ type: 'CONDITIONAL_EFFECT', condition: { type: 'VALUE_COMPARE', left: { type: 'COUNT_OBJECTS', query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', cardTypes: ['Basic', 'Land'] } }, operator: 'LT', right: { type: 'LITERAL', value: 2 } }, ifTrue: [{ type: 'ENTERS_TAPPED' }] }],
    automation: 'AUTO',
  },
  {
    id: 'prairie-stream-mana',
    sourceCardName: 'Prairie Stream',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA_CHOICE', player: 'SOURCE_CONTROLLER', allowedColors: ['W', 'U'], amount: one }],
    isManaAbility: true,
    automation: 'ASSISTED',
  },
]

export const grandArbiterAbilities: AbilityDefinition[] = [{
  id: 'grand-arbiter-cost-modifiers',
  sourceCardName: 'Grand Arbiter Augustin IV',
  kind: 'STATIC',
  effects: [
    { type: 'MODIFY_COST', operation: 'REDUCE_GENERIC_COST', amount: 1, filter: { controller: 'YOU', colors: ['W'] } },
    { type: 'MODIFY_COST', operation: 'REDUCE_GENERIC_COST', amount: 1, filter: { controller: 'YOU', colors: ['U'] } },
    { type: 'MODIFY_COST', operation: 'INCREASE_GENERIC_COST', amount: 1, filter: { controller: 'OPPONENT' } },
  ],
}]

export const hammerOfNazahnAbilities: AbilityDefinition[] = [
  {
    id: 'hammer-of-nazahn-auto-attach-equipment',
    sourceCardName: 'Hammer of Nazahn',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_CONTROLLER_IS', value: 'YOU' }, { type: 'EVENT_HAS_SUBTYPE', value: 'Equipment' }],
    effects: [{ type: 'OPTIONAL_EFFECT', prompt: '¿Quieres anexar ese Equipment?', effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] }, effects: [{ type: 'ATTACH', attachment: 'EVENT_SUBJECT', target: 'SELECTED_TARGET' }] }] }],
    automation: 'ASSISTED',
  },
  {
    id: 'hammer-of-nazahn-equipped',
    sourceCardName: 'Hammer of Nazahn',
    kind: 'STATIC',
    effects: [
      { type: 'MODIFY_POWER_TOUGHNESS', power: 2, toughness: 0, operation: 'ADD', filter: { attachedToSource: true } },
      { type: 'GRANT_KEYWORD', keyword: 'INDESTRUCTIBLE', filter: { attachedToSource: true } },
    ],
  },
  {
    id: 'hammer-of-nazahn-equip',
    sourceCardName: 'Hammer of Nazahn',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{4}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] }, effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }] }],
    automation: 'ASSISTED',
  },
]

export const heraldSecretStreamsAbilities: AbilityDefinition[] = [{
  id: 'herald-countered-creatures-unblockable',
  sourceCardName: 'Herald of Secret Streams',
  kind: 'STATIC',
  effects: [{ type: 'BLOCKING_RESTRICTION', restriction: { type: 'CANNOT_BE_BLOCKED', filter: { controller: 'YOU', cardType: 'Creature', hasCounterType: '+1/+1' } } }],
}]

export const k9Abilities: AbilityDefinition[] = [
  {
    id: 'k9-negative-ward',
    sourceCardName: 'K-9, Mark I',
    kind: 'STATIC',
    effects: [{ type: 'WARD', cost: '{1}', filter: { controller: 'YOU', cardType: 'Legendary Creature', excludeSource: true }, condition: { type: 'SOURCE_IS_UNTAPPED' } }],
  },
  {
    id: 'k9-affirmative-unblockable',
    sourceCardName: 'K-9, Mark I',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{1}{U}' }, { type: 'TAP_SOURCE' }],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura legendaria.', constraints: { zones: ['battlefield'], cardTypes: ['Legendary', 'Creature'] }, effects: [{ type: 'CANNOT_BE_BLOCKED', target: 'SELECTED_TARGET', duration: 'UNTIL_END_OF_TURN' }] }],
    automation: 'AUTO',
  },
]

export const kwainAbilities: AbilityDefinition[] = [{
  id: 'kwain-group-draw',
  sourceCardName: 'Kwain, Itinerant Meddler',
  kind: 'ACTIVATED',
  costs: [{ type: 'TAP_SOURCE' }],
  effects: [{
    type: 'FOR_EACH_PLAYER',
    relation: 'ALL_PLAYERS',
    effects: [{ type: 'OPTIONAL_EFFECT', prompt: '¿Este jugador quiere robar una carta?', effects: [
      { type: 'DRAW_FOR_PLAYER', player: 'CURRENT_PLAYER', amount: one },
      { type: 'GAIN_LIFE_FOR_PLAYER', player: 'CURRENT_PLAYER', amount: one },
    ] }],
  }],
  automation: 'ASSISTED',
}]

export const minasTirithAbilities: AbilityDefinition[] = [
  {
    id: 'minas-tirith-enters',
    sourceCardName: 'Minas Tirith',
    kind: 'AS_ENTERS',
    effects: [{ type: 'CONDITIONAL_EFFECT', condition: { type: 'VALUE_COMPARE', left: { type: 'COUNT_OBJECTS', query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', cardTypes: ['Legendary', 'Creature'] } }, operator: 'EQ', right: { type: 'LITERAL', value: 0 } }, ifTrue: [{ type: 'ENTERS_TAPPED' }] }],
    automation: 'AUTO',
  },
  {
    id: 'minas-tirith-white-mana',
    sourceCardName: 'Minas Tirith',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'ADD_MANA', color: 'W', amount: 1 }],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'minas-tirith-draw',
    sourceCardName: 'Minas Tirith',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{1}{W}' }, { type: 'TAP_SOURCE' }],
    activationConditions: [{ type: 'ATTACKED_WITH_CREATURES_AT_LEAST', count: 2 }],
    effects: [{ type: 'DRAW_FOR_PLAYER', player: 'SOURCE_CONTROLLER', amount: one }],
    automation: 'AUTO',
  },
]

export const mithrilCoatAbilities: AbilityDefinition[] = [
  {
    id: 'mithril-coat-enter-attach',
    sourceCardName: 'Mithril Coat',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura legendaria que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Legendary', 'Creature'] }, effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }] }],
    automation: 'ASSISTED',
  },
  {
    id: 'mithril-coat-equipped-indestructible',
    sourceCardName: 'Mithril Coat',
    kind: 'STATIC',
    effects: [{ type: 'GRANT_KEYWORD', keyword: 'INDESTRUCTIBLE', filter: { attachedToSource: true } }],
  },
  {
    id: 'mithril-coat-equip',
    sourceCardName: 'Mithril Coat',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{3}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] }, effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }] }],
    automation: 'ASSISTED',
  },
]

export const momoPlayfulPetAbilities: AbilityDefinition[] = [{
  id: 'momo-playful-pet-leaves',
  sourceCardName: 'Momo, Playful Pet',
  kind: 'TRIGGERED',
  trigger: { type: 'CARD_LEFT_BATTLEFIELD' },
  conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
  effects: [{ type: 'CHOOSE_MODE', prompt: 'Elige uno.', modes: [
    { id: 'food', label: 'Crear un Food', effects: [{ type: 'CREATE_TOKEN', tokenId: 'FOOD_TOKEN', amount: one }] },
    { id: 'counter', label: 'Poner un +1/+1', effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] }, effects: [{ type: 'ADD_COUNTER', target: 'SELECTED_TARGET', counterType: '+1/+1', amount: one }] }] },
    { id: 'scry', label: 'Scry 2', effects: [{ type: 'SCRY_PLAYER', player: 'SOURCE_CONTROLLER', amount: two }] },
  ] }],
  automation: 'ASSISTED',
}]

export const repelCalamityAbilities: AbilityDefinition[] = [{
  id: 'repel-calamity-spell',
  sourceCardName: 'Repel Calamity',
  kind: 'SPELL_EFFECT',
  effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura con fuerza o resistencia 4 o más.', constraints: { zones: ['battlefield'], cardTypes: ['Creature'], anyOf: [{ powerAtLeast: 4 }, { toughnessAtLeast: 4 }] }, effects: [{ type: 'DESTROY_PERMANENT', target: 'SELECTED_TARGET' }] }],
  automation: 'AUTO',
}]

export const rosaAbilities: AbilityDefinition[] = [{
  id: 'rosa-beginning-combat',
  sourceCardName: 'Rosa, Resolute White Mage',
  kind: 'TRIGGERED',
  trigger: { type: 'COMBAT_STARTED' },
  conditions: [{ type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' }],
  effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] }, effects: [
    { type: 'ADD_COUNTER', target: 'SELECTED_TARGET', counterType: '+1/+1', amount: one },
    { type: 'TEMPORARY_MODIFIER', target: 'SELECTED_TARGET', grantKeywords: ['LIFELINK'], duration: 'UNTIL_END_OF_TURN' },
  ] }],
  automation: 'AUTO',
}]

export const swiftfootBootsAbilities: AbilityDefinition[] = [
  {
    id: 'swiftfoot-boots-equipped',
    sourceCardName: 'Swiftfoot Boots',
    kind: 'STATIC',
    effects: [
      { type: 'GRANT_KEYWORD', keyword: 'HEXPROOF', filter: { attachedToSource: true } },
      { type: 'GRANT_KEYWORD', keyword: 'HASTE', filter: { attachedToSource: true } },
    ],
  },
  {
    id: 'swiftfoot-boots-equip',
    sourceCardName: 'Swiftfoot Boots',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{1}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura que controlas.', constraints: { zones: ['battlefield'], controller: 'YOU', cardTypes: ['Creature'] }, effects: [{ type: 'ATTACH', attachment: 'SOURCE', target: 'SELECTED_TARGET' }] }],
    automation: 'ASSISTED',
  },
]

export const tesharAbilities: AbilityDefinition[] = [{
  id: 'teshar-historic-cast-return',
  sourceCardName: "Teshar, Ancestor's Apostle",
  kind: 'TRIGGERED',
  trigger: { type: 'SPELL_CAST' },
  conditions: [{ type: 'EVENT_CONTROLLER_IS', value: 'YOU' }, { type: 'EVENT_IS_HISTORIC' }],
  effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura de tu cementerio de valor de maná 3 o menos.', constraints: { zones: ['graveyard'], owner: 'YOU', cardTypes: ['Creature'], manaValueMax: { type: 'LITERAL', value: 3 } }, effects: [{ type: 'MOVE_ZONE', target: 'SELECTED_TARGET', destination: 'battlefield', controller: 'OWNER' }] }],
  automation: 'AUTO',
}]

export const theOozeAbilities: AbilityDefinition[] = [
  {
    id: 'the-ooze-leave-mutagens',
    sourceCardName: 'The Ooze',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_LEFT_BATTLEFIELD' },
    conditions: [
      { type: 'EVENT_CONTROLLER_IS', value: 'YOU' },
      { type: 'EVENT_HAS_TYPE', value: 'Creature' },
      { type: 'EVENT_HAS_COUNTER', counterType: '+1/+1' },
    ],
    effects: [{ type: 'CREATE_TOKEN', tokenId: 'MUTAGEN_TOKEN', amount: { type: 'EVENT_COUNTER_COUNT', counterType: '+1/+1' } }],
    automation: 'AUTO',
  },
  {
    id: 'the-ooze-exile-grave-card',
    sourceCardName: 'The Ooze',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una carta de un cementerio.', constraints: { zones: ['graveyard'] }, effects: [
      { type: 'MOVE_ZONE', target: 'SELECTED_TARGET', destination: 'exile', controller: 'OWNER' },
      { type: 'CREATE_TOKEN', tokenId: 'MUTAGEN_TOKEN', amount: one },
    ] }],
    automation: 'AUTO',
  },
]

export const trenzaloreAbilities: AbilityDefinition[] = [
  {
    id: 'trenzalore-blue-time',
    sourceCardName: 'Trenzalore Clocktower',
    kind: 'ACTIVATED',
    costs: [{ type: 'TAP_SOURCE' }],
    effects: [
      { type: 'ADD_MANA', color: 'U', amount: 1 },
      { type: 'ADD_COUNTER', target: 'SOURCE', counterType: 'time', amount: one },
    ],
    isManaAbility: true,
    automation: 'AUTO',
  },
  {
    id: 'trenzalore-twelve-time-reload',
    sourceCardName: 'Trenzalore Clocktower',
    kind: 'ACTIVATED',
    costs: [
      { type: 'MANA_COST', cost: '{1}{U}' },
      { type: 'TAP_SOURCE' },
      { type: 'REMOVE_COUNTERS_FROM_SOURCE', counterType: 'time', amount: { type: 'LITERAL', value: 12 } },
      { type: 'EXILE_SOURCE_FROM_BATTLEFIELD' },
    ],
    activationConditions: [{ type: 'CONTROL_COUNT_AT_LEAST', query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', subtypes: ['Time Lord'] }, count: 1 }],
    effects: [
      { type: 'SHUFFLE_PLAYER_ZONES_INTO_LIBRARY', player: 'SOURCE_CONTROLLER', zones: ['hand', 'graveyard'] },
      { type: 'DRAW_FOR_PLAYER', player: 'SOURCE_CONTROLLER', amount: { type: 'LITERAL', value: 7 } },
    ],
    automation: 'AUTO',
  },
]

export const tyLeeAbilities: AbilityDefinition[] = [
  {
    id: 'ty-lee-prowess',
    sourceCardName: 'Ty Lee, Chi Blocker',
    kind: 'TRIGGERED',
    trigger: { type: 'SPELL_CAST' },
    conditions: [{ type: 'EVENT_CONTROLLER_IS', value: 'YOU' }, { type: 'SPELL_IS_CREATURE', value: false }],
    effects: [{ type: 'TEMPORARY_MODIFIER', target: 'SOURCE', power: 1, toughness: 1, duration: 'UNTIL_END_OF_TURN' }],
    automation: 'AUTO',
  },
  {
    id: 'ty-lee-enter-lock',
    sourceCardName: 'Ty Lee, Chi Blocker',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [{ type: 'OPTIONAL_EFFECT', prompt: '¿Quieres elegir una criatura para girarla?', effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura.', constraints: { zones: ['battlefield'], cardTypes: ['Creature'] }, effects: [
      { type: 'TAP_PERMANENT', target: 'SELECTED_TARGET' },
      { type: 'ADD_UNTAP_RESTRICTION', target: 'SELECTED_TARGET', duration: 'WHILE_SOURCE_CONTROLLED' },
    ] }] }],
    automation: 'ASSISTED',
  },
]

export const unbreakableFormationAbilities: AbilityDefinition[] = [{
  id: 'unbreakable-formation-spell',
  sourceCardName: 'Unbreakable Formation',
  kind: 'SPELL_EFFECT',
  effects: [
    { type: 'FOR_EACH', query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', cardTypes: ['Creature'] }, effects: [{ type: 'TEMPORARY_MODIFIER', target: 'CURRENT_OBJECT', grantKeywords: ['INDESTRUCTIBLE'], duration: 'UNTIL_END_OF_TURN' }] },
    { type: 'CONDITIONAL_EFFECT', condition: { type: 'CURRENT_TURN_STEP_IS_MAIN_PHASE' }, ifTrue: [
      { type: 'CONDITIONAL_EFFECT', condition: { type: 'SOURCE_CONTROLLER_IS_ACTIVE_PLAYER' }, ifTrue: [{ type: 'FOR_EACH', query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', cardTypes: ['Creature'] }, effects: [
        { type: 'ADD_COUNTER', target: 'CURRENT_OBJECT', counterType: '+1/+1', amount: one },
        { type: 'TEMPORARY_MODIFIER', target: 'CURRENT_OBJECT', grantKeywords: ['VIGILANCE'], duration: 'UNTIL_END_OF_TURN' },
      ] }] },
    ] },
  ],
  automation: 'AUTO',
}]

export const urdnanAbilities: AbilityDefinition[] = [
  {
    id: 'urdnan-enter-counter',
    sourceCardName: 'Urdnan, Dromoka Warrior',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura.', constraints: { zones: ['battlefield'], cardTypes: ['Creature'] }, effects: [{ type: 'ADD_COUNTER', target: 'SELECTED_TARGET', counterType: '+1/+1', amount: one }] }],
    automation: 'AUTO',
  },
  {
    id: 'urdnan-attack-strike',
    sourceCardName: 'Urdnan, Dromoka Warrior',
    kind: 'TRIGGERED',
    trigger: { type: 'ATTACKERS_DECLARED' },
    conditions: [{ type: 'EVENT_PLAYER_IS_SOURCE_CONTROLLER' }],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige una criatura atacante con un contador +1/+1.', constraints: { zones: ['battlefield'], cardTypes: ['Creature'], attacking: true, hasCounterType: '+1/+1' }, effects: [{
      type: 'CONDITIONAL_EFFECT',
      condition: { type: 'OBJECT_MATCHES_QUERY', object: 'SELECTED_TARGET', query: { hasCounterType: '+1/+1', counterCountAtLeast: 2 } },
      ifTrue: [{ type: 'TEMPORARY_MODIFIER', target: 'SELECTED_TARGET', grantKeywords: ['DOUBLE_STRIKE'], duration: 'UNTIL_END_OF_TURN' }],
      ifFalse: [{ type: 'TEMPORARY_MODIFIER', target: 'SELECTED_TARGET', grantKeywords: ['FIRST_STRIKE'], duration: 'UNTIL_END_OF_TURN' }],
    }] }],
    automation: 'AUTO',
  },
]

export const venatAbilities: AbilityDefinition[] = [
  {
    id: 'venat-legendary-draw',
    sourceCardName: 'Venat, Heart of Hydaelyn',
    kind: 'TRIGGERED',
    trigger: { type: 'SPELL_CAST' },
    conditions: [{ type: 'EVENT_CONTROLLER_IS', value: 'YOU' }, { type: 'EVENT_HAS_TYPE', value: 'Legendary' }],
    triggerLimit: 'ONCE_EACH_TURN',
    effects: [{ type: 'DRAW_FOR_PLAYER', player: 'SOURCE_CONTROLLER', amount: one }],
    automation: 'AUTO',
  },
  {
    id: 'venat-exile-transform',
    sourceCardName: 'Venat, Heart of Hydaelyn',
    kind: 'ACTIVATED',
    costs: [{ type: 'MANA_COST', cost: '{7}' }, { type: 'TAP_SOURCE' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [{ type: 'TARGET_SELECTION', prompt: 'Elige un permanente no tierra.', constraints: { zones: ['battlefield'], excludeCardTypes: ['Land'] }, effects: [
      { type: 'MOVE_ZONE', target: 'SELECTED_TARGET', destination: 'exile', controller: 'OWNER' },
      { type: 'TRANSFORM_PERMANENT', target: 'SOURCE' },
    ] }],
    automation: 'AUTO',
  },
]


export const aerithAbilities: AbilityDefinition[] = [
  {
    id: 'aerith-life-gain-counter',
    sourceCardName: 'Aerith Gainsborough',
    kind: 'TRIGGERED',
    trigger: { type: 'PLAYER_GAINED_LIFE' },
    conditions: [{ type: 'EVENT_PLAYER_IS_SOURCE_CONTROLLER' }],
    effects: [{ type: 'ADD_COUNTER', target: 'SOURCE', counterType: '+1/+1', amount: one }],
    automation: 'AUTO',
  },
  {
    id: 'aerith-dies-legendary-counters',
    sourceCardName: 'Aerith Gainsborough',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_DIED' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [{
      type: 'FOR_EACH',
      query: { zones: ['battlefield'], controller: 'SOURCE_CONTROLLER', cardTypes: ['Legendary', 'Creature'] },
      effects: [{
        type: 'ADD_COUNTER',
        target: 'CURRENT_OBJECT',
        counterType: '+1/+1',
        amount: { type: 'EVENT_COUNTER_COUNT', counterType: '+1/+1' },
      }],
    }],
    automation: 'AUTO',
  },
]
