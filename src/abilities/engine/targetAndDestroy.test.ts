import { describe, expect, it } from 'vitest'
import { advancePendingResolution } from './abilityEngine'
import { compileOracleText } from '../compiler/deterministic/compileOracleText'
import { createInitialGameState } from '../../engine/gameEngine'
import {
  deriveActiveStaticEffects,
  modifiedPowerToughness,
} from './staticEffects'
import type { CardDefinition, CardInstance } from '../../types/card'
import type {
  AbilityDefinition,
  PendingResolution,
} from '../types/abilityTypes'

const card = (
  name: string,
  typeLine: string,
  colors: CardDefinition['colors'] = [],
): CardDefinition => ({
  scryfallId: name,
  name,
  cmc: 1,
  typeLine,
  colors,
  colorIdentity: colors,
})

const instance = (
  id: string,
  definition: CardDefinition,
  zone: CardInstance['zone'],
): CardInstance => ({
  instanceId: id,
  card: definition,
  zone,
  tapped: false,
  counters: {},
  controller: 'YOU',
  controllerId: 'player-1',
  ownerId: 'player-1',
})

const resolution = (
  effects: PendingResolution['effects'],
  context: Partial<PendingResolution['context']> = {},
): PendingResolution => ({
  id: 'resolution-test',
  sourceAbilityId: 'test',
  sourceInstanceId: 'source',
  sourceCardName: 'Source',
  effects,
  currentEffectIndex: 0,
  context: {
    sourceInstanceId: 'source',
    triggeringEvent: { type: 'ABILITY_ACTIVATED' },
    selectedTargets: [],
    selectedCards: [],
    selectedStackObjects: [],
    variables: {},
    ...context,
  },
})

