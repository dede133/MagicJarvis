import { describe, expect, it } from 'vitest'
import {
  createGameFromDeck,
  createGameFromMatch,
  createStartedGameFromDeck,
  createStartedGameFromMatch,
} from './createGameFromDeck'
import type { CardDefinition } from '../types/card'
import type { DeckDefinition } from '../types/deck'
import type { GameState } from '../types/game'
import { applyGameAction } from '../engine/gameEngine'
import { resolveCommand } from '../commands/resolver/resolveCommand'

const island: CardDefinition = {
  scryfallId: 'island-id',
  name: 'Island',
  cmc: 0,
  typeLine: 'Basic Land — Island',
  colors: [],
  colorIdentity: ['U'],
}
const namor: CardDefinition = {
  ...island,
  scryfallId: 'namor-id',
  name: 'Namor the Sub-Mariner',
  manaCost: '{1}{U}{U}',
  cmc: 3,
  typeLine: 'Legendary Creature — Mutant Merfolk Villain',
  colors: ['U'],
  colorIdentity: ['U'],
}
const deck: DeckDefinition = {
  name: 'Test Namor',
  commander: { quantity: 1, name: namor.name, card: namor },
  mainboard: [
    { quantity: 34, name: island.name, card: island },
    {
      quantity: 65,
      name: 'Other card',
      card: { ...island, scryfallId: 'other-id', name: 'Other card' },
    },
  ],
  sideboard: [{ quantity: 1, name: 'Sideboard card' }],
  maybeboard: [{ quantity: 1, name: 'Maybeboard card' }],
}

