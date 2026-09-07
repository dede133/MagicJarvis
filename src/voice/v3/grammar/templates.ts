import { DEFAULT_VOICE_LANGUAGE_PACK, type VoiceLanguagePack } from '../../languages'

const grammar = DEFAULT_VOICE_LANGUAGE_PACK.v3

export const TURN_STEP_PHRASES = grammar.turnStepPhrases

/** Covers conjugation families instead of growing one phrase at a time. */
export const matchesNextTurnPhrase = (
  input: string,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): boolean =>
  languagePack.v3.nextTurnColloquial.has(input) ||
  languagePack.v3.nextTurnPattern.test(input)

export const ADVANCE_STEP_PHRASES = grammar.advanceStepPhrases
export const UNTAP_ALL_PHRASES = grammar.untapAllPhrases
export const MOVE_ZONE_PHRASES = grammar.moveZonePhrases
export const SHUFFLE_LIBRARY_PHRASES = grammar.shuffleLibraryPhrases
export const COMBAT_DAMAGE_PHRASES = grammar.combatDamagePhrases
export const NO_ATTACKERS_PHRASES = grammar.noAttackersPhrases
export const NO_BLOCKERS_PHRASES = grammar.noBlockersPhrases
export const RESOLVE_TOP_PHRASES = grammar.resolveTopPhrases
export const CONCEDE_PHRASES = grammar.concedePhrases
