import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialGameState } from '../engine/gameEngine'
import type { CardInstance } from '../types/card'
import { useGameStore } from './gameStore'

const ring: CardInstance = {
  instanceId: 'ring',
  card: {
    scryfallId: 'ring',
    name: 'Sol Ring',
    cmc: 1,
    typeLine: 'Artifact',
    colors: [],
    colorIdentity: [],
  },
  zone: 'battlefield',
  tapped: false,
  counters: {},
}

beforeEach(() =>
  useGameStore.getState().replaceGame(createInitialGameState([ring])),
)

describe('game store undo', () => {
  it('undoes a loss of life', () => {
    useGameStore.getState().dispatch({ type: 'LOSE_LIFE', amount: 3 })
    expect(useGameStore.getState().life).toBe(37)
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState().life).toBe(40)
  })

  it('undoes a tap', () => {
    useGameStore.getState().dispatch({ type: 'TAP_CARD', instanceId: 'ring' })
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState().cards[0].tapped).toBe(false)
  })

  it('undoes several successful actions one at a time', () => {
    useGameStore.getState().dispatch({ type: 'LOSE_LIFE', amount: 2 })
    useGameStore
      .getState()
      .dispatch({ type: 'ADD_MANA', color: 'C', amount: 1 })
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState().manaPool.C).toBe(0)
    expect(useGameStore.getState().life).toBe(38)
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState().life).toBe(40)
  })

  it('does not add an undo snapshot for a failed action', () => {
    useGameStore
      .getState()
      .dispatch({ type: 'TAP_CARD', instanceId: 'missing' })
    expect(useGameStore.getState().undoStack).toHaveLength(0)
  })

  it('clears undo history when a new game replaces the current one', () => {
    useGameStore.getState().dispatch({ type: 'LOSE_LIFE', amount: 1 })
    useGameStore.getState().replaceGame(createInitialGameState())
    expect(useGameStore.getState().undoStack).toHaveLength(0)
  })

  it('groups domain actions into a source-aware match transaction', () => {
    useGameStore.getState().dispatch(
      { type: 'TAP_CARD', instanceId: 'ring' },
      {
        source: 'VOICE',
        rawInput: 'gira sol ring',
        normalizedInput: 'gira sol ring',
        provider: 'test-stt',
        confidence: 0.93,
      },
    )

    const transaction = useGameStore.getState().matchTransactions.at(-1)
    expect(transaction).toMatchObject({
      source: 'VOICE',
      commandType: 'TAP_CARD',
      rawInput: 'gira sol ring',
      provider: 'test-stt',
      status: 'MUTATION',
    })
    expect(transaction?.actions).toEqual([
      expect.objectContaining({ type: 'TAP_CARD' }),
    ])
    expect(transaction?.before.battlefield[0]).toMatchObject({ tapped: false })
    expect(transaction?.after.battlefield[0]).toMatchObject({ tapped: true })
    expect(useGameStore.getState().history[0].transactionId).toBe(
      transaction?.id,
    )
  })

  it('preserves recovered transaction history when restoring a snapshot', () => {
    useGameStore
      .getState()
      .dispatch(
        { type: 'TAP_CARD', instanceId: 'ring' },
        { source: 'TEXT', rawInput: 'giro sol ring' },
      )
    const transactions = [...useGameStore.getState().matchTransactions]
    const game = useGameStore.getState().getCurrentGameState()

    useGameStore.getState().replaceGame(createInitialGameState())
    expect(useGameStore.getState().matchTransactions).toHaveLength(0)

    useGameStore.getState().replaceGame(game, { transactions })
    expect(useGameStore.getState().matchTransactions).toEqual(transactions)
  })

  it('preserves runtime rule state across the store GameState projection', () => {
    const game = {
      ...createInitialGameState(),
      failedDrawFromEmptyLibraryByPlayer: { 'player-2': true },
      temporaryGrantedTriggeredAbilities: [],
      damagePreventionEffects: [],
      playerRuleEffects: [],
      airbendPermissions: [],
      restrictedMana: [],
      attachmentControlEffects: [],
      replacementEffects: [],
    }
    useGameStore.getState().replaceGame(game)

    expect(useGameStore.getState().getCurrentGameState()).toMatchObject({
      failedDrawFromEmptyLibraryByPlayer: { 'player-2': true },
      temporaryGrantedTriggeredAbilities: [],
      damagePreventionEffects: [],
      playerRuleEffects: [],
      airbendPermissions: [],
      restrictedMana: [],
      attachmentControlEffects: [],
      replacementEffects: [],
    })
  })
})

