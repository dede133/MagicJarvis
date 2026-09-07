import type { VoiceCommandHistoryEntry } from '../voiceCommandExecution'

export const VOICE_NLP_FEEDBACK_STORAGE_KEY = 'magicjarvis.voiceNlpFeedback.v1'
export const VOICE_NLP_FEEDBACK_VERSION = 1
export const VOICE_NLP_FEEDBACK_LIMIT = 500

export type VoiceNlpFeedbackLabel = 'ACTION' | 'NOT_ACTION'

export type VoiceNlpFeedbackRecord = {
  id: string
  createdAt: string
  transcript: string
  normalizedTranscript: string
  provider: string
  speechConfidence?: number
  predictedIntent?: string
  predictedScore?: number
  nlpDecision?: string
  parsed: string
  entity?: string
  result: string
  successful: boolean
  ignored: boolean
  expectedAction: boolean
  expectedIntent: string
}

type VoiceNlpFeedbackExport = {
  schemaVersion: typeof VOICE_NLP_FEEDBACK_VERSION
  exportedAt: string
  count: number
  records: readonly VoiceNlpFeedbackRecord[]
}

const parsedIntentMap: Readonly<Record<string, string>> = {
  PLAY_CARD: 'PLAY_CARD',
  DECLARE_CARD: 'PLAY_CARD',
  CAST_SPELL: 'CAST_SPELL',
  ACTIVATE_ABILITY: 'ACTIVATE_ABILITY',
  TAP_CARD: 'TAP_CARD',
  ACTIVATE_MANA: 'TAP_CARD',
  UNTAP_CARD: 'UNTAP_CARD',
  DRAW: 'DRAW',
  DISCARD_CARD: 'DISCARD_CARD',
  GAIN_LIFE: 'GAIN_LIFE',
  LOSE_LIFE: 'LOSE_LIFE',
  SET_LIFE: 'SET_LIFE',
  DECLARE_ATTACKERS: 'DECLARE_ATTACKERS',
  DECLARE_BLOCKERS: 'DECLARE_BLOCKERS',
  DECLARE_ASSISTED_BLOCKER: 'DECLARE_BLOCKERS',
  DECLARE_DAMAGE: 'DECLARE_DAMAGE',
  NEXT_TURN: 'NEXT_TURN',
  UNDO: 'UNDO',
}

const createFeedbackId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return `voice-feedback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const expectedIntentFor = (
  entry: VoiceCommandHistoryEntry,
  label: VoiceNlpFeedbackLabel,
): string => {
  if (label === 'NOT_ACTION') return 'NOT_ACTION'
  return parsedIntentMap[entry.parsed] ?? 'ACTION_UNKNOWN'
}

export const buildVoiceNlpFeedbackRecord = (
  entry: VoiceCommandHistoryEntry,
  label: VoiceNlpFeedbackLabel,
  now = new Date(),
): VoiceNlpFeedbackRecord => ({
  id: createFeedbackId(),
  createdAt: now.toISOString(),
  transcript: entry.rawTranscript,
  normalizedTranscript: entry.normalizedTranscript,
  provider: entry.provider,
  speechConfidence: entry.confidence,
  predictedIntent: entry.nlpIntent,
  predictedScore: entry.nlpScore,
  nlpDecision: entry.nlpDecision,
  parsed: entry.parsed,
  entity: entry.entity,
  result: entry.result,
  successful: entry.successful,
  ignored: entry.ignored ?? false,
  expectedAction: label === 'ACTION',
  expectedIntent: expectedIntentFor(entry, label),
})

const storageAvailable = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

export const readVoiceNlpFeedback = (): VoiceNlpFeedbackRecord[] => {
  if (!storageAvailable()) return []
  try {
    const raw = window.localStorage.getItem(VOICE_NLP_FEEDBACK_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is VoiceNlpFeedbackRecord =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as VoiceNlpFeedbackRecord).transcript === 'string' &&
        typeof (item as VoiceNlpFeedbackRecord).expectedAction === 'boolean',
    )
  } catch {
    return []
  }
}

export const saveVoiceNlpFeedback = (
  entry: VoiceCommandHistoryEntry,
  label: VoiceNlpFeedbackLabel,
): VoiceNlpFeedbackRecord => {
  const record = buildVoiceNlpFeedbackRecord(entry, label)
  if (!storageAvailable()) return record
  const records = [...readVoiceNlpFeedback(), record].slice(
    -VOICE_NLP_FEEDBACK_LIMIT,
  )
  try {
    window.localStorage.setItem(
      VOICE_NLP_FEEDBACK_STORAGE_KEY,
      JSON.stringify(records),
    )
  } catch {
    // Feedback is diagnostic only; storage failures must never affect voice.
  }
  return record
}

export const clearVoiceNlpFeedback = (): void => {
  if (!storageAvailable()) return
  try {
    window.localStorage.removeItem(VOICE_NLP_FEEDBACK_STORAGE_KEY)
  } catch {
    // Diagnostic storage is deliberately best-effort.
  }
}

export const serializeVoiceNlpFeedback = (
  records = readVoiceNlpFeedback(),
  now = new Date(),
): string => {
  const payload: VoiceNlpFeedbackExport = {
    schemaVersion: VOICE_NLP_FEEDBACK_VERSION,
    exportedAt: now.toISOString(),
    count: records.length,
    records,
  }
  return JSON.stringify(payload, null, 2)
}
