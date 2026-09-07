import { describe, expect, it } from 'vitest'
import type { CardDefinition } from '../types/card'
import type { DeckDefinition } from '../types/deck'
import { segmentVoiceCommandsForGame } from './voiceCommandContextSegmentation'

const card = (name: string, typeLine = 'Artifact'): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(/[^a-z]/g, '-'),
  name,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})

const island = card('Island', 'Basic Land — Island')
const remora = card('Mystic Remora', 'Enchantment')
const solRing = card('Sol Ring', 'Artifact')

const deck: DeckDefinition = {
  name: 'Segmentation test',
  commander: { quantity: 1, name: 'Sol Ring', card: solRing },
  mainboard: [
    { quantity: 20, name: 'Island', card: island },
    { quantity: 1, name: 'Mystic Remora', card: remora },
  ],
}

const game = {
  localPlayerId: 'player-1' as const,
  activePlayerId: 'player-1' as const,
  deckDefinition: deck,
  deckDefinitionsByPlayer: { 'player-1': deck },
}

describe('segmentVoiceCommandsForGame', () => {
  it('inherits a card-play verb across a plain y only when both cards resolve', () => {
    expect(segmentVoiceCommandsForGame('juego una isla y una remora', game)).toEqual([
      'juego una isla',
      'juego una remora',
    ])
  })

  it('does not split a plain y when the second phrase is not a known deck card', () => {
    expect(segmentVoiceCommandsForGame('juego una isla y una carta rara', game)).toEqual([
      'juego una isla y una carta rara',
    ])
  })

  it('keeps non-card entity lists untouched', () => {
    expect(segmentVoiceCommandsForGame('ataco con Namor y Wolverine', game)).toEqual([
      'ataco con namor y wolverine',
    ])
  })

  it('uses the active player deck when expanding card ellipsis', () => {
    const activeDeck: DeckDefinition = {
      name: 'Active deck',
      commander: { quantity: 1, name: 'Sol Ring', card: solRing },
      mainboard: [
        { quantity: 1, name: 'Island', card: island },
        { quantity: 1, name: 'Mystic Remora', card: remora },
      ],
    }
    const legacyDeck: DeckDefinition = {
      name: 'Legacy deck',
      commander: { quantity: 1, name: 'Sol Ring', card: solRing },
      mainboard: [{ quantity: 1, name: 'Island', card: island }],
    }
    const match = {
      localPlayerId: 'player-1' as const,
      activePlayerId: 'player-2' as const,
      deckDefinition: legacyDeck,
      deckDefinitionsByPlayer: {
        'player-1': legacyDeck,
        'player-2': activeDeck,
      },
    }

    expect(segmentVoiceCommandsForGame('juego una isla y una remora', match)).toEqual([
      'juego una isla',
      'juego una remora',
    ])
  })

  it('splits adjacent semantic commands when ASR drops the conjunction', () => {
    expect(segmentVoiceCommandsForGame('robo bajo isla', game)).toEqual([
      'robo',
      'bajo isla',
    ])
  })

  it('recovers an adjacent command when ASR adds one character to the repeated verb', () => {
    expect(segmentVoiceCommandsForGame('juego isla juegos sol ring', game)).toEqual([
      'juego isla',
      'juego sol ring',
    ])
  })

  it('does not globally reinterpret the conversational noun juegos as a command', () => {
    expect(segmentVoiceCommandsForGame('juegos de mesa', game)).toEqual([
      'juegos de mesa',
    ])
  })

  it('does not split a command-like word when the whole card name already resolves', () => {
    const tricky = card('Bajo la Luna', 'Enchantment')
    const trickyDeck: DeckDefinition = {
      name: 'Boundary deck',
      commander: { quantity: 1, name: 'Sol Ring', card: solRing },
      mainboard: [{ quantity: 1, name: 'Bajo la Luna', card: tricky }],
    }
    const match = {
      ...game,
      deckDefinition: trickyDeck,
      deckDefinitionsByPlayer: { 'player-1': trickyDeck },
    }

    expect(segmentVoiceCommandsForGame('juego bajo la luna', match)).toEqual([
      'juego bajo la luna',
    ])
  })

})