describe('declaration-time ward', () => {
  it('puts Ward above a declared opposing spell and counters that spell when unpaid', () => {
    const svyelun: CardInstance = {
      instanceId: 'svyelun',
      card: {
        scryfallId: 'svyelun',
        name: 'Svyelun of Sea and Sky',
        cmc: 3,
        typeLine: 'Legendary Creature — Merfolk God',
        oracleText:
          'Svyelun has indestructible as long as you control at least two other Merfolk.\nWhenever Svyelun attacks, draw a card.\nOther Merfolk you control have ward {1}.',
        colors: ['U'],
        colorIdentity: ['U'],
        power: '3',
        toughness: '4',
      },
      zone: 'battlefield',
      tapped: false,
      counters: {},
      controller: 'YOU',
      controllerId: 'player-1',
      ownerId: 'player-1',
    }
    const target: CardInstance = {
      instanceId: 'warded-merfolk',
      card: {
        scryfallId: 'warded-merfolk',
        name: 'Warded Merfolk',
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
      controller: 'YOU',
      controllerId: 'player-1',
      ownerId: 'player-1',
    }
    const hostileSpell: CardInstance = {
      instanceId: 'hostile-spell',
      card: {
        scryfallId: 'hostile-spell',
        name: 'Hostile Spell',
        cmc: 1,
        typeLine: 'Instant',
        colors: ['R'],
        colorIdentity: ['R'],
      },
      zone: 'hand',
      tapped: false,
      counters: {},
      controller: 'OPPONENT',
      controllerId: 'player-2',
      ownerId: 'player-2',
    }
    useGameStore
      .getState()
      .replaceGame(createInitialGameState([svyelun, target, hostileSpell]))

    useGameStore.getState().dispatch({
      type: 'CAST_SPELL',
      instanceId: hostileSpell.instanceId,
      card: hostileSpell.card,
      fromZone: 'hand',
      actorPlayerId: 'player-2',
      declaredTargets: [
        {
          targetId: target.instanceId,
          constraints: { zones: ['battlefield'], cardTypes: ['Creature'] },
        },
      ],
    })

    const afterCast = useGameStore.getState()
    const ward = afterCast.pendingAbilities.find((ability) =>
      ability.id.startsWith('ward-'),
    )
    expect(ward).toBeDefined()
    expect(afterCast.stack.map((object) => object.kind)).toEqual([
      'SPELL',
      'TRIGGERED_ABILITY',
    ])
    expect(afterCast.stack.at(-1)).toMatchObject({
      controller: 'YOU',
      pendingAbilityId: ward!.id,
    })

    useGameStore.getState().resolvePendingAbility(ward!.id)
    const payment = useGameStore
      .getState()
      .pendingDecisions.find((decision) => decision.type === 'PAYMENT_CHOICE')
    expect(payment?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: 'PAID' }),
        expect.objectContaining({ instanceId: 'NOT_PAID' }),
      ]),
    )
    useGameStore.getState().resolvePendingDecision(payment!.id, 'NOT_PAID')

    expect(
      useGameStore
        .getState()
        .cards.find((card) => card.instanceId === hostileSpell.instanceId)
        ?.zone,
    ).toBe('graveyard')
    expect(
      useGameStore.getState().stack.some((object) => object.kind === 'SPELL'),
    ).toBe(false)
  })
})

