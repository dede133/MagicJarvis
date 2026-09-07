export type VoiceSlotEvidenceKind =
  | 'CANONICAL_NAME'
  | 'LOCALIZED_NAME'
  | 'CARD_FACE'
  | 'VISUAL_LABEL'
  | 'ROLE'
  | 'TYPE'
  | 'SUBTYPE'
  | 'COMPOSITE_REFERENCE'
  | 'ORDINAL_REFERENCE'
  | 'PENDING_CHOICE'
  | 'GENERIC_ALIAS'

export type VoiceSlotAliasEvidence = {
  value: string
  kind: VoiceSlotEvidenceKind
  /**
   * Whether approximate spelling matching may use this alias. Generic public
   * roles/types remain exact/contextual by default so fuzzy search cannot turn
   * a damaged common noun into an arbitrary card choice.
   */
  fuzzy?: boolean
}

export type VoiceSlotOption = {
  id: string
  canonical: string
  aliases: readonly string[]
  /** Typed provenance for aliases. `aliases` remains for legacy/UI display. */
  aliasEvidence?: readonly VoiceSlotAliasEvidence[]
  instanceId?: string
}

export type SlotMatchMethod =
  | 'CANONICAL_EXACT'
  | 'CANONICAL_COMPACT'
  | 'ALIAS_EXACT'
  | 'ALIAS_COMPACT'
  | 'CONTEXTUAL_FRAGMENT'
  | 'FUSE'
  | 'COMPACT_EDIT'

export type SlotResolutionTrace = {
  query: string
  candidateCount: number
  method: SlotMatchMethod
  evidenceKind?: VoiceSlotEvidenceKind
  score?: number
  marginToSecond?: number
}

export type SlotResolution =
  | { status: 'NO_MATCH' }
  | {
      status: 'AMBIGUOUS'
      options: readonly VoiceSlotOption[]
      method?: SlotMatchMethod
      evidenceKind?: VoiceSlotEvidenceKind
      marginToSecond?: number
      trace?: SlotResolutionTrace
    }
  | {
      status: 'MATCHED'
      option: VoiceSlotOption
      score: number
      method: SlotMatchMethod
      evidenceKind?: VoiceSlotEvidenceKind
      /** Higher means a cleaner separation from the runner-up. */
      marginToSecond?: number
      consumedText?: string
      ignoredRemainder?: string
      trace?: SlotResolutionTrace
    }
