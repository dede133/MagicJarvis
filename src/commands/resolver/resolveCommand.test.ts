import { describe, expect, it } from 'vitest'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import { resolveCardQuery } from './cardResolver'
import { resolveCommand } from './resolveCommand'
import { parseCommand } from '../parser/parseCommand'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { DeckDefinition } from '../../types/deck'
import type { GameState } from '../../types/game'

const definition = (
  name: string,
  id = name.toLocaleLowerCase().replaceAll(' ', '-'),
): CardDefinition => ({
  scryfallId: id,
  name,
  cmc: 0,
  typeLine: name === 'Island' ? 'Basic Land — Island' : 'Artifact',
  colors: [],
  colorIdentity: [],
})
const namor = {
  ...definition('Namor the Sub-Mariner', 'namor'),
  typeLine: 'Legendary Creature — Human Mutant',
}
const island = definition('Island', 'island')
const solRing = definition('Sol Ring', 'sol-ring')
const remora = definition('Mystic Remora', 'mystic-remora')
const counterspell = definition('Counterspell', 'counterspell')
const senu = {
  ...definition('Senu, Keen-Eyed Protector', 'senu'),
  typeLine: 'Legendary Creature — Bird Scout',
  colors: ['W' as const],
  colorIdentity: ['W' as const],
}
const hydroblast = {
  ...definition('Hydroblast', 'hydroblast'),
  typeLine: 'Instant',
  colors: ['U' as const],
}
const deck: DeckDefinition = {
  name: 'Commands test',
  commander: { quantity: 1, name: namor.name, card: namor },
  mainboard: [
    { quantity: 30, name: island.name, card: island },
    { quantity: 1, name: solRing.name, card: solRing },
    { quantity: 1, name: remora.name, card: remora },
    { quantity: 1, name: counterspell.name, card: counterspell },
    { quantity: 1, name: hydroblast.name, card: hydroblast },
    { quantity: 1, name: senu.name, card: senu },
  ],
}

const instance = (
  instanceId: string,
  card: CardDefinition,
  tapped = false,
): CardInstance => ({
  instanceId,
  card,
  zone: 'battlefield',
  tapped,
  counters: {},
})
const game = (cards: CardInstance[] = [], handCount = 3): GameState => ({
  ...createInitialGameState(cards),
  turnState: {
    phase: 'PRECOMBAT_MAIN',
    step: 'MAIN_1',
    priority: 'WINDOW_OPEN',
  },
  deckDefinition: deck,
  libraryCount: 90,
  handCount,
})

