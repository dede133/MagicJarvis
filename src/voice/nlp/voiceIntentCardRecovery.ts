import { parseCommand } from '../../commands/parser/parseCommand'
import { normalizeCommandText } from '../../commands/parser/normalizeText'
import { resolveCardQuery } from '../../commands/resolver/cardResolver'
import type { ParsedCommand } from '../../commands/types/commandTypes'
import type { GameState } from '../../types/game'
import { normalizeSpokenCommand } from '../spokenCommandNormalizer'
import { isVoiceIntentCompatibleWithCommand } from './voiceIntentAssistance'

export type KnownCardIntentRecovery = {
  rawTranscript: string
  normalizedTranscript: string
  parsedCommand: ParsedCommand
}

const commandPrefixForIntent = (intent: string): string | undefined => {
  switch (intent) {
    case 'PLAY_CARD':
      return 'juego'
    case 'CAST_SPELL':
      return 'lanzo'
    default:
      return undefined
  }
}

const uniqueKnownCardMention = (
  transcript: string,
  game: Pick<GameState, 'deckDefinition'>,
): string | undefined => {
  if (!game.deckDefinition) return undefined

  const words = normalizeCommandText(transcript).split(' ').filter(Boolean)
  const matches = new Set<string>()
  const maxSize = Math.min(5, words.length)

  for (let size = maxSize; size >= 1; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const query = words.slice(start, start + size).join(' ')
      const resolved = resolveCardQuery(game.deckDefinition, query)
      if (resolved.status === 'resolved') matches.add(resolved.name)
    }
  }

  return matches.size === 1 ? [...matches][0] : undefined
}

/**
 * Last-resort deterministic recovery for high-confidence NLP card intents when
 * ASR inserts junk inside the command itself:
 *
 *   "balaguer juego fue una isla" + PLAY_CARD
 *      -> known deck mention: Island
 *      -> "juego Island"
 *      -> existing parser
 *
 * It only fires when exactly one deck card can be identified in the whole
 * utterance. Multiple card mentions are left to multi-command segmentation.
 */
export const recoverKnownCardCommandFromIntent = (
  transcript: string,
  intent: string,
  game: Pick<GameState, 'deckDefinition'>,
): KnownCardIntentRecovery | undefined => {
  const prefix = commandPrefixForIntent(intent)
  if (!prefix) return undefined

  const cardName = uniqueKnownCardMention(transcript, game)
  if (!cardName) return undefined

  const normalizedTranscript = normalizeSpokenCommand(`${prefix} ${cardName}`)
  const parsed = parseCommand(normalizedTranscript)
  if (
    parsed.status !== 'parsed' ||
    !isVoiceIntentCompatibleWithCommand(intent, parsed.command)
  )
    return undefined

  return {
    rawTranscript: transcript.trim(),
    normalizedTranscript,
    parsedCommand: parsed.command,
  }
}
