import { describe, expect, it } from 'vitest'
import { parseCommand } from '../../commands/parser/parseCommand'
import { normalizeSpokenCommand } from '../spokenCommandNormalizer'
import { evaluateVoiceCommandGate } from '../voiceCommandGate'
import { segmentVoiceCommands } from '../voiceCommandSegmentation'
import {
  CATALAN_VOICE_LANGUAGE_PACK,
  SPANISH_VOICE_LANGUAGE_PACK,
  canonicalizeVoiceLanguageInput,
} from '.'

const parsedCommand = (
  input: string,
  languagePack:
    | typeof SPANISH_VOICE_LANGUAGE_PACK
    | typeof CATALAN_VOICE_LANGUAGE_PACK,
) => {
  const parsed = parseCommand(normalizeSpokenCommand(input, languagePack))
  expect(parsed.status).toBe('parsed')
  if (parsed.status !== 'parsed') throw new Error(`Could not parse: ${input}`)
  return parsed.command
}

const deterministicParity = [
  ['juego Namor', 'jugo Namor'],
  ['bajo una isla', 'baixo una illa'],
  ['lanzo Counterspell', 'llanço Counterspell'],
  ['giro Sol Ring', 'giro Sol Ring'],
  ['enderezo Sol Ring', 'redreço Sol Ring'],
  ['robo dos', 'robo dues'],
  ['descarto Counterspell', 'descarto Counterspell'],
  ['paso turno', 'passo torn'],
  ['siguiente fase', 'següent fase'],
  ['voy a combate', 'vaig a combat'],
  ['concedo', 'concedeixo'],
  ['daño de combate', 'dany de combat'],
  ['ataco con Namor y Wolverine', 'ataco amb Namor i Wolverine'],
  ['sin bloqueos', 'sense bloquejos'],
  ['bloqueo Wolverine con Namor', 'bloquejo Wolverine amb Namor'],
  ['resuelve', 'resol'],
  ['barajo mi biblioteca', 'barrejo la meva biblioteca'],
  ['tengo cinco cartas en la mano', 'tinc cinc cartes a la mà'],
  ['pierdo tres vidas', 'perdo tres vides'],
  ['gano dos vidas', 'guanyo dues vides'],
  ['estoy a veinte', 'estic a vint'],
  ['muevo Namor al cementerio', 'envio Namor al cementiri'],
  ['devuelvo Sol Ring a la mano', 'torno Sol Ring a la mà'],
  ['exilio Namor', 'exilio Namor'],
  ['activo Sol Ring', 'activo Sol Ring'],
  ['canalizo Boseiju', 'canalizo Boseiju'],
  ['equipo Sword', 'equipo Sword'],
  ['en respuesta Counterspell', 'en resposta Counterspell'],
  ['deshaz eso', 'desfés això'],
  ['añado dos mana azules', 'afegeixo dues mana blaus'],
  ['pago dos mana azules', 'pago dues mana blaus'],
  ['me quito cuatro', 'em trec quatre'],
  ['me como tres', 'em menjo tres'],
  ['me bajo tres', 'em baixo tres'],
  ['genero dos azules', 'genero dues blaves'],
  ['gasto un azul', 'gasto un blau'],
  ['activo Sol Ring para mana', 'activo Sol Ring per mana'],
  ['giro Island para azul', 'giro Island per blau'],
  ['uso la habilidad de Sol Ring', "utilitzo l'habilitat de Sol Ring"],
  ['enderezo todo', 'redreço tot'],
  ['mano 5', 'mà 5'],
  ['mazo 72', 'baralla 72'],
] as const

