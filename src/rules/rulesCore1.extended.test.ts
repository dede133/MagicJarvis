import { beforeEach, describe, expect, it } from 'vitest'
import { applyGameAction, createInitialGameState } from '../engine/gameEngine'
import { deriveGameEvents } from '../events/deriveGameEvents'
import { useGameStore } from '../store/gameStore'
import type { CardDefinition, CardInstance } from '../types/card'
import type { DeckDefinition } from '../types/deck'
import type { GameState } from '../types/game'
import { parseCommand } from '../commands/parser/parseCommand'
import { resolveCommand } from '../commands/resolver/resolveCommand'
import { validateCastTiming, validateLandTiming } from './legality/timing'
import { checkStateBasedActions } from './stateBasedActions'

const definition = (
  name: string,
  typeLine: string,
  manaCost?: string,
  extras: Partial<CardDefinition> = {},
): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(' ', '-'),
  name,
  manaCost,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
  ...extras,
})

const card = (
  instanceId: string,
  definitionValue: CardDefinition,
  zone: CardInstance['zone'] = 'battlefield',
  extras: Partial<CardInstance> = {},
): CardInstance => ({
  instanceId,
  card: definitionValue,
  zone,
  tapped: false,
  counters: {},
  ...extras,
})

const island = definition('Island', 'Basic Land — Island')
const remora = definition('Mystic Remora', 'Enchantment', '{U}')
const brainstorm = definition('Brainstorm', 'Instant', '{U}')
const creature = definition('River Creature', 'Creature — Merfolk', '{1}{U}', {
  power: '1',
  toughness: '1',
})
const flashCreature = definition('Flash Creature', 'Creature', '{U}', {
  oracleText: 'Flash',
})
const commander = definition(
  'Namor the Sub-Mariner',
  'Legendary Creature — Merfolk',
  '{U}',
  {
    power: '1',
    toughness: '1',
  },
)
const coreDeck: DeckDefinition = {
  name: 'Rules Core test deck',
  commander: { quantity: 1, name: commander.name, card: commander },
  mainboard: [
    { quantity: 2, name: island.name, card: island },
    { quantity: 1, name: remora.name, card: remora },
    { quantity: 1, name: brainstorm.name, card: brainstorm },
    { quantity: 1, name: creature.name, card: creature },
    { quantity: 1, name: flashCreature.name, card: flashCreature },
  ],
}

const main = (state: GameState): GameState => ({
  ...state,
  turnState: {
    phase: 'PRECOMBAT_MAIN',
    step: 'MAIN_1',
    priority: 'WINDOW_OPEN',
  },
})

const emptyPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }

beforeEach(() => useGameStore.getState().replaceGame(createInitialGameState()))