describe('declaration transactions', () => {
  const spellCard: CardInstance['card'] = {
    scryfallId: 'transaction-spell',
    name: 'Transaction Spell',
    cmc: 1,
    typeLine: 'Instant',
    colors: ['U'],
    colorIdentity: ['U'],
  }

  it('places triggers caused while paying a cast above the spell', () => {
    const pilgrimage: CardInstance = {
      instanceId: 'pilgrimage',
      card: {
        scryfallId: 'pilgrimage',
        name: 'Deeproot Pilgrimage',
        cmc: 2,
        typeLine: 'Enchantment',
        colors: ['U'],
        colorIdentity: ['U'],
      },
      zone: 'battlefield',
      tapped: false,
      counters: {},
      controller: 'YOU',
      controllerId: 'player-1',
      ownerId: 'player-1',
    }
    const merfolk: CardInstance = {
      instanceId: 'mana-merfolk',
      card: {
        scryfallId: 'mana-merfolk',
        name: 'Mana Merfolk',
        cmc: 1,
        typeLine: 'Creature — Merfolk',
        colors: ['U'],
        colorIdentity: ['U'],
        power: '1',
        toughness: '1',
      },
      zone: 'battlefield',
      tapped: false,
      counters: {},
      controller: 'YOU',
      controllerId: 'player-1',
      ownerId: 'player-1',
      controlledSinceTurn: 0,
    }
    const spell: CardInstance = {
      instanceId: 'transaction-spell-instance',
      card: spellCard,
      zone: 'hand',
      tapped: false,
      counters: {},
      controller: 'YOU',
      controllerId: 'player-1',
      ownerId: 'player-1',
    }
    useGameStore
      .getState()
      .replaceGame(createInitialGameState([pilgrimage, merfolk, spell]))

    useGameStore.getState().dispatchMany([
      { type: 'TAP_CARD', instanceId: merfolk.instanceId },
      {
        type: 'CAST_SPELL',
        instanceId: spell.instanceId,
        card: spell.card,
        fromZone: 'hand',
        actorPlayerId: 'player-1',
      },
    ])

    const next = useGameStore.getState()
    expect(next.stack.map((object) => object.kind)).toEqual([
      'SPELL',
      'TRIGGERED_ABILITY',
    ])
    expect(next.stack[0]).toMatchObject({ spellInstanceId: spell.instanceId })
    expect(next.stack[1]?.pendingAbilityId).toContain(
      'tritones-deeproot-pilgrimage-tap',
    )
  })

  it('rolls a cast declaration back when any planned cost action is stale', () => {
    const tappedSource: CardInstance = {
      instanceId: 'stale-source',
      card: {
        scryfallId: 'stale-source',
        name: 'Stale Source',
        cmc: 0,
        typeLine: 'Land',
        colors: [],
        colorIdentity: [],
      },
      zone: 'battlefield',
      tapped: true,
      counters: {},
      controller: 'YOU',
      controllerId: 'player-1',
      ownerId: 'player-1',
    }
    const spell: CardInstance = {
      instanceId: 'rollback-spell',
      card: spellCard,
      zone: 'hand',
      tapped: false,
      counters: {},
      controller: 'YOU',
      controllerId: 'player-1',
      ownerId: 'player-1',
    }
    useGameStore
      .getState()
      .replaceGame(createInitialGameState([tappedSource, spell]))

    useGameStore.getState().dispatchMany([
      { type: 'TAP_CARD', instanceId: tappedSource.instanceId },
      {
        type: 'CAST_SPELL',
        instanceId: spell.instanceId,
        card: spell.card,
        fromZone: 'hand',
        actorPlayerId: 'player-1',
      },
    ])

    const next = useGameStore.getState()
    expect(
      next.cards.find((card) => card.instanceId === spell.instanceId)?.zone,
    ).toBe('hand')
    expect(next.stack).toHaveLength(0)
    expect(next.spellsCastThisTurnByPlayer?.['player-1'] ?? 0).toBe(0)
  })

  it('keeps a stale mana decision pending instead of partially casting', () => {
    const source: CardInstance = {
      instanceId: 'decision-source',
      card: {
        scryfallId: 'decision-source',
        name: 'Decision Source',
        cmc: 0,
        typeLine: 'Land',
        colors: [],
        colorIdentity: [],
      },
      zone: 'battlefield',
      tapped: true,
      counters: {},
      controller: 'YOU',
      controllerId: 'player-1',
      ownerId: 'player-1',
    }
    const spell: CardInstance = {
      instanceId: 'decision-spell',
      card: spellCard,
      zone: 'hand',
      tapped: false,
      counters: {},
      controller: 'YOU',
      controllerId: 'player-1',
      ownerId: 'player-1',
    }
    const base = createInitialGameState([source, spell])
    const decision = {
      id: 'stale-mana-plan',
      sourceAbilityId: 'mana-planner',
      sourceInstanceId: spell.instanceId,
      type: 'MANA_SOURCE_SELECTION' as const,
      prompt: 'Choose mana',
      options: [{ instanceId: 'plan-a', label: 'Plan A' }],
      continuation: {
        effectsToExecute: [],
        resumeEffectIndex: 0,
        manaSourcePayment: {
          castAction: {
            type: 'CAST_SPELL' as const,
            instanceId: spell.instanceId,
            card: spell.card,
            fromZone: 'hand' as const,
            actorPlayerId: 'player-1',
          },
          options: [
            {
              id: 'plan-a',
              actions: [
                { type: 'TAP_CARD' as const, instanceId: source.instanceId },
                {
                  type: 'ADD_MANA' as const,
                  color: 'U' as const,
                  amount: 1,
                  actorPlayerId: 'player-1',
                },
                {
                  type: 'SPEND_MANA' as const,
                  color: 'U' as const,
                  amount: 1,
                  actorPlayerId: 'player-1',
                },
              ],
            },
          ],
        },
      },
    }
    useGameStore.getState().replaceGame({
      ...base,
      pendingDecisions: [decision],
    })

    useGameStore.getState().resolvePendingDecision(decision.id, 'plan-a')

    const next = useGameStore.getState()
    expect(next.pendingDecisions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: decision.id })]),
    )
    expect(
      next.cards.find((card) => card.instanceId === spell.instanceId)?.zone,
    ).toBe('hand')
    expect(next.stack).toHaveLength(0)
  })

  it('puts a dies trigger caused by an activation cost above the activated ability', () => {
    const animals: CardInstance = {
      instanceId: 'curious-farm-animals',
      card: {
        scryfallId: 'curious-farm-animals',
        name: 'Curious Farm Animals',
        cmc: 3,
        typeLine: 'Creature — Ox Bird',
        colors: ['G'],
        colorIdentity: ['G'],
        power: '2',
        toughness: '2',
      },
      zone: 'battlefield',
      tapped: false,
      counters: {},
      controller: 'YOU',
      controllerId: 'player-1',
      ownerId: 'player-1',
      controlledSinceTurn: 0,
    }
    const base = createInitialGameState([animals])
    const withMana = {
      ...base,
      turnState: {
        ...base.turnState,
        step: 'MAIN_1' as const,
        priority: 'WINDOW_OPEN' as const,
      },
      manaPool: { ...base.manaPool, C: 2 },
      players: base.players.map((player) =>
        player.id === 'player-1'
          ? { ...player, manaPool: { ...player.manaPool, C: 2 } }
          : player,
      ),
    }
    useGameStore.getState().replaceGame(withMana)

    useGameStore.getState().dispatch({
      type: 'ACTIVATE_ABILITY',
      instanceId: animals.instanceId,
      abilityId: 'curious-farm-animals-sacrifice-destroy',
      actorPlayerId: 'player-1',
    })
    const modeDecision = useGameStore
      .getState()
      .pendingDecisions.find(
        (decision) => decision.type === 'ACTIVATION_MODE_SELECTION',
      )
    expect(modeDecision).toBeDefined()
    useGameStore.getState().resolvePendingDecision(modeDecision!.id, 'none')

    const next = useGameStore.getState()
    expect(
      next.cards.find((card) => card.instanceId === animals.instanceId)?.zone,
    ).toBe('graveyard')
    expect(next.stack.map((object) => object.kind)).toEqual([
      'ACTIVATED_ABILITY',
      'TRIGGERED_ABILITY',
    ])
    expect(next.stack[0]?.pendingAbilityId).toContain(
      'curious-farm-animals-sacrifice-destroy',
    )
    expect(next.stack[1]?.pendingAbilityId).toContain(
      'curious-farm-animals-dies-gain-life',
    )
  })
})
