import { describe, expect, it } from 'vitest'
import { evaluateVoiceCommandGate } from './voiceCommandGate'

const ignored = [
  ['¿puedo lanzar Counterspell?', 'QUESTION'],
  ['puedo lanzar Counterspell', 'QUESTION'],
  ['debería atacar con Namor', 'QUESTION'],
  ['tienes Counterspell', 'QUESTION'],
  ['qué hace Sol Ring', 'QUESTION'],
  ['igual lanzo Counterspell', 'UNCERTAINTY'],
  ['quizá ataco con Namor', 'UNCERTAINTY'],
  ['a lo mejor juego una isla', 'UNCERTAINTY'],
  ['creo que voy a lanzar Counterspell', 'UNCERTAINTY'],
  ['puede que ataque con Namor', 'UNCERTAINTY'],
  ['no voy a atacar con Namor', 'NEGATED_ACTION'],
  ['no lanzo Counterspell', 'NEGATED_ACTION'],
  ['no quiero jugar una isla', 'NEGATED_ACTION'],
  ['ayer lancé Counterspell', 'PAST_REFERENCE'],
  ['he atacado con Namor', 'PAST_REFERENCE'],
  ['acabo de robar', 'PAST_REFERENCE'],
  ['vale creo que voy a lanzar Counterspell', 'UNCERTAINTY'],
  ['bueno igual bajo una isla', 'UNCERTAINTY'],
  ['eh puedo lanzar Counterspell', 'QUESTION'],
  ['y también creo que voy a bajar remora', 'UNCERTAINTY'],
  ['y además no voy a bajar remora', 'NEGATED_ACTION'],
  ['vale', 'NO_COMMAND_CANDIDATE'],
  ['bueno', 'NO_COMMAND_CANDIDATE'],
  ['me estais en plan aqui', 'NO_COMMAND_CANDIDATE'],
  ['una cosa diferente', 'NO_COMMAND_CANDIDATE'],
  ['pero bueno no no no', 'NO_COMMAND_CANDIDATE'],
] as const

const continued = [
  'lanzo Counterspell',
  'te pego con Namor',
  'voy con Namor',
  'voy a lanzar Counterspell',
  'robo dos',
  'giro Sol Ring',
  'no bloqueo',
  'sin bloqueos',
  'sin bloqueo',
  'no bloqueo',
  'no hay bloqueos',
  'nadie bloquea',
  'cancela',
  'deshaz eso',
  'anula',
  'vale voy a bajar una isla',
  'mmm pues ahora robo dos',
  'y también voy a bajar remora',
  'además voy a jugar Sol Ring',
] as const

describe('evaluateVoiceCommandGate', () => {
  it.each(ignored)('ignores conversational wording: %s', (input, reason) => {
    expect(evaluateVoiceCommandGate(input)).toEqual({
      decision: 'IGNORE',
      reason,
    })
  })

  it.each(continued)('lets clear declarations continue: %s', (input) => {
    expect(evaluateVoiceCommandGate(input)).toEqual({ decision: 'CONTINUE' })
  })

  it('uses explicit question punctuation even when the words look like a command', () => {
    expect(evaluateVoiceCommandGate('¿robo?')).toEqual({
      decision: 'IGNORE',
      reason: 'QUESTION',
    })
  })
})
