import { beforeEach, describe, expect, it } from 'vitest'
import { deriveGameEvents } from '../../events/deriveGameEvents'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import { useGameStore } from '../../store/gameStore'
import type { PendingAbility } from '../types/abilityTypes'
import { evaluateAbilities } from './abilityEngine'
import type { CardDefinition, CardInstance } from '../../types/card'
import { getCapabilityCoverage } from '../compiler/semantic/capabilityCoverage'
import { mapSemanticAnalysisToRuntime } from '../compiler/semantic/mapSemanticAnalysisToRuntime'

const definition = (
  name: string,
  typeLine = 'Creature — Merfolk',
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 1,
  typeLine,
  colors: ['U'],
  colorIdentity: ['U'],
})

const source: CardInstance = {
  instanceId: 'source',
  card: definition('Source'),
  zone: 'battlefield',
  tapped: true,
  counters: {},
}
const target: CardInstance = {
  instanceId: 'target',
  card: definition('Target'),
  zone: 'battlefield',
  tapped: false,
  counters: {},
}

const pending = (
  effects: PendingAbility['resolvedEffects'],
): PendingAbility => ({
  id: 'pending-test',
  abilityId: 'test-ability',
  sourceInstanceId: source.instanceId,
  sourceCardName: source.card.name,
  createdFromEvent: {
    type: 'SPELL_CAST',
    cardInstanceId: 'spell',
    cardName: 'Spell',
    isCreature: false,
    blueManaSymbols: 0,
    controller: 'YOU',
    cardTypes: ['Instant'],
    subtypes: [],
    isToken: false,
  },
  resolvedEffects: effects,
  automation: 'AUTO',
})

