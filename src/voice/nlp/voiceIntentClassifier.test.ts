import { describe, expect, it } from 'vitest'
import { classifyVoiceIntent } from './voiceIntentClassifier'
import {
  VOICE_INTENT_TRAINING_EXAMPLES,
  VOICE_NLP_INTENTS,
  isVoiceNlpActionIntent,
} from './voiceIntentCorpus'

describe('voice NLP intent corpus', () => {
  it('contains training examples for every declared intent', () => {
    for (const intent of VOICE_NLP_INTENTS)
      expect(VOICE_INTENT_TRAINING_EXAMPLES[intent].length).toBeGreaterThan(4)
  })

  it('keeps NOT_ACTION out of gameplay intents', () => {
    expect(isVoiceNlpActionIntent('PLAY_CARD')).toBe(true)
    expect(isVoiceNlpActionIntent('DECLARE_ATTACKERS')).toBe(true)
    expect(isVoiceNlpActionIntent('NOT_ACTION')).toBe(false)
    expect(isVoiceNlpActionIntent('None')).toBe(false)
  })
})

describe('voice NLP intent classifier', () => {
  it.each([
    ['bajo una isla', 'PLAY_CARD'],
    ['mmm pues ahora voy a bajar una isla', 'PLAY_CARD'],
    ['lanzo counterspell', 'CAST_SPELL'],
    ['te pego con namor', 'DECLARE_ATTACKERS'],
    ['robo dos', 'DRAW'],
    ['cancela eso', 'UNDO'],
    ['bajo isla y giro sol ring', 'MULTI_ACTION'],
    ['creo que voy a bajar una isla', 'NOT_ACTION'],
    ['vas a lanzar counterspell', 'NOT_ACTION'],
  ] as const)('classifies %s as %s', async (utterance, expectedIntent) => {
    const result = await classifyVoiceIntent(utterance)
    expect(result.intent).toBe(expectedIntent)
  })
})
