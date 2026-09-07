import {
  modifiedPowerToughness,
  deriveActiveStaticEffects,
  hasEffectiveKeyword,
  effectiveTypeLine,
  isProtectedFromSource,
  combatRestrictionFor,
  matchesStaticFilter,
  attackTaxForDeclaration,
  blockTaxForDeclaration,
} from '../../abilities/engine/staticEffects'
import type { GameAction } from '../../actions/gameActions'
import type { PendingDecision } from '../../abilities/types/abilityTypes'
import type { CardInstance } from '../../types/card'
import type {
  CombatAttacker,
  DamageRecord,
  DamageTarget,
  DefendingTarget,
} from '../../types/combat'
import type { GameState } from '../../types/game'
import { isPresentPermanent } from '../phasing/phasingRules'
import { effectiveCardDefinition } from '../copy/copyCharacteristics'
import {
  activePlayerIdOf,
  localPlayerIdOf,
  opponentPlayerIds,
} from '../players/playerState'

export type CombatValidation =
  { legal: true } | { legal: false; code: string; message: string }

const inCombatStep = (
  state: GameState,
  step: 'DECLARE_ATTACKERS' | 'DECLARE_BLOCKERS' | 'COMBAT_DAMAGE',
) => state.turnState.step === step && state.combatState.active

const defendingDamageTarget = (attacker: CombatAttacker): DamageTarget => {
  if (attacker.defendingTarget.kind === 'PLANESWALKER')
    return { kind: 'PLANESWALKER', instanceId: attacker.defendingTarget.id }
  if (attacker.defendingTarget.kind === 'BATTLE')
    return { kind: 'BATTLE', instanceId: attacker.defendingTarget.id }
  return {
    kind: 'PLAYER',
    player: attacker.defendingTarget.id === 'local' ? 'local' : 'opponent',
    ...(attacker.defendingTarget.playerId
      ? { playerId: attacker.defendingTarget.playerId }
      : {}),
  }
}

const defendingPlayerIdFor = (
  state: GameState,
  attacker: CombatAttacker,
  attackerControllerId: string,
): string | undefined => {
  if (attacker.defendingTarget.kind === 'PLAYER')
    return (
      attacker.defendingTarget.playerId ??
      opponentPlayerIds(state, attackerControllerId)[0]
    )
  if (attacker.defendingTarget.kind === 'PLANESWALKER') {
    const planeswalker = state.cards.find(
      (card) => card.instanceId === attacker.defendingTarget.id,
    )
    if (!planeswalker || !isPresentPermanent(planeswalker)) return undefined
    return (
      planeswalker.controllerId ??
      (planeswalker.controller === 'OPPONENT'
        ? opponentPlayerIds(state, attackerControllerId)[0]
        : localPlayerIdOf(state))
    )
  }
  return undefined
}

export const canAttack = (
  state: GameState,
  creature: CardInstance,
): CombatValidation => {
  if (!inCombatStep(state, 'DECLARE_ATTACKERS'))
    return {
      legal: false,
      code: 'INVALID_TIMING',
      message: 'No estás declarando atacantes.',
    }
  if (
    !/\bcreature\b/i.test(effectiveTypeLine(state, creature)) ||
    !isPresentPermanent(creature)
  )
    return {
      legal: false,
      code: 'INVALID_ATTACKER',
      message: 'El atacante debe ser una criatura en el campo de batalla.',
    }
  const activePlayerId = activePlayerIdOf(state)
  const creatureControllerId =
    creature.controllerId ??
    (creature.controller === 'OPPONENT'
      ? opponentPlayerIds(state, localPlayerIdOf(state))[0]
      : localPlayerIdOf(state))
  if (creatureControllerId !== activePlayerId)
    return {
      legal: false,
      code: 'INVALID_ATTACKER',
      message: 'La criatura no está controlada por el jugador activo.',
    }
  if (creature.tapped)
    return {
      legal: false,
      code: 'ALREADY_TAPPED',
      message: 'La criatura está girada.',
    }
  if (
    combatRestrictionFor(state, creature).cannotAttack ||
    hasEffectiveKeyword(state, creature, 'DEFENDER')
  )
    return {
      legal: false,
      code: 'CANNOT_ATTACK',
      message: hasEffectiveKeyword(state, creature, 'DEFENDER')
        ? 'Una criatura con defender no puede atacar.'
        : 'Un efecto impide que esta criatura ataque.',
    }
  if (
    state.combatState.attackers.some(
      (item) => item.attackerInstanceId === creature.instanceId,
    )
  )
    return {
      legal: false,
      code: 'INVALID_ATTACKER',
      message: 'La criatura ya está atacando.',
    }
  if (
    creature.controlledSinceTurn === state.turn &&
    !hasEffectiveKeyword(state, creature, 'HASTE')
  )
    return {
      legal: false,
      code: 'SUMMONING_SICKNESS',
      message: 'La criatura tiene mareo de invocación.',
    }
  return { legal: true }
}

