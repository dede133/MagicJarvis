import type { ManaColor } from '../../types/card'
import type { RuntimeVariableValue } from '../../abilities/types/abilityTypes'

export type CastCondition =
  { type: 'CONTROLS_COMMANDER' } | { type: 'NOT_YOUR_TURN' }

export type CastVariableDefinition = {
  name: string
  min?: number
  max?: number
}

export type CastGenericContributionDefinition =
  | {
      type: 'TAP_PERMANENTS'
      cardTypesAnyOf: string[]
      max?: number | { variable: string }
    }
  | {
      type: 'EXILE_CARDS_FROM_GRAVEYARD'
      max?: number | { variable: string }
    }
  | {
      /** Hidden hand stays unknown; cards are named explicitly only after this count is chosen. */
      type: 'EXILE_DECLARED_CARDS_FROM_HAND'
      colors?: ManaColor[]
      excludeSource?: boolean
      genericReductionPerCard: number
      max?: number | { variable: string }
    }

/** Non-mana costs that can be declared from physical hidden information. */
export type CastNonManaCostDefinition =
  | { type: 'PAY_LIFE'; amount: number }
  | {
      type: 'EXILE_CARD_FROM_HAND'
      count: number
      colors?: ManaColor[]
      excludeSource?: boolean
    }

/**
 * Declarative casting-cost override/addition. These definitions are card data;
 * the resolver only knows the reusable cost vocabulary below.
 */
export type CastOptionDefinition = {
  id: string
  label: string
  kind: 'ALTERNATIVE' | 'ADDITIONAL' | 'PAYMENT_MODIFIER'
  /** Alternative replaces the printed mana cost; additional is added to it. */
  manaCost: string
  /** Suppresses the normal-cost variant when this option is a mandatory additional cost. */
  required?: boolean
  condition?: CastCondition
  variable?: CastVariableDefinition
  nonManaCosts?: CastNonManaCostDefinition[]
  /** Generic-cost contribution paid by selecting public tabletop objects. */
  genericContribution?: CastGenericContributionDefinition
  setVariables?: Record<string, RuntimeVariableValue>
}
