import { describe, expect, it } from 'vitest'
import type { VoiceCommandHistoryEntry } from '../voiceCommandExecution'
import {
  buildVoiceNlpFeedbackRecord,
  serializeVoiceNlpFeedback,
} from './voiceNlpFeedback'

const entry = (
  overrides: Partial<VoiceCommandHistoryEntry> = {},
): VoiceCommandHistoryEntry => ({
  source: 'VOICE',
  rawTranscript: 'mmm pues ahora bajo isla',
  normalizedTranscript: 'bajo isla',
  provider: 'browser',
  parsed: 'DECLARE_CARD',
  entity: 'isla',
  result: '✓ Jugar tierra Island',
  successful: true,
  durationMs: 2,
  nlpIntent: 'PLAY_CARD',
  nlpScore: 0.97,
  nlpDecision: 'RESCUED',
  ...overrides,
})

describe('voice NLP feedback', () => {
  it('labels an action using the deterministic parsed command when available', () => {
    const record = buildVoiceNlpFeedbackRecord(
      entry(),
      'ACTION',
      new Date('2026-08-17T00:00:00.000Z'),
    )

    expect(record.expectedAction).toBe(true)
    expect(record.expectedIntent).toBe('PLAY_CARD')
    expect(record.predictedIntent).toBe('PLAY_CARD')
    expect(record.predictedScore).toBe(0.97)
  })

  it('can mark a predicted gameplay intent as conversation', () => {
    const record = buildVoiceNlpFeedbackRecord(
      entry({ successful: false, ignored: true }),
      'NOT_ACTION',
    )

    expect(record.expectedAction).toBe(false)
    expect(record.expectedIntent).toBe('NOT_ACTION')
  })

  it('keeps action feedback useful when the parser could not identify an intent', () => {
    const record = buildVoiceNlpFeedbackRecord(
      entry({ parsed: '—', nlpIntent: 'NOT_ACTION' }),
      'ACTION',
    )

    expect(record.expectedIntent).toBe('ACTION_UNKNOWN')
  })

  it('exports a versioned JSON payload suitable for later corpus calibration', () => {
    const record = buildVoiceNlpFeedbackRecord(entry(), 'ACTION')
    const payload = JSON.parse(
      serializeVoiceNlpFeedback(
        [record],
        new Date('2026-08-17T00:10:00.000Z'),
      ),
    ) as { schemaVersion: number; count: number; records: unknown[] }

    expect(payload.schemaVersion).toBe(1)
    expect(payload.count).toBe(1)
    expect(payload.records).toHaveLength(1)
  })
})
