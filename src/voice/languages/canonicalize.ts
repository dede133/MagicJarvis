import { normalizeCommandText } from '../../commands/parser/normalizeText'
import type { VoiceLanguagePack } from './types'

/**
 * Converts one supported surface language into the stable deterministic command
 * language already consumed by V2/V3. This is intentionally a lexical layer:
 * card identities, GameState and semantic intents are never translated here.
 */
export const canonicalizeVoiceLanguageInput = (
  input: string,
  languagePack: VoiceLanguagePack,
): string => {
  let current = normalizeCommandText(input)
    .replace(/[’‘`´]/g, "'")
    .replace(/·/g, '')
  if (!current) return current

  for (const rule of languagePack.canonicalization.rules)
    current = current.replace(rule.pattern, rule.replacement)

  return normalizeCommandText(current)
}
