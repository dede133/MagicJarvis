import type {
  ActivatedAbilityDefinition,
  DeclaredTarget,
  EffectDefinition,
  SelectionConstraints,
  SpellEffectDefinition,
  ValueExpression,
} from '../../abilities/types/abilityTypes'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import {
  canTarget,
  canTargetPlayer,
  type TargetingKind,
} from './targetingRules'

export type DeclarationTargetRequirement = {
  prompt: string
  constraints: SelectionConstraints
  requiredCount: number
  minimumCount: number
  allowFewer: boolean
}

export type DeclarationModeRequirement = {
  prompt: string
  modes: Array<{ id: string; label: string }>
}

export const declaredModeVariableKey = (abilityId: string): string =>
  `__declaredMode:${abilityId}`

export const declaredTargetCountVariableKey = (abilityId: string): string =>
  `__declaredTargetCount:${abilityId}`

export const declarationModeRequirement = (
  ability: TargetableAbility,
): DeclarationModeRequirement | undefined => {
  const first = ability.effects[0]
  if (!first || first.type !== 'CHOOSE_MODE') return undefined
  return {
    prompt: first.prompt,
    modes: first.modes.map((mode) => ({ id: mode.id, label: mode.label })),
  }
}

type TargetableAbility = SpellEffectDefinition | ActivatedAbilityDefinition

const declarationCount = (
  count: ValueExpression | undefined,
  variables: Record<string, string | number | boolean>,
): number | undefined => {
  if (!count) return 1
  if (count.type === 'LITERAL') return Math.max(0, count.value)
  if (count.type !== 'VARIABLE') return undefined
  const value = variables[count.name]
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
}

/**
 * The MVP declares direct top-level targets before costs are paid. A leading
 * CHOOSE_MODE is also declaration-time; once its mode id is stored in variables
 * this helper follows that mode into its first direct TARGET_SELECTION.
 */
const declaredTargetEffect = (
  ability: TargetableAbility,
  variables: Record<string, string | number | boolean>,
): Extract<EffectDefinition, { type: 'TARGET_SELECTION' }> | undefined => {
  const first = ability.effects[0]
  const effects =
    first?.type === 'CHOOSE_MODE'
      ? first.modes.find(
          (mode) =>
            mode.id === variables[declaredModeVariableKey(ability.id)],
        )?.effects
      : ability.effects
  return effects?.find(
    (effect): effect is Extract<
      EffectDefinition,
      { type: 'TARGET_SELECTION' }
    > => effect.type === 'TARGET_SELECTION',
  )
}

const declarationConstraints = (
  effect: Extract<EffectDefinition, { type: 'TARGET_SELECTION' }>,
  variables: Record<string, string | number | boolean>,
): SelectionConstraints =>
  effect.declarationConstraintOverrides?.find(
    (override) => variables[override.variableName] === override.equals,
  )?.constraints ?? effect.constraints

export const declarationTargetRequirement = (
  ability: TargetableAbility,
  variables: Record<string, string | number | boolean> = {},
): DeclarationTargetRequirement | undefined => {
  const targetEffect = declaredTargetEffect(ability, variables)
  if (!targetEffect) return undefined
  const requiredCount = declarationCount(targetEffect.count, variables)
  if (requiredCount === undefined) return undefined
  return {
    prompt: targetEffect.prompt,
    constraints: declarationConstraints(targetEffect, variables),
    requiredCount,
    minimumCount: targetEffect.allowFewer ? 0 : requiredCount,
    allowFewer: targetEffect.allowFewer === true,
  }
}

export const isStackTargetConstraint = (
  constraints: SelectionConstraints,
): boolean =>
  constraints.stackKind === 'SPELL' ||
  constraints.zones?.includes('stack') === true ||
  constraints.anyOf?.some(isStackTargetConstraint) === true

export const legalDeclarationTargetOptions = (
  state: GameState,
  source: {
    sourceInstanceId?: string
    sourceCard?: CardDefinition
    controllerId: string
    kind: TargetingKind
  },
  constraints: SelectionConstraints,
): Array<{ instanceId: string; label: string }> => {
  if (constraints.playerRelation)
    return state.players
      .filter((player) =>
        canTargetPlayer(state, player.id, source, constraints.playerRelation),
      )
      .map((player) => ({
        instanceId: player.id,
        label: player.name ?? player.id,
      }))
  return state.cards
    .filter((card) => {
      if (constraints.controllerPlayer) return false
      return canTarget(state, card, source, constraints)
    })
    .map((card) => ({
      instanceId:
        card.zone === 'stack' && card.stackObjectId
          ? card.stackObjectId
          : card.instanceId,
      label: card.card.name,
    }))
}

export const declaredTargetCard = (
  state: GameState,
  target: DeclaredTarget,
): CardInstance | undefined =>
  state.cards.find((card) => card.instanceId === target.targetId) ??
  state.cards.find(
    (card) => card.zone === 'stack' && card.stackObjectId === target.targetId,
  )
