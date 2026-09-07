import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { resolveActivatedAbility } from './activationEngine'
import type { ActivatedAbilityDefinition } from '../types/abilityTypes'
import { useGameStore } from '../../store/gameStore'
import type { CardDefinition, CardInstance } from '../../types/card'

const card = (name: string, typeLine: string): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 0,
  typeLine,
  colors: name === 'Rivendell' || name === 'Island' ? ['U'] : [],
  colorIdentity: name === 'Rivendell' || name === 'Island' ? ['U'] : [],
})

const instance = (
  instanceId: string,
  definition: CardDefinition,
): CardInstance => ({
  instanceId,
  card: definition,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  controllerId: 'player-1',
  controller: 'YOU',
})

const rivendell = card('Rivendell', 'Legendary Land')
const island = card('Island', 'Basic Land — Island')
const legendaryCreature = card(
  'Legendary Friend',
  'Legendary Creature — Merfolk',
)

describe('0031 activated tap integration', () => {
  it('uses SMART mana to pay a tap ability while reserving its own source', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([
        instance('rivendell', rivendell),
        instance('island-1', island),
        instance('island-2', island),
        { ...instance('legend', legendaryCreature), controlledSinceTurn: 1 },
      ]),
      turn: 2,
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
      autoManaMode: 'SMART',
    })

    useGameStore.getState().dispatch({
      type: 'ACTIVATE_ABILITY',
      instanceId: 'rivendell',
      abilityId: 'rivendell-scry-two',
    })

    const state = useGameStore.getState()
    expect(
      state.cards.find((item) => item.instanceId === 'rivendell')?.tapped,
    ).toBe(true)
    expect(
      state.cards.find((item) => item.instanceId === 'island-1')?.tapped,
    ).toBe(true)
    expect(
      state.cards.find((item) => item.instanceId === 'island-2')?.tapped,
    ).toBe(true)
    expect(state.manaPool.U).toBe(0)
    expect(state.stack.at(-1)).toMatchObject({
      kind: 'ACTIVATED_ABILITY',
      sourceInstanceId: 'rivendell',
    })
  })

  it('pays an activated ability from the source controller mana pool for P2', () => {
    const source = {
      ...instance('p2-source', card('P2 Source', 'Artifact')),
      controllerId: 'player-2',
      controller: 'OPPONENT' as const,
    }
    const initial = createInitialGameState([source])
    const state = {
      ...initial,
      players: initial.players.map((player) =>
        player.id === 'player-2'
          ? {
              ...player,
              manaPool: { ...player.manaPool, U: 1 },
            }
          : player,
      ),
    }
    const ability: ActivatedAbilityDefinition = {
      id: 'p2-pay-blue',
      sourceCardName: 'P2 Source',
      kind: 'ACTIVATED',
      costs: [{ type: 'MANA_COST', cost: '{U}' }],
      effects: [],
      automation: 'AUTO',
    }

    expect(resolveActivatedAbility(state, source.instanceId, ability)).toMatchObject({
      ok: true,
      costActions: [
        {
          type: 'SPEND_PLAYER_MANA',
          playerId: 'player-2',
          color: 'U',
          amount: 1,
        },
      ],
    })
  })
})