export const validateAttackRequirements = (
  state: GameState,
  attackers: Array<{
    attackerInstanceId: string
    defendingTarget: DefendingTarget
  }>,
): CombatValidation => {
  const declared = new Map(
    attackers.map((attacker) => [attacker.attackerInstanceId, attacker]),
  )
  for (const attacker of attackers) {
    const source = state.cards.find(
      (card) => card.instanceId === attacker.attackerInstanceId,
    )
    if (!source) continue
    const attackerControllerId = source.controllerId ?? activePlayerIdOf(state)
    if (attacker.defendingTarget.kind === 'PLANESWALKER') {
      const planeswalker = state.cards.find(
        (card) => card.instanceId === attacker.defendingTarget.id,
      )
      if (
        !planeswalker ||
        !isPresentPermanent(planeswalker) ||
        !/\bplaneswalker\b/i.test(effectiveTypeLine(state, planeswalker)) ||
        (planeswalker.controllerId ??
          (planeswalker.controller === 'OPPONENT'
            ? opponentPlayerIds(state, attackerControllerId)[0]
            : localPlayerIdOf(state))) === attackerControllerId
      )
        return {
          legal: false,
          code: 'INVALID_DEFENDING_TARGET',
          message: 'El planeswalker defensor debe existir y estar controlado por un oponente.',
        }
    } else if (attacker.defendingTarget.kind === 'BATTLE') {
      return {
        legal: false,
        code: 'UNSUPPORTED_DEFENDING_TARGET',
        message: 'Los Battles todavía no están implementados.',
      }
    }
  }
  for (const requirement of state.attackRequirements ?? []) {
    if (requirement.turn !== state.turn) continue
    const creature = state.cards.find(
      (card) => card.instanceId === requirement.attackerInstanceId,
    )
    if (!creature || !canAttack(state, creature).legal) continue
    const attacker = declared.get(requirement.attackerInstanceId)
    if (!attacker) {
      const requiredAttack = [{
        attackerInstanceId: creature.instanceId,
        defendingTarget: {
          kind: 'PLAYER' as const,
          id: 'opponent',
          playerId: requirement.defendingPlayerId,
        },
      }]
      // "If able" never forces a player to pay an optional cost to attack.
      if (attackTaxForDeclaration(state, creature.controllerId ?? activePlayerIdOf(state), requiredAttack) > 0)
        continue
      return {
        legal: false,
        code: 'ATTACK_REQUIREMENT_NOT_MET',
        message: `${creature.card.name} debe atacar este turno si puede.`,
      }
    }
    if (
      attacker.defendingTarget.kind !== 'PLAYER' ||
      attacker.defendingTarget.playerId !== requirement.defendingPlayerId
    )
      return {
        legal: false,
        code: 'ATTACK_REQUIREMENT_NOT_MET',
        message: `${creature.card.name} debe atacar al oponente indicado por su efecto.`,
      }
  }
  return { legal: true }
}