describe('generic target legality and destroy', () => {
  it('allows the controller to target hexproof and rejects another controller', () => {
    const target = {
      ...instance(
        'target',
        card('Merfolk', 'Creature — Merfolk'),
        'battlefield',
      ),
      keywords: ['HEXPROOF'] as NonNullable<CardInstance['keywords']>,
    }
    const state = createInitialGameState([
      instance('source', card('Source', 'Creature'), 'battlefield'),
      target,
    ])
    const legal = advancePendingResolution(
      state,
      resolution([{ type: 'TAP_PERMANENT', target: 'SELECTED_TARGET' }], {
        selectedTargets: ['target'],
      }),
    )
    expect(legal.type).toBe('ACTIONS')
    const opponent = {
      ...state,
      cards: state.cards.map((entry) =>
        entry.instanceId === 'source'
          ? {
              ...entry,
              controller: 'OPPONENT' as const,
              controllerId: 'player-2',
            }
          : entry,
      ),
    }
    expect(
      advancePendingResolution(
        opponent,
        resolution([
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose a creature.',
            constraints: {
              zones: ['battlefield'],
              cardTypes: ['Creature'],
              controller: 'YOU',
            },
            effects: [{ type: 'TAP_PERMANENT', target: 'SELECTED_TARGET' }],
          },
        ]),
      ).type,
    ).toBe('ERROR')
  })

  it('consumes a declared target without asking again during resolution', () => {
    const source = instance('source', card('Source', 'Instant'), 'stack')
    const target = instance(
      'target',
      card('Target Merfolk', 'Creature — Merfolk'),
      'battlefield',
    )
    const state = createInitialGameState([source, target])
    const constraints = {
      zones: ['battlefield' as const],
      cardTypes: ['Creature'],
    }
    const result = advancePendingResolution(
      state,
      resolution(
        [
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose a creature.',
            constraints,
            effects: [{ type: 'TAP_PERMANENT', target: 'SELECTED_TARGET' }],
          },
        ],
        {
          declaredTargets: [{ targetId: 'target', constraints }],
        },
      ),
    )
    expect(result).toMatchObject({
      type: 'ACTIONS',
      actions: [{ type: 'TAP_CARD', instanceId: 'target' }],
    })
  })

  it('does not follow a permanent target after it changes zones', () => {
    const source = instance('source', card('Source', 'Instant'), 'stack')
    const moved = instance(
      'target',
      card('Moved Merfolk', 'Creature — Merfolk'),
      'graveyard',
    )
    const state = createInitialGameState([source, moved])
    const result = advancePendingResolution(
      state,
      resolution(
        [
          {
            type: 'ADD_COUNTER',
            target: 'SELECTED_TARGET',
            counterType: '+1/+1',
            amount: 1,
          },
        ],
        {
          selectedTargets: ['target'],
          selectedTargetConstraints: [
            { zones: ['battlefield'], cardTypes: ['Creature'] },
          ],
        },
      ),
    )
    expect(result).toMatchObject({ type: 'COMPLETE' })
  })

  it('counters the whole source stack object when ward/additional cost is not paid', () => {
    const source = instance(
      'source',
      card('Targeted Spell', 'Instant'),
      'stack',
    )
    source.stackObjectId = 'stack-source'
    const state = {
      ...createInitialGameState([source]),
      stack: [
        {
          stackObjectId: 'stack-source',
          kind: 'SPELL' as const,
          controller: 'YOU' as const,
          controllerId: 'player-1',
          sourceInstanceId: 'source',
          spellInstanceId: 'source',
          targets: ['target'],
          order: 1,
        },
      ],
    }
    const result = advancePendingResolution(state, {
      ...resolution([{ type: 'COUNTER_SOURCE_STACK_OBJECT' }]),
      completionActions: [{ type: 'RESOLVE_SPELL', instanceId: 'source' }],
    })
    expect(result).toMatchObject({
      type: 'ACTIONS',
      actions: [
        { type: 'MOVE_CARD', instanceId: 'source', toZone: 'graveyard' },
      ],
      resolution: { completionActions: [] },
    })
  })

  it('destroys a permanent but preserves indestructible', () => {
    const red = instance(
      'red',
      card('Red Permanent', 'Artifact', ['R']),
      'battlefield',
    )
    const state = createInitialGameState([
      instance('source', card('Source', 'Creature'), 'battlefield'),
      red,
    ])
    const result = advancePendingResolution(
      state,
      resolution([{ type: 'DESTROY_PERMANENT', target: 'SELECTED_TARGET' }], {
        selectedTargets: ['red'],
      }),
    )
    expect(result).toMatchObject({
      type: 'ACTIONS',
      actions: [{ type: 'MOVE_CARD', instanceId: 'red', toZone: 'graveyard' }],
    })
    const indestructible = {
      ...red,
      keywords: ['INDESTRUCTIBLE'] as NonNullable<CardInstance['keywords']>,
    }
    expect(
      advancePendingResolution(
        { ...state, cards: [state.cards[0], indestructible] },
        resolution([{ type: 'DESTROY_PERMANENT', target: 'SELECTED_TARGET' }], {
          selectedTargets: ['red'],
        }),
      ).type,
    ).toBe('COMPLETE')
  })

  it('compiles Hydroblast as a generic mode with resolution-time red checks', () => {
    const compiled = compileOracleText({
      cardName: 'Hydroblast',
      typeLine: 'Instant',
      oracleText:
        "Choose one —\n• Counter target spell if it's red.\n• Destroy target permanent if it's red.",
    })
    expect(compiled.status).toBe('COMPILED')
    expect(compiled.abilities[0]).toMatchObject({ kind: 'SPELL_EFFECT' })
    expect(JSON.stringify(compiled.abilities)).toContain('OBJECT_MATCHES_QUERY')
    expect(JSON.stringify(compiled.abilities)).toContain('DESTROY_PERMANENT')
  })

  it('checks red at resolution without making it a target filter', () => {
    const red = instance('red', card('Red Spell', 'Instant', ['R']), 'stack')
    red.stackObjectId = 'stack-red'
    const source = instance(
      'source',
      card('Hydroblast', 'Instant', ['U']),
      'stack',
    )
    const state = createInitialGameState([source, red])
    const counter = advancePendingResolution(
      state,
      resolution(
        [
          {
            type: 'CONDITIONAL_EFFECT',
            condition: {
              type: 'OBJECT_MATCHES_QUERY',
              object: 'SELECTED_STACK_OBJECT',
              query: { colors: ['R'] },
            },
            ifTrue: [
              { type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' },
            ],
          },
        ],
        { selectedStackObjects: ['stack-red'] },
      ),
    )
    expect(counter).toMatchObject({
      type: 'ACTIONS',
      actions: [{ type: 'MOVE_CARD', instanceId: 'red', toZone: 'graveyard' }],
    })
    const nonRed = { ...red, card: card('Blue Spell', 'Instant', ['U']) }
    const noCounter = advancePendingResolution(
      { ...state, cards: [source, nonRed] },
      resolution(
        [
          {
            type: 'CONDITIONAL_EFFECT',
            condition: {
              type: 'OBJECT_MATCHES_QUERY',
              object: 'SELECTED_STACK_OBJECT',
              query: { colors: ['R'] },
            },
            ifTrue: [
              { type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' },
            ],
          },
        ],
        { selectedStackObjects: ['stack-red'] },
      ),
    )
    expect(noCounter.type).toBe('COMPLETE')
  })

  it('recalculates Namor-style power from known Merfolk', () => {
    const namor = instance(
      'namor',
      {
        ...card('Namor', 'Legendary Creature — Merfolk'),
        power: '0',
        toughness: '1',
      },
      'battlefield',
    )
    const merfolk = instance(
      'merfolk',
      card('Merfolk', 'Creature — Merfolk'),
      'battlefield',
    )
    const state = createInitialGameState([namor, merfolk])
    const abilities = (): AbilityDefinition[] => [
      {
        id: 'namor-power',
        sourceCardName: 'Namor',
        kind: 'STATIC',
        effects: [
          {
            type: 'MODIFY_POWER_TOUGHNESS',
            power: {
              type: 'COUNT_OBJECTS',
              query: { zones: ['battlefield'], subtypes: ['Merfolk'] },
            },
            toughness: 0,
            filter: { controller: 'YOU' },
          },
        ],
      },
    ]
    const active = deriveActiveStaticEffects(state, abilities)
    expect(modifiedPowerToughness(namor, active)?.power).toBe(2)
    const fewer = deriveActiveStaticEffects(
      { ...state, cards: [namor] },
      abilities,
    )
    expect(modifiedPowerToughness(namor, fewer)?.power).toBe(1)
  })
})
