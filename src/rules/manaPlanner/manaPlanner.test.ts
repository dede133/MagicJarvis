import { describe, expect, it } from 'vitest'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import type { CardDefinition, CardInstance, ManaColor } from '../../types/card'
import type { GameState, ManaPool } from '../../types/game'
import { findAvailableManaAbilities, planSmartManaPayment } from './manaPlanner'

const pool = (values: Partial<ManaPool> = {}): ManaPool => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
  C: 0,
  ...values,
})

const card = (
  name: string,
  typeLine: string,
  manaCost?: string,
  oracleText?: string,
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  manaCost,
  cmc: 0,
  typeLine,
  oracleText,
  colors: [],
  colorIdentity: [],
})

const island = card('Island', 'Basic Land — Island')
const solRing = card('Sol Ring', 'Artifact', undefined, '{T}: Add {C}{C}.')
const nonManaPermanent = card(
  'Utility Artifact',
  'Artifact',
  undefined,
  '{T}: Draw a card.',
)

const instance = (
  instanceId: string,
  definition: CardDefinition,
  overrides: Partial<CardInstance> = {},
): CardInstance => ({
  instanceId,
  card: definition,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ...overrides,
})

const state = (
  cards: CardInstance[],
  manaPool: ManaPool = pool(),
): GameState => ({
  ...createInitialGameState(cards),
  manaPool,
  turnState: {
    phase: 'PRECOMBAT_MAIN',
    step: 'MAIN_1',
    priority: 'WINDOW_OPEN',
  },
})

const cost = (
  generic = 0,
  colors: Partial<Record<ManaColor, number>> = {},
) => ({
  generic,
  colors,
})

