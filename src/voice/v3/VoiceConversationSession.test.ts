import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { DeckDefinition } from '../../types/deck'
import { VoiceConversationSession } from './VoiceConversationSession'
import { matchSemanticVoiceCommand } from './matcher/semanticMatcher'

const card = (name: string, typeLine = 'Creature'): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(/[^a-z]/g, '-'),
  name,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})

const commander = card('Yoshimaru, Ever Faithful', 'Legendary Creature — Dog')
const eiganjo = card('Eiganjo, Seat of the Empire', 'Legendary Land')
const island = card('Island', 'Basic Land — Island')
const deck: DeckDefinition = {
  name: 'Conversation session',
  commander: { quantity: 1, name: commander.name, card: commander },
  mainboard: [
    { quantity: 1, name: eiganjo.name, card: eiganjo },
    { quantity: 10, name: island.name, card: island },
  ],
}

const state = () => ({ ...createInitialGameState([]), deckDefinition: deck })

const permanent = (id: string, definition: CardDefinition): CardInstance => ({
  instanceId: id,
  card: definition,
  zone: 'battlefield',
  tapped: false,
  counters: {},
})

describe('VoiceConversationSession', () => {
  it('fills a missing entity from the next Web Speech final', () => {
    const now = 1_000
    const game = state()
    const session = new VoiceConversationSession(5_000, () => now)
    const incomplete = matchSemanticVoiceCommand('juego', game)
    expect(incomplete).toMatchObject({
      status: 'INCOMPLETE',
      intent: 'PLAY_CARD',
    })
    if (incomplete.status !== 'INCOMPLETE')
      throw new Error('fixture must be incomplete')

    session.rememberIncomplete(incomplete, game)
    const resumed = session.tryResume('seat of the empire', game)
    expect(resumed).toMatchObject({
      transcript: 'juego seat of the empire',
      match: {
        status: 'MATCHED',
        command: {
          intent: 'PLAY_CARD',
          slots: { card: 'Eiganjo, Seat of the Empire' },
        },
      },
    })

    // Successful completion consumes the pending slot.
    expect(session.tryResume('island', game)).toBeUndefined()
  })

  it('keeps harmless conversation from consuming the pending slot', () => {
    const game = state()
    const session = new VoiceConversationSession()
    const incomplete = matchSemanticVoiceCommand('juego', game)
    if (incomplete.status !== 'INCOMPLETE')
      throw new Error('fixture must be incomplete')
    session.rememberIncomplete(incomplete, game)

    expect(session.tryResume('bueno', game)).toBeUndefined()
    expect(session.tryResume('island', game)).toMatchObject({
      match: { status: 'MATCHED', command: { intent: 'PLAY_CARD' } },
    })
  })

  it('continues an ambiguous entity with an ordinal clarification', () => {
    const game = {
      ...createInitialGameState([
        permanent('island-1', island),
        permanent('island-2', island),
      ]),
      deckDefinition: deck,
    }
    const session = new VoiceConversationSession()
    const ambiguous = matchSemanticVoiceCommand('giro isla', game)
    expect(ambiguous).toMatchObject({ status: 'AMBIGUOUS' })
    if (ambiguous.status !== 'AMBIGUOUS')
      throw new Error('fixture must be ambiguous')

    session.rememberAmbiguous(ambiguous, game)
    expect(session.tryResume('la segunda', game)).toMatchObject({
      match: {
        status: 'MATCHED',
        command: {
          intent: 'TAP_CARD',
          slots: { card: 'Island', cardInstanceId: 'island-2' },
        },
      },
    })
  })

  it('invalidates an ambiguity when relevant GameState changes', () => {
    const game = {
      ...createInitialGameState([
        permanent('island-1', island),
        permanent('island-2', island),
      ]),
      deckDefinition: deck,
    }
    const session = new VoiceConversationSession()
    const ambiguous = matchSemanticVoiceCommand('giro isla', game)
    if (ambiguous.status !== 'AMBIGUOUS')
      throw new Error('fixture must be ambiguous')
    session.rememberAmbiguous(ambiguous, game)

    game.cards[0].tapped = true
    expect(session.tryResume('la segunda', game)).toBeUndefined()
  })

  it('drops pending context on a new explicit command, turn change or timeout', () => {
    let now = 1_000
    const game = state()
    const session = new VoiceConversationSession(500, () => now)
    const incomplete = matchSemanticVoiceCommand('juego', game)
    if (incomplete.status !== 'INCOMPLETE')
      throw new Error('fixture must be incomplete')

    session.rememberIncomplete(incomplete, game)
    expect(session.tryResume('paso turno', game)).toBeUndefined()
    expect(session.tryResume('island', game)).toBeUndefined()

    session.rememberIncomplete(incomplete, game)
    now += 600
    expect(session.tryResume('island', game)).toBeUndefined()

    session.rememberIncomplete(incomplete, game)
    game.turn += 1
    expect(session.tryResume('island', game)).toBeUndefined()
  })
})
