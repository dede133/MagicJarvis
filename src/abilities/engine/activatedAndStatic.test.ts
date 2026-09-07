import { describe, expect, it } from 'vitest'
import { resolveActivatedAbility } from './activationEngine'
import {
  deriveActiveStaticEffects,
  modifiedPowerToughness,
} from './staticEffects'
import { calculateTotalCost } from './costCalculation'
import { createInitialGameState } from '../../engine/gameEngine'
import { useGameStore } from '../../store/gameStore'
import type { ActivatedAbilityDefinition } from '../types/abilityTypes'
import type { CardDefinition, CardInstance } from '../../types/card'

const card = (
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
  power: '1',
  toughness: '1',
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
})

const solRing = card('Sol Ring', 'Artifact', '{T}: Add {C}{C}.')
const merfolkSource = card(
  'Mana Merfolk',
  'Creature — Merfolk',
  '{T}: Add {U}.',
)
const deeproot = card(
  'Deeproot Pilgrimage',
  'Enchantment',
  'Whenever one or more nontoken Merfolk you control become tapped, create a 1/1 blue Merfolk creature token with hexproof.',
)
const sovereign = card(
  'Merfolk Sovereign',
  'Creature — Merfolk Noble',
  "Other Merfolk creatures you control get +1/+1.\n{T}: Target Merfolk creature can't be blocked this turn.",
)
const reejerey = card(
  'Merrow Reejerey',
  'Creature — Merfolk Wizard',
  'Other Merfolk creatures you control get +1/+1.\nWhenever you cast a Merfolk spell, you may tap or untap target permanent.',
)

