import { beforeEach, describe, expect, it } from 'vitest'
import { compileOracleText } from '../compiler/deterministic/compileOracleText'
import { mapSemanticAnalysisToRuntime } from '../compiler/semantic/mapSemanticAnalysisToRuntime'
import { deriveGameEvents } from '../../events/deriveGameEvents'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import { useGameStore } from '../../store/gameStore'
import type { CardDefinition, CardInstance } from '../../types/card'

const definition = (
  name: string,
  typeLine: string,
  oracleText?: string,
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 2,
  typeLine,
  oracleText,
  colors: ['U'],
  colorIdentity: ['U'],
})

const cosi = definition(
  "Cosi's Trickster",
  'Creature — Merfolk Wizard',
  'Whenever an opponent shuffles their library, you may put a +1/+1 counter on this creature.',
)
const deeproot = definition(
  'Deeproot Pilgrimage',
  'Enchantment',
  'Whenever one or more nontoken Merfolk you control become tapped, create a 1/1 blue Merfolk creature token with hexproof.',
)
const instance = (
  instanceId: string,
  card: CardDefinition,
  isToken = false,
): CardInstance => ({
  instanceId,
  card,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ...(isToken ? { isToken: true } : {}),
})

describe('deterministic semantic runtime patterns', () => {
  beforeEach(() =>
    useGameStore.getState().replaceGame(createInitialGameState()),
  )

  it('compiles the generic opponent-shuffle counter pattern without a card-name branch', () => {
    const result = compileOracleText({
      cardName: 'Any Creature',
      typeLine: cosi.typeLine,
      oracleText: cosi.oracleText,
    })
    expect(result).toMatchObject({
      status: 'COMPILED',
      abilities: [
        {
          trigger: { type: 'PLAYER_SHUFFLED' },
          conditions: [{ type: 'EVENT_CONTROLLER_IS', value: 'OPPONENT' }],
        },
      ],
    })
  })

  it('maps a fully supported semantic construct to the runtime DSL', () => {
    const result = mapSemanticAnalysisToRuntime(
      {
        cardName: cosi.name,
        typeLine: cosi.typeLine,
        oracleText: cosi.oracleText,
      },
      {
        cardName: cosi.name,
        oracleText: cosi.oracleText,
        unsupportedOrUnclear: [],
        abilities: [
          {
            abilityKind: 'TRIGGERED',
            triggerDescription: 'Whenever an opponent shuffles their library',
            costs: [],
            conditions: [],
            effects: ['put a +1/+1 counter on this creature'],
            targets: [],
            choices: ['you may'],
            restrictions: [],
            duration: null,
            referencedObjects: ['this creature'],
            requiredCapabilities: [
              'SHUFFLE_LIBRARY',
              'PLAYER_CHOICE',
              'ADD_COUNTER',
            ],
            unsupportedOrUnclear: [],
          },
        ],
      },
    )
    expect(result).toMatchObject({
      status: 'COMPILED',
      abilities: [{ trigger: { type: 'PLAYER_SHUFFLED' } }],
    })
  })

  it('derives PLAYER_SHUFFLED and does not trigger an opponent-only ability for YOU', () => {
    const initial = createInitialGameState([instance('cosi', cosi)])
    useGameStore.getState().replaceGame(initial)
    useGameStore
      .getState()
      .dispatch({ type: 'DECLARE_PLAYER_SHUFFLED', player: 'local' })
    expect(useGameStore.getState().pendingAbilities).toHaveLength(0)
    useGameStore
      .getState()
      .dispatch({ type: 'DECLARE_PLAYER_SHUFFLED', player: 'opponent' })
    expect(useGameStore.getState().pendingAbilities).toHaveLength(1)
  })

  it('Cosi end-to-end adds a +1/+1 counter only after YES', () => {
    useGameStore
      .getState()
      .replaceGame(createInitialGameState([instance('cosi', cosi)]))
    useGameStore
      .getState()
      .dispatch({ type: 'DECLARE_PLAYER_SHUFFLED', player: 'opponent' })
    useGameStore
      .getState()
      .resolvePendingAbility(useGameStore.getState().pendingAbilities[0].id)
    const decision = useGameStore.getState().pendingDecisions[0]
    useGameStore.getState().resolvePendingDecision(decision.id, 'YES')
    expect(
      useGameStore.getState().cards.find((card) => card.instanceId === 'cosi')
        ?.counters['+1/+1'],
    ).toBe(1)
    useGameStore.getState().undoLastAction()
    expect(
      useGameStore.getState().cards.find((card) => card.instanceId === 'cosi')
        ?.counters['+1/+1'] ?? 0,
    ).toBe(0)
  })

  it('Cosi NO leaves its counters unchanged', () => {
    useGameStore
      .getState()
      .replaceGame(createInitialGameState([instance('cosi', cosi)]))
    useGameStore
      .getState()
      .dispatch({ type: 'DECLARE_PLAYER_SHUFFLED', player: 'opponent' })
    useGameStore
      .getState()
      .resolvePendingAbility(useGameStore.getState().pendingAbilities[0].id)
    useGameStore
      .getState()
      .resolvePendingDecision(
        useGameStore.getState().pendingDecisions[0].id,
        'NO',
      )
    expect(
      useGameStore.getState().cards.find((card) => card.instanceId === 'cosi')
        ?.counters['+1/+1'] ?? 0,
    ).toBe(0)
  })

  it('accumulates repeated +1/+1 counters through the existing counter action', () => {
    useGameStore
      .getState()
      .replaceGame(createInitialGameState([instance('cosi', cosi)]))
    for (let count = 0; count < 2; count += 1) {
      useGameStore
        .getState()
        .dispatch({ type: 'DECLARE_PLAYER_SHUFFLED', player: 'opponent' })
      useGameStore
        .getState()
        .resolvePendingAbility(useGameStore.getState().pendingAbilities[0].id)
      useGameStore
        .getState()
        .resolvePendingDecision(
          useGameStore.getState().pendingDecisions[0].id,
          'YES',
        )
    }
    expect(
      useGameStore.getState().cards.find((card) => card.instanceId === 'cosi')
        ?.counters['+1/+1'],
    ).toBe(2)
  })

  it('derives a tap event only for an untapped-to-tapped transition', () => {
    const merfolk = instance(
      'merfolk',
      definition('Merfolk', 'Creature — Merfolk'),
    )
    const state = createInitialGameState([merfolk])
    const action = { type: 'TAP_CARD' as const, instanceId: 'merfolk' }
    const next = applyGameAction(state, action)
    expect(deriveGameEvents(state, action, next)).toEqual([
      expect.objectContaining({ type: 'PERMANENT_BECAME_TAPPED' }),
    ])
    const repeated = applyGameAction(next, action)
    expect(deriveGameEvents(next, action, repeated)).toEqual([])
  })

  it('Deeproot triggers once for a nontoken Merfolk and creates a hexproof token', () => {
    const merfolk = instance(
      'merfolk',
      definition('Merfolk', 'Creature — Merfolk'),
    )
    useGameStore
      .getState()
      .replaceGame(
        createInitialGameState([instance('deeproot', deeproot), merfolk]),
      )
    useGameStore
      .getState()
      .dispatch({ type: 'TAP_CARD', instanceId: 'merfolk' })
    expect(useGameStore.getState().pendingAbilities).toHaveLength(1)
    useGameStore
      .getState()
      .resolvePendingAbility(useGameStore.getState().pendingAbilities[0].id)
    const tokens = useGameStore.getState().cards.filter((card) => card.isToken)
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({
      card: {
        power: '1',
        toughness: '1',
        colors: ['U'],
        typeLine: 'Token Creature — Merfolk',
      },
      keywords: ['HEXPROOF'],
    })
  })

  it('does not trigger Deeproot for a non-Merfolk or token Merfolk', () => {
    const nonMerfolk = instance(
      'human',
      definition('Human', 'Creature — Human'),
    )
    const tokenMerfolk = instance(
      'token-merfolk',
      definition('Token Merfolk', 'Token Creature — Merfolk'),
      true,
    )
    useGameStore
      .getState()
      .replaceGame(
        createInitialGameState([
          instance('deeproot', deeproot),
          nonMerfolk,
          tokenMerfolk,
        ]),
      )
    useGameStore.getState().dispatch({ type: 'TAP_CARD', instanceId: 'human' })
    useGameStore
      .getState()
      .dispatch({ type: 'TAP_CARD', instanceId: 'token-merfolk' })
    expect(useGameStore.getState().pendingAbilities).toHaveLength(0)
  })

  it('groups one-or-more taps into one Deeproot trigger', () => {
    const first = instance('first', definition('First', 'Creature — Merfolk'))
    const second = instance(
      'second',
      definition('Second', 'Creature — Merfolk'),
    )
    useGameStore
      .getState()
      .replaceGame(
        createInitialGameState([instance('deeproot', deeproot), first, second]),
      )
    useGameStore.getState().dispatchMany([
      { type: 'TAP_CARD', instanceId: 'first', eventGroupId: 'three-merfolk' },
      { type: 'TAP_CARD', instanceId: 'second', eventGroupId: 'three-merfolk' },
    ])
    expect(useGameStore.getState().pendingAbilities).toHaveLength(1)
  })
})