describe('generic runtime ability effects and decisions', () => {
  beforeEach(() => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([source, target]),
      hiddenZoneTracking: 'COUNTS_ONLY',
      libraryCount: 5,
      pendingAbilities: [],
    })
  })

  it('emits one CARD_ENTERED_BATTLEFIELD for MOVE_CARD to battlefield', () => {
    const state = createInitialGameState([{ ...target, zone: 'hand' }])
    const action = {
      type: 'MOVE_CARD' as const,
      instanceId: 'target',
      toZone: 'battlefield' as const,
    }
    const next = applyGameAction(state, action)
    const events = deriveGameEvents(state, action, next)
    expect(events).toEqual([
      expect.objectContaining({
        type: 'CARD_ENTERED_BATTLEFIELD',
        cardInstanceId: 'target',
        previousZone: 'hand',
        cardTypes: ['Creature'],
        subtypes: ['Merfolk'],
      }),
    ])
  })

  it('emits CARD_ENTERED_BATTLEFIELD when a permanent spell resolves', () => {
    const state = createInitialGameState([{ ...target, zone: 'stack' }])
    const action = { type: 'RESOLVE_SPELL' as const, instanceId: 'target' }
    const next = applyGameAction(state, action)
    expect(deriveGameEvents(state, action, next)).toEqual([
      expect.objectContaining({
        type: 'CARD_ENTERED_BATTLEFIELD',
        previousZone: 'stack',
      }),
    ])
  })

  it('does not emit a duplicate enter event for a battlefield-to-battlefield move', () => {
    const state = createInitialGameState([target])
    const action = {
      type: 'MOVE_CARD' as const,
      instanceId: 'target',
      toZone: 'battlefield' as const,
    }
    const next = applyGameAction(state, action)
    expect(deriveGameEvents(state, action, next)).toEqual([])
  })

  it('emits one enter event per created token', () => {
    const state = createInitialGameState()
    const action = {
      type: 'CREATE_TOKEN' as const,
      token: {
        id: 'test-token',
        name: 'Test Token',
        colors: ['U'] as CardDefinition['colors'],
        typeLine: 'Token Creature — Merfolk',
        power: '1',
        toughness: '1',
      },
      amount: 2,
    }
    const next = applyGameAction(state, action)
    expect(deriveGameEvents(state, action, next)).toEqual([
      expect.objectContaining({
        type: 'CARD_ENTERED_BATTLEFIELD',
        isToken: true,
        previousZone: 'created',
      }),
      expect.objectContaining({
        type: 'CARD_ENTERED_BATTLEFIELD',
        isToken: true,
        previousZone: 'created',
      }),
    ])
  })

  it('keeps the identity of the creature that died for self-death triggers', () => {
    const state = createInitialGameState([source])
    const action = {
      type: 'MOVE_CARD' as const,
      instanceId: 'source',
      toZone: 'graveyard' as const,
    }
    const next = applyGameAction(state, action)
    expect(deriveGameEvents(state, action, next)).toContainEqual(
      expect.objectContaining({
        type: 'CARD_DIED',
        cardInstanceId: 'source',
        controller: 'YOU',
        cardTypes: ['Creature'],
      }),
    )
  })

  it('derives PLAYER_GAINED_LIFE from the canonical player life delta', () => {
    const state = createInitialGameState([source])
    const action = {
      type: 'GAIN_PLAYER_LIFE' as const,
      playerId: 'player-1',
      amount: 3,
    }
    const next = applyGameAction(state, action)
    expect(deriveGameEvents(state, action, next)).toContainEqual({
      type: 'PLAYER_GAINED_LIFE',
      playerId: 'player-1',
      controller: 'YOU',
      amount: 3,
    })
  })

  it('routes GAIN_LIFE_FOR_PLAYER through the canonical multiplayer life action', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'GAIN_LIFE_FOR_PLAYER',
            player: 'SOURCE_CONTROLLER',
            amount: { type: 'LITERAL', value: 3 },
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    expect(useGameStore.getState().life).toBe(43)
    expect(
      useGameStore.getState().players.find((player) => player.id === 'player-1')
        ?.life,
    ).toBe(43)
  })

  it('can trigger only from life gained by the source controller', () => {
    const lifeAbility = {
      id: 'life-trigger',
      sourceCardName: 'Source',
      kind: 'TRIGGERED' as const,
      trigger: { type: 'PLAYER_GAINED_LIFE' as const },
      conditions: [{ type: 'EVENT_PLAYER_IS_SOURCE_CONTROLLER' as const }],
      effects: [
        {
          type: 'ADD_COUNTER' as const,
          target: 'SOURCE' as const,
          counterType: '+1/+1',
          amount: { type: 'LITERAL' as const, value: 1 },
        },
      ],
      automation: 'AUTO' as const,
    }
    const state = createInitialGameState([
      { ...source, controllerId: 'player-1', controller: 'YOU' },
    ])
    const getAbilities = () => [lifeAbility]
    expect(
      evaluateAbilities(
        state,
        {
          type: 'PLAYER_GAINED_LIFE',
          playerId: 'player-1',
          controller: 'YOU',
          amount: 2,
        },
        state,
        getAbilities,
      ),
    ).toHaveLength(1)
    expect(
      evaluateAbilities(
        state,
        {
          type: 'PLAYER_GAINED_LIFE',
          playerId: 'player-2',
          controller: 'OPPONENT',
          amount: 2,
        },
        state,
        getAbilities,
      ),
    ).toHaveLength(0)
  })

  it('keeps scry as a serializable physical decision and forgets stale known top data', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([source, { ...target, zone: 'library' }]),
      hiddenZoneTracking: 'COUNTS_ONLY',
      libraryCount: 5,
      knownLibraryTopInstanceId: 'target',
      pendingAbilities: [],
    })
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'SCRY_PLAYER',
            player: 'SOURCE_CONTROLLER',
            amount: { type: 'LITERAL', value: 2 },
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    const decision = useGameStore.getState().pendingDecisions[0]
    expect(decision).toMatchObject({
      type: 'PHYSICAL_CONFIRMATION',
      decisionPlayerId: 'player-1',
    })
    expect(useGameStore.getState().knownLibraryTopInstanceId).toBeUndefined()
    expect(JSON.parse(JSON.stringify(decision))).toEqual(decision)
  })

  it('surveil asks for the physical graveyard count before declaring public card identities', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'SURVEIL_PLAYER',
            player: 'SOURCE_CONTROLLER',
            amount: { type: 'LITERAL', value: 2 },
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    const countDecision = useGameStore.getState().pendingDecisions[0]
    expect(countDecision.type).toBe('CHOOSE_VALUE')
    expect(countDecision.options?.map((option) => option.instanceId)).toEqual([
      '0',
      '1',
      '2',
    ])
    useGameStore.getState().resolvePendingDecision(countDecision.id, '1')
    expect(useGameStore.getState().pendingDecisions[0]).toMatchObject({
      type: 'HIDDEN_ZONE_CARD_SELECTION',
      acceptsTextValue: true,
      decisionPlayerId: 'player-1',
    })
  })

  it('maps DRAW_CARD effects to existing unknown draw actions', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [pending([{ type: 'DRAW_CARD', amount: 2 }])],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    expect(useGameStore.getState()).toMatchObject({
      libraryCount: 3,
      handCount: 2,
    })
  })

  it('maps MOVE_ZONE and UNTAP effects to the existing engine actions', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          { type: 'UNTAP_PERMANENT', target: 'SOURCE' },
          { type: 'MOVE_ZONE', target: 'EVENT_SUBJECT', destination: 'exile' },
        ]),
      ],
    })
    useGameStore.getState().dispatch({
      type: 'CAST_SPELL',
      instanceId: 'spell',
      card: definition('Spell', 'Artifact'),
      fromZone: 'hand',
    })
    // Resolve the test ability, not the Namor-triggered ability.
    useGameStore.getState().resolvePendingAbility('pending-test')
    expect(
      useGameStore.getState().cards.find((card) => card.instanceId === 'source')
        ?.tapped,
    ).toBe(false)
    expect(
      useGameStore.getState().cards.find((card) => card.instanceId === 'spell')
        ?.zone,
    ).toBe('exile')
    expect(
      useGameStore.getState().history.map((entry) => entry.action.type),
    ).toEqual(expect.arrayContaining(['MOVE_CARD', 'UNTAP_CARD']))
  })

  it('pauses an optional effect as a serializable PendingDecision', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'OPTIONAL_EFFECT',
            prompt: 'You may draw a card.',
            effects: [{ type: 'DRAW_CARD', amount: 1 }],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    const decision = useGameStore.getState().pendingDecisions[0]
    expect(decision.type).toBe('OPTIONAL_EFFECT')
    expect(JSON.parse(JSON.stringify(decision))).toEqual(decision)
    expect(JSON.stringify(decision)).not.toContain('function')
  })

  it('continues optional effects on YES and ends them on NO', () => {
    const startOptional = () => {
      useGameStore.getState().dispatch({
        type: 'ADD_PENDING_ABILITIES',
        pending: [
          pending([
            {
              type: 'OPTIONAL_EFFECT',
              prompt: 'Draw?',
              effects: [{ type: 'DRAW_CARD', amount: 1 }],
            },
          ]),
        ],
      })
      useGameStore.getState().resolvePendingAbility('pending-test')
      return useGameStore.getState().pendingDecisions[0].id
    }
    useGameStore.getState().resolvePendingDecision(startOptional(), 'YES')
    expect(useGameStore.getState().handCount).toBe(1)
    useGameStore.getState().replaceGame({
      ...createInitialGameState([source, target]),
      hiddenZoneTracking: 'COUNTS_ONLY',
      libraryCount: 5,
      pendingAbilities: [],
    })
    useGameStore.getState().resolvePendingDecision(startOptional(), 'NO')
    expect(useGameStore.getState().handCount).toBe(0)
  })

  it('requires an explicit target, stores its instanceId, and resumes afterwards', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose a creature.',
            constraints: { zones: ['battlefield'], cardTypes: ['Creature'] },
            effects: [
              {
                type: 'MOVE_ZONE',
                target: 'SELECTED_TARGET',
                destination: 'exile',
              },
              { type: 'DRAW_CARD', amount: 1 },
            ],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    const decision = useGameStore.getState().pendingDecisions[0]
    expect(decision.options).toHaveLength(2)
    expect(
      useGameStore.getState().cards.find((card) => card.instanceId === 'target')
        ?.zone,
    ).toBe('battlefield')
    useGameStore.getState().resolvePendingDecision(decision.id, 'target')
    expect(
      useGameStore.getState().cards.find((card) => card.instanceId === 'target')
        ?.zone,
    ).toBe('exile')
    expect(useGameStore.getState().handCount).toBe(1)
  })

  it('keeps a selected target instanceId in the paused resolution context', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose a creature.',
            constraints: { zones: ['battlefield'], cardTypes: ['Creature'] },
            effects: [
              {
                type: 'OPTIONAL_EFFECT',
                prompt: 'Continue?',
                effects: [],
              },
            ],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    useGameStore
      .getState()
      .resolvePendingDecision(
        useGameStore.getState().pendingDecisions[0].id,
        'target',
      )
    expect(
      useGameStore.getState().pendingResolutions[0].context.selectedTargets,
    ).toEqual(['target'])
  })

  it('never picks a target automatically when multiple candidates are known', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose a creature.',
            constraints: { zones: ['battlefield'], cardTypes: ['Creature'] },
            effects: [
              {
                type: 'MOVE_ZONE',
                target: 'SELECTED_TARGET',
                destination: 'exile',
              },
            ],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    expect(useGameStore.getState().pendingDecisions[0].options).toHaveLength(2)
    expect(
      useGameStore
        .getState()
        .cards.every((card) => card.zone === 'battlefield'),
    ).toBe(true)
  })

  it('does not create a target decision when no known candidate exists', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([{ ...source, zone: 'command' }]),
      pendingAbilities: [],
    })
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose a creature.',
            constraints: { zones: ['battlefield'], cardTypes: ['Creature'] },
            effects: [],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    expect(useGameStore.getState().pendingDecisions).toHaveLength(0)
  })

  it('prepares card selection without inventing an unknown-hand identity', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'CARD_SELECTION',
            prompt: 'Choose a known card.',
            constraints: { zones: ['battlefield'] },
            effects: [
              {
                type: 'OPTIONAL_EFFECT',
                prompt: 'Continue?',
                effects: [],
              },
            ],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    const decision = useGameStore.getState().pendingDecisions[0]
    expect(decision.type).toBe('CARD_SELECTION')
    useGameStore.getState().resolvePendingDecision(decision.id, 'target')
    expect(
      useGameStore.getState().pendingResolutions[0].context.selectedCards,
    ).toEqual(['target'])
    expect(useGameStore.getState().handCount).toBe(0)
  })

  it('does not add an undo point for an invalid decision response', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'OPTIONAL_EFFECT',
            prompt: 'Draw?',
            effects: [{ type: 'DRAW_CARD', amount: 1 }],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    const before = useGameStore.getState().undoStack.length
    useGameStore
      .getState()
      .resolvePendingDecision(
        useGameStore.getState().pendingDecisions[0].id,
        'MAYBE',
      )
    expect(useGameStore.getState().undoStack).toHaveLength(before)
  })

  it('undoes the complete selected effect resolution as one snapshot', () => {
    useGameStore.getState().dispatch({
      type: 'ADD_PENDING_ABILITIES',
      pending: [
        pending([
          {
            type: 'OPTIONAL_EFFECT',
            prompt: 'Draw?',
            effects: [{ type: 'DRAW_CARD', amount: 1 }],
          },
        ]),
      ],
    })
    useGameStore.getState().resolvePendingAbility('pending-test')
    const decision = useGameStore.getState().pendingDecisions[0]
    useGameStore.getState().resolvePendingDecision(decision.id, 'YES')
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState().handCount).toBe(0)
    expect(useGameStore.getState().pendingDecisions).toHaveLength(1)
  })

  it('recognizes newly supported capabilities without treating remaining gaps as ready', () => {
    expect(
      getCapabilityCoverage([
        'DRAW_CARD',
        'GAIN_LIFE',
        'SCRY',
        'SURVEIL',
        'PLAYER_CHOICE',
        'ADD_COUNTER',
      ]),
    ).toEqual({
      supported: [
        'DRAW_CARD',
        'GAIN_LIFE',
        'SCRY',
        'SURVEIL',
        'PLAYER_CHOICE',
        'ADD_COUNTER',
      ],
      missing: [],
    })
  })

  it('keeps an unclear semantic fragment from becoming a runtime ability', () => {
    const mapped = mapSemanticAnalysisToRuntime(
      {
        cardName: 'Unclear',
        typeLine: 'Creature',
        oracleText: 'Do something strange.',
      },
      {
        cardName: 'Unclear',
        oracleText: 'Do something strange.',
        abilities: [
          {
            abilityKind: 'TRIGGERED',
            triggerDescription: 'Whenever this enters.',
            costs: [],
            conditions: [],
            effects: ['Draw a card.'],
            targets: [],
            choices: [],
            restrictions: [],
            duration: null,
            referencedObjects: [],
            requiredCapabilities: ['ENTER_BATTLEFIELD', 'DRAW_CARD'],
            unsupportedOrUnclear: ['Do something strange.'],
          },
        ],
        unsupportedOrUnclear: [],
      },
    )
    expect(mapped.status).not.toBe('COMPILED')
    expect(mapped.abilities).toEqual([])
  })
})
