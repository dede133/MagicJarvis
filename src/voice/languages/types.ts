import type { Zone } from '../../types/card'
import type { TurnStep } from '../../types/turn'

export type VoiceLanguageId = 'es' | 'ca'

export type VoiceCanonicalizationRule = {
  pattern: RegExp
  replacement: string
}

export type VoiceLanguageSafetyPatterns = {
  questionStart: RegExp
  uncertaintyStart: RegExp
  negatedAction: RegExp
  explicitPastContext: RegExp
  completedPastAction: RegExp
  recentPastAction: RegExp
}


export type VoiceLanguageV3Syntax = {
  response: RegExp
  attackWith: RegExp
  attackVoyWith: RegExp
  targetedAttack: RegExp
  targetedBlock: RegExp
  lifeDelta: RegExp
  lifeSet: RegExp
  hiddenZoneNatural: RegExp
  hiddenZoneCompact: RegExp
  counterAdd: RegExp
  counterRemove: RegExp
  resolveNamed: RegExp
  manaActivation: RegExp
}

export type VoiceLanguageV3Grammar = {
  discoursePrefixes: readonly string[]
  /** Canonical surface syntax. The semantic matcher consumes these patterns instead of embedding one language. */
  syntax: VoiceLanguageV3Syntax
  declarationPrefixes: readonly string[]
  verbs: {
    play: readonly string[]
    tap: readonly string[]
    untap: readonly string[]
    draw: readonly string[]
    discard: readonly string[]
    activate: readonly string[]
    channel: readonly string[]
    waterbend: readonly string[]
    equip: readonly string[]
    move: readonly string[]
    return: readonly string[]
    exile: readonly string[]
    attack: readonly string[]
    block: readonly string[]
  }
  turnStepPhrases: Readonly<Record<string, TurnStep>>
  advanceStepPhrases: readonly string[]
  nextTurnColloquial: ReadonlySet<string>
  nextTurnPattern: RegExp
  untapAllPhrases: readonly string[]
  moveZonePhrases: Readonly<Record<string, Zone>>
  shuffleLibraryPhrases: readonly string[]
  combatDamagePhrases: readonly string[]
  noAttackersPhrases: readonly string[]
  noBlockersPhrases: readonly string[]
  resolveTopPhrases: readonly string[]
  concedePhrases: readonly string[]
  safety: VoiceLanguageSafetyPatterns
}

/**
 * Language-specific surface forms only. Game intents, slots and execution stay
 * language agnostic and must not be duplicated in a language pack.
 */
export type VoiceLanguagePack = {
  id: VoiceLanguageId
  label: string
  textLocale: string
  speechLocale: string
  /** CA-01 may expose a selectable pack before its vocabulary lands in CA-02. */
  implementation: 'READY' | 'SCAFFOLD'
  /** Surface-language rules that collapse speech into the existing deterministic command DSL. */
  canonicalization: {
    rules: readonly VoiceCanonicalizationRule[]
  }
  /** Provider phrase hints for this language. They never authorize execution. */
  recognitionTerms: readonly string[]
  v3: VoiceLanguageV3Grammar
}
