import { describe, expect, it } from 'vitest'
import { parseCommand } from './parseCommand'

describe('parseCommand', () => {
  it.each(['activo sol ring', 'activo la habilidad de sol ring'])(
    'parses an activation declaration: %s',
    (input) => {
      expect(parseCommand(input)).toMatchObject({
        status: 'parsed',
        command: { type: 'ACTIVATE_ABILITY', cardQuery: 'sol ring' },
      })
    },
  )
  it.each([
    ['canalizo eiganjo', 'eiganjo', 'CHANNEL'],
    ['hago channel de eiganjo', 'eiganjo', 'CHANNEL'],
    ['waterbend katara', 'katara', 'WATERBEND'],
    ['hago waterbend de katara', 'katara', 'WATERBEND'],
    ['equipo blackblade reforged', 'blackblade reforged', 'EQUIP'],
  ])('parses an existing mechanic activation: %s', (input, cardQuery, abilityHint) => {
    expect(parseCommand(input)).toMatchObject({
      status: 'parsed',
      command: { type: 'ACTIVATE_ABILITY', cardQuery, abilityHint },
    })
  })

  it.each(['mi oponente baraja', 'oponente baraja'])(
    'parses an opponent shuffle declaration: %s',
    (input) => {
      expect(parseCommand(input)).toMatchObject({
        status: 'parsed',
        command: { type: 'DECLARE_PLAYER_SHUFFLED', player: 'opponent' },
      })
    },
  )
  it.each([
    ['pierdo 4 vidas', { type: 'LOSE_LIFE', amount: 4 }],
    ['gano dos vidas', { type: 'GAIN_LIFE', amount: 2 }],
    ['estoy a 27', { type: 'SET_LIFE', amount: 27 }],
    ['robo', { type: 'DRAW', amount: 1 }],
    ['robo tres', { type: 'DRAW', amount: 3 }],
    ['añade dos azules', { type: 'ADD_MANA', colorQuery: 'azul', amount: 2 }],
    ['gasto un azul', { type: 'SPEND_MANA', colorQuery: 'azul', amount: 1 }],
    ['paso turno', { type: 'NEXT_TURN' }],
    ['deshaz eso', { type: 'UNDO' }],
    ['cancela', { type: 'UNDO' }],
    ['cancela eso', { type: 'UNDO' }],
    ['anula eso', { type: 'UNDO' }],
    ['revierte eso', { type: 'UNDO' }],
    ['bajo una isla', { type: 'DECLARE_CARD', cardQuery: 'isla' }],
    ['bajo sol ring', { type: 'DECLARE_CARD', cardQuery: 'sol ring' }],
    ['lanzo counterspell', { type: 'CAST_SPELL', cardQuery: 'counterspell' }],
    ['sin bloqueo', { type: 'DECLARE_BLOCKERS', blockerQueries: [], none: true }],
    ['no bloqueo', { type: 'DECLARE_BLOCKERS', blockerQueries: [], none: true }],
    ['no hay bloqueos', { type: 'DECLARE_BLOCKERS', blockerQueries: [], none: true }],
    ['nadie bloquea', { type: 'DECLARE_BLOCKERS', blockerQueries: [], none: true }],
    ['defiendo namor con yoshimaru', { type: 'DECLARE_BLOCKERS', attackerQuery: 'namor', blockerQueries: ['yoshimaru'] }],
    ['defiendo a namor con yoshimaru', { type: 'DECLARE_BLOCKERS', attackerQuery: 'namor', blockerQueries: ['yoshimaru'] }],
    ['defiendo con yoshimaru', { type: 'DECLARE_BLOCKERS', blockerQueries: ['yoshimaru'] }],
    ['yoshimaru defiende namor', { type: 'DECLARE_BLOCKERS', assignments: [{ blockerQuery: 'yoshimaru', attackerQuery: 'namor' }] }],
  ])('parses %s', (input, command) => {
    expect(parseCommand(input)).toMatchObject({ status: 'parsed', command })
  })

  it('normalizes case, accents, spacing and written indexes', () => {
    expect(parseCommand('  GIRO   LA ÍsLa TRES ')).toMatchObject({
      status: 'parsed',
      command: { type: 'TAP_CARD', cardQuery: 'isla', indexes: [3] },
    })
  })

  it('parses indexed and counted duplicate targets', () => {
    expect(parseCommand('giro las islas 2 y 4')).toMatchObject({
      status: 'parsed',
      command: { type: 'TAP_CARD', cardQuery: 'islas', indexes: [2, 4] },
    })
    expect(parseCommand('giro tres islas')).toMatchObject({
      status: 'parsed',
      command: { type: 'TAP_CARD', cardQuery: 'islas', count: 3 },
    })
  })

  it('parses a declared stack target separately from the spell being cast', () => {
    expect(parseCommand('lanzo mana drain a counterspell')).toMatchObject({
      status: 'parsed',
      command: {
        type: 'CAST_SPELL',
        cardQuery: 'mana drain',
        targetQuery: 'counterspell',
      },
    })
  })

  it('parses a basic-land mana declaration and resolving a spell', () => {
    expect(parseCommand('giro island para azul')).toMatchObject({
      status: 'parsed',
      command: {
        type: 'ACTIVATE_MANA',
        cardQuery: 'island',
        colorQuery: 'azul',
      },
    })
    expect(parseCommand('activo sol ring para mana')).toMatchObject({
      status: 'parsed',
      command: { type: 'ACTIVATE_MANA', cardQuery: 'sol ring' },
    })
    expect(parseCommand('activo arcane signet para azul')).toMatchObject({
      status: 'parsed',
      command: {
        type: 'ACTIVATE_MANA',
        cardQuery: 'arcane signet',
        colorQuery: 'azul',
      },
    })
    expect(parseCommand('resuelve remora')).toMatchObject({
      status: 'parsed',
      command: { type: 'RESOLVE_SPELL', cardQuery: 'remora' },
    })
  })

  it('parses identified and unknown discard declarations', () => {
    expect(parseCommand('descarto counterspell')).toMatchObject({
      status: 'parsed',
      command: { type: 'DISCARD_CARD', cardQuery: 'counterspell', amount: 1 },
    })
    expect(parseCommand('descarto una carta desconocida')).toMatchObject({
      status: 'parsed',
      command: { type: 'DISCARD_CARD', amount: 1, unknown: true },
    })
  })

  it('returns a typed error for unknown input', () => {
    expect(parseCommand('haz magia')).toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN_COMMAND' },
    })
  })

  it('marks explicit response language without creating a separate voice parser', () => {
    expect(parseCommand('en respuesta Counterspell a Remora')).toMatchObject({
      status: 'parsed',
      command: {
        type: 'CAST_SPELL',
        cardQuery: 'counterspell',
        targetQuery: 'remora',
        inResponse: true,
      },
    })
  })
})