describe('Rules Core 1 — turn engine and timing', () => {
  it.each([
    ['UNTAP', 'UPKEEP'],
    ['UPKEEP', 'DRAW'],
    ['DRAW', 'MAIN_1'],
    ['MAIN_1', 'BEGIN_COMBAT'],
    ['BEGIN_COMBAT', 'DECLARE_ATTACKERS'],
    ['DECLARE_ATTACKERS', 'DECLARE_BLOCKERS'],
    ['DECLARE_BLOCKERS', 'COMBAT_DAMAGE'],
    ['COMBAT_DAMAGE', 'END_COMBAT'],
    ['END_COMBAT', 'MAIN_2'],
    ['MAIN_2', 'END_STEP'],
    ['END_STEP', 'CLEANUP'],
  ] as const)('advances from %s to %s', (from, to) => {
    const state: GameState = {
      ...createInitialGameState([], coreDeck),
      turnState: {
        phase: from === 'MAIN_1' ? 'PRECOMBAT_MAIN' : 'BEGINNING',
        step: from,
        priority: from === 'UNTAP' ? 'NONE' : 'WINDOW_OPEN',
      },
    } as GameState
    expect(
      applyGameAction(state, { type: 'ADVANCE_STEP' }).turnState.step,
    ).toBe(to)
  })

  it('wraps cleanup into a new untap turn', () => {
    const state: GameState = {
      ...createInitialGameState([], coreDeck),
      turn: 3,
      landPlaysUsedThisTurn: 1,
      turnState: { phase: 'ENDING', step: 'CLEANUP', priority: 'NONE' },
    } as GameState
    expect(applyGameAction(state, { type: 'ADVANCE_STEP' })).toMatchObject({
      turn: 4,
      landPlaysUsedThisTurn: 0,
      turnState: { step: 'UNTAP', priority: 'NONE' },
    })
  })

  it.each(['UPKEEP', 'DRAW', 'MAIN_1', 'END_STEP'] as const)(
    'derives generic events once at %s',
    (step) => {
      const previous = {
        ...createInitialGameState([], coreDeck),
        turnState: { phase: 'BEGINNING', step: 'UNTAP', priority: 'NONE' },
      } as GameState
      const next = {
        ...previous,
        turnState: { ...previous.turnState, step },
      } as GameState
      const events = deriveGameEvents(previous, { type: 'ADVANCE_STEP' }, next)
      expect(
        events.filter((event) => event.type === 'STEP_STARTED'),
      ).toHaveLength(1)
    },
  )

  it('untaps local known permanents at START_TURN without opening priority', () => {
    const state = createInitialGameState([
      card('local', island, 'battlefield', { tapped: true }),
      card('opponent', island, 'battlefield', {
        tapped: true,
        controller: 'OPPONENT',
      }),
    ])
    const next = applyGameAction(state, { type: 'START_TURN' })
    expect(next.cards.map((item) => item.tapped)).toEqual([false, true])
    expect(next.turnState.priority).toBe('NONE')
  })

  it('draw step tracks an unknown card in COUNTS_ONLY mode', () => {
    const state: GameState = {
      ...createInitialGameState([], coreDeck),
      hiddenZoneTracking: 'COUNTS_ONLY' as const,
      libraryCount: 2,
      handCount: 1,
      turnState: {
        phase: 'BEGINNING',
        step: 'UPKEEP',
        priority: 'WINDOW_OPEN',
      },
    }
    const next = applyGameAction(state, { type: 'ADVANCE_STEP' })
    expect(next).toMatchObject({
      libraryCount: 1,
      handCount: 2,
      turnState: { step: 'DRAW' },
    })
    expect(next.cards).toHaveLength(0)
  })

  it('does not invent a draw identity in UNTRACKED mode', () => {
    const state: GameState = {
      ...createInitialGameState([], coreDeck),
      turnState: {
        phase: 'BEGINNING',
        step: 'UPKEEP',
        priority: 'WINDOW_OPEN',
      },
    }
    expect(applyGameAction(state, { type: 'ADVANCE_STEP' }).cards).toHaveLength(
      0,
    )
  })

  it('clears mana when a step changes', () => {
    const state = main({
      ...createInitialGameState([], coreDeck),
      manaPool: { ...emptyPool, U: 2 },
    })
    expect(applyGameAction(state, { type: 'ADVANCE_STEP' }).manaPool).toEqual(
      emptyPool,
    )
  })

  it('does not give priority during untap', () => {
    const state = createInitialGameState([], coreDeck)
    expect(validateCastTiming(state, brainstorm)).toMatchObject({
      legal: false,
      code: 'NO_PRIORITY',
    })
  })

  it('accepts a land during a main phase with an empty stack', () => {
    expect(
      validateLandTiming(main(createInitialGameState([], coreDeck))),
    ).toEqual({ legal: true })
  })

  it('rejects land timing outside a main phase', () => {
    expect(
      validateLandTiming(createInitialGameState([], coreDeck)),
    ).toMatchObject({ legal: false, code: 'NO_PRIORITY' })
  })

  it('rejects land timing with a non-empty stack', () => {
    const state = main({
      ...createInitialGameState([], coreDeck),
      stack: [
        {
          stackObjectId: 'spell',
          kind: 'SPELL',
          controller: 'YOU',
          sourceInstanceId: 'x',
          spellInstanceId: 'x',
          targets: [],
          order: 1,
        },
      ],
    })
    expect(validateLandTiming(state)).toMatchObject({
      legal: false,
      code: 'STACK_NOT_EMPTY',
    })
  })

  it('accepts instants with a non-empty stack', () => {
    const state = main({
      ...createInitialGameState([], coreDeck),
      stack: [
        {
          stackObjectId: 'spell',
          kind: 'SPELL',
          controller: 'YOU',
          sourceInstanceId: 'x',
          spellInstanceId: 'x',
          targets: [],
          order: 1,
        },
      ],
    })
    expect(validateCastTiming(state, brainstorm)).toEqual({ legal: true })
  })

  it('accepts Flash as instant timing', () => {
    const state = {
      ...createInitialGameState([], coreDeck),
      turnState: {
        phase: 'BEGINNING',
        step: 'UPKEEP',
        priority: 'WINDOW_OPEN',
      },
    } as GameState
    expect(validateCastTiming(state, flashCreature)).toEqual({ legal: true })
  })

  it.each([creature, remora] as const)(
    'requires sorcery timing for %s',
    (spell) => {
      const state = {
        ...createInitialGameState([], coreDeck),
        turnState: {
          phase: 'BEGINNING',
          step: 'UPKEEP',
          priority: 'WINDOW_OPEN',
        },
      } as GameState
      expect(validateCastTiming(state, spell)).toMatchObject({
        legal: false,
        code: 'INVALID_TIMING',
      })
    },
  )
})