describe('activated abilities and derived static effects', () => {
  it('does not activate a UI ability action without priority', () => {
    useGameStore
      .getState()
      .replaceGame(createInitialGameState([instance('ring', solRing)]))
    useGameStore.getState().dispatch({
      type: 'ACTIVATE_ABILITY',
      instanceId: 'ring',
      abilityId: 'compiled-tap-add-mana',
    })
    expect(useGameStore.getState().manaPool.C).toBe(0)
    expect(useGameStore.getState().cards[0].tapped).toBe(false)
    expect(useGameStore.getState().undoStack).toHaveLength(0)
  })

  it('activates a simple mana ability through TAP_SOURCE and ADD_MANA', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([instance('ring', solRing)]),
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })
    useGameStore.getState().dispatch({
      type: 'ACTIVATE_ABILITY',
      instanceId: 'ring',
      abilityId: 'compiled-tap-add-mana',
    })
    expect(useGameStore.getState().manaPool.C).toBe(2)
    expect(useGameStore.getState().cards[0].tapped).toBe(true)
  })

  it('does not pay TAP_SOURCE twice and undo restores a mana activation', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([instance('ring', solRing)]),
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })
    const action = {
      type: 'ACTIVATE_ABILITY' as const,
      instanceId: 'ring',
      abilityId: 'compiled-tap-add-mana',
    }
    useGameStore.getState().dispatch(action)
    useGameStore.getState().dispatch(action)
    expect(useGameStore.getState().manaPool.C).toBe(2)
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState().manaPool.C).toBe(0)
    expect(useGameStore.getState().cards[0].tapped).toBe(false)
  })

  it('activation TAP_SOURCE derives the normal tapped event and can trigger Deeproot', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([
        instance('deeproot', deeproot),
        instance('merfolk', merfolkSource),
      ]),
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })
    useGameStore.getState().dispatch({
      type: 'ACTIVATE_ABILITY',
      instanceId: 'merfolk',
      abilityId: 'compiled-tap-add-mana',
    })
    expect(useGameStore.getState().pendingAbilities).toHaveLength(1)
    expect(useGameStore.getState().manaPool.U).toBe(1)
  })

  it('chooses an activated ability target before paying its tap cost', () => {
    const source = {
      ...instance('sovereign', sovereign),
      controlledSinceTurn: 0,
      controller: 'YOU' as const,
      controllerId: 'player-1',
    }
    const target = {
      ...instance(
        'target-merfolk',
        card('Target Merfolk', 'Creature — Merfolk'),
      ),
      controlledSinceTurn: 0,
      controller: 'YOU' as const,
      controllerId: 'player-1',
    }
    useGameStore.getState().replaceGame({
      ...createInitialGameState([source, target]),
      turn: 2,
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })

    useGameStore.getState().dispatch({
      type: 'ACTIVATE_ABILITY',
      instanceId: 'sovereign',
      abilityId: 'tritones-merfolk-sovereign-unblockable',
    })
    const decision = useGameStore
      .getState()
      .pendingDecisions.find(
        (item) => item.type === 'ACTIVATION_TARGET_SELECTION',
      )
    expect(decision).toBeDefined()
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'sovereign')?.tapped,
    ).toBe(false)
    expect(useGameStore.getState().stack).toHaveLength(0)

    useGameStore
      .getState()
      .resolvePendingDecision(decision!.id, 'target-merfolk')
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'sovereign')?.tapped,
    ).toBe(true)
    expect(useGameStore.getState().stack.at(-1)).toMatchObject({
      kind: 'ACTIVATED_ABILITY',
      targets: ['target-merfolk'],
      declaredTargets: [{ targetId: 'target-merfolk' }],
    })
  })

  it('spends a supported mana cost before effects and rejects insufficient mana', () => {
    const ability: ActivatedAbilityDefinition = {
      id: 'pay-blue',
      sourceCardName: 'Source',
      kind: 'ACTIVATED',
      costs: [{ type: 'MANA_COST', cost: '{1}{U}' }],
      effects: [{ type: 'ADD_MANA', color: 'C', amount: 1 }],
      restrictions: [],
      automation: 'AUTO',
    }
    const state = {
      ...createInitialGameState([
        instance('source', card('Source', 'Artifact')),
      ]),
      manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 1 },
    }
    const paid = resolveActivatedAbility(state, 'source', ability)
    expect(paid).toMatchObject({ ok: true })
    if (paid.ok)
      expect(paid.actions).toEqual(
        expect.arrayContaining([
          { type: 'SPEND_MANA', color: 'C', amount: 1 },
          { type: 'SPEND_MANA', color: 'U', amount: 1 },
        ]),
      )
    expect(
      resolveActivatedAbility(
        { ...state, manaPool: { ...state.manaPool, C: 0 } },
        'source',
        ability,
      ),
    ).toEqual({ ok: false, code: 'NOT_ENOUGH_MANA' })
  })

  it('enforces reusable board-state activation conditions', () => {
    const ability: ActivatedAbilityDefinition = {
      id: 'legendary-only',
      sourceCardName: 'Source',
      kind: 'ACTIVATED',
      costs: [],
      effects: [{ type: 'ADD_MANA', color: 'C', amount: 1 }],
      activationConditions: [
        {
          type: 'CONTROL_COUNT_AT_LEAST',
          query: {
            zones: ['battlefield'],
            controller: 'SOURCE_CONTROLLER',
            cardTypes: ['Legendary', 'Creature'],
          },
          count: 1,
        },
      ],
      automation: 'AUTO',
    }
    const source = instance('source', card('Source', 'Artifact'))
    const withoutLegend = createInitialGameState([source])
    expect(resolveActivatedAbility(withoutLegend, 'source', ability)).toEqual({
      ok: false,
      code: 'INVALID_TIMING',
    })
    const withLegend = createInitialGameState([
      source,
      instance('legend', card('Legend', 'Legendary Creature — Human Wizard')),
    ])
    expect(
      resolveActivatedAbility(withLegend, 'source', ability),
    ).toMatchObject({
      ok: true,
    })
  })

  it('derives static P/T effects only from battlefield sources and accumulates them', () => {
    const target = instance('target', card('Target', 'Creature — Merfolk'))
    const state = createInitialGameState([
      instance('reejerey-a', reejerey),
      instance('reejerey-b', reejerey),
      target,
    ])
    const active = deriveActiveStaticEffects(state)
    expect(active.powerToughnessModifiers).toHaveLength(2)
    expect(modifiedPowerToughness(target, active)).toEqual({
      power: 3,
      toughness: 3,
    })
    const withoutSources = createInitialGameState([target])
    expect(
      deriveActiveStaticEffects(withoutSources).powerToughnessModifiers,
    ).toHaveLength(0)
  })

  it('rebuilds the static index after a move and undo without storing a second truth', () => {
    useGameStore
      .getState()
      .replaceGame(createInitialGameState([instance('reejerey', reejerey)]))
    expect(
      deriveActiveStaticEffects(useGameStore.getState())
        .powerToughnessModifiers,
    ).toHaveLength(1)
    useGameStore.getState().dispatch({
      type: 'MOVE_CARD',
      instanceId: 'reejerey',
      toZone: 'graveyard',
    })
    expect(
      deriveActiveStaticEffects(useGameStore.getState())
        .powerToughnessModifiers,
    ).toHaveLength(0)
    useGameStore.getState().undoLastAction()
    expect(
      deriveActiveStaticEffects(useGameStore.getState())
        .powerToughnessModifiers,
    ).toHaveLength(1)
  })

  it('calculates simple generic cost increases and reductions from derived static data', () => {
    const total = calculateTotalCost({
      baseGeneric: 2,
      activeStaticEffects: {
        costModifiers: [
          {
            type: 'MODIFY_COST',
            operation: 'INCREASE_GENERIC_COST',
            amount: 2,
            filter: {},
            sourceInstanceId: 'a',
            sourceCardName: 'A',
          },
          {
            type: 'MODIFY_COST',
            operation: 'REDUCE_GENERIC_COST',
            amount: 1,
            filter: {},
            sourceInstanceId: 'b',
            sourceCardName: 'B',
          },
        ],
        powerToughnessModifiers: [],
        keywordGrants: [],
        typeModifiers: [],
        otherSupported: [],
        wardModifiers: [],
        protectionModifiers: [],
        targetingCostModifiers: [],
        protectionCardTypeModifiers: [],
        protectionEverythingModifiers: [],
        basePowerToughnessSetters: [],
        characteristicModifiers: [],
        damagePreventionModifiers: [],
      },
    })
    expect(total.generic).toBe(3)
  })
})