describe('resolveCommand', () => {
  it('resolves the commander alias and fuzzy card names conservatively', () => {
    expect(resolveCardQuery(deck, 'el comandante')).toEqual({
      status: 'resolved',
      name: namor.name,
    })
    expect(resolveCardQuery(deck, 'mistic remora')).toEqual({
      status: 'resolved',
      name: remora.name,
    })
  })

  it('binds self-directed commands to the active player', () => {
    const state = game()
    const localPlayerId = state.localPlayerId ?? 'player-1'
    const opponent = state.players.find((player) => player.id !== localPlayerId)
    expect(opponent).toBeDefined()
    if (!opponent) throw new Error('Expected opponent')
    state.activePlayerId = opponent.id
    state.activePlayer = 'opponent'

    expect(resolveCommand(state, { type: 'DRAW', amount: 1 })).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'DRAW_CARD',
          playerId: localPlayerId,
          actorPlayerId: localPlayerId,
        },
      ],
    })
    expect(
      resolveCommand(state, { type: 'GAIN_LIFE', amount: 2 }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'GAIN_LIFE', actorPlayerId: localPlayerId }],
    })
    expect(resolveCommand(state, { type: 'UNTAP_ALL' })).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'UNTAP_ALL', actorPlayerId: localPlayerId }],
    })
  })

  it('honors an explicit semantic actor without changing legacy local defaults', () => {
    const state = game()
    state.localPlayerId = 'player-1'
    state.activePlayerId = 'player-2'
    state.turnOrder = ['player-1', 'player-2']

    expect(
      resolveCommand(state, {
        type: 'DRAW',
        amount: 1,
        actorPlayerId: 'player-2',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        { type: 'DRAW_CARD', playerId: 'player-2', actorPlayerId: 'player-2' },
      ],
    })
    expect(
      resolveCommand(state, {
        type: 'GAIN_LIFE',
        amount: 2,
        actorPlayerId: 'player-2',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'GAIN_LIFE', actorPlayerId: 'player-2' }],
    })
    expect(
      resolveCommand(state, { type: 'UNTAP_ALL', actorPlayerId: 'player-2' }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'UNTAP_ALL', actorPlayerId: 'player-2' }],
    })
  })

  it('does not interpret a raw spoken tap as free state mutation', () => {
    const tap = resolveCommand(game([instance('namor-1', namor)]), {
      type: 'TAP_CARD',
      cardQuery: 'namor',
    })
    expect(tap).toMatchObject({
      status: 'error',
      error: { code: 'INVALID_TIMING' },
    })
    const untap = resolveCommand(game([instance('namor-1', namor, true)]), {
      type: 'UNTAP_CARD',
      cardQuery: 'namor',
    })
    expect(untap).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'UNTAP_CARD', instanceId: 'namor-1' }],
    })
  })

  it('never counts opponent permanents as targets for your tap commands', () => {
    const state = game([
      { ...instance('opponent-island', island), controllerId: 'player-2' },
      { ...instance('local-island-1', island), controllerId: 'player-1' },
      { ...instance('local-island-2', island), controllerId: 'player-1' },
    ])
    state.localPlayerId = 'player-1'

    expect(
      resolveCommand(state, {
        type: 'TAP_CARD',
        cardQuery: 'Island',
        count: 2,
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        { type: 'TAP_CARD', instanceId: 'local-island-1' },
        { type: 'TAP_CARD', instanceId: 'local-island-2' },
      ],
    })
  })

  it('interprets giro Senu as activating its tap-cost ability', () => {
    const source = {
      ...instance('senu-1', senu),
      controlledSinceTurn: 1,
      controllerId: 'player-1',
      controller: 'YOU' as const,
    }
    const state = { ...game([source]), turn: 2 }
    expect(
      resolveCommand(state, { type: 'TAP_CARD', cardQuery: 'senu' }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'ACTIVATE_ABILITY',
          instanceId: 'senu-1',
          abilityId: 'senu-exile-gain-life-scry',
        },
      ],
    })
  })

  it('reports summoning sickness instead of silently tapping Senu', () => {
    const source = {
      ...instance('senu-1', senu),
      controlledSinceTurn: 2,
      controllerId: 'player-1',
      controller: 'YOU' as const,
    }
    const state = { ...game([source]), turn: 2 }
    expect(
      resolveCommand(state, { type: 'TAP_CARD', cardQuery: 'senu' }),
    ).toMatchObject({
      status: 'error',
      error: { code: 'SUMMONING_SICKNESS' },
    })
  })

  it('interprets giro Sol Ring as its mana ability instead of a raw tap', () => {
    expect(
      resolveCommand(game([instance('ring-1', solRing)]), {
        type: 'TAP_CARD',
        cardQuery: 'sol ring',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'ACTIVATE_ABILITY',
          instanceId: 'ring-1',
          abilityId: 'tritones-sol-ring-mana',
        },
      ],
    })
  })

  it('resolves visual Island indexes and counted untapped Islands', () => {
    const islands = [1, 2, 3, 4].map((index) =>
      instance(`island-${index}`, island),
    )
    expect(
      resolveCommand(game(islands), {
        type: 'TAP_CARD',
        cardQuery: 'isla',
        indexes: [3],
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        { type: 'TAP_CARD', instanceId: 'island-3' },
        { type: 'ADD_MANA', color: 'U', amount: 1 },
      ],
    })
    expect(
      resolveCommand(game(islands), {
        type: 'TAP_CARD',
        cardQuery: 'islas',
        indexes: [2, 4],
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ instanceId: 'island-2' }, { instanceId: 'island-4' }],
    })
    expect(
      resolveCommand(game(islands), {
        type: 'TAP_CARD',
        cardQuery: 'islas',
        count: 3,
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        { instanceId: 'island-1' },
        { instanceId: 'island-2' },
        { instanceId: 'island-3' },
      ],
    })
  })

  it('materializes declared cards from an unknown hand', () => {
    expect(
      resolveCommand(game(), { type: 'PLAY_CARD', cardQuery: 'isla' }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'PLAY_LAND',
          card: { name: 'Island' },
          fromZone: 'hand',
        },
      ],
    })
    expect(
      resolveCommand(game(), { type: 'PLAY_CARD', cardQuery: 'sol ring' }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'CAST_SPELL', card: { name: 'Sol Ring' } }],
    })
  })

  it('asks for a spell target before paying or casting Counterspell', () => {
    const targetCard = {
      ...instance('brainstorm-stack', definition('Brainstorm'), false),
      zone: 'stack' as const,
      stackObjectId: 'stack-brainstorm',
      controller: 'OPPONENT' as const,
      controllerId: 'player-2',
    }
    const state = {
      ...game([targetCard]),
      stack: [
        {
          stackObjectId: 'stack-brainstorm',
          kind: 'SPELL' as const,
          controller: 'OPPONENT' as const,
          controllerId: 'player-2',
          sourceInstanceId: targetCard.instanceId,
          spellInstanceId: targetCard.instanceId,
          targets: [],
          order: 1,
        },
      ],
    }
    expect(
      resolveCommand(state, {
        type: 'CAST_SPELL',
        cardQuery: 'counterspell',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'ADD_PENDING_DECISION',
          decision: {
            type: 'CAST_TARGET_SELECTION',
            options: [{ instanceId: 'stack-brainstorm' }],
          },
        },
      ],
    })
  })

  it('chooses a modal spell mode before targets or payment', () => {
    expect(
      resolveCommand(game(), {
        type: 'CAST_SPELL',
        cardQuery: 'hydroblast',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'ADD_PENDING_DECISION',
          decision: {
            type: 'CAST_MODE_SELECTION',
            options: [{ instanceId: 'counter' }, { instanceId: 'destroy' }],
          },
        },
      ],
    })
  })

  it('regression: resolves natural bajar isla through parser and deck resolver', () => {
    const parsed = parseCommand('bajar isla')
    if (parsed.status !== 'parsed')
      throw new Error('Expected PLAY_CARD intent.')
    expect(resolveCommand(game(), parsed.command)).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'PLAY_LAND',
          card: { name: 'Island' },
          fromZone: 'hand',
        },
      ],
    })
  })

  it('resolves life, draw, mana, next turn and undo', () => {
    const state = {
      ...game(),
      manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 },
    }
    expect(
      resolveCommand(state, { type: 'LOSE_LIFE', amount: 4 }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'LOSE_LIFE', amount: 4 }],
    })
    expect(
      resolveCommand(state, { type: 'GAIN_LIFE', amount: 2 }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'GAIN_LIFE', amount: 2 }],
    })
    expect(
      resolveCommand(state, { type: 'SET_LIFE', amount: 27 }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'SET_LIFE', amount: 27 }],
    })
    expect(resolveCommand(state, { type: 'DRAW', amount: 3 })).toMatchObject({
      status: 'resolved',
      actions: [
        { type: 'DRAW_CARD' },
        { type: 'DRAW_CARD' },
        { type: 'DRAW_CARD' },
      ],
    })
    expect(
      resolveCommand(state, {
        type: 'ADD_MANA',
        colorQuery: 'azul',
        amount: 2,
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'ADD_MANA', color: 'U', amount: 2 }],
    })
    expect(
      resolveCommand(state, {
        type: 'SPEND_MANA',
        colorQuery: 'blue',
        amount: 1,
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'SPEND_MANA', color: 'U', amount: 1 }],
    })
    expect(resolveCommand(state, { type: 'NEXT_TURN' })).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'NEXT_TURN' }],
    })
    expect(resolveCommand(state, { type: 'UNDO' })).toMatchObject({
      status: 'undo',
    })
  })

  it('does not resolve an unknown or ambiguous target, and tap still creates no mana', () => {
    const state = game([
      instance('island-1', island),
      instance('island-2', island),
    ])
    const unknown = resolveCommand(state, {
      type: 'TAP_CARD',
      cardQuery: 'triton',
    })
    const ambiguous = resolveCommand(state, {
      type: 'TAP_CARD',
      cardQuery: 'isla',
    })
    expect(unknown).toMatchObject({
      status: 'error',
      error: { code: 'CARD_NOT_FOUND' },
    })
    expect(ambiguous).toMatchObject({
      status: 'error',
      error: { code: 'AMBIGUOUS_CARD' },
    })
    expect(state.cards.map((card) => card.tapped)).toEqual([false, false])
    const tapped = applyGameAction(state, {
      type: 'TAP_CARD',
      instanceId: 'island-1',
    })
    expect(tapped.manaPool).toEqual(state.manaPool)
  })

  it('honors an exact semantic instance when identical activated sources exist', () => {
    const state = game([
      instance('ring-1', solRing),
      instance('ring-2', solRing),
    ])

    expect(
      resolveCommand(state, {
        type: 'ACTIVATE_MANA',
        cardQuery: 'Sol Ring',
      }),
    ).toMatchObject({ status: 'error', error: { code: 'AMBIGUOUS_CARD' } })

    expect(
      resolveCommand(state, {
        type: 'ACTIVATE_MANA',
        cardQuery: 'Sol Ring',
        instanceId: 'ring-2',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'ACTIVATE_ABILITY',
          instanceId: 'ring-2',
        },
      ],
    })
  })

  it('uses the spoken mechanic to disambiguate an already-programmed activated ability', () => {
    const eiganjoCastle = {
      ...definition('Eiganjo Castle', 'eiganjo-castle'),
      typeLine: 'Legendary Land',
    }
    const eiganjoSeat = {
      ...definition('Eiganjo, Seat of the Empire', 'eiganjo-seat'),
      typeLine: 'Legendary Land',
    }
    const channelSource = {
      ...instance('eiganjo-seat-1', eiganjoSeat),
      zone: 'hand' as const,
    }
    const state: GameState = {
      ...createInitialGameState([channelSource]),
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
      deckDefinition: {
        name: 'Channel ambiguity test',
        commander: deck.commander,
        mainboard: [
          { quantity: 1, name: eiganjoCastle.name, card: eiganjoCastle },
          { quantity: 1, name: eiganjoSeat.name, card: eiganjoSeat },
        ],
      },
    }

    expect(
      resolveCommand(state, {
        type: 'ACTIVATE_ABILITY',
        cardQuery: 'eiganjo',
        abilityHint: 'CHANNEL',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'ACTIVATE_ABILITY',
          instanceId: 'eiganjo-seat-1',
          abilityId: 'eiganjo-seat-channel',
        },
      ],
    })
  })

  it('returns typed errors for impossible actions', () => {
    expect(
      resolveCommand(game([], 0), { type: 'PLAY_CARD', cardQuery: 'isla' }),
    ).toMatchObject({ status: 'resolved' })
    expect(
      resolveCommand(game(), {
        type: 'SPEND_MANA',
        colorQuery: 'azul',
        amount: 1,
      }),
    ).toMatchObject({ status: 'error', error: { code: 'NOT_ENOUGH_MANA' } })
    expect(
      resolveCommand(game([instance('island-1', island, true)]), {
        type: 'TAP_CARD',
        cardQuery: 'isla',
      }),
    ).toMatchObject({ status: 'error', error: { code: 'ALREADY_TAPPED' } })
  })

  it('resolves an explicit named stack target without guessing among spells', () => {
    const targetCard = {
      ...instance('brainstorm-stack', definition('Brainstorm'), false),
      zone: 'stack' as const,
      stackObjectId: 'stack-brainstorm',
      controller: 'OPPONENT' as const,
      controllerId: 'player-2',
    }
    const state = {
      ...game([targetCard]),
      stack: [
        {
          stackObjectId: 'stack-brainstorm',
          kind: 'SPELL' as const,
          controller: 'OPPONENT' as const,
          controllerId: 'player-2',
          sourceInstanceId: targetCard.instanceId,
          spellInstanceId: targetCard.instanceId,
          targets: [],
          order: 1,
        },
      ],
    }
    const result = resolveCommand(state, {
      type: 'CAST_SPELL',
      cardQuery: 'counterspell',
      targetQuery: 'brainstorm',
    })
    expect(result).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'CAST_SPELL',
          targetStackObjectId: 'stack-brainstorm',
          declaredTargets: [{ targetId: 'stack-brainstorm' }],
        },
      ],
    })
  })

  it('materializes an identified discarded card from a hidden hand', () => {
    expect(
      resolveCommand(game([], 1), {
        type: 'DISCARD_CARD',
        cardQuery: 'counterspell',
        amount: 1,
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        { type: 'MATERIALIZE_CARD', fromZone: 'hand', toZone: 'graveyard' },
      ],
    })
  })

  it('resolves global untap and local/opponent shuffle declarations', () => {
    expect(resolveCommand(game(), { type: 'UNTAP_ALL' })).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'UNTAP_ALL' }],
    })
    expect(
      resolveCommand(game(), {
        type: 'DECLARE_PLAYER_SHUFFLED',
        player: 'local',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'DECLARE_PLAYER_SHUFFLED', player: 'local' }],
    })
  })

  it('moves an explicitly known card to the declared zone', () => {
    expect(
      resolveCommand(game([instance('namor-1', namor)]), {
        type: 'MOVE_CARD',
        cardQuery: 'namor',
        destination: 'graveyard',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'MOVE_CARD',
          instanceId: 'namor-1',
          toZone: 'graveyard',
        },
      ],
    })
  })

  it('can move a known external public card without pretending it belongs to the deck', () => {
    const external = {
      ...instance('external-rift', definition('Cyclonic Rift', 'rift')),
      controller: 'OPPONENT' as const,
      controllerId: 'player-2',
    }
    expect(
      resolveCommand(game([external]), {
        type: 'MOVE_CARD',
        cardQuery: 'cyclonic rift',
        destination: 'graveyard',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'MOVE_CARD',
          instanceId: 'external-rift',
          toZone: 'graveyard',
        },
      ],
    })
  })

  it('does not allow arbitrary non-commanders to be sent to the command zone', () => {
    expect(
      resolveCommand(game([instance('sol-1', solRing)]), {
        type: 'MOVE_CARD',
        cardQuery: 'sol ring',
        destination: 'command',
      }),
    ).toMatchObject({
      status: 'error',
      error: { code: 'INVALID_TIMING' },
    })
  })

  it('resolves hidden-zone count synchronization from voice commands', () => {
    expect(
      resolveCommand(game(), { type: 'SET_HAND_COUNT', count: 7 }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'SET_HAND_COUNT', count: 7 }],
    })
    expect(
      resolveCommand(game(), { type: 'SET_LIBRARY_COUNT', count: 82 }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'SET_LIBRARY_COUNT', count: 82 }],
    })
  })

  it('resolves a named known external spell from the stack', () => {
    const external = {
      ...instance('external-rift', definition('Cyclonic Rift', 'rift'), false),
      zone: 'stack' as const,
      stackObjectId: 'stack-rift',
      controller: 'OPPONENT' as const,
      controllerId: 'player-2',
    }
    const state = {
      ...game([external]),
      stack: [
        {
          stackObjectId: 'stack-rift',
          kind: 'SPELL' as const,
          controller: 'OPPONENT' as const,
          controllerId: 'player-2',
          sourceInstanceId: external.instanceId,
          spellInstanceId: external.instanceId,
          targets: [],
          order: 1,
        },
      ],
    }
    expect(
      resolveCommand(state, {
        type: 'RESOLVE_SPELL',
        cardQuery: 'cyclonic rift',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'RESOLVE_SPELL', instanceId: 'external-rift' }],
    })
  })

  it('can tap a known external permanent exposed by the battlefield UI', () => {
    const external = {
      ...instance(
        'external-rock',
        definition('Arcane Signet', 'signet'),
        false,
      ),
      controller: 'OPPONENT' as const,
      controllerId: 'player-2',
    }
    expect(
      resolveCommand(game([external]), {
        type: 'TAP_CARD',
        cardQuery: 'arcane signet',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [{ type: 'TAP_CARD', instanceId: 'external-rock' }],
    })
  })
  it('declares a known external creature as an attacker', () => {
    const external = {
      ...instance(
        'external-attacker',
        {
          ...definition('Serra Angel', 'serra'),
          typeLine: 'Creature — Angel',
        },
        false,
      ),
      controller: 'OPPONENT' as const,
      controllerId: 'player-2',
    }
    expect(
      resolveCommand(game([external]), {
        type: 'DECLARE_EXTERNAL_ATTACKER',
        cardQuery: 'serra angel',
      }),
    ).toMatchObject({
      status: 'resolved',
      actions: [
        {
          type: 'DECLARE_EXTERNAL_ATTACKER',
          instanceId: 'external-attacker',
        },
      ],
    })
  })
})
