import { describe, expect, it } from 'vitest'
import type { ParsedCommand } from '../../commands/types/commandTypes'
import {
  isVoiceIntentCompatibleWithCommand,
  rescueVoiceCommandFromIntent,
  shouldBlockAsNotAction,
} from './voiceIntentAssistance'

describe('voiceIntentAssistance', () => {
  it('rescues a natural PLAY_CARD utterance through the existing parser', () => {
    expect(
      rescueVoiceCommandFromIntent(
        'mmm pues ahora voy a bajar una isla',
        'PLAY_CARD',
      ),
    ).toMatchObject({
      normalizedTranscript: 'bajo 1 isla',
      parsedCommand: { type: 'DECLARE_CARD', cardQuery: 'isla' },
    })
  })

  it('rescues an attack after harmless conversational fillers', () => {
    expect(
      rescueVoiceCommandFromIntent(
        'bueno pues nada te pego con namor the sub-mariner',
        'DECLARE_ATTACKERS',
      ),
    ).toMatchObject({
      parsedCommand: {
        type: 'DECLARE_ATTACKERS',
        attackerQueries: ['namor the sub-mariner'],
      },
    })
  })

  it('does not strip through a clear uncertainty marker', () => {
    expect(
      rescueVoiceCommandFromIntent(
        'mmm creo que voy a bajar una isla',
        'PLAY_CARD',
      ),
    ).toBeUndefined()
  })

  it('requires the parser result to agree with the NLP action family', () => {
    expect(
      rescueVoiceCommandFromIntent('bueno pues robo dos', 'PLAY_CARD'),
    ).toBeUndefined()
  })


  it('can reject an early parseable suffix and keep looking for a valid one', () => {
    expect(
      rescueVoiceCommandFromIntent(
        'ruido juego basura juego isla',
        'PLAY_CARD',
        {
          acceptsParsedCommand: (command) =>
            command.type === 'DECLARE_CARD' && command.cardQuery === 'isla',
        },
      ),
    ).toMatchObject({
      normalizedTranscript: 'juego isla',
      parsedCommand: { type: 'DECLARE_CARD', cardQuery: 'isla' },
    })
  })

  it('treats DECLARE_CARD as compatible with the PLAY_CARD NLP intent', () => {
    const command: ParsedCommand = { type: 'DECLARE_CARD', cardQuery: 'Island' }
    expect(isVoiceIntentCompatibleWithCommand('PLAY_CARD', command)).toBe(true)
    expect(isVoiceIntentCompatibleWithCommand('CAST_SPELL', command)).toBe(
      false,
    )
  })

  it('only blocks NOT_ACTION above the conservative threshold', () => {
    expect(
      shouldBlockAsNotAction({
        transcript: 'creo que robo',
        intent: 'NOT_ACTION',
        score: 0.95,
        isActionIntent: false,
        alternatives: [],
      }),
    ).toBe(true)
    expect(
      shouldBlockAsNotAction({
        transcript: 'creo que robo',
        intent: 'NOT_ACTION',
        score: 0.7,
        isActionIntent: false,
        alternatives: [],
      }),
    ).toBe(false)
  })
})