export const validateAttackDeclaration = (
  state: GameState,
  attackers: Array<{
    attackerInstanceId: string
    defendingTarget: DefendingTarget
  }>,
): CombatValidation => {
  if (!inCombatStep(state, 'DECLARE_ATTACKERS'))
    return {
      legal: false,
      code: 'INVALID_TIMING',
      message: 'No estás declarando atacantes.',
    }
  const ids = new Set(attackers.map((attacker) => attacker.attackerInstanceId))
  if (ids.size !== attackers.length)
    return {
      legal: false,
      code: 'INVALID_ATTACKER',
      message: 'Una criatura solo puede declararse atacante una vez.',
    }
  const validationState: GameState = {
    ...state,
    combatState: { ...state.combatState, attackers: [] },
  }
  for (const attacker of attackers) {
    const creature = state.cards.find(
      (card) => card.instanceId === attacker.attackerInstanceId,
    )
    if (!creature)
      return {
        legal: false,
        code: 'INVALID_ATTACKER',
        message: 'Uno de los atacantes ya no existe.',
      }
    const legality = canAttack(validationState, creature)
    if (!legality.legal) return legality
  }
  return validateAttackRequirements(validationState, attackers)
}

export const canBlock = (
  state: GameState,
  attacker: CombatAttacker,
  blocker: CardInstance,
): CombatValidation => {
  if (!inCombatStep(state, 'DECLARE_BLOCKERS'))
    return {
      legal: false,
      code: 'INVALID_TIMING',
      message: 'No estás declarando bloqueadores.',
    }
  if (
    !/\bcreature\b/i.test(effectiveTypeLine(state, blocker)) ||
    !isPresentPermanent(blocker) ||
    blocker.tapped
  )
    return {
      legal: false,
      code: 'INVALID_BLOCKER',
      message:
        'El bloqueador debe ser una criatura enderezada en el campo de batalla.',
    }
  if (combatRestrictionFor(state, blocker).cannotBlock)
    return {
      legal: false,
      code: 'CANNOT_BLOCK',
      message: 'Un efecto impide que esta criatura bloquee.',
    }
  const attacking = state.cards.find(
    (item) => item.instanceId === attacker.attackerInstanceId,
  )
  const attackerControllerId =
    attacking?.controllerId ?? activePlayerIdOf(state)
  const defendingPlayerId = defendingPlayerIdFor(
    state,
    attacker,
    attackerControllerId,
  )
  const blockerControllerId =
    blocker.controllerId ??
    (blocker.controller === 'OPPONENT'
      ? opponentPlayerIds(state, attackerControllerId)[0]
      : localPlayerIdOf(state))
  if (defendingPlayerId && blockerControllerId !== defendingPlayerId)
    return {
      legal: false,
      code: 'INVALID_BLOCKER',
      message: 'El bloqueador debe ser controlado por el jugador defensor.',
    }
  const activeStatics = deriveActiveStaticEffects(state)
  const attackingMatches = (
    filter: import('../../abilities/types/abilityTypes').StaticObjectFilter,
    sourceInstanceId?: string,
  ): boolean => {
    if (!attacking) return false
    const source = sourceInstanceId
      ? state.cards.find((card) => card.instanceId === sourceInstanceId)
      : undefined
    return matchesStaticFilter(
      attacking,
      filter,
      sourceInstanceId,
      source,
      state,
    )
  }
  const temporary = (state.temporaryBlockingRestrictions ?? []).some(
    (entry) =>
      entry.targetInstanceId === attacker.attackerInstanceId &&
      entry.restriction.type === 'CANNOT_BE_BLOCKED',
  )
  const cannot = (activeStatics.blockingRestrictions ?? []).some(
    (restriction) =>
      restriction.type === 'CANNOT_BE_BLOCKED' &&
      attackingMatches(restriction.filter, restriction.sourceInstanceId),
  )
  if (temporary || cannot)
    return {
      legal: false,
      code: 'CANNOT_BE_BLOCKED',
      message: 'Esta criatura no puede ser bloqueada.',
    }
  if (
    state.combatState.blockers.some(
      (item) => item.blockerInstanceId === blocker.instanceId,
    )
  )
    return {
      legal: false,
      code: 'INVALID_BLOCKER',
      message: 'Una criatura solo puede bloquear a un atacante.',
    }
  if (attacking && isProtectedFromSource(state, attacking, blocker))
    return {
      legal: false,
      code: 'INVALID_BLOCKER',
      message: 'La protección impide que esa criatura pueda bloquearla.',
    }
  if (
    attacking &&
    hasEffectiveKeyword(state, attacking, 'FLYING') &&
    !hasEffectiveKeyword(state, blocker, 'FLYING') &&
    !hasEffectiveKeyword(state, blocker, 'REACH')
  )
    return {
      legal: false,
      code: 'INVALID_BLOCKER',
      message: 'Solo flying o reach pueden bloquear una criatura con flying.',
    }
  const lowPowerBlockRestricted = (
    activeStatics.blockingRestrictions ?? []
  ).some(
    (restriction) =>
      restriction.type === 'CANNOT_BE_BLOCKED_BY_POWER_AT_MOST' &&
      attackingMatches(restriction.filter, restriction.sourceInstanceId) &&
      (modifiedPowerToughness(blocker, activeStatics)?.power ??
        Number.POSITIVE_INFINITY) <= restriction.power,
  )
  if (lowPowerBlockRestricted)
    return {
      legal: false,
      code: 'CANNOT_BE_BLOCKED',
      message: 'La potencia de esta bloqueadora es demasiado baja.',
    }
  const landwalk = (activeStatics.blockingRestrictions ?? []).some(
    (restriction) =>
      restriction.type === 'LANDWALK' &&
      attackingMatches(restriction.filter, restriction.sourceInstanceId) &&
      state.cards.some(
        (card) =>
          isPresentPermanent(card) &&
          (!defendingPlayerId ||
            (card.controllerId ??
              (card.controller === 'OPPONENT'
                ? opponentPlayerIds(state, attackerControllerId)[0]
                : localPlayerIdOf(state))) === defendingPlayerId) &&
          /\bland\b/i.test(effectiveTypeLine(state, card)) &&
          effectiveTypeLine(state, card)
            .toLocaleLowerCase()
            .includes(restriction.landSubtype.toLocaleLowerCase()),
      ),
  )
  if (landwalk)
    return {
      legal: false,
      code: 'CANNOT_BE_BLOCKED',
      message: 'La criatura tiene landwalk relevante.',
    }
  return { legal: true }
}

