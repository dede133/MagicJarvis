import { describe, expect, it } from 'vitest'
import type { CardDefinition } from '../../types/card'
import type { DeckDefinition } from '../../types/deck'
import { recoverKnownCardCommandFromIntent } from './voiceIntentCardRecovery'

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
const deck: DeckDefinition = {
  name: 'Recovery test',
  commander: { quantity: 1, name: 'Mystic Remora', card: remora },
  mainboard: [{ quantity: 20, name: 'Island', card: island }],
}

const game = { deckDefinition: deck }

describe('recoverKnownCardCommandFromIntent', () => {
  it('recovers a unique known card when ASR inserts junk inside a PLAY_CARD utterance', () => {
    expect(
      recoverKnownCardCommandFromIntent(
        'balaguer juego fue una isla',
        'PLAY_CARD',
        game,
      ),
    ).toMatchObject({
      normalizedTranscript: 'juego island',
      parsedCommand: { type: 'DECLARE_CARD', cardQuery: 'island' },
    })
  })

  it('does not collapse a phrase containing two different known cards', () => {
    expect(
      recoverKnownCardCommandFromIntent(
        'juego una isla y una remora',
        'PLAY_CARD',
        game,
      ),
    ).toBeUndefined()
  })
})