describe('Rules Core 1 — stack and state-based actions', () => {
  it('puts spell objects on the stack in LIFO order', () => {
    let state = main(createInitialGameState([], coreDeck))
    state = applyGameAction(state, {
      type: 'CAST_SPELL',
      instanceId: 'a',
      card: remora,
      fromZone: 'hand',
    })
    state = applyGameAction(state, {
      type: 'CAST_SPELL',
      instanceId: 'b',
      card: brainstorm,
      fromZone: 'hand',
    })
    expect(state.stack.at(-1)).toMatchObject({
      spellInstanceId: 'b',
      kind: 'SPELL',
    })
  })

  it('does not resolve a non-top spell', () => {
    let state = main(createInitialGameState([], coreDeck))
    state = applyGameAction(state, {
      type: 'CAST_SPELL',
      instanceId: 'a',
      card: remora,
      fromZone: 'hand',
    })
    state = applyGameAction(state, {
      type: 'CAST_SPELL',
      instanceId: 'b',
      card: brainstorm,
      fromZone: 'hand',
    })
    expect(
      applyGameAction(state, { type: 'RESOLVE_SPELL', instanceId: 'a' }),
    ).toBe(state)
  })

  it('does not advance to a new turn while an object remains on the stack', () => {
    const state = main({
      ...createInitialGameState([], coreDeck),
      stack: [
        {
          stackObjectId: 'spell',
          kind: 'SPELL',
          controller: 'YOU',
          sourceInstanceId: 'spell-card',
          spellInstanceId: 'spell-card',
          targets: [],
          order: 1,
        },
      ],
    })
    expect(resolveCommand(state, { type: 'NEXT_TURN' })).toMatchObject({
      status: 'error',
      error: { code: 'STACK_NOT_EMPTY' },
    })
  })

  it('resolves the top spell and restores a priority window', () => {
    let state = main(createInitialGameState([], coreDeck))
    state = applyGameAction(state, {
      type: 'CAST_SPELL',
      instanceId: 'a',
      card: remora,
      fromZone: 'hand',
    })
    const next = applyGameAction(state, {
      type: 'RESOLVE_SPELL',
      instanceId: 'a',
    })
    expect(next).toMatchObject({
      stack: [],
      turnState: { priority: 'WINDOW_OPEN' },
    })
    expect(next.cards[0]?.zone).toBe('battlefield')
  })

  it('parses attack declarations while unsupported combat syntax remains explicit', () => {
    expect(parseCommand('ataco con namor')).toMatchObject({
      status: 'parsed',
      command: { type: 'DECLARE_ATTACKERS' },
    })
    const resolved = resolveCommand(
      main(createInitialGameState([], coreDeck)),
      { type: 'COMBAT_ACTION' },
    )
    expect(resolved).toMatchObject({
      status: 'error',
      error: { code: 'COMBAT_NOT_IMPLEMENTED' },
    })
  })

  it('marks life zero as lost via the store SBA loop', () => {
    useGameStore
      .getState()
      .replaceGame(main(createInitialGameState([], coreDeck)))
    useGameStore.getState().dispatch({ type: 'SET_LIFE', amount: 0 })
    expect(useGameStore.getState()).toMatchObject({
      gameStatus: 'LOST',
      gameLossReason: 'LIFE',
    })
  })

  it('marks negative life as lost via the store SBA loop', () => {
    useGameStore
      .getState()
      .replaceGame(main(createInitialGameState([], coreDeck)))
    useGameStore.getState().dispatch({ type: 'LOSE_LIFE', amount: 41 })
    expect(useGameStore.getState().gameStatus).toBe('LOST')
  })

  it('does not deck a player merely for an untracked empty library', () => {
    useGameStore
      .getState()
      .replaceGame(main(createInitialGameState([], coreDeck)))
    useGameStore.getState().dispatch({ type: 'DRAW_CARD' })
    expect(useGameStore.getState().gameStatus).toBe('IN_PROGRESS')
  })

  it('loses only after an attempted draw from a known empty library', () => {
    useGameStore.getState().replaceGame(
      main({
        ...createInitialGameState([], coreDeck),
        hiddenZoneTracking: 'COUNTS_ONLY',
        libraryCount: 0,
      }),
    )
    useGameStore.getState().dispatch({ type: 'DRAW_CARD' })
    expect(useGameStore.getState()).toMatchObject({
      gameStatus: 'LOST',
      gameLossReason: 'EMPTY_LIBRARY',
    })
  })

  it.each(['graveyard', 'exile'] as const)(
    'removes a token in %s during SBA checks',
    (zone) => {
      useGameStore
        .getState()
        .replaceGame(
          main(
            createInitialGameState(
              [
                card(
                  'token',
                  definition(
                    'Merfolk Token',
                    'Token Creature — Merfolk',
                    undefined,
                    { power: '1', toughness: '1' },
                  ),
                  zone,
                  { isToken: true },
                ),
              ],
              coreDeck,
            ),
          ),
        )
      useGameStore
        .getState()
        .dispatch({ type: 'ADD_MANA', color: 'U', amount: 1 })
      expect(useGameStore.getState().cards).toHaveLength(0)
    },
  )

  it('collects objective SBAs into one atomic batch', () => {
    const first = card('first', creature, 'battlefield', { damageMarked: 1 })
    const second = card('second', creature, 'battlefield', { damageMarked: 1 })
    const vanishedToken = card(
      'token',
      definition('Merfolk Token', 'Token Creature — Merfolk', undefined, {
        power: '1',
        toughness: '1',
      }),
      'graveyard',
      { isToken: true },
    )
    const countered = card('countered', creature, 'battlefield', {
      counters: { '+1/+1': 2, '-1/-1': 1 },
    })
    const state = main(
      createInitialGameState(
        [first, second, vanishedToken, countered],
        coreDeck,
      ),
    )
    const result = checkStateBasedActions(state)
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]).toMatchObject({
      type: 'APPLY_STATE_BASED_ACTIONS',
      moves: expect.arrayContaining([
        { instanceId: 'first', toZone: 'graveyard' },
        { instanceId: 'second', toZone: 'graveyard' },
      ]),
      removeInstanceIds: ['token'],
      counterRemovals: expect.arrayContaining([
        { instanceId: 'countered', counter: '+1/+1', amount: 1 },
        { instanceId: 'countered', counter: '-1/-1', amount: 1 },
      ]),
    })
    const action = result.actions[0]
    if (!action) throw new Error('expected atomic SBA action')
    const next = applyGameAction(state, action)
    expect(
      next.cards.filter((item) =>
        ['first', 'second'].includes(item.instanceId),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: 'first', zone: 'graveyard' }),
        expect.objectContaining({ instanceId: 'second', zone: 'graveyard' }),
      ]),
    )
    expect(next.cards.some((item) => item.instanceId === 'token')).toBe(false)
    expect(
      next.cards.find((item) => item.instanceId === 'countered')?.counters,
    ).toMatchObject({ '+1/+1': 1, '-1/-1': 0 })
    const events = deriveGameEvents(state, action, next)
    expect(events.filter((event) => event.type === 'CARD_DIED')).toHaveLength(2)
  })

  it('moves a known zero-toughness creature to graveyard', () => {
    const zero = definition('Zero', 'Creature', undefined, {
      power: '1',
      toughness: '0',
    })
    useGameStore
      .getState()
      .replaceGame(main(createInitialGameState([card('zero', zero)], coreDeck)))
    useGameStore
      .getState()
      .dispatch({ type: 'ADD_MANA', color: 'U', amount: 1 })
    expect(useGameStore.getState().cards[0]?.zone).toBe('graveyard')
  })

  it('cancels +1/+1 and -1/-1 counters in pairs', () => {
    useGameStore.getState().replaceGame(
      main(
        createInitialGameState(
          [
            card('countered', creature, 'battlefield', {
              counters: { '+1/+1': 3, '-1/-1': 2 },
            }),
          ],
          coreDeck,
        ),
      ),
    )
    useGameStore
      .getState()
      .dispatch({ type: 'ADD_MANA', color: 'U', amount: 1 })
    expect(useGameStore.getState().cards[0]?.counters).toMatchObject({
      '+1/+1': 1,
      '-1/-1': 0,
    })
  })

  it('offers a legend-rule decision instead of choosing a permanent', () => {
    useGameStore
      .getState()
      .replaceGame(
        main(
          createInitialGameState(
            [card('legend-a', commander), card('legend-b', commander)],
            coreDeck,
          ),
        ),
      )
    useGameStore
      .getState()
      .dispatch({ type: 'ADD_MANA', color: 'U', amount: 1 })
    expect(useGameStore.getState().pendingDecisions[0]).toMatchObject({
      type: 'LEGEND_RULE_SELECTION',
    })
  })

  it('keeps only the legend selected by the player', () => {
    useGameStore
      .getState()
      .replaceGame(
        main(
          createInitialGameState(
            [card('legend-a', commander), card('legend-b', commander)],
            coreDeck,
          ),
        ),
      )
    useGameStore
      .getState()
      .dispatch({ type: 'ADD_MANA', color: 'U', amount: 1 })
    const decision = useGameStore.getState().pendingDecisions[0]
    useGameStore.getState().resolvePendingDecision(decision.id, 'legend-b')
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'legend-a')?.zone,
    ).toBe('graveyard')
    expect(
      useGameStore
        .getState()
        .cards.find((item) => item.instanceId === 'legend-b')?.zone,
    ).toBe('battlefield')
  })
})