export const validateBlockDeclaration = (
  state: GameState,
  blockers: import('../../types/combat').CombatBlocker[],
): CombatValidation => {
  if (!inCombatStep(state, 'DECLARE_BLOCKERS'))
    return {
      legal: false,
      code: 'INVALID_TIMING',
      message: 'No estás declarando bloqueadores.',
    }
  const blockerIds = new Set(blockers.map((blocker) => blocker.blockerInstanceId))
  if (blockerIds.size !== blockers.length)
    return {
      legal: false,
      code: 'INVALID_BLOCKER',
      message: 'Una criatura solo puede declararse bloqueadora una vez.',
    }
  const attackers = new Map(
    state.combatState.attackers.map((attacker) => [
      attacker.attackerInstanceId,
      attacker,
    ]),
  )
  const validationState: GameState = {
    ...state,
    combatState: { ...state.combatState, blockers: [] },
  }
  const blockersPerAttacker = new Map<string, number>()
  for (const blocker of blockers) {
    if (blocker.blocking.length !== 1)
      return {
        legal: false,
        code: 'INVALID_BLOCKER',
        message:
          'Este núcleo todavía permite que cada criatura bloquee a un solo atacante.',
      }
    const blockingCard = state.cards.find(
      (card) => card.instanceId === blocker.blockerInstanceId,
    )
    if (!blockingCard)
      return {
        legal: false,
        code: 'INVALID_BLOCKER',
        message: 'Uno de los bloqueadores ya no existe.',
      }
    const attackerId = blocker.blocking[0]
    const attacker = attackers.get(attackerId)
    if (!attacker)
      return {
        legal: false,
        code: 'INVALID_ATTACKER',
        message: 'Solo se puede bloquear una criatura que esté atacando.',
      }
    const legality = canBlock(validationState, attacker, blockingCard)
    if (!legality.legal) return legality
    blockersPerAttacker.set(
      attackerId,
      (blockersPerAttacker.get(attackerId) ?? 0) + 1,
    )
  }
  for (const [attackerId, count] of blockersPerAttacker) {
    if (count !== 1) continue
    const attacker = state.cards.find((card) => card.instanceId === attackerId)
    if (attacker && hasEffectiveKeyword(state, attacker, 'MENACE'))
      return {
        legal: false,
        code: 'INVALID_BLOCKER',
        message: 'Menace requiere al menos dos criaturas para bloquear.',
      }
  }
  return validateBlockRequirements(validationState, blockers)
}

