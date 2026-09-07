import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import { effectiveTypeLine } from '../../abilities/engine/staticEffects'
import { isPresentPermanent } from '../phasing/phasingRules'

export const LOYALTY_COUNTER = 'loyalty'
export const LOYALTY_USED_TURN_RUNTIME_KEY = 'LOYALTY_ABILITY_USED_TURN'

const parseLoyalty = (value?: string): number | undefined => {
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

export const printedLoyalty = (card: CardDefinition): number | undefined =>
  parseLoyalty(card.loyalty)

export const initialLoyaltyCounters = (
  card: CardDefinition,
): Record<string, number> => {
  if (!/\bplaneswalker\b/i.test(card.typeLine)) return {}
  const loyalty = printedLoyalty(card)
  return loyalty === undefined ? {} : { [LOYALTY_COUNTER]: loyalty }
}

export const isPlaneswalkerPermanent = (
  state: GameState,
  card: CardInstance,
): boolean =>
  isPresentPermanent(card) &&
  /\bplaneswalker\b/i.test(effectiveTypeLine(state, card))

export const loyaltyOf = (card: CardInstance): number =>
  Math.max(0, card.counters[LOYALTY_COUNTER] ?? 0)

export const loyaltyAbilityUsedThisTurn = (
  state: GameState,
  card: CardInstance,
): boolean => card.runtimeValues?.[LOYALTY_USED_TURN_RUNTIME_KEY] === state.turn
