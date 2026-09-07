import type { AbilityDefinition } from '../types/abilityTypes'

const exiledCardLinkKey = 'the-key-to-the-vault-exiled-card'

/**
 * The library order remains physical.  Jarvis only materializes the nonland
 * card explicitly declared by the player after looking at the required top N.
 */
export const theKeyToTheVaultAbilities: AbilityDefinition[] = [
  {
    id: 'the-key-to-the-vault-combat-damage',
    sourceCardName: 'The Key to the Vault',
    kind: 'TRIGGERED',
    trigger: { type: 'PLAYER_DEALT_DAMAGE' },
    conditions: [
      { type: 'EVENT_SOURCE_IS_ATTACHED_OBJECT' },
      { type: 'EVENT_DAMAGE_KIND_IS', value: 'COMBAT' },
      {
        type: 'EVENT_NUMBER_COMPARE',
        field: 'damageAmount',
        operator: 'GT',
        value: 0,
      },
    ],
    effects: [
      {
        type: 'SELECT_HIDDEN_ZONE_CARD',
        player: 'SOURCE_CONTROLLER',
        zone: 'library',
        prompt:
          'Puedes declarar una carta que no sea tierra entre las que acabas de mirar para exiliarla.',
        constraints: { excludeCardTypes: ['Land'] },
        destination: 'exile',
        count: { type: 'LITERAL', value: 1 },
        allowFail: true,
        linkKey: exiledCardLinkKey,
        lookAtTop: { type: 'EVENT_VALUE', field: 'damageAmount' },
      },
      {
        type: 'PHYSICAL_CONFIRMATION',
        prompt:
          'Pon las demás cartas que miraste en el fondo de tu biblioteca en orden aleatorio.',
        effects: [],
      },
      {
        type: 'CAST_LINKED_CARD_WITHOUT_PAYING_MANA_COST',
        key: exiledCardLinkKey,
      },
    ],
    automation: 'ASSISTED',
  },
  {
    id: 'the-key-to-the-vault-equip',
    sourceCardName: 'The Key to the Vault',
    kind: 'ACTIVATED',
    automation: 'ASSISTED',
    costs: [{ type: 'MANA_COST', cost: '{2}{U}' }],
    restrictions: ['SORCERY_SPEED'],
    effects: [
      {
        type: 'TARGET_SELECTION',
        prompt: 'Elige una criatura que controlas para equipar.',
        constraints: {
          zones: ['battlefield'],
          controller: 'YOU',
          cardTypes: ['Creature'],
        },
        effects: [
          {
            type: 'ATTACH',
            attachment: 'SOURCE',
            target: 'SELECTED_TARGET',
          },
        ],
      },
    ],
  },
]
