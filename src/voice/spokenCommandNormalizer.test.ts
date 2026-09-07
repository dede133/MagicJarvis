import { describe, expect, it } from 'vitest'
import { parseCommand } from '../commands/parser/parseCommand'
import { normalizeSpokenCommand } from './spokenCommandNormalizer'

const cases = [
  ['te pego con Namor', 'ataco con namor', 'DECLARE_ATTACKERS'],
  ['pego con Namor', 'ataco con namor', 'DECLARE_ATTACKERS'],
  ['voy con Namor', 'ataco con namor', 'DECLARE_ATTACKERS'],
  ['voy con todo', 'ataco con todos', 'DECLARE_ATTACKERS'],
  ['te juego Sol Ring', 'juego sol ring', 'DECLARE_CARD'],
  ['te bajo una isla', 'bajo 1 isla', 'DECLARE_CARD'],
  ['te lanzo Counterspell', 'lanzo counterspell', 'CAST_SPELL'],
  ['le tiro Counterspell', 'tiro counterspell', 'CAST_SPELL'],
  ['voy a jugar Sol Ring', 'juego sol ring', 'DECLARE_CARD'],
  ['voy a lanzar Counterspell', 'lanzo counterspell', 'CAST_SPELL'],
  ['me entran cinco', 'pierdo 5', 'LOSE_LIFE'],
  ['me llevo cuatro vidas', 'pierdo 4', 'LOSE_LIFE'],
  ['me pongo en 30', 'estoy a 30', 'SET_LIFE'],
  ['Namor se come tres', 'namor recibe 3', 'DECLARE_DAMAGE'],
  ['le hago dos a Namor', 'namor recibe 2', 'DECLARE_DAMAGE'],
  ['no bloqueo', 'sin bloqueos', 'DECLARE_BLOCKERS'],
  ['sin bloqueo', 'sin bloqueos', 'DECLARE_BLOCKERS'],
  ['no hay bloqueos', 'sin bloqueos', 'DECLARE_BLOCKERS'],
  ['nadie bloquea', 'sin bloqueos', 'DECLARE_BLOCKERS'],
  [
    'bloqueo a Namor con Triton',
    'bloqueo namor con triton',
    'DECLARE_BLOCKERS',
  ],
  ['te toca', 'paso turno', 'NEXT_TURN'],
  ['vale voy a bajar una isla', 'bajo 1 isla', 'DECLARE_CARD'],
  ['mmm pues ahora voy a bajar una isla', 'bajo 1 isla', 'DECLARE_CARD'],
  ['y también voy a bajar remora', 'bajo remora', 'DECLARE_CARD'],
  ['también voy a bajar remora', 'bajo remora', 'DECLARE_CARD'],
  ['además voy a jugar Sol Ring', 'juego sol ring', 'DECLARE_CARD'],
  ['y ahora voy a bajar una isla', 'bajo 1 isla', 'DECLARE_CARD'],
  ['bueno venga robo dos', 'robo 2', 'DRAW'],
  ['vale pues te pego con Namor', 'ataco con namor', 'DECLARE_ATTACKERS'],
  ['voy a activar Sol Ring', 'activo sol ring', 'ACTIVATE_ABILITY'],
  ['voy a canalizar Eiganjo', 'canalizo eiganjo', 'ACTIVATE_ABILITY'],
  [
    'voy a equipar Blackblade Reforged',
    'equipo blackblade reforged',
    'ACTIVATE_ABILITY',
  ],
] as const

describe('normalizeSpokenCommand', () => {
  it.each(cases)('%s -> %s', (input, expected, commandType) => {
    const normalized = normalizeSpokenCommand(input)
    expect(normalized).toBe(expected)
    expect(parseCommand(normalized)).toMatchObject({
      status: 'parsed',
      command: { type: commandType },
    })
  })

  it.each([
    ['giro la isla uno', 'giro la isla 1'],
    ['robo dos', 'robo 2'],
    ['lanzo counterspell', 'lanzo counterspell'],
    ['ataco con namor', 'ataco con namor'],
    ['sin bloqueos', 'sin bloqueos'],
  ])('leaves an already canonical command unchanged: %s', (input, expected) => {
    expect(normalizeSpokenCommand(input)).toBe(expected)
  })

  it('keeps semantic uncertainty/question/negation markers after continuation fillers', () => {
    expect(normalizeSpokenCommand('vale igual lanzo Counterspell')).toBe(
      'igual lanzo counterspell',
    )
    expect(normalizeSpokenCommand('bueno creo que voy a bajar una isla')).toBe(
      'creo que voy a bajar 1 isla',
    )
    expect(normalizeSpokenCommand('eh puedo lanzar Counterspell')).toBe(
      'puedo lanzar counterspell',
    )
    expect(normalizeSpokenCommand('y también creo que voy a bajar remora')).toBe(
      'creo que voy a bajar remora',
    )
    expect(normalizeSpokenCommand('y además no voy a bajar remora')).toBe(
      'no voy a bajar remora',
    )
  })
})

it('normalizes future declarations with a spoken object pronoun', () => {
  expect(normalizeSpokenCommand('lo voy a bajar la morada')).toBe(
    'bajo la morada',
  )
})

describe('continuous ASR self-restarts', () => {
  it('drops an incomplete future declaration immediately restarted by another one', () => {
    expect(
      normalizeSpokenCommand('vale yo voy a jugar voy a bajar una isla'),
    ).toBe('bajo 1 isla')
  })

  it('tolerates harmless hesitation between two incomplete future starts', () => {
    expect(
      normalizeSpokenCommand('mmm voy a lanzar eh voy a jugar remora'),
    ).toBe('juego remora')
  })

  it('keeps a complete future declaration intact', () => {
    expect(normalizeSpokenCommand('voy a jugar isla')).toBe('juego isla')
  })

  it('does not jump across semantic material to find a later command', () => {
    expect(normalizeSpokenCommand('voy a jugar si voy a bajar isla')).toBe(
      'juego si voy a bajar isla',
    )
  })
})