describe('planSmartManaPayment', () => {
  it('finds one safe Island plan for {U} without mutating the state', () => {
    const game = state([instance('island-1', island)])
    const before = structuredClone(game)
    const result = planSmartManaPayment({
      state: game,
      manaCost: cost(0, { U: 1 }),
    })

    expect(result).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
    if (result.kind !== 'UNIQUE_SAFE_PLAN') return
    expect(result.plan.actions).toMatchObject([
      { type: 'TAP_CARD', instanceId: 'island-1' },
      { type: 'ADD_MANA', color: 'U', amount: 1 },
      { type: 'SPEND_MANA', color: 'U', amount: 1 },
    ])
    expect(game).toEqual(before)
  })

  it('uses both Islands when they are both necessary for {U}{U}', () => {
    const result = planSmartManaPayment({
      state: state([
        instance('island-1', island),
        instance('island-2', island),
      ]),
      manaCost: cost(0, { U: 2 }),
    })

    expect(result).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
    if (result.kind === 'UNIQUE_SAFE_PLAN')
      expect(result.plan.sourceIds).toEqual(['island-1', 'island-2'])
  })

  it('can use coloured mana for generic cost', () => {
    expect(
      planSmartManaPayment({
        state: state([instance('island-1', island)]),
        manaCost: cost(1),
      }),
    ).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
  })

  it('does not plan sources when the pool already pays the cost', () => {
    expect(
      planSmartManaPayment({
        state: state([instance('island-1', island)], pool({ U: 1 })),
        manaCost: cost(0, { U: 1 }),
      }),
    ).toEqual({ kind: 'ALREADY_PAYABLE' })
  })

  it('keeps the former manual behaviour in STRICT mode', () => {
    expect(
      planSmartManaPayment({
        state: state([instance('island-1', island)]),
        manaCost: cost(0, { U: 1 }),
        mode: 'STRICT',
      }),
    ).toEqual({ kind: 'NO_SAFE_PLAN' })
  })

  it('uses existing mana before producing only the missing generic portion', () => {
    const result = planSmartManaPayment({
      state: state([instance('ring', solRing)], pool({ U: 1 })),
      manaCost: cost(2, { U: 1 }),
    })

    expect(result).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
    if (result.kind === 'UNIQUE_SAFE_PLAN')
      expect(result.plan.sourceIds).toEqual(['ring'])
  })

  it('does not turn colourless mana into blue', () => {
    expect(
      planSmartManaPayment({
        state: state([instance('island-1', island), instance('ring', solRing)]),
        manaCost: cost(0, { U: 2 }),
      }),
    ).toEqual({ kind: 'NO_SAFE_PLAN' })
  })

  it('excludes tapped sources, summoning-sick creatures, and non-mana abilities', () => {
    const sickManaCreature = card(
      'New Mana Creature',
      'Creature',
      undefined,
      '{T}: Add {G}.',
    )
    const result = planSmartManaPayment({
      state: state([
        instance('tapped-island', island, { tapped: true }),
        instance('sick-creature', sickManaCreature, { controlledSinceTurn: 1 }),
        instance('utility', nonManaPermanent),
      ]),
      manaCost: cost(0, { U: 1 }),
    })

    expect(result).toEqual({ kind: 'NO_SAFE_PLAN' })
  })

  it('allows a hasty creature mana source', () => {
    const hastyManaCreature = card(
      'Hasty Mana Creature',
      'Creature — Elf Haste',
      undefined,
      '{T}: Add {G}.',
    )
    expect(
      planSmartManaPayment({
        state: state([
          instance('hasty', hastyManaCreature, { controlledSinceTurn: 1 }),
        ]),
        manaCost: cost(0, { G: 1 }),
      }),
    ).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
  })

  it('chooses automatically between two equivalent Islands', () => {
    const result = planSmartManaPayment({
      state: state([
        instance('island-1', island),
        instance('island-2', island),
      ]),
      manaCost: cost(0, { U: 1 }),
    })
    expect(result).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
  })

  it('auto-spends the only safe Sol Ring plan even when it leaves mana floating', () => {
    const result = planSmartManaPayment({
      state: state([instance('ring', solRing)]),
      manaCost: cost(1),
    })
    expect(result).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
    if (result.kind === 'UNIQUE_SAFE_PLAN') {
      expect(result.plan.sourceIds).toEqual(['ring'])
      expect(result.plan.leavesProducedMana).toBe(true)
    }
  })

  it('prefers a no-surplus Island over Sol Ring for a generic one-mana cost', () => {
    const result = planSmartManaPayment({
      state: state([instance('island', island), instance('ring', solRing)]),
      manaCost: cost(1),
    })
    expect(result).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
    if (result.kind === 'UNIQUE_SAFE_PLAN') {
      expect(result.plan.sourceIds).toEqual(['island'])
      expect(result.plan.leavesProducedMana).toBe(false)
    }
  })

  it('keeps competing plans visible in CONFIRM mode', () => {
    const result = planSmartManaPayment({
      state: state([instance('island', island), instance('ring', solRing)]),
      manaCost: cost(1),
      mode: 'CONFIRM',
    })
    expect(result).toMatchObject({ kind: 'MULTIPLE_SAFE_PLANS' })
    if (result.kind === 'MULTIPLE_SAFE_PLANS') {
      expect(result.plans[0].sourceIds).toEqual(['island'])
      expect(result.plans[0].leavesProducedMana).toBe(false)
    }
  })


  it('prefers a fixed Island over a flexible Command Tower when both pay {U}', () => {
    const tower = card('Command Tower', 'Land')
    const commander = {
      ...card('Blue White Commander', 'Legendary Creature'),
      colorIdentity: ['W', 'U'] as ManaColor[],
    }
    const game = {
      ...state([
        instance('island-fixed', island),
        instance('tower-flex', tower),
        instance('commander', commander, { zone: 'command' }),
      ]),
      commanderIdsByPlayer: { 'player-1': ['commander'] },
    }

    const result = planSmartManaPayment({
      state: game,
      manaCost: cost(0, { U: 1 }),
    })

    expect(result).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
    if (result.kind === 'UNIQUE_SAFE_PLAN')
      expect(result.plan.sourceIds).toEqual(['island-fixed'])
  })

  it('keeps mana activation actions out of the stack', () => {
    const result = planSmartManaPayment({
      state: state([instance('ring', solRing)]),
      manaCost: cost(2),
    })
    expect(result).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
    if (result.kind === 'UNIQUE_SAFE_PLAN')
      expect(
        result.plan.actions.some(
          (action) => action.type === 'ADD_STACK_OBJECT',
        ),
      ).toBe(false)
  })

  it('can apply a unique plan as ordinary engine actions', () => {
    const result = planSmartManaPayment({
      state: state([instance('island-1', island)]),
      manaCost: cost(0, { U: 1 }),
    })
    if (result.kind !== 'UNIQUE_SAFE_PLAN') throw new Error('Expected a plan')
    const next = result.plan.actions.reduce(
      (current, action) => applyGameAction(current, action),
      state([instance('island-1', island)]),
    )
    expect(next.cards[0].tapped).toBe(true)
    expect(next.manaPool).toEqual(pool())
  })

  it('uses Sol Ring controlled by player 2 when planning player 2 mana', () => {
    const game = state([
      instance('ring-p2', solRing, {
        ownerId: 'player-2',
        controllerId: 'player-2',
        controller: 'OPPONENT',
      }),
    ])
    const result = planSmartManaPayment({
      state: game,
      manaCost: cost(2),
      playerId: 'player-2',
    })

    expect(result).toMatchObject({ kind: 'UNIQUE_SAFE_PLAN' })
    if (result.kind === 'UNIQUE_SAFE_PLAN') {
      expect(result.plan.sourceIds).toEqual(['ring-p2'])
      expect(result.plan.actions).toContainEqual({
        type: 'ADD_PLAYER_MANA',
        playerId: 'player-2',
        color: 'C',
        amount: 2,
      })
    }
  })

  it('exposes Command Tower commander-identity colors to the mana planner', () => {
    const tower = card('Command Tower', 'Land')
    const ishai = {
      ...card('Ishai, Ojutai Dragonspeaker', 'Legendary Creature — Bird Monk'),
      colorIdentity: ['W', 'U'] as ManaColor[],
    }
    const game = {
      ...state([
        instance('tower-p2', tower, {
          ownerId: 'player-2',
          controllerId: 'player-2',
          controller: 'OPPONENT',
        }),
        instance('ishai-p2', ishai, {
          zone: 'command',
          ownerId: 'player-2',
          controllerId: 'player-2',
          controller: 'OPPONENT',
        }),
      ]),
      commanderIdsByPlayer: { 'player-2': ['ishai-p2'] },
    }

    const sources = findAvailableManaAbilities(game, 'player-2')
      .filter((source) => source.sourceInstanceId === 'tower-p2')

    expect(sources.map((source) => source.production)).toEqual([
      pool({ W: 1 }),
      pool({ U: 1 }),
    ])
  })

})
