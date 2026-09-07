import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { planManaPayment, parseManaCost } from './manaCost'

const pool = (
  values: Partial<ReturnType<typeof createInitialGameState>['manaPool']>,
) => ({
  ...createInitialGameState(),
  manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...values },
})

describe('normal spell mana costs', () => {
  it.each([
    ['{U}', { generic: 0, colors: { U: 1 } }],
    ['{U}{U}', { generic: 0, colors: { U: 2 } }],
    ['{2}{U}', { generic: 2, colors: { U: 1 } }],
    ['{1}', { generic: 1, colors: {} }],
    [
      '{W}{U}{B}{R}{G}{C}',
      { generic: 0, colors: { W: 1, U: 1, B: 1, R: 1, G: 1, C: 1 } },
    ],
  ])('parses %s', (text, expected) => {
    expect(parseManaCost(text)).toEqual(expected)
  })

  it.each(['{X}', '{U/P}', '{2/U}', '{∞}'])(
    'refuses unsupported symbol %s',
    (text) => {
      expect(parseManaCost(text)).toBeUndefined()
    },
  )

  it('requires the exact coloured mana', () => {
    expect(
      planManaPayment(pool({ C: 1 }), { generic: 0, colors: { U: 1 } }),
    ).toMatchObject({ kind: 'NOT_ENOUGH_MANA' })
  })

  it('pays a unique generic cost with the only available color', () => {
    expect(
      planManaPayment(pool({ C: 1 }), { generic: 1, colors: {} }),
    ).toMatchObject({
      kind: 'PAYABLE',
      actions: [{ type: 'SPEND_MANA', color: 'C', amount: 1 }],
    })
  })

  it('keeps material generic payment as a player decision', () => {
    const plan = planManaPayment(pool({ U: 1, C: 1 }), {
      generic: 1,
      colors: {},
    })
    expect(plan.kind).toBe('AMBIGUOUS')
    if (plan.kind === 'AMBIGUOUS')
      expect(plan.options.map((option) => option.label).sort()).toEqual([
        '1 C',
        '1 U',
      ])
  })

  it('combines a mandatory coloured symbol and generic mana', () => {
    expect(
      planManaPayment(pool({ U: 1, C: 2 }), { generic: 2, colors: { U: 1 } }),
    ).toMatchObject({
      kind: 'PAYABLE',
      actions: [
        { type: 'SPEND_MANA', color: 'U', amount: 1 },
        { type: 'SPEND_MANA', color: 'C', amount: 2 },
      ],
    })
  })

  it('keeps the payer identity in normal mana payment actions', () => {
    let state = createInitialGameState()
    state = {
      ...state,
      activePlayerId: 'player-2',
      activePlayer: 'opponent',
      players: state.players.map((player) =>
        player.id === 'player-2'
          ? { ...player, manaPool: { ...player.manaPool, U: 1 } }
          : player,
      ),
    }

    expect(
      planManaPayment(
        state,
        { generic: 0, colors: { U: 1 } },
        undefined,
        'player-2',
      ),
    ).toMatchObject({
      kind: 'PAYABLE',
      actions: [
        {
          type: 'SPEND_MANA',
          color: 'U',
          amount: 1,
          actorPlayerId: 'player-2',
        },
      ],
    })
  })

  it('does not allow generic mana to substitute a missing coloured symbol', () => {
    expect(
      planManaPayment(pool({ C: 3 }), { generic: 2, colors: { U: 1 } }),
    ).toMatchObject({ kind: 'NOT_ENOUGH_MANA' })
  })
})