export const validateBlockRequirements = (
  state: GameState,
  blockers: import('../../types/combat').CombatBlocker[],
): CombatValidation => {
  const requirements = (state.blockRequirements ?? []).filter(
    (requirement) =>
      requirement.turn === state.turn &&
      (!requirement.combatId || requirement.combatId === state.combatState.combatId),
  )
  if (!requirements.length) return { legal: true }

  const declaredByBlocker = new Map(
    blockers.map((blocker) => [blocker.blockerInstanceId, blocker]),
  )
  const attackingById = new Map(
    state.combatState.attackers.map((attacker) => [attacker.attackerInstanceId, attacker]),
  )

  for (const requirement of requirements) {
    const blocker = state.cards.find(
      (card) => card.instanceId === requirement.blockerInstanceId,
    )
    if (!blocker) continue
    const candidates = requirement.attackerInstanceId
      ? [attackingById.get(requirement.attackerInstanceId)].filter(Boolean)
      : [...attackingById.values()]
    const legalCandidates = candidates.filter(
      (attacker): attacker is CombatAttacker =>
        Boolean(attacker && canBlock({ ...state, combatState: { ...state.combatState, blockers: [] } }, attacker, blocker).legal),
    )
    if (!legalCandidates.length) continue

    const declaration = declaredByBlocker.get(blocker.instanceId)
    const satisfies = declaration?.blocking.some((attackerId) =>
      legalCandidates.some((attacker) => attacker.attackerInstanceId === attackerId),
    )
    if (satisfies) continue

    const blockingPlayerId = blocker.controllerId ?? opponentPlayerIds(state, activePlayerIdOf(state))[0]
    const cheapestRequiredDeclaration = [{
      blockerInstanceId: blocker.instanceId,
      blocking: [legalCandidates[0].attackerInstanceId],
    }]
    // As with attack requirements, a player is never forced to pay an optional
    // cost merely to satisfy "blocks if able".
    if (blockTaxForDeclaration(state, blockingPlayerId, cheapestRequiredDeclaration) > 0)
      continue

    return {
      legal: false,
      code: 'BLOCK_REQUIREMENT_NOT_MET',
      message: `${blocker.card.name} debe bloquear este combate si puede.`,
    }
  }
  return { legal: true }
}

export const effectivePower = (
  state: GameState,
  creature: CardInstance,
): number | undefined =>
  modifiedPowerToughness(creature, deriveActiveStaticEffects(state))?.power

export const effectiveToughness = (
  state: GameState,
  creature: CardInstance,
): number | undefined =>
  modifiedPowerToughness(creature, deriveActiveStaticEffects(state))?.toughness

const eligibleForDamageStep = (
  state: GameState,
  creature: CardInstance,
  step: 'FIRST_STRIKE' | 'NORMAL',
  firstStrikeParticipantIds: readonly string[],
): boolean => {
  const first = hasEffectiveKeyword(state, creature, 'FIRST_STRIKE')
  const double = hasEffectiveKeyword(state, creature, 'DOUBLE_STRIKE')
  if (step === 'FIRST_STRIKE') return first || double
  if (!firstStrikeParticipantIds.length) return true
  return !firstStrikeParticipantIds.includes(creature.instanceId) || double
}

const damage = (
  state: GameState,
  source: CardInstance,
  target: DamageRecord['target'],
  amount: number,
  eventGroupId: string,
): DamageRecord => ({
  sourceInstanceId: source.instanceId,
  target,
  amount,
  damageKind: 'COMBAT',
  hasDeathtouch: hasEffectiveKeyword(state, source, 'DEATHTOUCH'),
  eventGroupId,
})

const distributions = (amount: number, slots: number): number[][] => {
  if (slots === 1) return [[amount]]
  return Array.from({ length: amount + 1 }, (_, current) =>
    distributions(amount - current, slots - 1).map((rest) => [
      current,
      ...rest,
    ]),
  ).flat()
}

export type CombatDamageAssignmentData = {
  sourceInstanceId: string
  sourceCardName: string
  power: number
  options: Array<{ id: string; label: string; damages: DamageRecord[] }>
}

