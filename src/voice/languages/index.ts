import { CATALAN_VOICE_LANGUAGE_PACK } from './ca'
import { SPANISH_VOICE_LANGUAGE_PACK } from './es'
import type { VoiceLanguageId, VoiceLanguagePack } from './types'

export { canonicalizeVoiceLanguageInput } from './canonicalize'

export type {
  VoiceCanonicalizationRule,
  VoiceLanguageId,
  VoiceLanguagePack,
  VoiceLanguageV3Grammar,
} from './types'
export { CATALAN_VOICE_LANGUAGE_PACK } from './ca'
export { SPANISH_VOICE_LANGUAGE_PACK } from './es'

export const DEFAULT_VOICE_LANGUAGE_ID: VoiceLanguageId = 'es'
export const DEFAULT_VOICE_LANGUAGE_PACK = SPANISH_VOICE_LANGUAGE_PACK

const VOICE_LANGUAGE_PACKS: Readonly<Record<VoiceLanguageId, VoiceLanguagePack>> = {
  es: SPANISH_VOICE_LANGUAGE_PACK,
  ca: CATALAN_VOICE_LANGUAGE_PACK,
}

export const getVoiceLanguagePack = (
  languageId: VoiceLanguageId,
): VoiceLanguagePack => VOICE_LANGUAGE_PACKS[languageId]

export const VOICE_LANGUAGE_OPTIONS = (
  Object.values(VOICE_LANGUAGE_PACKS) as VoiceLanguagePack[]
).map(({ id, label, implementation }) => ({ id, label, implementation }))

/**
 * Backwards-compatible Spanish default for call sites not migrated to an
 * explicit runtime pack yet. New voice entry points should receive a pack.
 */
export const ACTIVE_VOICE_LANGUAGE_PACK = DEFAULT_VOICE_LANGUAGE_PACK
