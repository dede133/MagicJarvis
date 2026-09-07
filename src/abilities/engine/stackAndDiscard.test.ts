import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { useGameStore } from '../../store/gameStore'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { PendingAbility } from '../types/abilityTypes'
import {
  advancePendingResolution,
  createPendingResolution,
} from './abilityEngine'

const card = (name: string, typeLine = 'Instant'): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 1,
  typeLine,
  colors: ['U'],
  colorIdentity: ['U'],
})

const instance = (
  instanceId: string,
  definition: CardDefinition,
  zone: CardInstance['zone'],
  extra: Partial<CardInstance> = {},
): CardInstance => ({
  instanceId,
  card: definition,
  zone,
  tapped: false,
  counters: {},
  ...extra,
})

const source = instance('source', card('Source', 'Creature'), 'battlefield')
const event: PendingAbility['createdFromEvent'] = {
  type: 'SPELL_CAST',
  cardInstanceId: 'event-spell',
  cardName: 'Event spell',
  isCreature: false,
  blueManaSymbols: 0,
  controller: 'YOU',
  cardTypes: ['Instant'],
  subtypes: [],
  isToken: false,
}

const pending = (
  effects: PendingAbility['resolvedEffects'],
): PendingAbility => ({
  id: 'pending-stack',
  abilityId: 'stack-effect',
  sourceInstanceId: source.instanceId,
  sourceCardName: source.card.name,
  createdFromEvent: event,
  resolvedEffects: effects,
  automation: 'AUTO',
})