export const createCombatDamageAssignmentDecision = (
  assignment: CombatDamageAssignmentData,
  accumulatedDamages: DamageRecord[],
  remainingAssignments: CombatDamageAssignmentData[],
  completionActions: GameAction[],
): PendingDecision => ({
  id: `combat-assignment-${assignment.sourceInstanceId}-${remainingAssignments.length}`,
  sourceAbilityId: 'combat-damage-assignment',
  sourceInstanceId: assignment.sourceInstanceId,
  type: 'COMBAT_DAMAGE_ASSIGNMENT',
  prompt: `Assign ${assignment.power} combat damage from ${assignment.sourceCardName}.`,
  options: assignment.options.map((option) => ({
    instanceId: option.id,
    label: option.label,
  })),
  continuation: {
    effectsToExecute: [],
    resumeEffectIndex: 0,
    combatDamage: {
      options: assignment.options,
      accumulatedDamages,
      remainingAssignments,
      completionActions,
    },
  },
})

export type CombatDamagePlan =
  | { type: 'ACTIONS'; actions: GameAction[] }
  | { type: 'DECISION'; decision: PendingDecision }
  | { type: 'ERROR'; code: string; message: string }

export const planCombatDamage = (state: GameState): CombatDamagePlan => {
  if (!inCombatStep(state, 'COMBAT_DAMAGE'))
    return {
      type: 'ERROR',
      code: 'INVALID_TIMING',
      message: 'No estás en daño de combate.',
    }
  const combat = state.combatState
  if (combat.damageStep === 'COMPLETE')
    return {
      type: 'ERROR',
      code: 'COMBAT_DAMAGE_COMPLETE',
      message: 'El daño de combate ya se resolvió.',
    }

  const combatantIds = [
    ...combat.attackers.map((attacker) => attacker.attackerInstanceId),
    ...combat.blockers.map((blocker) => blocker.blockerInstanceId),
  ]
  const firstStrikeSnapshot = combatantIds.filter((instanceId) => {
    const source = state.cards.find((card) => card.instanceId === instanceId)
    return Boolean(
      source &&
        source.zone === 'battlefield' &&
        (hasEffectiveKeyword(state, source, 'FIRST_STRIKE') ||
          hasEffectiveKeyword(state, source, 'DOUBLE_STRIKE')),
    )
  })
  const hasFirstStrike =
    combat.damageStep === 'PENDING' && firstStrikeSnapshot.length > 0
  const step: 'FIRST_STRIKE' | 'NORMAL' =
    combat.damageStep === 'PENDING' && hasFirstStrike
      ? 'FIRST_STRIKE'
      : 'NORMAL'
  const rememberedFirstStrikeParticipants =
    step === 'FIRST_STRIKE'
      ? firstStrikeSnapshot
      : (combat.firstStrikeParticipantIds ?? [])
  const nextDamageStep: 'NORMAL' | 'COMPLETE' =
    step === 'FIRST_STRIKE' ? 'NORMAL' : 'COMPLETE'
  const completionActions: GameAction[] = [
    {
      type: 'SET_COMBAT_DAMAGE_STEP',
      step: nextDamageStep,
      ...(step === 'FIRST_STRIKE'
        ? { firstStrikeParticipantIds: rememberedFirstStrikeParticipants }
        : {}),
    },
  ]

  const records: DamageRecord[] = []
  const assignments: CombatDamageAssignmentData[] = []
  const group = `combat-${combat.combatId}-${step}`

  for (const attacker of combat.attackers) {
    const source = state.cards.find(
      (item) => item.instanceId === attacker.attackerInstanceId,
    )
    if (
      !source ||
      source.zone !== 'battlefield' ||
      !eligibleForDamageStep(
        state,
        source,
        step,
        rememberedFirstStrikeParticipants,
      )
    )
      continue
    const power = effectivePower(state, source)
    if (power === undefined)
      return {
        type: 'ERROR',
        code: 'ASSISTED_COMBAT_REQUIRED',
        message: `No puedo calcular la fuerza de ${source.card.name}.`,
      }
    const blockers = attacker.blockedBy
      .map((id) => state.cards.find((item) => item.instanceId === id))
      .filter((item): item is CardInstance =>
        Boolean(item && item.zone === 'battlefield'),
      )

    if (blockers.length > 1) {
      blockers.forEach((blocker) => {
        if (
          !eligibleForDamageStep(
            state,
            blocker,
            step,
            rememberedFirstStrikeParticipants,
          )
        )
          return
        const blockerPower = effectivePower(state, blocker)
        if (blockerPower !== undefined && blockerPower > 0)
          records.push(
            damage(
              state,
              blocker,
              { kind: 'CREATURE', instanceId: source.instanceId },
              blockerPower,
              group,
            ),
          )
      })

      const trample = hasEffectiveKeyword(state, source, 'TRAMPLE')
      const lethalByBlocker = blockers.map((blocker) =>
        hasEffectiveKeyword(state, source, 'DEATHTOUCH')
          ? 1
          : Math.max(
              0,
              (effectiveToughness(state, blocker) ?? 0) -
                (blocker.damageMarked ?? 0),
            ),
      )
      const allocations = trample
        ? distributions(Math.max(0, power), blockers.length + 1).filter(
            (allocation) =>
              (allocation[blockers.length] ?? 0) === 0 ||
              allocation
                .slice(0, blockers.length)
                .every((amount, index) => amount >= lethalByBlocker[index]),
          )
        : distributions(Math.max(0, power), blockers.length)
      const options = allocations.map((allocation, index) => {
        const assigned: DamageRecord[] = blockers
          .map((blocker, blockerIndex) =>
            damage(
              state,
              source,
              { kind: 'CREATURE', instanceId: blocker.instanceId },
              allocation[blockerIndex] ?? 0,
              group,
            ),
          )
          .filter((record) => record.amount > 0)
        const defendingDamage = trample
          ? (allocation[blockers.length] ?? 0)
          : 0
        if (defendingDamage > 0)
          assigned.push(
            damage(
              state,
              source,
              defendingDamageTarget(attacker),
              defendingDamage,
              group,
            ),
          )
        return {
          id: `combat-allocation-${source.instanceId}-${index}`,
          label: allocation.join('/'),
          damages: assigned,
        }
      })
      if (options.length <= 1) records.push(...(options[0]?.damages ?? []))
      else
        assignments.push({
          sourceInstanceId: source.instanceId,
          sourceCardName: source.card.name,
          power,
          options,
        })
      continue
    }

    if (!blockers.length && !attacker.externalBlockedBy.length) {
      const wasBlocked = attacker.blockedBy.length > 0
      if ((!wasBlocked || hasEffectiveKeyword(state, source, 'TRAMPLE')) && power > 0)
        records.push(
          damage(
            state,
            source,
            defendingDamageTarget(attacker),
            power,
            group,
          ),
        )
      continue
    }

    if (blockers.length === 1) {
      const blocker = blockers[0]
      const toughness = effectiveToughness(state, blocker)
      const lethal = hasEffectiveKeyword(state, source, 'DEATHTOUCH')
        ? 1
        : Math.max(0, (toughness ?? 0) - (blocker.damageMarked ?? 0))
      const toBlocker = hasEffectiveKeyword(state, source, 'TRAMPLE')
        ? Math.min(power, lethal)
        : power
      if (toBlocker > 0)
        records.push(
          damage(
            state,
            source,
            { kind: 'CREATURE', instanceId: blocker.instanceId },
            toBlocker,
            group,
          ),
        )
      if (hasEffectiveKeyword(state, source, 'TRAMPLE') && power > toBlocker)
        records.push(
          damage(
            state,
            source,
            defendingDamageTarget(attacker),
            power - toBlocker,
            group,
          ),
        )
      if (
        eligibleForDamageStep(
          state,
          blocker,
          step,
          rememberedFirstStrikeParticipants,
        )
      ) {
        const blockerPower = effectivePower(state, blocker)
        if (blockerPower !== undefined && blockerPower > 0)
          records.push(
            damage(
              state,
              blocker,
              { kind: 'CREATURE', instanceId: source.instanceId },
              blockerPower,
              group,
            ),
          )
      }
    }
  }

  if (assignments.length) {
    const [first, ...remaining] = assignments
    return {
      type: 'DECISION',
      decision: createCombatDamageAssignmentDecision(
        first,
        records,
        remaining,
        completionActions,
      ),
    }
  }

  return {
    type: 'ACTIONS',
    actions: [
      { type: 'DEAL_DAMAGE_BATCH', damages: records },
      ...completionActions,
    ],
  }
}
