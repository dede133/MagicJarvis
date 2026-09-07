import type { AbilityDefinition } from '../types/abilityTypes'

export const laviniaAzoriusRenegadeAbilities: AbilityDefinition[] = [
  {
    id: 'lavinia-noncreature-cast-restriction',
    sourceCardName: 'Lavinia, Azorius Renegade',
    kind: 'STATIC',
    effects: [
      {
        type: 'CAST_RESTRICTION',
        filter: { controller: 'OPPONENT', excludeCardType: 'Creature' },
        rule: 'MANA_VALUE_AT_MOST_LANDS_CONTROLLED',
      },
    ],
  },
  {
    id: 'lavinia-counter-no-mana-spell',
    sourceCardName: 'Lavinia, Azorius Renegade',
    kind: 'TRIGGERED',
    trigger: { type: 'SPELL_CAST' },
    conditions: [
      { type: 'EVENT_PLAYER_IS_OPPONENT_OF_SOURCE_CONTROLLER' },
      {
        type: 'EVENT_NUMBER_COMPARE',
        field: 'manaSpent',
        operator: 'EQ',
        value: 0,
      },
    ],
    effects: [{ type: 'COUNTER_SPELL', target: 'EVENT_STACK_OBJECT' }],
    automation: 'AUTO',
  },
]

export const narsetParterOfVeilsAbilities: AbilityDefinition[] = [
  {
    id: 'narset-opponent-draw-limit',
    sourceCardName: 'Narset, Parter of Veils',
    kind: 'STATIC',
    effects: [{ type: 'DRAW_LIMIT', player: 'OPPONENT', maxPerTurn: 1 }],
  },
  {
    id: 'narset-look-four',
    sourceCardName: 'Narset, Parter of Veils',
    kind: 'ACTIVATED',
    costs: [{ type: 'LOYALTY', amount: -2 }],
    restrictions: ['SORCERY_SPEED'],
    effects: [
      {
        type: 'SELECT_HIDDEN_ZONE_CARD',
        player: 'SOURCE_CONTROLLER',
        zone: 'library',
        prompt:
          'Mira las cuatro primeras cartas. Puedes revelar una carta que no sea criatura ni tierra y ponerla en tu mano.',
        constraints: { excludeCardTypes: ['Creature', 'Land'] },
        destination: 'hand',
        count: { type: 'LITERAL', value: 1 },
        allowFail: true,
        lookAtTop: { type: 'LITERAL', value: 4 },
      },
      {
        type: 'PHYSICAL_CONFIRMATION',
        prompt:
          'Pon el resto de las cartas miradas en el fondo de tu biblioteca en orden aleatorio.',
        effects: [],
      },
    ],
    automation: 'ASSISTED',
  },
]

export const momoFriendlyFlierAbilities: AbilityDefinition[] = [
  {
    id: 'momo-first-flying-non-lemur-cost-reduction',
    sourceCardName: 'Momo, Friendly Flier',
    kind: 'STATIC',
    effects: [
      {
        type: 'MODIFY_COST',
        operation: 'REDUCE_GENERIC_COST',
        amount: 1,
        filter: {
          controller: 'YOU',
          cardType: 'Creature',
          excludeSubtype: 'Lemur',
          hasKeyword: 'flying',
        },
        condition: { type: 'SOURCE_CONTROLLER_IS_ACTIVE_PLAYER' },
        spellOrdinal: 'FIRST_MATCHING_EACH_TURN',
      },
    ],
  },
  {
    id: 'momo-flying-creature-entered',
    sourceCardName: 'Momo, Friendly Flier',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [
      { type: 'EVENT_SUBJECT_IS_NOT_SOURCE' },
      { type: 'EVENT_PLAYER_IS_SOURCE_CONTROLLER' },
      { type: 'EVENT_HAS_TYPE', value: 'Creature' },
      { type: 'EVENT_HAS_KEYWORD', value: 'flying' },
    ],
    effects: [
      {
        type: 'TEMPORARY_MODIFIER',
        target: 'SOURCE',
        power: 1,
        toughness: 1,
        duration: 'UNTIL_END_OF_TURN',
      },
    ],
    automation: 'AUTO',
  },
]
