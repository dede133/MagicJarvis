import { describe, expect, it } from 'vitest'
import { parseCommand } from './parseCommand'
import type { ParsedCommand } from '../types/commandTypes'

type CorpusCase = { input: string; command: ParsedCommand }

const corpus: CorpusCase[] = [
  { input: 'bajar isla', command: { type: 'DECLARE_CARD', cardQuery: 'isla' } },
  {
    input: 'bajo una isla',
    command: { type: 'DECLARE_CARD', cardQuery: 'isla' },
  },
  {
    input: 'juego island',
    command: { type: 'DECLARE_CARD', cardQuery: 'island' },
  },
  {
    input: 'pongo sol ring',
    command: { type: 'DECLARE_CARD', cardQuery: 'sol ring' },
  },
  { input: 'giro isla', command: { type: 'TAP_CARD', cardQuery: 'isla' } },
  {
    input: 'giro la isla tres',
    command: { type: 'TAP_CARD', cardQuery: 'isla', indexes: [3] },
  },
  {
    input: 'tapeo isla 2',
    command: { type: 'TAP_CARD', cardQuery: 'isla', indexes: [2] },
  },
  {
    input: 'giro tres islas',
    command: { type: 'TAP_CARD', cardQuery: 'islas', count: 3 },
  },
  {
    input: 'enderezo namor',
    command: { type: 'UNTAP_CARD', cardQuery: 'namor' },
  },
  {
    input: 'destapo isla dos',
    command: { type: 'UNTAP_CARD', cardQuery: 'isla', indexes: [2] },
  },
  {
    input: 'lanzo counterspell',
    command: { type: 'CAST_SPELL', cardQuery: 'counterspell' },
  },
  {
    input: 'casteo mana drain',
    command: { type: 'CAST_SPELL', cardQuery: 'mana drain' },
  },
  { input: 'robo', command: { type: 'DRAW', amount: 1 } },
  { input: 'robo dos cartas', command: { type: 'DRAW', amount: 2 } },
  { input: 'me quito cuatro', command: { type: 'LOSE_LIFE', amount: 4 } },
  { input: 'me como 3', command: { type: 'LOSE_LIFE', amount: 3 } },
  { input: 'me curo dos', command: { type: 'GAIN_LIFE', amount: 2 } },
  { input: 'me pongo a 30', command: { type: 'SET_LIFE', amount: 30 } },
  {
    input: 'genero dos azules',
    command: { type: 'ADD_MANA', colorQuery: 'azul', amount: 2 },
  },
  {
    input: 'añado dos maná azules',
    command: { type: 'ADD_MANA', colorQuery: 'azul', amount: 2 },
  },
  {
    input: 'gasto un azul',
    command: { type: 'SPEND_MANA', colorQuery: 'azul', amount: 1 },
  },
  {
    input: 'activo merfolk looter',
    command: { type: 'ACTIVATE_ABILITY', cardQuery: 'merfolk looter' },
  },
  {
    input: 'uso la habilidad de merfolk looter',
    command: { type: 'ACTIVATE_ABILITY', cardQuery: 'merfolk looter' },
  },
  {
    input: 'mi oponente baraja',
    command: { type: 'DECLARE_PLAYER_SHUFFLED', player: 'opponent' },
  },
  { input: 'paso turno', command: { type: 'NEXT_TURN' } },
  { input: 'deshaz eso', command: { type: 'UNDO' } },
  { input: 'cancela', command: { type: 'UNDO' } },
  { input: 'anula eso', command: { type: 'UNDO' } },
  { input: 'revierte eso', command: { type: 'UNDO' } },
  { input: 'enderezo todo', command: { type: 'UNTAP_ALL' } },
  { input: 'barajo mi biblioteca', command: { type: 'DECLARE_PLAYER_SHUFFLED', player: 'local' } },
  { input: 'el rival baraja', command: { type: 'DECLARE_PLAYER_SHUFFLED', player: 'opponent' } },
  { input: 'termino turno', command: { type: 'NEXT_TURN' } },
  { input: 'vamos a combate', command: { type: 'ADVANCE_STEP', targetStep: 'BEGIN_COMBAT' } },
  {
    input: 'el rival ataca con arcane signet',
    command: {
      type: 'DECLARE_EXTERNAL_ATTACKER',
      cardQuery: 'arcane signet',
    },
  },
  {
    input: 'mando namor al cementerio',
    command: {
      type: 'MOVE_CARD',
      cardQuery: 'namor',
      destination: 'graveyard',
    },
  },
  {
    input: 'namor va al exilio',
    command: { type: 'MOVE_CARD', cardQuery: 'namor', destination: 'exile' },
  },
  {
    input: 'devuelvo sol ring a la mano',
    command: { type: 'MOVE_CARD', cardQuery: 'sol ring', destination: 'hand' },
  },
  {
    input: 'mando el comandante a la zona de mando',
    command: {
      type: 'MOVE_CARD',
      cardQuery: 'comandante',
      destination: 'command',
    },
  },
  { input: 'tengo siete cartas en mano', command: { type: 'SET_HAND_COUNT', count: 7 } },
  { input: 'mano 5', command: { type: 'SET_HAND_COUNT', count: 5 } },
  {
    input: 'me quedan ochenta en la biblioteca',
    command: { type: 'SET_LIBRARY_COUNT', count: 80 },
  },
  { input: 'mazo 72', command: { type: 'SET_LIBRARY_COUNT', count: 72 } },
]

describe('natural Spanish command corpus', () => {
  it.each(corpus)('$input', ({ input, command }) => {
    expect(parseCommand(input)).toMatchObject({ status: 'parsed', command })
  })

  it('keeps a bare mana quantity deliberately unknown', () => {
    expect(parseCommand('dos azules')).toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN_COMMAND' },
    })
  })

  it('does not confuse a life loss declaration with playing a card', () => {
    expect(parseCommand('me bajo 3')).toMatchObject({
      status: 'parsed',
      command: { type: 'LOSE_LIFE', amount: 3 },
    })
  })

  it('uses tiro for discard only with explicit graveyard context', () => {
    expect(parseCommand('tiro una isla al cementerio')).toMatchObject({
      status: 'parsed',
      command: { type: 'DISCARD_CARD', cardQuery: 'isla', amount: 1 },
    })
    expect(parseCommand('tiro counterspell')).toMatchObject({
      status: 'parsed',
      command: { type: 'CAST_SPELL', cardQuery: 'counterspell' },
    })
  })

  it('does not fake destroy or sacrifice semantics as a generic zone move', () => {
    expect(parseCommand('sacrifico namor')).toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN_COMMAND' },
    })
    expect(parseCommand('destruyo namor')).toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN_COMMAND' },
    })
  })
})
