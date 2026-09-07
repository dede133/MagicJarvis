import { describe, expect, it } from 'vitest'
import {
  formatVoiceRoutingSummary,
  summarizeVoiceRouting,
  type VoiceRoutingTelemetry,
} from './voiceRoutingTelemetry'

describe('voice routing telemetry', () => {
  it('summarizes V3 authority and legacy fallbacks without changing execution', () => {
    const entries: VoiceRoutingTelemetry[] = [
      { source: 'V3', v3Result: 'MATCHED', family: 'PLAY_CARD' },
      { source: 'V3', v3Result: 'MATCHED', family: 'ACTIVATE_MANA' },
      {
        source: 'V2_FALLBACK',
        v3Result: 'MATCHED',
        family: 'PLAY_CARD',
        fallbackReason: 'STRUCTURED_CAST_DEFERRED',
        legacyParsed: 'CAST_SPELL',
      },
      {
        source: 'V2_FALLBACK',
        v3Result: 'NO_MATCH',
        family: 'ADD_MANA',
        fallbackReason: 'V3_NO_MATCH',
        legacyParsed: 'ADD_MANA',
      },
      {
        source: 'PENDING_DECISION',
        v3Result: 'MATCHED',
        family: 'PENDING_DECISION',
      },
      {
        source: 'REJECTED',
        v3Result: 'AMBIGUOUS',
        family: 'TAP_CARD',
      },
    ]

    const summary = summarizeVoiceRouting(entries)
    expect(summary).toEqual({
      total: 6,
      bySource: {
        V3: 2,
        V2_FALLBACK: 2,
        PENDING_DECISION: 1,
        REJECTED: 1,
      },
      v2FallbackByFamily: { PLAY_CARD: 1, ADD_MANA: 1 },
      v2FallbackByReason: {
        STRUCTURED_CAST_DEFERRED: 1,
        V3_NO_MATCH: 1,
      },
    })
    expect(formatVoiceRoutingSummary(summary)).toContain(
      'V2_FALLBACK: 2 (33.3%)',
    )
  })
})
