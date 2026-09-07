import { normalizeCommandText } from '../../../commands/parser/normalizeText'
import { DEFAULT_VOICE_LANGUAGE_PACK, type VoiceLanguagePack } from '../../languages'
import { stripDiscourse } from '../grammar/macros'

export type SemanticSafetyResult =
  | { safe: true }
  | {
      safe: false
      reason: 'QUESTION' | 'UNCERTAINTY' | 'NEGATED_ACTION' | 'PAST_REFERENCE'
    }

export const evaluateSemanticSafety = (
  input: string,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): SemanticSafetyResult => {
  const safety = languagePack.v3.safety
  const hasQuestionPunctuation = /[¿?]/.test(input)
  const core = stripDiscourse(normalizeCommandText(input), languagePack)
  if (!core) return { safe: true }
  if (hasQuestionPunctuation || safety.questionStart.test(core))
    return { safe: false, reason: 'QUESTION' }
  if (safety.uncertaintyStart.test(core))
    return { safe: false, reason: 'UNCERTAINTY' }
  if (safety.negatedAction.test(core))
    return { safe: false, reason: 'NEGATED_ACTION' }
  if (
    safety.explicitPastContext.test(core) ||
    safety.completedPastAction.test(core) ||
    safety.recentPastAction.test(core)
  )
    return { safe: false, reason: 'PAST_REFERENCE' }
  return { safe: true }
}