describe('createGameFromDeck', () => {
  const game = createGameFromDeck(deck)

  it('materializes 34 Islands as different physical instances when they become known', () => {
    const revealed = Array.from({ length: 34 }).reduce<GameState>(
      (state, _, index) =>
        applyGameAction(state, {
          type: 'MATERIALIZE_CARD',
          instanceId: `island-${index + 1}`,
          card: island,
          fromZone: 'library',
          toZone: 'library',
        }),
      game,
    )
    const islands = revealed.cards.filter((card) => card.card.name === 'Island')
    expect(islands).toHaveLength(34)
    expect(new Set(islands.map((card) => card.instanceId)).size).toBe(34)
  })

  it('starts the commander in command with a 99-card hidden mainboard', () => {
    expect(game.cards.find((card) => card.card.name === namor.name)?.zone).toBe(
      'command',
    )
    expect(game.libraryCount).toBe(99)
    expect(game.handCount).toBe(0)
    expect(game.cards).toHaveLength(1)
    expect(game.cards.some((card) => card.card.name === 'Sideboard card')).toBe(
      false,
    )
    expect(
      game.cards.some((card) => card.card.name === 'Maybeboard card'),
    ).toBe(false)
    expect(
      game.cards.filter((card) => card.zone === 'battlefield'),
    ).toHaveLength(0)
    expect(game.cards.filter((card) => card.zone === 'graveyard')).toHaveLength(
      0,
    )
    expect(game.cards.filter((card) => card.zone === 'exile')).toHaveLength(0)
    expect(game.life).toBe(40)
    expect(game.turn).toBe(1)
    expect(game.manaPool).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 })
  })

  it('keeps the commander in command until its mana cost is paid and the spell resolves', () => {
    const started = createStartedGameFromDeck(deck)
    const commanderId = started.commanderId

    const withoutMana = resolveCommand(started, {
      type: 'CAST_SPELL',
      cardQuery: namor.name,
    })
    expect(withoutMana).toMatchObject({
      status: 'error',
      error: { code: 'NOT_ENOUGH_MANA' },
    })
    expect(
      started.cards.find((card) => card.instanceId === commanderId)?.zone,
    ).toBe('command')

    let payable = applyGameAction(started, {
      type: 'ADD_MANA',
      color: 'U',
      amount: 2,
    })
    payable = applyGameAction(payable, {
      type: 'ADD_MANA',
      color: 'C',
      amount: 1,
    })
    const cast = resolveCommand(payable, {
      type: 'CAST_SPELL',
      cardQuery: namor.name,
    })
    expect(cast.status).toBe('resolved')
    if (cast.status !== 'resolved') return

    const onStack = cast.actions.reduce(
      (state, action) => applyGameAction(state, action),
      payable,
    )
    expect(
      onStack.cards.find((card) => card.instanceId === commanderId)?.zone,
    ).toBe('stack')
    expect(onStack.commanderCastsFromCommandZone[commanderId as string]).toBe(1)

    const deployed = applyGameAction(onStack, {
      type: 'RESOLVE_SPELL',
      instanceId: commanderId as string,
    })
    expect(
      deployed.cards.find((card) => card.instanceId === commanderId)?.zone,
    ).toBe('battlefield')
    expect(deployed.commanderCastsFromCommandZone[commanderId as string]).toBe(
      1,
    )
    expect(
      deployed.players.find((player) => player.id === deployed.localPlayerId)
        ?.commanderCastsFromCommandZone?.[commanderId as string],
    ).toBe(1)

    let returned = applyGameAction(deployed, {
      type: 'MOVE_CARD',
      instanceId: commanderId as string,
      toZone: 'command',
    })
    returned = applyGameAction(returned, {
      type: 'ADD_MANA',
      color: 'U',
      amount: 2,
    })
    returned = applyGameAction(returned, {
      type: 'ADD_MANA',
      color: 'C',
      amount: 3,
    })
    const secondCast = resolveCommand(returned, {
      type: 'CAST_SPELL',
      cardQuery: namor.name,
    })
    expect(secondCast.status).toBe('resolved')
    if (secondCast.status !== 'resolved') return
    expect(secondCast.actions).toEqual(
      expect.arrayContaining([
        { type: 'SPEND_MANA', color: 'C', amount: 3 },
        { type: 'SPEND_MANA', color: 'U', amount: 2 },
      ]),
    )
    const secondOnStack = secondCast.actions.reduce(
      (state, action) => applyGameAction(state, action),
      returned,
    )
    expect(
      secondOnStack.commanderCastsFromCommandZone[commanderId as string],
    ).toBe(2)
  })

  it('starts the UI flow ready for the first main phase', () => {
    const started = createStartedGameFromDeck(deck)

    expect(started.turnState).toMatchObject({
      phase: 'PRECOMBAT_MAIN',
      step: 'MAIN_1',
      priority: 'WINDOW_OPEN',
    })
    expect(started.landPlaysUsedThisTurn).toBe(0)
    expect(
      started.cards.find((card) => card.card.name === namor.name)?.zone,
    ).toBe('command')
  })

  it('starts partner commanders together and tracks their command casts independently', () => {
    const ishai: CardDefinition = {
      ...namor,
      scryfallId: 'ishai-id',
      name: 'Ishai, Ojutai Dragonspeaker',
      manaCost: '{2}{W}{U}',
      cmc: 4,
      colors: ['W', 'U'],
      colorIdentity: ['W', 'U'],
      oracleText: 'Flying\nWhenever an opponent casts a spell, put a +1/+1 counter on Ishai, Ojutai Dragonspeaker.\nPartner',
    }
    const yoshimaru: CardDefinition = {
      ...namor,
      scryfallId: 'yoshimaru-id',
      name: 'Yoshimaru, Ever Faithful',
      manaCost: '{W}',
      cmc: 1,
      colors: ['W'],
      colorIdentity: ['W'],
      oracleText: 'Partner',
    }
    const partnerDeck: DeckDefinition = {
      name: 'Partner test',
      commanders: [
        { quantity: 1, name: ishai.name, card: ishai },
        { quantity: 1, name: yoshimaru.name, card: yoshimaru },
      ],
      commander: { quantity: 1, name: ishai.name, card: ishai },
      mainboard: [{ quantity: 98, name: island.name, card: island }],
    }
    let partner = createStartedGameFromDeck(partnerDeck)
    expect(partner.commanderIds).toHaveLength(2)
    expect(partner.commanderId).toBe(partner.commanderIds?.[0])
    expect(
      partner.cards.filter((card) => partner.commanderIds?.includes(card.instanceId)),
    ).toHaveLength(2)
    expect(
      partner.cards.filter((card) => partner.commanderIds?.includes(card.instanceId)).every((card) => card.zone === 'command'),
    ).toBe(true)
    expect(partner.libraryCount).toBe(98)

    const [ishaiId, yoshimaruId] = partner.commanderIds ?? []
    partner = applyGameAction(partner, {
      type: 'CAST_SPELL',
      instanceId: yoshimaruId,
      card: yoshimaru,
      fromZone: 'command',
    })
    expect(partner.commanderCastsFromCommandZone[yoshimaruId]).toBe(1)
    expect(partner.commanderCastsFromCommandZone[ishaiId] ?? 0).toBe(0)

    partner = applyGameAction(partner, {
      type: 'MOVE_CARD',
      instanceId: yoshimaruId,
      toZone: 'command',
    })
    partner = applyGameAction(partner, {
      type: 'CAST_SPELL',
      instanceId: ishaiId,
      card: ishai,
      fromZone: 'command',
    })
    expect(partner.commanderCastsFromCommandZone[ishaiId]).toBe(1)
    expect(partner.commanderCastsFromCommandZone[yoshimaruId]).toBe(1)
  })


  it('creates a real two-player match with both deck recipes and commander zones', () => {
    const cuteCommander: CardDefinition = {
      ...namor,
      scryfallId: 'cute-commander-id',
      name: 'Ishai, Ojutai Dragonspeaker',
      manaCost: '{2}{W}{U}',
      cmc: 4,
      colors: ['W', 'U'],
      colorIdentity: ['W', 'U'],
    }
    const cuteDeck: DeckDefinition = {
      name: 'Cute',
      commander: { quantity: 1, name: cuteCommander.name, card: cuteCommander },
      mainboard: [{ quantity: 99, name: island.name, card: island }],
    }
    const match = createGameFromMatch({
      player1Deck: deck,
      player2Deck: cuteDeck,
      startingPlayerId: 'player-2',
    })

    expect(match.turnOrder).toEqual(['player-1', 'player-2'])
    expect(match.activePlayerId).toBe('player-2')
    expect(match.deckDefinitionsByPlayer?.['player-1']?.name).toBe('Test Namor')
    expect(match.deckDefinitionsByPlayer?.['player-2']?.name).toBe('Cute')
    expect(match.commanderIdsByPlayer?.['player-1']).toHaveLength(1)
    expect(match.commanderIdsByPlayer?.['player-2']).toHaveLength(1)
    expect(
      match.cards.find((card) => card.card.name === cuteCommander.name),
    ).toMatchObject({ zone: 'command', ownerId: 'player-2', controllerId: 'player-2' })
    expect(match.players.find((player) => player.id === 'player-2')?.libraryCount).toBe(99)
  })

  it('starts the selected first player at main one', () => {
    const started = createStartedGameFromMatch({
      player1Deck: deck,
      player2Deck: deck,
      startingPlayerId: 'player-2',
    })
    expect(started.activePlayerId).toBe('player-2')
    expect(started.turnState).toMatchObject({ step: 'MAIN_1', priority: 'WINDOW_OPEN' })
  })

})
