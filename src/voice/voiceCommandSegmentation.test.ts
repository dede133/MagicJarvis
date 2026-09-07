import { describe, expect, it } from 'vitest'
import { segmentVoiceCommands } from './voiceCommandSegmentation'

describe('voice command segmentation', () => {
  it('splits repeated clear command verbs into ordered segments', () => {
    expect(segmentVoiceCommands('bajo isla, bajo remora y paso')).toEqual([
      'bajo isla',
      'bajo remora',
      'paso',
    ])
  })

  it('supports natural sequencing connectors', () => {
    expect(
      segmentVoiceCommands('robo dos y luego giro sol ring despues paso'),
    ).toEqual(['robo 2', 'giro sol ring', 'paso'])
  })

  it('does not split a list of attackers', () => {
    expect(segmentVoiceCommands('ataco con Namor y Wolverine')).toEqual([
      'ataco con namor y wolverine',
    ])
  })

  it('does not split a list of permanents for the same verb', () => {
    expect(segmentVoiceCommands('giro Island y Sol Ring')).toEqual([
      'giro island y sol ring',
    ])
  })

  it('creates a boundary before wording the Command Gate may reject', () => {
    expect(
      segmentVoiceCommands('bajo isla y creo que lanzo counterspell y paso'),
    ).toEqual(['bajo isla', 'creo que lanzo counterspell', 'paso'])
  })
})

it('inherits the previous action after a strong sequence connector', () => {
  expect(segmentVoiceCommands('juego isla y luego anillo solar')).toEqual([
    'juego isla',
    'juego anillo solar',
  ])
  expect(segmentVoiceCommands('giro Island luego Sol Ring')).toEqual([
    'giro island',
    'giro sol ring',
  ])
})

it('keeps a plain entity list together while allowing strong ellipsis', () => {
  expect(segmentVoiceCommands('ataco con Namor y Wolverine')).toEqual([
    'ataco con namor y wolverine',
  ])
  expect(segmentVoiceCommands('ataco con Namor y luego Wolverine')).toEqual([
    'ataco con namor',
    'ataco con wolverine',
  ])
})

it('splits a later explicit self-restart from an uncertain clause', () => {
  expect(
    segmentVoiceCommands(
      'vale eh pues yo creo que voy a bajar esa bajo isla y luego bajo remora',
    ),
  ).toEqual([
    'vale eh pues yo creo que voy a bajar esa',
    'bajo isla',
    'bajo remora',
  ])
})

it('does not split a single hypothetical declaration', () => {
  expect(segmentVoiceCommands('creo que voy a bajar isla')).toEqual([
    'creo que voy a bajar isla',
  ])
})

it('recognizes repeated future declarations with object pronouns', () => {
  expect(
    segmentVoiceCommands('voy a bajar isla y lo voy a bajar la morada'),
  ).toEqual(['voy a bajar isla', 'lo voy a bajar la morada'])
})
