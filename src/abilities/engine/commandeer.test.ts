import { describe, expect, it } from 'vitest'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import {
  advancePendingResolution,
  createSpellEffectResolution,
} from './abilityEngine'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import { useGameStore } from '../../store/gameStore'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'

const definition = (
  name: string,
  typeLine: string,
  oracleText?: string,
): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 2,
  manaCost: '{U}{U}',
  typeLine,
  oracleText,
  colors: ['U'],
  colorIdentity: ['U'],
})

const instance = (
  instanceId: string,
  card: CardDefinition,
  zone: CardInstance['zone'],
  controller: 'YOU' | 'OPPONENT',
  controllerId: string,
): CardInstance => ({
  instanceId,
  card,
  zone,
  tapped: false,
  counters: {},
  controller,
  controllerId,
  ownerId: controllerId,
})

const meta = { actionId: 'test', timestamp: 1 }

describe('Commandeer', () => {
  it('takes control of the target spell and retargets it during resolution', () => {
    const commandeer = definition(
      'Commandeer',
      'Instant',
      "You may exile two blue cards from your hand rather than pay this spell's mana cost.\nGain control of target noncreature spell. You may choose new targets for it.",
    )
    const bounce = definition(
      'External Bounce',
      'Instant',
      "Return target creature to its owner's hand.",
    )
    const creature = definition('Merfolk A', 'Creature — Merfolk')
    const targetA = instance(
      'target-a',
      creature,
      'battlefield',
      'YOU',
      'player-1',
    )
    const targetB = instance(
      'target-b',
      { ...creature, scryfallId: 'merfolk-b', name: 'Merfolk B' },
      'battlefield',
      'YOU',
      'player-1',
    )
    const commandeerInstance = {
      ...instance('commandeer', commandeer, 'stack', 'YOU', 'player-1'),
      stackObjectId: 'stack-commandeer',
    }
    const externalInstance = {
      ...instance('external-bounce', bounce, 'stack', 'OPPONENT', 'player-2'),
      stackObjectId: 'stack-external-bounce',
    }
    const state: GameState = {
      ...createInitialGameState([
        targetA,
        targetB,
        commandeerInstance,
        externalInstance,
      ]),
      stack: [
        {
          stackObjectId: 'stack-external-bounce',
          kind: 'SPELL' as const,
          controller: 'OPPONENT' as const,
          controllerId: 'player-2',
          sourceInstanceId: externalInstance.instanceId,
          spellInstanceId: externalInstance.instanceId,
          targets: [targetA.instanceId],
          declaredTargets: [
            {
              targetId: targetA.instanceId,
              constraints: {
                zones: ['battlefield' as const],
                cardTypes: ['Creature'],
              },
            },
          ],
          order: 1,
        },
        {
          stackObjectId: 'stack-commandeer',
          kind: 'SPELL' as const,
          controller: 'YOU' as const,
          controllerId: 'player-1',
          sourceInstanceId: commandeerInstance.instanceId,
          spellInstanceId: commandeerInstance.instanceId,
          targets: ['stack-external-bounce'],
          declaredTargets: [
            {
              targetId: 'stack-external-bounce',
              constraints: {
                stackKind: 'SPELL' as const,
                excludeCardTypes: ['Creature'],
              },
            },
          ],
          order: 2,
        },
      ],
    }
    const ability = getAbilitiesForCard(commandeer).find(
      (candidate) => candidate.kind === 'SPELL_EFFECT',
    )
    expect(ability).toBeDefined()
    const resolution = createSpellEffectResolution(
      commandeerInstance,
      ability!,
      {},
      state.stack[1].declaredTargets,
    )
    const step = advancePendingResolution(state, resolution)
    expect(step.type).toBe('DECISION')
    if (step.type !== 'DECISION') return
    expect(step.actions).toContainEqual({
      type: 'SET_CARD_CONTROLLER',
      instanceId: externalInstance.instanceId,
      controllerId: 'player-1',
    })
    expect(step.decision.type).toBe('STACK_RETARGET_SELECTION')
    expect(step.decision.options).toContainEqual(
      expect.objectContaining({ instanceId: targetB.instanceId }),
    )

    let staged: GameState = state
    for (const action of step.actions)
      staged = applyGameAction(staged, action, meta)
    staged = applyGameAction(
      staged,
      { type: 'ADD_PENDING_RESOLUTION', resolution: step.resolution },
      meta,
    )
    staged = applyGameAction(
      staged,
      { type: 'ADD_PENDING_DECISION', decision: step.decision },
      meta,
    )
    useGameStore.getState().replaceGame(staged)
    useGameStore
      .getState()
      .resolvePendingDecision(step.decision.id, targetB.instanceId)

    const finalState = useGameStore.getState()
    expect(
      finalState.stack.find(
        (object) => object.stackObjectId === 'stack-external-bounce',
      ),
    ).toMatchObject({
      controller: 'YOU',
      controllerId: 'player-1',
      targets: [targetB.instanceId],
      declaredTargets: [
        expect.objectContaining({ targetId: targetB.instanceId }),
      ],
    })
    expect(
      finalState.cards.find((card) => card.instanceId === 'commandeer')?.zone,
    ).toBe('graveyard')
  })
})
