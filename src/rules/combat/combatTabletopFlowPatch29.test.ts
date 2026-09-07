import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { parseCommand } from '../../commands/parser/parseCommand'
import { parseCommandForGame } from '../../commands/parser/parseCommandForGame'
import { useGameStore } from '../../store/gameStore'
import type { CardInstance } from '../../types/card'
import { turnStateFor } from '../../types/turn'

const attacker: CardInstance = {
  instanceId: 'flow-attacker',
  card: {
    scryfallId: 'flow-attacker',
    name: 'Flow Attacker',
    cmc: 2,
    typeLine: 'Creature — Test',
    colors: [],
    colorIdentity: [],
    power: '2',
    toughness: '2',
  },
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ownerId: 'player-1',
  controllerId: 'player-1',
  controlledSinceTurn: 0,
}

const blocker: CardInstance = {
  instanceId: 'flow-blocker',
  card: {
    scryfallId: 'flow-blocker',
    name: 'Yoshimaru, Ever Faithful',
    cmc: 1,
    typeLine: 'Legendary Creature — Dog',
    colors: ['W'],
    colorIdentity: ['W'],
    power: '1',
    toughness: '1',
  },
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ownerId: 'player-2',
  controllerId: 'player-2',
  controlledSinceTurn: 0,
}

beforeEach(() => {
  const base = createInitialGameState([attacker, blocker])
  useGameStore.getState().replaceGame({
    ...base,
    activePlayerId: 'player-1',
    turnOrder: ['player-1', 'player-2'],
    turn: 3,
    turnState: turnStateFor('MAIN_1'),
    cards: [attacker, blocker],
  })
})

describe('tabletop combat flow', () => {
  it('accepts an attack declaration directly from main phase', () => {
    const result = useGameStore.getState().executeTabletopCommand({
      type: 'DECLARE_ATTACKERS',
      attackerQueries: ['flow attacker'],
    })
    expect(result.status).toBe('executed')
    const next = useGameStore.getState()
    expect(next.turnState.step).toBe('DECLARE_ATTACKERS')
    expect(next.combatState.attackersDeclared).toBe(true)
    expect(next.combatState.attackers).toHaveLength(1)
  })

  it.each([
    'defiendo flow attacker con yoshimaru',
    'defiendo a flow attacker con yoshimaru',
    'defiendo con yoshimaru',
  ])('accepts natural defend wording: %s', (text) => {
    useGameStore.getState().executeTabletopCommand({
      type: 'DECLARE_ATTACKERS',
      attackerQueries: ['flow attacker'],
    })
    const parsed = parseCommand(text)
    expect(parsed.status).toBe('parsed')
    if (parsed.status !== 'parsed') return
    const result = useGameStore.getState().executeTabletopCommand(parsed.command)
    expect(result.status).toBe('executed')
    const next = useGameStore.getState()
    expect(next.turnState.step).toBe('DECLARE_BLOCKERS')
    expect(next.combatState.blockers).toEqual([
      { blockerInstanceId: 'flow-blocker', blocking: ['flow-attacker'] },
    ])
  })

  it('uses a bare blocker name only in the single-attacker blocker context', () => {
    expect(parseCommandForGame('yoshimaru', useGameStore.getState()).status).toBe('error')
    useGameStore.getState().executeTabletopCommand({
      type: 'DECLARE_ATTACKERS',
      attackerQueries: ['flow attacker'],
    })
    const parsed = parseCommandForGame('yoshimaru', useGameStore.getState())
    expect(parsed).toMatchObject({
      status: 'parsed',
      command: { type: 'DECLARE_BLOCKERS', blockerQueries: ['Yoshimaru, Ever Faithful'] },
    })
    if (parsed.status !== 'parsed') return
    const result = useGameStore.getState().executeTabletopCommand(parsed.command)
    expect(result.status).toBe('executed')
    expect(useGameStore.getState().combatState.blockers).toEqual([
      { blockerInstanceId: 'flow-blocker', blocking: ['flow-attacker'] },
    ])
  })

  it.each(['sin bloqueo', 'sin bloqueos', 'no bloqueo', 'no hay bloqueos', 'nadie bloquea'])(
    'accepts a natural no-blocks declaration from text: %s',
    (text) => {
      useGameStore.getState().executeTabletopCommand({
        type: 'DECLARE_ATTACKERS',
        attackerQueries: ['flow attacker'],
      })
      const parsed = parseCommand(text)
      expect(parsed.status).toBe('parsed')
      if (parsed.status !== 'parsed') return
      const result = useGameStore.getState().executeTabletopCommand(parsed.command)
      expect(result.status).toBe('executed')
      const next = useGameStore.getState()
      expect(next.turnState.step).toBe('DECLARE_BLOCKERS')
      expect(next.combatState.blockersDeclared).toBe(true)
      expect(next.combatState.blockers).toHaveLength(0)
    },
  )

  it('advances to blockers when the next declaration says there are no blocks', () => {
    useGameStore.getState().executeTabletopCommand({
      type: 'DECLARE_ATTACKERS',
      attackerQueries: ['flow attacker'],
    })
    const result = useGameStore.getState().executeTabletopCommand({
      type: 'DECLARE_BLOCKERS',
      blockerQueries: [],
      none: true,
    })
    expect(result.status).toBe('executed')
    const next = useGameStore.getState()
    expect(next.turnState.step).toBe('DECLARE_BLOCKERS')
    expect(next.combatState.blockersDeclared).toBe(true)
  })

  it('finishes deterministic combat before a pass-turn command', () => {
    useGameStore.getState().executeTabletopCommand({
      type: 'DECLARE_ATTACKERS',
      attackerQueries: ['flow attacker'],
    })
    useGameStore.getState().executeTabletopCommand({
      type: 'DECLARE_BLOCKERS',
      blockerQueries: [],
      none: true,
    })
    const beforeLife = useGameStore.getState().opponentLife
    const result = useGameStore.getState().executeTabletopCommand({ type: 'NEXT_TURN' })
    expect(result.status).toBe('executed')
    const next = useGameStore.getState()
    expect(next.opponentLife).toBe(beforeLife - 2)
    expect(next.activePlayerId).toBe('player-2')
    expect(next.turnState.step).toBe('MAIN_1')
  })
})
