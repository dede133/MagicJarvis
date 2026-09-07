import type { SelectionConstraints } from '../../abilities/types/abilityTypes'
import {
  additionalTargetingCost,
  deriveActiveStaticEffects,
  modifiedPowerToughness,
  effectiveTypeLine,
  hasEffectiveKeyword,
  isProtectedFromSource,
  wardCostsForTarget,
} from '../../abilities/engine/staticEffects'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import { effectiveCardDefinition } from '../copy/copyCharacteristics'
import { isPhasedOut } from '../phasing/phasingRules'
import { isCommanderInstance } from '../commander/commanderRules'

export type TargetingKind = 'SPELL' | 'ACTIVATED_ABILITY' | 'TRIGGERED_ABILITY'

export type TargetingSource = {
  sourceInstanceId?: string
  sourceCard?: CardDefinition
  controllerId: string
  kind: TargetingKind
}

export type TargetLegality =
  | { legal: true }
  | {
      legal: false
      reason:
        | 'ZONE'
        | 'PHASED_OUT'
        | 'TYPE'
        | 'COLOR'
        | 'CONTROLLER'
        | 'TOKEN'
        | 'COMMANDER'
        | 'SOURCE'
        | 'MANA_VALUE'
        | 'COMBAT_ROLE'
        | 'HEXPROOF'
        | 'SHROUD'
        | 'PROTECTION'
    }

export type PlayerTargetLegality =
  | { legal: true }
  | { legal: false; reason: 'RELATION' | 'HEXPROOF' | 'PROTECTION' }

const controllerIdOf = (state: GameState, card: CardInstance): string =>
  card.controllerId ??
  (card.controller === 'OPPONENT'
    ? (state.turnOrder.find((id) => id !== state.localPlayerId) ?? 'player-2')
    : (state.localPlayerId ?? 'player-1'))

const lowerIncludesAll = (haystack: string, needles?: string[]) =>
  !needles?.some((needle) => !haystack.includes(needle.toLocaleLowerCase()))

