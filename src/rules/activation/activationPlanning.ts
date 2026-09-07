import type { GameAction } from '../../actions/gameActions'
import type { ActivatedAbilityDefinition } from '../../abilities/types/abilityTypes'
import type { GameState } from '../../types/game'
import type { CardInstance, ManaColor } from '../../types/card'
import { parseManaCost, type SpellManaCost } from '../costs/manaCost'
import {
  findAvailableManaAbilities,
  planSmartManaPayment,
} from '../manaPlanner/manaPlanner'
import { localPlayerIdOf } from '../players/playerState'

export type ActivationManaPreparation =
  | { kind: 'NO_MANA_REQUIRED' }
  | { kind: 'ALREADY_PAYABLE' }
  | { kind: 'AUTO_PLAN'; actions: GameAction[] }
  | { kind: 'NO_SAFE_PLAN' }
  | { kind: 'UNSUPPORTED' }

const manaColors: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C']

const addManaCost = (left: SpellManaCost, right: SpellManaCost): SpellManaCost => ({
  generic: left.generic + right.generic,
  colors: manaColors.reduce<SpellManaCost['colors']>((colors, color) => {
    const amount = (left.colors[color] ?? 0) + (right.colors[color] ?? 0)
    return amount ? { ...colors, [color]: amount } : colors
  }, {}),
})

/**
 * Returns the deterministic mana portion of an activated ability cost.
 * Complex cost reducers and Waterbend remain in the activation engine instead of
 * being guessed by the generic mana planner.
 */
export const activationManaCostForPlanning = (
  ability: ActivatedAbilityDefinition,
  variables: Record<string, string | number | boolean> = {},
  additionalGenericCost = 0,
): SpellManaCost | undefined => {
  let total: SpellManaCost = {
    generic: Math.max(0, Math.floor(additionalGenericCost)),
    colors: {},
  }
  const numericVariables = Object.fromEntries(
    Object.entries(variables).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  )

  for (const cost of ability.costs) {
    if (cost.type === 'WATERBEND') return undefined
    if (cost.type !== 'MANA_COST') continue
    if (cost.genericReduction) return undefined
    const parsed = parseManaCost(cost.cost, numericVariables)
    if (!parsed) return undefined
    total = addManaCost(total, parsed)
  }
  return total
}

const sourceMustStayAvailableForOwnCost = (
  ability: ActivatedAbilityDefinition,
): boolean =>
  ability.costs.some((cost) =>
    [
      'TAP_SOURCE',
      'SACRIFICE_SOURCE',
      'DISCARD_SOURCE',
      'EXILE_SOURCE_FROM_GRAVEYARD',
      'EXILE_SOURCE_FROM_BATTLEFIELD',
    ].includes(cost.type),
  )

/**
 * Reuses the same SMART mana policy used for casting, while reserving the source
 * permanent when its own activation cost needs to tap/sacrifice/exile it.
 */
export const planActivationManaPreparation = ({
  state,
  source,
  ability,
  variables = {},
  additionalGenericCost = 0,
}: {
  state: GameState
  source: CardInstance
  ability: ActivatedAbilityDefinition
  variables?: Record<string, string | number | boolean>
  additionalGenericCost?: number
}): ActivationManaPreparation => {
  const manaCost = activationManaCostForPlanning(
    ability,
    variables,
    additionalGenericCost,
  )
  if (!manaCost) return { kind: 'UNSUPPORTED' }
  if (!manaCost.generic && !Object.keys(manaCost.colors).length)
    return { kind: 'NO_MANA_REQUIRED' }

  const playerId = source.controllerId ?? localPlayerIdOf(state)
  const available = findAvailableManaAbilities(state, playerId).filter(
    (manaSource) =>
      !sourceMustStayAvailableForOwnCost(ability) ||
      manaSource.sourceInstanceId !== source.instanceId,
  )
  const plan = planSmartManaPayment({
    state,
    manaCost,
    availableManaAbilities: available,
    mode: state.autoManaMode ?? 'SMART',
    playerId,
  })
  if (plan.kind === 'ALREADY_PAYABLE') return { kind: 'ALREADY_PAYABLE' }
  if (plan.kind === 'UNIQUE_SAFE_PLAN')
    return { kind: 'AUTO_PLAN', actions: plan.plan.actions }
  return plan.kind === 'UNSUPPORTED'
    ? { kind: 'UNSUPPORTED' }
    : { kind: 'NO_SAFE_PLAN' }
}
