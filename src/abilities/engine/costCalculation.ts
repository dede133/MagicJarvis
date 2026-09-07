import type { ManaColor } from '../../types/card'
import type { CardInstance } from '../../types/card'
import {
  matchesStaticFilter,
  staticConditionMatches,
  type ActiveStaticEffects,
} from './staticEffects'

export type CostCalculationInput = {
  baseGeneric: number
  colors?: Partial<Record<ManaColor, number>>
  activeStaticEffects: ActiveStaticEffects
  spell?: CardInstance
}

/** Small, explicit pipeline; it intentionally excludes alternate-cost systems. */
export const calculateTotalCost = ({
  baseGeneric,
  colors = {},
  activeStaticEffects,
  spell,
}: CostCalculationInput): {
  generic: number
  colors: Partial<Record<ManaColor, number>>
} => {
  const generic = activeStaticEffects.costModifiers.reduce((value, modifier) => {
    if (spell) {
      const source = activeStaticEffects.knownCards?.find(
        (candidate) => candidate.instanceId === modifier.sourceInstanceId,
      )
      if (
        !matchesStaticFilter(
          spell,
          modifier.filter,
          modifier.sourceInstanceId,
          source,
          activeStaticEffects.state,
        ) ||
        (modifier.condition !== undefined &&
          (!activeStaticEffects.state ||
            !staticConditionMatches(
              activeStaticEffects.state,
              source,
              modifier.condition,
            )))
      )
        return value
      if (
        modifier.spellOrdinal === 'FIRST_MATCHING_EACH_TURN' &&
        activeStaticEffects.state?.spellCastHistoryThisTurn?.some((entry) => {
          const previous: CardInstance = {
            instanceId: `cast-history:${entry.card.scryfallId}`,
            card: entry.card,
            zone: 'stack',
            tapped: false,
            counters: {},
            ownerId: entry.playerId,
            controllerId: entry.playerId,
          }
          return matchesStaticFilter(
            previous,
            modifier.filter,
            modifier.sourceInstanceId,
            source,
            activeStaticEffects.state,
          )
        })
      )
        return value
    }
    return modifier.operation === 'INCREASE_GENERIC_COST'
      ? value + modifier.amount
      : Math.max(0, value - modifier.amount)
  }, baseGeneric)
  return { generic, colors }
}
