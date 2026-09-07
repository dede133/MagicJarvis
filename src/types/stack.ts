export type StackObjectKind =
  'SPELL' | 'TRIGGERED_ABILITY' | 'ACTIVATED_ABILITY'

/** Ordered separately from cards because abilities have no CardInstance in a zone. */
export type StackObject = {
  stackObjectId: string
  kind: StackObjectKind
  controller: 'YOU' | 'OPPONENT'
  controllerId?: import('./player').PlayerId
  sourceInstanceId: string
  spellInstanceId?: string
  pendingAbilityId?: string
  /** Public provenance when this stack object is a copy of another spell. */
  copiedFromStackObjectId?: string
  targets: string[]
  /** Target legality snapshots captured while declaring the stack object. */
  declaredTargets?: import('../abilities/types/abilityTypes').DeclaredTarget[]
  /** Values chosen while casting, e.g. X. Public stack information. */
  variables?: Record<string, string | number | boolean>
  order: number
}