describe('Catalan voice language parity', () => {
  it.each(deterministicParity)(
    'maps %s / %s to the same deterministic command',
    (spanish, catalan) => {
      expect(parsedCommand(catalan, CATALAN_VOICE_LANGUAGE_PACK)).toEqual(
        parsedCommand(spanish, SPANISH_VOICE_LANGUAGE_PACK),
      )
    },
  )

  it.each([
    ['creo que voy a jugar Namor', 'crec que vaig a jugar Namor', 'UNCERTAINTY'],
    ['puedo jugar Namor', 'puc jugar Namor', 'QUESTION'],
    ['ayer jugué Namor', 'ahir vaig jugar Namor', 'PAST_REFERENCE'],
  ] as const)(
    'keeps Command Gate safety equivalent: %s / %s',
    (spanish, catalan, reason) => {
      expect(evaluateVoiceCommandGate(catalan, CATALAN_VOICE_LANGUAGE_PACK)).toEqual(
        evaluateVoiceCommandGate(spanish, SPANISH_VOICE_LANGUAGE_PACK),
      )
      expect(evaluateVoiceCommandGate(catalan, CATALAN_VOICE_LANGUAGE_PACK)).toEqual({
        decision: 'IGNORE',
        reason,
      })
    },
  )

  it('keeps explicit negative combat declarations executable', () => {
    expect(evaluateVoiceCommandGate('no ataco', CATALAN_VOICE_LANGUAGE_PACK)).toEqual({
      decision: 'CONTINUE',
    })
    expect(
      evaluateVoiceCommandGate('sense bloquejos', CATALAN_VOICE_LANGUAGE_PACK),
    ).toEqual({ decision: 'CONTINUE' })
  })

  it('segments Catalan sequencing into the same canonical command stream', () => {
    expect(
      segmentVoiceCommands(
        'jugo Namor i després robo dues i després passo torn',
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toEqual(['juego namor', 'robo 2', 'paso turno'])
  })

  it.each([
    ['trio blau', 'elijo azul'],
    ['no ho pago', 'no lo pago'],
    ["resol l'habilitat", 'resuelve la habilidad'],
    ['deixa-ho', 'dejalo'],
    ['faig waterbend', 'hago waterbend'],
    ['dic elf', 'digo elf'],
    ['afegeixo dues comptadors +1/+1 a Namor', 'anado 2 contadores +1/+1 a namor'],
    ['em queden trenta a la biblioteca', 'me quedan 30 en la biblioteca'],
    ['faig waterbend amb Katara', 'hago waterbend con katara'],
    ['faig channel de Eiganjo', 'hago channel de eiganjo'],
    ["llança'l", 'lanzalo'],
    ['ignora-la', 'ignorala'],
    ['resol-la', 'resuelvela'],
    ['rebo tres vides', 'recibo 3 vidas'],
    ['li poso dues comptadors +1/+1 a Namor', 'le pongo 2 contadores +1/+1 a namor'],
    ['Namor torna a la mà', 'namor vuelve a la mano'],
    ['vaig a robar', 'voy al robo'],
    ['tapejo Sol Ring', 'tapeo sol ring'],
    ['llança Counterspell', 'lanza counterspell'],
  ] as const)('canonicalizes V3/UI language: %s', (catalan, canonical) => {
    expect(canonicalizeVoiceLanguageInput(catalan, CATALAN_VOICE_LANGUAGE_PACK)).toBe(
      canonical,
    )
  })

  it('normalizes Catalan apostrophe variants consistently', () => {
    expect(
      canonicalizeVoiceLanguageInput("resol l'habilitat", CATALAN_VOICE_LANGUAGE_PACK),
    ).toBe('resuelve la habilidad')
    expect(
      canonicalizeVoiceLanguageInput('resol l’habilitat', CATALAN_VOICE_LANGUAGE_PACK),
    ).toBe('resuelve la habilidad')
  })

  it('does not treat English card-name word "Set" as the Catalan number seven', () => {
    expect(
      canonicalizeVoiceLanguageInput('jugo Set Adrift', CATALAN_VOICE_LANGUAGE_PACK),
    ).toBe('juego set adrift')
    expect(canonicalizeVoiceLanguageInput('set', CATALAN_VOICE_LANGUAGE_PACK)).toBe('7')
  })
})
