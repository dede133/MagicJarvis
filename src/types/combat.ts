export type CombatPlayerRef = 'local' | 'opponent'

export type DefendingTarget = {
  kind: 'PLAYER' | 'PLANESWALKER' | 'BATTLE'
  id: string
  playerId?: import('./player').PlayerId
}

export type ExternalCombatParticipant = {
  temporaryId: string
  controller: 'YOU' | 'OPPONENT'
  power?: number
  toughness?: number
  damageMarked: number
  keywords: string[]
}

export type CombatAttacker = {
  attackerInstanceId: string
  defendingTarget: DefendingTarget
  blockedBy: string[]
  externalBlockedBy: string[]
}

export type CombatBlocker = {
  blockerInstanceId: string
  blocking: string[]
}

export type CombatDamageStep =
  'PENDING' | 'FIRST_STRIKE' | 'NORMAL' | 'COMPLETE'

export type CombatState = {
  combatId: string
  active: boolean
  attackingPlayerId: CombatPlayerRef
  attackingPlayerStableId?: import('./player').PlayerId
  attackers: CombatAttacker[]
  blockers: CombatBlocker[]
  /** Distinguishes an empty declaration from a declaration that has not happened yet. */
  attackersDeclared?: boolean
  blockersDeclared?: boolean
  externalParticipants: ExternalCombatParticipant[]
  damageStep: CombatDamageStep
  firstStrikeDamageStepRequired: boolean
  /** Snapshot of creatures that had first/double strike as the first combat-damage step began. */
  firstStrikeParticipantIds?: string[]
}

export const emptyCombatState = (): CombatState => ({
  combatId: '',
  active: false,
  attackingPlayerId: 'local',
  attackers: [],
  blockers: [],
  attackersDeclared: false,
  blockersDeclared: false,
  externalParticipants: [],
  damageStep: 'PENDING',
  firstStrikeDamageStepRequired: false,
  firstStrikeParticipantIds: [],
})

export type DamageTarget =
  | {
      kind: 'PLAYER'
      player: CombatPlayerRef
      playerId?: import('./player').PlayerId
    }
  | { kind: 'CREATURE'; instanceId: string }
  | { kind: 'EXTERNAL_CREATURE'; temporaryId: string }
  | { kind: 'PLANESWALKER'; instanceId: string }
  | { kind: 'BATTLE'; instanceId: string }

export type DamageRecord = {
  sourceInstanceId?: string
  target: DamageTarget
  amount: number
  damageKind: 'COMBAT' | 'NONCOMBAT'
  hasDeathtouch: boolean
  eventGroupId?: string
}
