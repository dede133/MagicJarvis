import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { useGameStore } from '../../store/gameStore'
import type { CardInstance } from '../../types/card'

const battlefieldCreature: CardInstance = {
  instanceId: 'target-creature',
  card: {
    scryfallId: 'target-creature',
    name: 'Target Creature',
    cmc: 2,
    typeLine: 'Creature — Merfolk',
    colors: ['U'],
    colorIdentity: ['U'],
    power: '2',
    toughness: '2',
  },
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ownerId: 'player-1',
  controllerId: 'player-1',
  controller: 'YOU',
}

const spell: CardInstance = {
  instanceId: 'source-spell',
  card: {
    scryfallId: 'source-spell',
    name: 'Source Spell',
    cmc: 1,
    typeLine: 'Instant',
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Target creature gains flying until end of turn.',
  },
  zone: 'stack',
  tapped: false,
  counters: {},
  ownerId: 'player-1',
  controllerId: 'player-1',
  controller: 'YOU',
  stackObjectId: 'stack-source-spell',
}

beforeEach(() => useGameStore.getState().replaceGame(createInitialGameState()))

describe('spell copy retarget timing', () => {
  it('copies original targets, then asks whether to choose new ones before priority resumes', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([spell, battlefieldCreature]),
      stack: [
        {
          stackObjectId: 'stack-source-spell',
          kind: 'SPELL',
          controller: 'YOU',
          controllerId: 'player-1',
          sourceInstanceId: spell.instanceId,
          spellInstanceId: spell.instanceId,
          targets: [battlefieldCreature.instanceId],
          declaredTargets: [
            {
              targetId: battlefieldCreature.instanceId,
              constraints: {
                zones: ['battlefield'],
                cardTypes: ['Creature'],
              },
            },
          ],
          order: 1,
        },
      ],
    })

    useGameStore.getState().dispatch({
      type: 'COPY_STACK_SPELL',
      sourceStackObjectId: 'stack-source-spell',
      chooseNewTargets: true,
    })

    const copy = useGameStore
      .getState()
      .stack.find(
        (object) => object.copiedFromStackObjectId === 'stack-source-spell',
      )
    expect(copy?.targets).toEqual([battlefieldCreature.instanceId])
    const decision = useGameStore.getState().pendingDecisions[0]
    expect(decision?.type).toBe('STACK_COPY_RETARGET_SELECTION')

    useGameStore
      .getState()
      .resolvePendingDecision(decision!.id, '__KEEP_TARGET__')

    expect(useGameStore.getState().pendingDecisions).toHaveLength(0)
    expect(
      useGameStore
        .getState()
        .stack.find((object) => object.stackObjectId === copy?.stackObjectId)
        ?.declaredTargets,
    ).toMatchObject([{ targetId: battlefieldCreature.instanceId }])
  })
})
