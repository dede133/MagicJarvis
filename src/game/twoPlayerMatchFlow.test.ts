import { describe, expect, it } from 'vitest'
import { resolveCommand } from '../commands/resolver/resolveCommand'
import { applyGameAction } from '../engine/gameEngine'
import { createStartedGameFromMatch } from './createGameFromDeck'
import { checkStateBasedActions } from '../rules/stateBasedActions'
import type { CardDefinition, CardInstance } from '../types/card'
import type { DeckDefinition } from '../types/deck'

const card = (
  name: string,
  typeLine = 'Basic Land — Island',
): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})

const deck = (name: string, cards: CardDefinition[]): DeckDefinition => ({
  name,
  commander: {
    quantity: 1,
    name: `${name} Commander`,
    card: card(`${name} Commander`, 'Legendary Creature'),
  },
  mainboard: cards.map((entry) => ({
    quantity: 1,
    name: entry.name,
    card: entry,
  })),
})

describe('two-player active deck flow', () => {
  it('resolves a land against the active player deck and owns it by that player', () => {
    const p1Island = card('Plains', 'Basic Land — Plains')
    const p2Island = card('Island')
    const state = createStartedGameFromMatch({
      player1Deck: deck('P1', [p1Island]),
      player2Deck: deck('P2', [p2Island]),
      startingPlayerId: 'player-2',
    })
    const result = resolveCommand(state, {
      type: 'PLAY_CARD',
      cardQuery: 'isla',
    })
    expect(result).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'PLAY_LAND', actorPlayerId: 'player-2' }],
    })
    if (result.status !== 'resolved') return
    const next = result.actions.reduce(
      (current, action) => applyGameAction(current, action),
      state,
    )
    const island = next.cards.find((entry) => entry.card.name === 'Island')
    expect(island).toMatchObject({
      ownerId: 'player-2',
      controllerId: 'player-2',
    })
    expect(
      next.players.find((player) => player.id === 'player-2')
        ?.landPlaysUsedThisTurn,
    ).toBe(1)
    expect(
      next.players.find((player) => player.id === 'player-1')
        ?.landPlaysUsedThisTurn,
    ).toBe(0)
    expect(
      resolveCommand(state, { type: 'PLAY_CARD', cardQuery: 'llanura' }),
    ).toMatchObject({
      status: 'error',
      error: { code: 'CARD_NOT_FOUND' },
    })
  })

  it('draws for the active player and changes the implicit deck after next turn', () => {
    const p1Card = card('Plains', 'Basic Land — Plains')
    const p2Card = card('Island')
    const state = createStartedGameFromMatch({
      player1Deck: deck('P1', [p1Card]),
      player2Deck: deck('P2', [p2Card]),
      startingPlayerId: 'player-2',
    })
    const draw = resolveCommand(state, { type: 'DRAW', amount: 1 })
    expect(draw).toMatchObject({
      actions: [
        { type: 'DRAW_CARD', playerId: 'player-2', actorPlayerId: 'player-2' },
      ],
    })
    const afterDraw =
      draw.status === 'resolved'
        ? draw.actions.reduce(
            (current, action) => applyGameAction(current, action),
            state,
          )
        : state
    let nextTurn = applyGameAction(afterDraw, { type: 'NEXT_TURN' })
    nextTurn = applyGameAction(nextTurn, { type: 'ADVANCE_STEP' })
    nextTurn = applyGameAction(nextTurn, { type: 'ADVANCE_STEP' })
    nextTurn = applyGameAction(nextTurn, { type: 'ADVANCE_STEP' })
    expect(nextTurn.activePlayerId).toBe('player-1')
    const p1Land = resolveCommand(nextTurn, {
      type: 'PLAY_CARD',
      cardQuery: 'plains',
    })
    expect(p1Land).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'PLAY_LAND', actorPlayerId: 'player-1' }],
    })
  })

  it('applies implicit player commands to the active player, not the local player', () => {
    const p1Card = card('Plains', 'Basic Land — Plains')
    const p2Card = card('Island')
    let state = createStartedGameFromMatch({
      player1Deck: deck('P1', [p1Card]),
      player2Deck: deck('P2', [p2Card]),
      startingPlayerId: 'player-2',
    })
    state = applyGameAction(state, {
      type: 'ADD_PLAYER_MANA',
      playerId: 'player-2',
      color: 'U',
      amount: 2,
    })

    const gainLife = resolveCommand(state, { type: 'GAIN_LIFE', amount: 2 })
    expect(gainLife).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'GAIN_LIFE', actorPlayerId: 'player-2' }],
    })
    if (gainLife.status === 'resolved')
      state = gainLife.actions.reduce(
        (current, action) => applyGameAction(current, action),
        state,
      )
    expect(state.players.find((player) => player.id === 'player-2')?.life).toBe(
      42,
    )
    expect(state.players.find((player) => player.id === 'player-1')?.life).toBe(
      40,
    )

    const spendMana = resolveCommand(state, {
      type: 'SPEND_MANA',
      colorQuery: 'azul',
      amount: 1,
    })
    expect(spendMana).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'SPEND_MANA', actorPlayerId: 'player-2' }],
    })
    if (spendMana.status === 'resolved')
      state = spendMana.actions.reduce(
        (current, action) => applyGameAction(current, action),
        state,
      )
    expect(
      state.players.find((player) => player.id === 'player-2')?.manaPool.U,
    ).toBe(1)
    expect(
      state.players.find((player) => player.id === 'player-1')?.manaPool.U,
    ).toBe(0)

    const hand = resolveCommand(state, { type: 'SET_HAND_COUNT', count: 6 })
    if (hand.status === 'resolved')
      state = hand.actions.reduce(
        (current, action) => applyGameAction(current, action),
        state,
      )
    expect(
      state.players.find((player) => player.id === 'player-2')?.handCount,
    ).toBe(6)
    expect(state.handCount).toBe(0)

    const library = resolveCommand(state, {
      type: 'SET_LIBRARY_COUNT',
      count: 77,
    })
    if (library.status === 'resolved')
      state = library.actions.reduce(
        (current, action) => applyGameAction(current, action),
        state,
      )
    expect(
      state.players.find((player) => player.id === 'player-2')?.libraryCount,
    ).toBe(77)
    expect(state.libraryCount).toBe(0)
  })

  it('charges legacy mana spend actions to their explicit actor', () => {
    const p1Card = card('Plains', 'Basic Land — Plains')
    const p2Card = card('Island')
    let state = createStartedGameFromMatch({
      player1Deck: deck('P1', [p1Card]),
      player2Deck: deck('P2', [p2Card]),
      startingPlayerId: 'player-1',
    })
    state = applyGameAction(state, {
      type: 'ADD_PLAYER_MANA',
      playerId: 'player-2',
      color: 'U',
      amount: 1,
    })

    const next = applyGameAction(state, {
      type: 'SPEND_MANA',
      color: 'U',
      amount: 1,
      actorPlayerId: 'player-2',
    })

    expect(next).not.toBe(state)
    expect(
      next.players.find((player) => player.id === 'player-2')?.manaPool.U,
    ).toBe(0)
    expect(
      next.players.find((player) => player.id === 'player-1')?.manaPool.U,
    ).toBe(0)
  })

  it('treats concession as belonging to the active player', () => {
    const p1Card = card('Plains', 'Basic Land — Plains')
    const p2Card = card('Island')
    const state = createStartedGameFromMatch({
      player1Deck: deck('P1', [p1Card]),
      player2Deck: deck('P2', [p2Card]),
      startingPlayerId: 'player-2',
    })
    const concede = resolveCommand(state, { type: 'CONCEDE' })
    expect(concede).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'CONCEDE', actorPlayerId: 'player-2' }],
    })
    if (concede.status !== 'resolved') return
    const next = concede.actions.reduce(
      (current, action) => applyGameAction(current, action),
      state,
    )
    expect(next.gameStatus).toBe('WON')
    expect(next.gameLossReason).toBe('CONCEDED')
  })

  it('uses the active player and the recorded attacker for symmetric combat', () => {
    const p1Card = card('Plains', 'Basic Land — Plains')
    const p2Card = card('Island')
    const attacker = card('Sky Pet', 'Creature — Bird')
    const blocker = card('Wall', 'Creature — Wall')
    let state = createStartedGameFromMatch({
      player1Deck: deck('P1', [p1Card]),
      player2Deck: deck('P2', [p2Card]),
      startingPlayerId: 'player-2',
    })
    const instances: CardInstance[] = [
      {
        instanceId: 'p2-attacker',
        card: attacker,
        zone: 'battlefield',
        tapped: false,
        counters: {},
        ownerId: 'player-2',
        controllerId: 'player-2',
        controlledSinceTurn: 0,
      },
      {
        instanceId: 'p1-blocker',
        card: blocker,
        zone: 'battlefield',
        tapped: false,
        counters: {},
        ownerId: 'player-1',
        controllerId: 'player-1',
        controlledSinceTurn: 0,
      },
    ]
    state = { ...state, cards: [...state.cards, ...instances] }
    state = applyGameAction(state, {
      type: 'ADVANCE_STEP',
      actorPlayerId: 'player-2',
    })
    state = applyGameAction(state, {
      type: 'ADVANCE_STEP',
      actorPlayerId: 'player-2',
    })
    const attack = resolveCommand(state, {
      type: 'DECLARE_ATTACKERS',
      attackerQueries: ['sky pet'],
    })
    expect(attack).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'DECLARE_ATTACKERS', actorPlayerId: 'player-2' }],
    })
    if (attack.status !== 'resolved') return
    state = attack.actions.reduce(
      (current, action) => applyGameAction(current, action),
      state,
    )
    state = applyGameAction(state, { type: 'ADVANCE_STEP' })
    const blocks = resolveCommand(state, {
      type: 'DECLARE_BLOCKERS',
      attackerQuery: 'sky pet',
      blockerQueries: ['wall'],
    })
    expect(blocks).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'DECLARE_BLOCKERS' }],
    })
  })

  it('checks defeat for the opposing player independently', () => {
    const state = createStartedGameFromMatch({
      player1Deck: deck('P1', [card('Plains')]),
      player2Deck: deck('P2', [card('Island')]),
      startingPlayerId: 'player-1',
    })
    const defeated = {
      ...state,
      opponentLife: 0,
      players: state.players.map((player) =>
        player.id === 'player-2' ? { ...player, life: 0 } : player,
      ),
    }
    expect(checkStateBasedActions(defeated).actions).toEqual([
      { type: 'SET_GAME_STATUS', status: 'WON', reason: 'LIFE' },
    ])
  })

  it('starts the configured first player in main phase without a draw', () => {
    const state = createStartedGameFromMatch({
      player1Deck: deck('P1', [card('Plains')]),
      player2Deck: deck('P2', [card('Island')]),
      startingPlayerId: 'player-2',
    })
    expect(state.activePlayerId).toBe('player-2')
    expect(state.turnState.step).toBe('MAIN_1')
    expect(state.cardsDrawnThisTurnByPlayer?.['player-2']).toBe(0)
  })
})
