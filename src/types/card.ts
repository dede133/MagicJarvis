export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'

export type CardFace = {
  name: string
  manaCost?: string
  typeLine?: string
  oracleText?: string
  image?: string
  power?: string
  toughness?: string
  loyalty?: string
  colors?: ManaColor[]
  colorIndicator?: ManaColor[]
}

/** The small, stable subset of Scryfall data used by MagicJarvis. */
export type CardDefinition = {
  scryfallId: string
  /** Scryfall layout, used to distinguish transforming DFCs from modal DFCs. */
  layout?: string
  oracleId?: string
  name: string
  manaCost?: string
  cmc: number
  typeLine: string
  oracleText?: string
  colors: ManaColor[]
  colorIdentity: ManaColor[]
  power?: string
  toughness?: string
  loyalty?: string
  image?: string
  cardFaces?: CardFace[]
  /** Prepared deck metadata, never fetched during a game. */
  localizedAliases?: string[]
}

export type Zone =
  | 'library'
  | 'hand'
  | 'battlefield'
  | 'graveyard'
  | 'exile'
  | 'command'
  | 'stack'

export type CardInstance = {
  instanceId: string
  card: CardDefinition
  zone: Zone
  tapped: boolean
  counters: Record<string, number>
  isToken?: boolean
  tokenDefinitionId?: string
  /** Informational token keyword data; rules enforcement may be added later. */
  keywords?: import('../tokens/tokenTypes').KeywordAbility[]
  /** Stable identity while this card is an object on the development stack. */
  stackObjectId?: string
  /** The local tabletop model only distinguishes us from a generic opponent. */
  controller?: 'YOU' | 'OPPONENT'
  /** How this physical object's identity became known to Jarvis. */
  knownBecause?: 'DECLARED' | 'REVEALED' | 'SEARCHED' | 'MILLED' | 'CAST'
  /** Stable owner identity, when known. Legacy instances may omit it. */
  ownerId?: import('./player').PlayerId
  /** Stable current controller identity, when known. */
  controllerId?: import('./player').PlayerId
  /** Object-scoped Runtime memory (chosen type/color/etc.); cleared on zone changes. */
  runtimeValues?: Record<string, string | number | boolean>
  /** Current attachment target for Auras/Equipment in the known physical state. */
  attachedToInstanceId?: string
  /** Last known attachment target, retained across a zone change for LKI-dependent abilities. */
  lastAttachedToInstanceId?: string
  /** Synthetic stack copies are not physical cards and cease to exist after resolving. */
  isSpellCopy?: boolean
  /** Public provenance for token/spell copies; never used as card-specific logic. */
  copiedFromInstanceId?: string
  /** A declared spell target; it is data, never an inferred target. */
  declaredTargetStackObjectId?: string
  /** Turn in which this controller most recently gained control of this creature. */
  controlledSinceTurn?: number
  /** Active face for a transforming double-faced permanent. Front face is 0. */
  currentFaceIndex?: 0 | 1
  /** Phasing is a battlefield status, not a zone change. */
  phasedOut?: boolean
  /** Player who controlled this permanent when it phased out; drives normal phase-in timing. */
  phasedOutUnderPlayerId?: import('./player').PlayerId
  /** Indirect phasing follows the attached permanent rather than phasing in independently. */
  phasedOutIndirectlyWith?: string
  /** Damage is marked, never subtracted from toughness. Cleared at cleanup. */
  damageMarked?: number
  /** Transient SBA evidence, cleared with marked damage. */
  deathtouchDamageMarked?: boolean
}