export const checkTargetLegality = (
  state: GameState,
  target: CardInstance,
  source: TargetingSource,
  constraints: SelectionConstraints = {},
): TargetLegality => {
  if (constraints.anyOf?.length) {
    const { anyOf, ...common } = constraints
    const branchLegal = anyOf.some((branch) =>
      checkTargetLegality(state, target, source, { ...common, ...branch }).legal,
    )
    if (!branchLegal) return { legal: false, reason: 'TYPE' }
    return { legal: true }
  }
  if (constraints.attacking !== undefined) {
    const attacking = state.combatState.attackers.some(
      (entry) => entry.attackerInstanceId === target.instanceId,
    )
    if (attacking !== constraints.attacking)
      return { legal: false, reason: 'COMBAT_ROLE' }
  }
  if (constraints.combatRole === 'ATTACKING_OR_BLOCKING') {
    const inCombat =
      state.combatState.attackers.some(
        (entry) => entry.attackerInstanceId === target.instanceId,
      ) ||
      state.combatState.blockers.some(
        (entry) => entry.blockerInstanceId === target.instanceId,
      )
    if (!inCombat)
      return { legal: false, reason: 'COMBAT_ROLE' }
  }
  if (constraints.stackKind === 'SPELL') {
    if (target.zone !== 'stack' || !target.stackObjectId)
      return { legal: false, reason: 'ZONE' }
    const stackObject = state.stack.find(
      (object) => object.stackObjectId === target.stackObjectId,
    )
    if (!stackObject || stackObject.kind !== 'SPELL')
      return { legal: false, reason: 'TYPE' }
  }
  if (constraints.zones && !constraints.zones.includes(target.zone))
    return { legal: false, reason: 'ZONE' }

  if (target.zone === 'battlefield' && isPhasedOut(target))
    return { legal: false, reason: 'PHASED_OUT' }

  const typeLine = effectiveTypeLine(state, target).toLocaleLowerCase()
  if (!lowerIncludesAll(typeLine, constraints.cardTypes))
    return { legal: false, reason: 'TYPE' }
  if (
    constraints.cardTypesAnyOf?.length &&
    !constraints.cardTypesAnyOf.some((type) =>
      typeLine.includes(type.toLocaleLowerCase()),
    )
  )
    return { legal: false, reason: 'TYPE' }
  if (
    constraints.excludeCardTypes?.some((type) =>
      typeLine.includes(type.toLocaleLowerCase()),
    )
  )
    return { legal: false, reason: 'TYPE' }
  if (!lowerIncludesAll(typeLine, constraints.subtypes))
    return { legal: false, reason: 'TYPE' }
  if (
    constraints.subtypesAnyOf?.length &&
    !constraints.subtypesAnyOf.some((subtype) =>
      typeLine.includes(subtype.toLocaleLowerCase()),
    )
  )
    return { legal: false, reason: 'TYPE' }
  if (constraints.historic !== undefined) {
    const historic = /\bartifact\b|\blegendary\b|\bsaga\b/i.test(typeLine)
    if (historic !== constraints.historic)
      return { legal: false, reason: 'TYPE' }
  }
  if (constraints.hasAnyCounters !== undefined) {
    const hasAny = Object.values(target.counters).some((amount) => amount > 0)
    if (hasAny !== constraints.hasAnyCounters)
      return { legal: false, reason: 'TYPE' }
  }
  if (constraints.hasCounterType) {
    const count = target.counters[constraints.hasCounterType] ?? 0
    if (count < (constraints.counterCountAtLeast ?? 1))
      return { legal: false, reason: 'TYPE' }
  }
  if (constraints.powerAtLeast !== undefined || constraints.toughnessAtLeast !== undefined) {
    const pt = modifiedPowerToughness(target, deriveActiveStaticEffects(state))
    if (
      constraints.powerAtLeast !== undefined &&
      (pt?.power ?? Number.NEGATIVE_INFINITY) < constraints.powerAtLeast
    )
      return { legal: false, reason: 'TYPE' }
    if (
      constraints.toughnessAtLeast !== undefined &&
      (pt?.toughness ?? Number.NEGATIVE_INFINITY) < constraints.toughnessAtLeast
    )
      return { legal: false, reason: 'TYPE' }
  }

  const targetDefinition = effectiveCardDefinition(state, target)
  if (
    constraints.colors?.some(
      (color) => !targetDefinition.colors.includes(color),
    ) ||
    (constraints.colorsAnyOf?.length &&
      !constraints.colorsAnyOf.some((color) =>
        targetDefinition.colors.includes(color),
      )) ||
    constraints.excludeColors?.some((color) =>
      targetDefinition.colors.includes(color),
    )
  )
    return { legal: false, reason: 'COLOR' }

  if (
    constraints.isToken !== undefined &&
    constraints.isToken !== (target.isToken === true)
  )
    return { legal: false, reason: 'TOKEN' }

  const targetControllerId = controllerIdOf(state, target)
  const localPlayerId = state.localPlayerId ?? 'player-1'
  const targetOwnerId = target.ownerId ?? localPlayerId
  const targetOwner =
    targetOwnerId === source.controllerId
      ? ('YOU' as const)
      : ('OPPONENT' as const)
  if (
    constraints.owner &&
    constraints.owner !== 'ANY' &&
    constraints.owner !== targetOwner
  )
    return { legal: false, reason: 'CONTROLLER' }
  const targetController =
    targetControllerId === source.controllerId
      ? ('YOU' as const)
      : ('OPPONENT' as const)
  if (
    constraints.controller &&
    constraints.controller !== 'ANY' &&
    constraints.controller !== targetController
  )
    return { legal: false, reason: 'CONTROLLER' }
  if (
    constraints.controllerRelation === 'NOT_SOURCE_CONTROLLER' &&
    targetControllerId === source.controllerId
  )
    return { legal: false, reason: 'CONTROLLER' }

  if (
    constraints.excludeSource &&
    target.instanceId === source.sourceInstanceId
  )
    return { legal: false, reason: 'SOURCE' }
  if (constraints.excludeAttachedToSource && source.sourceInstanceId) {
    const sourceInstance = state.cards.find(
      (card) => card.instanceId === source.sourceInstanceId,
    )
    if (sourceInstance?.attachedToInstanceId === target.instanceId)
      return { legal: false, reason: 'SOURCE' }
  }
  if (
    constraints.isCommander !== undefined &&
    constraints.isCommander !== isCommanderInstance(state, target.instanceId)
  )
    return { legal: false, reason: 'COMMANDER' }
  const sourceCard =
    source.sourceCard ??
    (source.sourceInstanceId
      ? (() => {
          const instance = state.cards.find(
            (card) => card.instanceId === source.sourceInstanceId,
          )
          return instance ? effectiveCardDefinition(state, instance) : undefined
        })()
      : undefined)
  if (
    isProtectedFromSource(
      state,
      target,
      sourceCard
        ? {
            instanceId: source.sourceInstanceId ?? 'declared-source',
            card: sourceCard,
            zone: 'stack',
            tapped: false,
            counters: {},
          }
        : undefined,
    )
  )
    return { legal: false, reason: 'PROTECTION' }
  if (hasEffectiveKeyword(state, target, 'SHROUD'))
    return { legal: false, reason: 'SHROUD' }
  if (
    hasEffectiveKeyword(state, target, 'HEXPROOF') &&
    targetControllerId !== source.controllerId
  )
    return { legal: false, reason: 'HEXPROOF' }

  return { legal: true }
}

export const canTarget = (
  state: GameState,
  target: CardInstance,
  source: TargetingSource,
  constraints: SelectionConstraints = {},
): boolean => checkTargetLegality(state, target, source, constraints).legal

const playerRuleActive = (
  state: GameState,
  playerId: string,
  rule: 'hexproof' | 'protectionFromEverything',
): boolean =>
  (state.playerRuleEffects ?? []).some(
    (effect) => effect.playerId === playerId && effect[rule] === true,
  )

export const checkPlayerTargetLegality = (
  state: GameState,
  targetPlayerId: string,
  source: TargetingSource,
  relation: 'YOU' | 'OPPONENT' | 'ANY' = 'ANY',
): PlayerTargetLegality => {
  if (
    (relation === 'YOU' && targetPlayerId !== source.controllerId) ||
    (relation === 'OPPONENT' && targetPlayerId === source.controllerId)
  )
    return { legal: false, reason: 'RELATION' }
  if (playerRuleActive(state, targetPlayerId, 'protectionFromEverything'))
    return { legal: false, reason: 'PROTECTION' }
  if (
    playerRuleActive(state, targetPlayerId, 'hexproof') &&
    targetPlayerId !== source.controllerId
  )
    return { legal: false, reason: 'HEXPROOF' }
  return { legal: true }
}

export const canTargetPlayer = (
  state: GameState,
  targetPlayerId: string,
  source: TargetingSource,
  relation: 'YOU' | 'OPPONENT' | 'ANY' = 'ANY',
): boolean => checkPlayerTargetLegality(state, targetPlayerId, source, relation).legal

export const targetingCosts = (
  state: GameState,
  target: CardInstance,
  source: TargetingSource,
) => ({
  additionalGeneric:
    source.kind === 'TRIGGERED_ABILITY'
      ? 0
      : additionalTargetingCost(
          state,
          target,
          source.controllerId,
          source.kind,
        ),
  wardCosts: wardCostsForTarget(state, target, source.controllerId),
})
