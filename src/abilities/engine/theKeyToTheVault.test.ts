import { describe, expect, it } from 'vitest'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import { evaluateAbilities } from './abilityEngine'
import { createInitialGameState } from '../../engine/gameEngine'
import { resolveFreeCastFromExile } from '../../commands/resolver/resolveCommand'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { DeckDefinition } from '../../types/deck'
import type { GameState } from '../../types/game'

const card = (
  name: string,
  typeLine: string,
  manaCost = '{1}{U}',
): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 2,
  manaCost,
  typeLine,
  colors: typeLine === 'Land' ? [] : ['U'],
  colorIdentity: typeLine === 'Land' ? [] : ['U'],
})

const key = card('The Key to the Vault', 'Legendary Artifact — Equipment')
const merfolk = card('Test Merfolk', 'Creature — Merfolk')
const freeCreature = card('Free Merfolk', 'Creature — Merfolk', '{5}{U}')
const commander = card(
  'Test Commander',
  'Legendary Creature — Merfolk',
  '{2}{U}',
)

const deck: DeckDefinition = {
  name: 'Key test',
  commander: { quantity: 1, name: commander.name, card: commander },
  mainboard: [
    { quantity: 1, name: key.name, card: key },
    { quantity: 1, name: freeCreature.name, card: freeCreature },
  ],
}

const permanent = (
  instanceId: string,
  definition: CardDefinition,
): CardInstance => ({
  instanceId,
  card: definition,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ownerId: 'player-1',
  controllerId: 'player-1',
  controller: 'YOU',
})

describe('The Key to the Vault', () => {
  it('triggers only from combat damage dealt by the equipped creature and carries the damage amount into the physical top-library prompt', () => {
    const equipped = permanent('equipped', merfolk)
    const equipment = {
      ...permanent('key', key),
      attachedToInstanceId: equipped.instanceId,
    }
    const state = createInitialGameState([equipment, equipped], deck)
    const pending = evaluateAbilities(state, {
      type: 'PLAYER_DEALT_DAMAGE',
      sourceInstanceId: equipped.instanceId,
      amount: 5,
      damageKind: 'COMBAT',
      sourcePlayerId: 'player-1',
      targetPlayerId: 'player-2',
    })
    expect(pending).toHaveLength(1)
    expect(pending[0].sourceCardName).toBe('The Key to the Vault')
    expect(pending[0].resolvedEffects[0]).toMatchObject({
      type: 'SELECT_HIDDEN_ZONE_CARD',
      lookAtTop: 5,
      destination: 'exile',
      allowFail: true,
      constraints: { excludeCardTypes: ['Land'] },
    })

    expect(
      evaluateAbilities(state, {
        type: 'PLAYER_DEALT_DAMAGE',
        sourceInstanceId: equipped.instanceId,
        amount: 5,
        damageKind: 'NONCOMBAT',
        sourcePlayerId: 'player-1',
        targetPlayerId: 'player-2',
      }),
    ).toHaveLength(0)
  })

  it('casts the declared exiled card for a zero base mana cost', () => {
    const exiled: CardInstance = {
      instanceId: 'free-card',
      card: freeCreature,
      zone: 'exile',
      tapped: false,
      counters: {},
      ownerId: 'player-1',
      controllerId: 'player-1',
      controller: 'YOU',
    }
    const state: GameState = {
      ...createInitialGameState([exiled], deck),
      turnState: {
        phase: 'COMBAT',
        step: 'COMBAT_DAMAGE',
        priority: 'NONE',
      },
      manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    }
    const result = resolveFreeCastFromExile(state, exiled.instanceId)
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.actions).toContainEqual(
      expect.objectContaining({
        type: 'CAST_SPELL',
        instanceId: exiled.instanceId,
        fromZone: 'exile',
      }),
    )
    expect(result.actions.some((action) => action.type === 'SPEND_MANA')).toBe(
      false,
    )
  })

  it('keeps the normal equip ability at sorcery speed for {2}{U}', () => {
    const equip = getAbilitiesForCard(key).find(
      (ability) => ability.kind === 'ACTIVATED',
    )
    expect(equip).toMatchObject({
      costs: [{ type: 'MANA_COST', cost: '{2}{U}' }],
      restrictions: ['SORCERY_SPEED'],
    })
  })
})
