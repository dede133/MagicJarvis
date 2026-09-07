import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../engine/gameEngine'
import type { CardDefinition } from '../types/card'
import type { DeckDefinition } from '../types/deck'
import { getVoicePhraseHints, getVoiceVocabulary } from './contextualVocabulary'
import {
  MAGIC_VOICE_COMMON_TERMS,
  MAGIC_VOICE_VOCABULARY,
} from './magicVocabulary'

describe('Magic speech vocabulary', () => {
  it('contains official tabletop terms and common player slang', () => {
    expect(MAGIC_VOICE_COMMON_TERMS).toEqual(
      expect.arrayContaining([
        'campo de batalla',
        'cementerio',
        'zona de mando',
        'prioridad',
        'mantenimiento',
        'contrarrestar',
        'sacrificar',
        'adivinar',
        'toque mortal',
        'board wipe',
        'bounce',
        'blink',
        'tutor',
        'ramp',
        'mana dork',
        'topdeck',
        'commander tax',
        'mana rock',
        'combat trick',
        'fizzle',
        'swing',
        'valor de mana',
        'mareo de invocacion',
      ]),
    )
  })

  it('keeps the dictionary categorized and deduplicated after normalization', () => {
    expect(Object.keys(MAGIC_VOICE_VOCABULARY).length).toBeGreaterThan(5)
    expect(new Set(MAGIC_VOICE_COMMON_TERMS).size).toBe(
      MAGIC_VOICE_COMMON_TERMS.length,
    )
  })

  it('adds dictionary terms as low-priority phrase hints', () => {
    const state = createInitialGameState([])
    const vocabulary = getVoiceVocabulary(state)
    const hints = getVoicePhraseHints(state)

    expect(vocabulary.commonWords).toContain('stack')
    expect(vocabulary.commonWords).toContain('board wipe')
    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phrase: 'stack', boost: 1.5 }),
        expect.objectContaining({ phrase: 'board wipe', boost: 1.5 }),
      ]),
    )
  })

  it('biases the active player deck instead of the legacy local deck', () => {
    const card = (name: string): CardDefinition => ({
      scryfallId: name.toLowerCase().replaceAll(/[^a-z]/g, '-'),
      name,
      cmc: 0,
      typeLine: 'Artifact',
      colors: [],
      colorIdentity: [],
    })
    const localCard = card('Commandeer')
    const activeCard = card('Command Tower')
    const localDeck: DeckDefinition = {
      name: 'Local deck',
      commander: { quantity: 1, name: 'Commandeer', card: localCard },
      mainboard: [],
    }
    const activeDeck: DeckDefinition = {
      name: 'Active deck',
      commander: { quantity: 1, name: 'Command Tower', card: activeCard },
      mainboard: [],
    }
    const state = createInitialGameState([], localDeck)
    state.deckDefinitionsByPlayer = {
      'player-1': localDeck,
      'player-2': activeDeck,
    }
    state.activePlayerId = 'player-2'

    const vocabulary = getVoiceVocabulary(state)
    const hints = getVoicePhraseHints(state)

    expect(vocabulary.deckCards).toContain('Command Tower')
    expect(vocabulary.deckCards).not.toContain('Commandeer')
    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phrase: 'Command Tower', boost: 3 }),
      ]),
    )
  })

})
