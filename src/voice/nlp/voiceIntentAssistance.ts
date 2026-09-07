import { parseCommand } from '../../commands/parser/parseCommand'
import type { ParsedCommand } from '../../commands/types/commandTypes'
import { normalizeSpokenCommand } from '../spokenCommandNormalizer'
import { evaluateVoiceCommandGate } from '../voiceCommandGate'
import type { VoiceIntentClassification } from './voiceIntentClassifier'
import type { VoiceNlpIntent } from './voiceIntentCorpus'

export const VOICE_NLP_THRESHOLDS = {
  notActionBlock: 0.9,
  actionConflict: 0.95,
  actionRescue: 0.94,
} as const

export type VoiceNlpDecision =
  'PASS' | 'BLOCK_NOT_ACTION' | 'CONFLICT' | 'RESCUED'

const compatibleParsedTypes: Readonly<
  Partial<Record<VoiceNlpIntent, readonly ParsedCommand['type'][]>>
> = {
  PLAY_CARD: ['PLAY_CARD', 'DECLARE_CARD'],
  CAST_SPELL: ['CAST_SPELL'],
  ACTIVATE_ABILITY: ['ACTIVATE_ABILITY'],
  TAP_CARD: ['TAP_CARD', 'ACTIVATE_MANA'],
  UNTAP_CARD: ['UNTAP_CARD', 'UNTAP_ALL'],
  MOVE_CARD: ['MOVE_CARD'],
  SHUFFLE: ['DECLARE_PLAYER_SHUFFLED'],
  ADVANCE_STEP: ['ADVANCE_STEP'],
  SYNC_ZONE_COUNT: ['SET_HAND_COUNT', 'SET_LIBRARY_COUNT'],
  DRAW: ['DRAW'],
  DISCARD_CARD: ['DISCARD_CARD'],
  GAIN_LIFE: ['GAIN_LIFE'],
  LOSE_LIFE: ['LOSE_LIFE'],
  SET_LIFE: ['SET_LIFE'],
  DECLARE_ATTACKERS: [
    'DECLARE_ATTACKERS',
    'DECLARE_EXTERNAL_ATTACKER',
    'COMBAT_ACTION',
  ],
  DECLARE_BLOCKERS: [
    'DECLARE_BLOCKERS',
    'DECLARE_ASSISTED_BLOCKER',
    'COMBAT_ACTION',
  ],
  NO_BLOCKS: ['DECLARE_BLOCKERS'],
  DECLARE_DAMAGE: ['DECLARE_DAMAGE'],
  NEXT_TURN: ['NEXT_TURN'],
  UNDO: ['UNDO'],
}

export const isVoiceIntentCompatibleWithCommand = (
  intent: string,
  command: ParsedCommand,
): boolean => {
  if (intent === 'MULTI_ACTION') return true
  const compatible = compatibleParsedTypes[intent as VoiceNlpIntent]
  if (!compatible?.includes(command.type)) return false
  if (intent === 'NO_BLOCKS')
    return command.type === 'DECLARE_BLOCKERS' && command.none === true
  return true
}

const suffixes = (transcript: string): string[] => {
  const trimmed = transcript.trim()
  if (!trimmed) return []
  const starts = [0]
  for (const match of trimmed.matchAll(/\s+/g))
    starts.push((match.index ?? 0) + match[0].length)
  return starts
    .map((start) => trimmed.slice(start).trim())
    .filter((value, index, values) => value && values.indexOf(value) === index)
}

export type VoiceIntentRescue = {
  rawTranscript: string
  normalizedTranscript: string
  parsedCommand: ParsedCommand
}

/**
 * Tries progressively shorter suffixes of a natural utterance until the
 * existing deterministic parser produces the same action family predicted by
 * NLP. The Command Gate is checked at every suffix boundary: if stripping
 * fillers would cross a clear doubt/question/negation marker, rescue stops.
 *
 * Example:
 *   "mmm pues ahora voy a bajar una isla"
 *   -> "voy a bajar una isla"
 *   -> normalizeSpokenCommand -> "bajo 1 isla"
 *   -> DECLARE_CARD
 *
 * But:
 *   "mmm creo que voy a bajar una isla"
 * stops at "creo que..." and is never reduced to an executable suffix.
 */
export const rescueVoiceCommandFromIntent = (
  transcript: string,
  intent: string,
  options: { acceptsParsedCommand?: (command: ParsedCommand) => boolean } = {},
): VoiceIntentRescue | undefined => {
  if (intent === 'NOT_ACTION' || intent === 'MULTI_ACTION') return undefined

  for (const candidate of suffixes(transcript)) {
    const gate = evaluateVoiceCommandGate(candidate)
    if (gate.decision === 'IGNORE') return undefined

    const normalizedTranscript = normalizeSpokenCommand(candidate)
    const parsed = parseCommand(normalizedTranscript)
    if (
      parsed.status === 'parsed' &&
      isVoiceIntentCompatibleWithCommand(intent, parsed.command) &&
      (options.acceptsParsedCommand?.(parsed.command) ?? true)
    )
      return {
        rawTranscript: transcript.trim(),
        normalizedTranscript,
        parsedCommand: parsed.command,
      }
  }

  return undefined
}

export const shouldBlockAsNotAction = (
  classification: VoiceIntentClassification,
): boolean =>
  classification.intent === 'NOT_ACTION' &&
  classification.score >= VOICE_NLP_THRESHOLDS.notActionBlock

export const shouldTreatAsHighConfidenceAction = (
  classification: VoiceIntentClassification,
  threshold: number,
): boolean => classification.isActionIntent && classification.score >= threshold