describe('stack targets and identified discard', () => {
  beforeEach(() => {
    useGameStore.getState().replaceGame(
      createInitialGameState([
        source,
        instance('brainstorm', card('Brainstorm'), 'stack', {
          stackObjectId: 'stack-brainstorm',
          controller: 'OPPONENT',
        }),
        instance('opt', card('Opt'), 'stack', {
          stackObjectId: 'stack-opt',
          controller: 'OPPONENT',
        }),
        instance('counterspell', card('Counterspell'), 'hand'),
      ]),
    )
  })

  it('keeps a stable stack object identity when a known card is cast', () => {
    useGameStore.getState().dispatch({
      type: 'CAST_SPELL',
      instanceId: 'counterspell',
      card: card('Counterspell'),
      fromZone: 'hand',
      targetStackObjectId: 'stack-brainstorm',
    })
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'counterspell'),
    ).toMatchObject({
      zone: 'stack',
      stackObjectId: 'stack-counterspell',
      declaredTargetStackObjectId: 'stack-brainstorm',
    })
  })

  it('offers only stack spells that satisfy stack target constraints', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose a spell.',
            constraints: {
              zones: ['stack'],
              stackKind: 'SPELL',
              controller: 'OPPONENT',
            },
            effects: [],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-stack')
    expect(useGameStore.getState().pendingDecisions[0].options).toEqual([
      { instanceId: 'stack-brainstorm', label: 'Brainstorm' },
      { instanceId: 'stack-opt', label: 'Opt' },
    ])
  })

  it('does not automatically choose among multiple spells', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose a spell.',
            constraints: { zones: ['stack'], stackKind: 'SPELL' },
            effects: [
              { type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' },
            ],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-stack')
    expect(
      useGameStore.getState().cards.filter((item) => item.zone === 'stack'),
    ).toHaveLength(2)
  })

  it('stores a selected stack object separately from permanent targets', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose a spell.',
            constraints: { zones: ['stack'], stackKind: 'SPELL' },
            effects: [],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-stack')
    useGameStore
      .getState()
      .resolvePendingDecision(
        useGameStore.getState().pendingDecisions[0].id,
        'stack-brainstorm',
      )
    expect(useGameStore.getState().pendingResolutions).toHaveLength(0)
  })

  it('counters exactly the selected spell into its graveyard', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose a spell.',
            constraints: { zones: ['stack'], stackKind: 'SPELL' },
            effects: [
              { type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' },
            ],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-stack')
    useGameStore
      .getState()
      .resolvePendingDecision(
        useGameStore.getState().pendingDecisions[0].id,
        'stack-brainstorm',
      )
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'brainstorm')?.zone,
    ).toBe('graveyard')
    expect(
      useGameStore.getState().cards.find((item) => item.instanceId === 'opt')
        ?.zone,
    ).toBe('stack')
  })

  it('does not retarget a counter when its chosen spell is gone', () => {
    const resolution = createPendingResolution(
      pending([{ type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' }]),
    )
    const step = advancePendingResolution(createInitialGameState([source]), {
      ...resolution,
      context: { ...resolution.context, selectedStackObjects: ['gone'] },
    })
    expect(step).toMatchObject({ type: 'ERROR' })
  })

  it('undo restores a countered spell to the stack', () => {
    useGameStore.getState().dispatch({
      type: 'MOVE_CARD',
      instanceId: 'brainstorm',
      toZone: 'graveyard',
    })
    useGameStore.getState().undoLastAction()
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'brainstorm')?.zone,
    ).toBe('stack')
  })

  it('resolves a generic compiled counter spell through the existing stack engine', () => {
    const counterspell = card('Counterspell')
    counterspell.oracleText = 'Counter target spell.'
    useGameStore.getState().replaceGame(
      createInitialGameState([
        source,
        instance('counterspell-stack', counterspell, 'stack', {
          stackObjectId: 'stack-counterspell',
          declaredTargetStackObjectId: 'stack-brainstorm',
        }),
        instance('brainstorm', card('Brainstorm'), 'stack', {
          stackObjectId: 'stack-brainstorm',
          controller: 'OPPONENT',
        }),
      ]),
    )
    useGameStore.getState().dispatch({
      type: 'RESOLVE_SPELL',
      instanceId: 'counterspell-stack',
    })
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'brainstorm')?.zone,
    ).toBe('graveyard')
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'counterspell-stack')?.zone,
    ).toBe('graveyard')
  })

  it('pauses DISCARD_CARD for an explicit known hand selection', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [pending([{ type: 'DISCARD_CARD', player: 'YOU', amount: 1 }])],
    })
    useGameStore.getState().resolvePendingAbility('pending-stack')
    expect(useGameStore.getState().pendingDecisions[0]).toMatchObject({
      type: 'CARD_SELECTION',
      constraints: { zones: ['hand'] },
      options: [{ instanceId: 'counterspell', label: 'Counterspell' }],
    })
  })

  it('moves an explicitly selected hand card to graveyard once', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [pending([{ type: 'DISCARD_CARD', player: 'YOU', amount: 1 }])],
    })
    useGameStore.getState().resolvePendingAbility('pending-stack')
    useGameStore
      .getState()
      .resolvePendingDecision(
        useGameStore.getState().pendingDecisions[0].id,
        'counterspell',
      )
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'counterspell')?.zone,
    ).toBe('graveyard')
  })

  it('keeps hand count correct when a known card is discarded', () => {
    useGameStore.getState().replaceGame({
      ...useGameStore.getState(),
      handCount: 1,
      hiddenZoneTracking: 'COUNTS_ONLY',
    })
    useGameStore.getState().dispatch({
      type: 'MOVE_CARD',
      instanceId: 'counterspell',
      toZone: 'graveyard',
    })
    expect(useGameStore.getState().handCount).toBe(0)
  })

  it('does not invent an unknown card when discard needs a selection', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([source]),
      handCount: 4,
    })
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [pending([{ type: 'DISCARD_CARD', player: 'YOU', amount: 1 }])],
    })
    useGameStore.getState().resolvePendingAbility('pending-stack')
    expect(useGameStore.getState().cards).toEqual([source])
    expect(useGameStore.getState().handCount).toBe(4)
  })

  it('degrades safely for a discard amount above one', () => {
    const resolution = createPendingResolution(
      pending([{ type: 'DISCARD_CARD', player: 'YOU', amount: 2 }]),
    )
    expect(
      advancePendingResolution(createInitialGameState([source]), resolution),
    ).toMatchObject({
      type: 'ERROR',
    })
  })

  it('serializes the discard decision without callbacks', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [pending([{ type: 'DISCARD_CARD', player: 'YOU', amount: 1 }])],
    })
    useGameStore.getState().resolvePendingAbility('pending-stack')
    const decision = useGameStore.getState().pendingDecisions[0]
    expect(JSON.parse(JSON.stringify(decision))).toEqual(decision)
    expect(JSON.stringify(decision)).not.toContain('function')
  })
})
