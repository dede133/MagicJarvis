import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { useGameStore } from '../../store/gameStore'
import { BLUE_MERFOLK_1_1 } from '../../tokens/tokenDefinitions'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { ReplacementEffect } from './replacementTypes'

const definition = (name: string, typeLine: string): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 1,
  typeLine,
  oracleText: '',
  colors: [],
  colorIdentity: [],
  ...(typeLine.includes('Creature') ? { power: '2', toughness: '2' } : {}),
})

const permanent = (
  id: string,
  name: string,
  typeLine: string,
  extras: Partial<CardInstance> = {},
): CardInstance => ({
  instanceId: id,
  card: definition(name, typeLine),
  zone: 'battlefield',
  tapped: false,
  counters: {},
  controlledSinceTurn: 0,
  ...extras,
})

beforeEach(() => useGameStore.getState().replaceGame(createInitialGameState()))

describe('replacement core', () => {
  it('supports optional first-token-event replacement without reapplying it', () => {
    const enchanted = permanent('target', 'Target', 'Creature — Merfolk')
    const source = permanent('aura', 'Replacement Aura', 'Enchantment — Aura', {
      attachedToInstanceId: enchanted.instanceId,
    })
    const replacement: ReplacementEffect = {
      id: 'copy-first-token-event',
      sourceInstanceId: source.instanceId,
      optional: true,
      firstTimeEachTurn: true,
      duration: 'WHILE_SOURCE_ON_BATTLEFIELD',
      event: { type: 'CREATE_TOKENS' },
      replacement: { type: 'CREATE_TOKEN_COPIES_OF_ATTACHED_PERMANENT' },
    }
    useGameStore.getState().replaceGame({
      ...createInitialGameState([source, enchanted]),
      replacementEffects: [replacement],
    })

    useGameStore.getState().dispatch({
      type: 'CREATE_TOKEN',
      token: BLUE_MERFOLK_1_1,
      amount: 2,
    })
    const decision = useGameStore.getState().pendingDecisions[0]
    expect(decision?.type).toBe('REPLACEMENT_EFFECT')
    expect(
      useGameStore.getState().cards.filter((card) => card.isToken),
    ).toHaveLength(0)
    expect(
      useGameStore.getState().perTurnEventMarkers?.[
        `REPLACEMENT:${replacement.id}`
      ],
    ).toBe(useGameStore.getState().turn)

    if (!decision) throw new Error('expected replacement decision')
    useGameStore.getState().resolvePendingDecision(decision.id, 'YES')
    const copies = useGameStore
      .getState()
      .cards.filter(
        (card) => card.copiedFromInstanceId === enchanted.instanceId,
      )
    expect(copies).toHaveLength(2)

    useGameStore.getState().dispatch({
      type: 'CREATE_TOKEN',
      token: BLUE_MERFOLK_1_1,
      amount: 1,
    })
    expect(useGameStore.getState().pendingDecisions).toHaveLength(0)
    expect(
      useGameStore
        .getState()
        .cards.filter((card) => card.card.name === BLUE_MERFOLK_1_1.name),
    ).toHaveLength(1)
  })

  it('can replace a move to graveyard with exile before the move happens', () => {
    const subject = permanent('spell', 'Tracked Spell', 'Sorcery')
    const replacement: ReplacementEffect = {
      id: 'graveyard-to-exile',
      sourceInstanceId: 'persistent-rule',
      duration: 'PERSISTENT',
      event: {
        type: 'MOVE_CARD',
        toZone: 'graveyard',
        subjectInstanceId: subject.instanceId,
      },
      replacement: { type: 'MOVE_CARD', toZone: 'exile' },
    }
    useGameStore.getState().replaceGame({
      ...createInitialGameState([subject]),
      replacementEffects: [replacement],
    })

    useGameStore.getState().dispatch({
      type: 'MOVE_CARD',
      instanceId: subject.instanceId,
      toZone: 'graveyard',
    })

    expect(
      useGameStore
        .getState()
        .cards.find((card) => card.instanceId === subject.instanceId)?.zone,
    ).toBe('exile')
  })

  it('derives Moonlit Meditation from its static runtime definition', () => {
    const enchanted = permanent('target', 'Target', 'Creature — Merfolk')
    const source = permanent(
      'moonlit',
      'Moonlit Meditation',
      'Enchantment — Aura',
      { attachedToInstanceId: enchanted.instanceId },
    )
    source.card.oracleText =
      'Enchant artifact or creature you control\nThe first time you would create one or more tokens each turn, you may instead create that many tokens that are copies of enchanted permanent.'
    useGameStore
      .getState()
      .replaceGame(createInitialGameState([source, enchanted]))

    useGameStore.getState().dispatch({
      type: 'CREATE_TOKEN',
      token: BLUE_MERFOLK_1_1,
      amount: 2,
    })
    const decision = useGameStore.getState().pendingDecisions[0]
    expect(decision).toMatchObject({
      type: 'REPLACEMENT_EFFECT',
      sourceInstanceId: source.instanceId,
    })
    if (!decision) throw new Error('expected Moonlit replacement decision')
    useGameStore.getState().resolvePendingDecision(decision.id, 'YES')
    expect(
      useGameStore
        .getState()
        .cards.filter(
          (card) => card.copiedFromInstanceId === enchanted.instanceId,
        ),
    ).toHaveLength(2)
  })
})