describe('Rules Core 1 — Commander and recovery', () => {
  const commanderState = (pool = emptyPool): GameState =>
    main({
      ...createInitialGameState([card('cmd', commander, 'command')], coreDeck),
      commanderId: 'cmd',
      manaPool: pool,
    })

  it('starts its commander in command and life at forty', () => {
    const state = commanderState()
    expect(state).toMatchObject({
      life: 40,
      cards: [{ instanceId: 'cmd', zone: 'command' }],
    })
  })

  it('casts a commander from command without tax the first time', () => {
    const resolved = resolveCommand(commanderState({ ...emptyPool, U: 1 }), {
      type: 'CAST_SPELL',
      cardQuery: commander.name,
    })
    expect(resolved).toMatchObject({ status: 'resolved' })
    if (resolved.status === 'resolved')
      expect(resolved.actions).toEqual(
        expect.arrayContaining([{ type: 'SPEND_MANA', color: 'U', amount: 1 }]),
      )
  })

  it('adds two generic mana for the second command-zone cast', () => {
    const state = commanderState({ ...emptyPool, U: 1, C: 2 })
    const spent = resolveCommand(
      { ...state, commanderCastsFromCommandZone: { cmd: 1 } },
      { type: 'CAST_SPELL', cardQuery: commander.name },
    )
    expect(spent).toMatchObject({ status: 'resolved' })
    if (spent.status === 'resolved')
      expect(spent.actions).toEqual(
        expect.arrayContaining([{ type: 'SPEND_MANA', color: 'C', amount: 2 }]),
      )
  })

  it('adds four generic mana for the third command-zone cast', () => {
    const state = commanderState({ ...emptyPool, U: 1, C: 4 })
    const spent = resolveCommand(
      { ...state, commanderCastsFromCommandZone: { cmd: 2 } },
      { type: 'CAST_SPELL', cardQuery: commander.name },
    )
    expect(spent).toMatchObject({ status: 'resolved' })
    if (spent.status === 'resolved')
      expect(spent.actions).toEqual(
        expect.arrayContaining([{ type: 'SPEND_MANA', color: 'C', amount: 4 }]),
      )
  })

  it('does not increment commander tax for a failed cast', () => {
    const state = commanderState()
    expect(
      resolveCommand(state, { type: 'CAST_SPELL', cardQuery: commander.name }),
    ).toMatchObject({ status: 'error', error: { code: 'NOT_ENOUGH_MANA' } })
    expect(state.commanderCastsFromCommandZone).toEqual({})
  })

  it('increments commander tax only after the cast action succeeds', () => {
    useGameStore.getState().replaceGame(commanderState({ ...emptyPool, U: 1 }))
    const resolved = resolveCommand(useGameStore.getState(), {
      type: 'CAST_SPELL',
      cardQuery: commander.name,
    })
    if (resolved.status === 'resolved')
      useGameStore.getState().dispatchMany(resolved.actions)
    expect(useGameStore.getState().commanderCastsFromCommandZone).toEqual({
      cmd: 1,
    })
  })

  it('does not tax a commander cast from a non-command zone', () => {
    const state = main({
      ...createInitialGameState([card('cmd', commander, 'hand')], coreDeck),
      commanderId: 'cmd',
      commanderCastsFromCommandZone: { cmd: 3 },
      manaPool: { ...emptyPool, U: 1 },
    })
    const resolved = resolveCommand(state, {
      type: 'CAST_SPELL',
      cardQuery: commander.name,
    })
    expect(resolved).toMatchObject({ status: 'resolved' })
  })

  it.each(['graveyard', 'exile'] as const)(
    'offers a command-zone choice from %s',
    (zone) => {
      useGameStore.getState().replaceGame(commanderState())
      useGameStore
        .getState()
        .dispatch({ type: 'MOVE_CARD', instanceId: 'cmd', toZone: zone })
      expect(useGameStore.getState().pendingDecisions[0]).toMatchObject({
        type: 'COMMANDER_ZONE_CHOICE',
      })
    },
  )

  it('can keep the commander in its graveyard', () => {
    useGameStore.getState().replaceGame(commanderState())
    useGameStore
      .getState()
      .dispatch({ type: 'MOVE_CARD', instanceId: 'cmd', toZone: 'graveyard' })
    const choice = useGameStore.getState().pendingDecisions[0]
    useGameStore
      .getState()
      .resolvePendingDecision(choice.id, 'KEEP_IN_CURRENT_ZONE')
    expect(useGameStore.getState().cards[0]).toMatchObject({
      instanceId: 'cmd',
      zone: 'graveyard',
    })
  })

  it('can move the commander to command while retaining its instance identity', () => {
    useGameStore.getState().replaceGame(commanderState())
    useGameStore
      .getState()
      .dispatch({ type: 'MOVE_CARD', instanceId: 'cmd', toZone: 'exile' })
    const choice = useGameStore.getState().pendingDecisions[0]
    useGameStore
      .getState()
      .resolvePendingDecision(choice.id, 'MOVE_TO_COMMAND_ZONE')
    expect(useGameStore.getState().cards[0]).toMatchObject({
      instanceId: 'cmd',
      zone: 'command',
    })
  })

  it.each(['hand', 'library'] as const)(
    'offers replacement before moving commander to %s',
    (zone) => {
      useGameStore.getState().replaceGame(commanderState())
      useGameStore
        .getState()
        .dispatch({ type: 'MOVE_CARD', instanceId: 'cmd', toZone: zone })
      expect(useGameStore.getState().cards[0]?.zone).toBe('command')
      expect(useGameStore.getState().pendingDecisions[0]).toMatchObject({
        type: 'COMMANDER_REPLACEMENT_CHOICE',
      })
    },
  )

  it('can accept the original hand destination after the replacement choice', () => {
    useGameStore.getState().replaceGame(commanderState())
    useGameStore
      .getState()
      .dispatch({ type: 'MOVE_CARD', instanceId: 'cmd', toZone: 'hand' })
    const choice = useGameStore.getState().pendingDecisions[0]
    useGameStore
      .getState()
      .resolvePendingDecision(choice.id, 'ORIGINAL_DESTINATION')
    expect(useGameStore.getState().cards[0]).toMatchObject({
      instanceId: 'cmd',
      zone: 'hand',
    })
  })

  it('can replace a library move with command zone', () => {
    useGameStore.getState().replaceGame(commanderState())
    useGameStore
      .getState()
      .dispatch({ type: 'MOVE_CARD', instanceId: 'cmd', toZone: 'library' })
    const choice = useGameStore.getState().pendingDecisions[0]
    useGameStore.getState().resolvePendingDecision(choice.id, 'COMMAND_ZONE')
    expect(useGameStore.getState().cards[0]?.zone).toBe('command')
  })

  it('concession ends a game and undo restores it', () => {
    useGameStore
      .getState()
      .replaceGame(main(createInitialGameState([], coreDeck)))
    useGameStore.getState().dispatch({ type: 'CONCEDE' })
    expect(useGameStore.getState()).toMatchObject({
      gameStatus: 'LOST',
      gameLossReason: 'CONCEDED',
    })
    useGameStore.getState().undoLastAction()
    expect(useGameStore.getState().gameStatus).toBe('IN_PROGRESS')
  })

  it('lets a manual life correction restore an erroneously lost physical state', () => {
    useGameStore
      .getState()
      .replaceGame(main(createInitialGameState([], coreDeck)))
    useGameStore.getState().dispatch({ type: 'SET_LIFE', amount: 0 })
    useGameStore.getState().dispatch({ type: 'SET_LIFE', amount: 5 })
    expect(useGameStore.getState()).toMatchObject({
      gameStatus: 'IN_PROGRESS',
      life: 5,
    })
  })
})
