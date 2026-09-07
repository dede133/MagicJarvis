import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { useGameStore } from '../../store/gameStore'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import type {
  AbilityDefinition,
  PendingAbility,
  PendingDecision,
} from '../types/abilityTypes'
import { evaluateAbilities } from './abilityEngine'

const definition = (name: string): CardDefinition => ({
  scryfallId: name.toLowerCase(),
  name,
  cmc: 1,
  typeLine: 'Creature — Merfolk',
  oracleText: '',
  power: '1',
  toughness: '1',
  colors: [],
  colorIdentity: [],
})

const instance = (id: string, name: string): CardInstance => ({
  instanceId: id,
  card: definition(name),
  zone: 'battlefield',
  tapped: false,
  counters: {},
  controlledSinceTurn: 0,
})

const pending = (id: string): PendingAbility => ({
  id,
  abilityId: `ability-${id}`,
  sourceInstanceId: `source-${id}`,
  sourceCardName: `Source ${id}`,
  createdFromEvent: { type: 'ABILITY_ACTIVATED' },
  resolvedEffects: [],
  automation: 'AUTO',
})

beforeEach(() => useGameStore.getState().replaceGame(createInitialGameState()))

describe('trigger consistency', () => {
  it('uses last known battlefield abilities when permanents leave simultaneously', () => {
    const watcher = instance('watcher', 'Watcher')
    const victim = instance('victim', 'Victim')
    const previous = createInitialGameState([watcher, victim])
    const after: GameState = {
      ...previous,
      cards: previous.cards.map((card) => ({
        ...card,
        zone: 'graveyard' as const,
      })),
    }
    const ability: AbilityDefinition = {
      id: 'watch-leave',
      sourceCardName: 'Watcher',
      kind: 'TRIGGERED',
      trigger: { type: 'CARD_LEFT_BATTLEFIELD' },
      conditions: [],
      effects: [{ type: 'DRAW_CARD', amount: { type: 'LITERAL', value: 1 } }],
      automation: 'AUTO',
    }
    const getAbilities = (card: CardDefinition): AbilityDefinition[] =>
      card.name === 'Watcher' ? [ability] : []

    const result = evaluateAbilities(
      after,
      {
        type: 'CARD_LEFT_BATTLEFIELD',
        cardInstanceId: victim.instanceId,
        cardName: victim.card.name,
        previousZone: 'battlefield',
        nextZone: 'graveyard',
        controller: 'YOU',
        playerId: previous.localPlayerId,
        cardTypes: ['creature'],
        subtypes: ['Merfolk'],
        isToken: false,
      },
      previous,
      getAbilities,
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      sourceInstanceId: watcher.instanceId,
      abilityId: ability.id,
    })
  })

  it('lets the player completely order three simultaneous triggers', () => {
    const abilities = [pending('a'), pending('b'), pending('c')]
    const decision: PendingDecision = {
      id: 'order-three',
      sourceAbilityId: 'trigger-order',
      sourceInstanceId: abilities[0].sourceInstanceId,
      type: 'TRIGGER_ORDER_SELECTION',
      prompt: 'Choose trigger order.',
      options: abilities.map((item) => ({
        instanceId: item.id,
        label: item.sourceCardName,
      })),
      continuation: {
        effectsToExecute: [],
        resumeEffectIndex: 0,
        triggerOrder: { pendingAbilityIds: abilities.map((item) => item.id) },
      },
    }
    useGameStore.getState().replaceGame({
      ...createInitialGameState(),
      pendingAbilities: abilities,
      pendingDecisions: [decision],
    })

    useGameStore.getState().resolvePendingDecision(decision.id, 'b')
    expect(useGameStore.getState().stack).toHaveLength(0)
    expect(
      useGameStore.getState().pendingDecisions[0]?.continuation.triggerOrder,
    ).toEqual({
      pendingAbilityIds: ['a', 'c'],
      orderedPendingAbilityIds: ['b'],
    })

    useGameStore.getState().resolvePendingDecision(decision.id, 'c')
    expect(
      useGameStore.getState().stack.map((object) => object.pendingAbilityId),
    ).toEqual(['b', 'c', 'a'])
    expect(useGameStore.getState().pendingDecisions).toHaveLength(0)
  })

  it('declares a triggered ability target before putting that ability on the stack', () => {
    const tidebinder = {
      ...instance('tidebinder', 'Tidebinder Mage'),
      zone: 'hand' as const,
    }
    const opponentCreature = {
      ...instance('opponent-red', 'Opponent Red Creature'),
      card: {
        ...definition('Opponent Red Creature'),
        colors: ['R' as const],
        colorIdentity: ['R' as const],
      },
      controller: 'OPPONENT' as const,
      controllerId: 'player-2',
      ownerId: 'player-2',
    }
    useGameStore
      .getState()
      .replaceGame(createInitialGameState([tidebinder, opponentCreature]))

    useGameStore.getState().dispatch({
      type: 'MOVE_CARD',
      instanceId: tidebinder.instanceId,
      toZone: 'battlefield',
    })

    const declaration = useGameStore.getState().pendingDecisions[0]
    expect(declaration?.type).toBe('TRIGGER_TARGET_SELECTION')
    expect(useGameStore.getState().stack).toHaveLength(0)

    useGameStore
      .getState()
      .resolvePendingDecision(declaration!.id, opponentCreature.instanceId)

    expect(useGameStore.getState().pendingDecisions).toHaveLength(0)
    expect(useGameStore.getState().stack).toHaveLength(1)
    expect(useGameStore.getState().stack[0]).toMatchObject({
      kind: 'TRIGGERED_ABILITY',
      targets: [opponentCreature.instanceId],
      declaredTargets: [
        {
          targetId: opponentCreature.instanceId,
        },
      ],
    })
  })
})
