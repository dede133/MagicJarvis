import type { GameAction } from '../../actions/gameActions'
import { calculateTotalCost } from '../../abilities/engine/costCalculation'
import { deriveActiveStaticEffects } from '../../abilities/engine/staticEffects'
import type { CardDefinition, ManaColor } from '../../types/card'
import type { GameState } from '../../types/game'
import {
  activePlayerIdOf,
  localPlayerIdOf,
  playerManaPool,
} from '../players/playerState'

export type SpellManaCost = {
  generic: number
  colors: Partial<Record<ManaColor, number>>
}

const colors: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C']

/** Parses only normal mana symbols; unsupported symbols intentionally cost no guesswork. */
export const parseManaCost = (
  manaCost?: string,
  variables: Record<string, number> = {},
): SpellManaCost | undefined => {
  if (!manaCost) return { generic: 0, colors: {} }
  const symbols = [...manaCost.matchAll(/\{([^}]+)\}/g)].map(
    (match) => match[1],
  )
  const result: SpellManaCost = { generic: 0, colors: {} }
  for (const symbol of symbols) {
    if (/^\d+$/.test(symbol)) result.generic += Number(symbol)
    else if (symbol in variables) {
      const value = variables[symbol]
      if (!Number.isInteger(value) || value < 0) return undefined
      result.generic += value
    } else if (colors.includes(symbol as ManaColor))
      result.colors[symbol as ManaColor] =
        (result.colors[symbol as ManaColor] ?? 0) + 1
    else return undefined
  }
  return result
}

export const calculateSpellManaCost = (
  state: GameState,
  card: CardDefinition,
  variables: Record<string, number> = {},
  playerId = activePlayerIdOf(state),
): SpellManaCost | undefined => {
  const parsed = parseManaCost(card.manaCost, variables)
  return parsed
    ? calculateTotalCost({
        baseGeneric: parsed.generic,
        colors: parsed.colors,
        activeStaticEffects: deriveActiveStaticEffects(state),
        spell: {
          instanceId: `spell-cost:${card.scryfallId}`,
          card,
          zone: 'stack',
          tapped: false,
          counters: {},
          ownerId: playerId,
          controllerId: playerId,
          controller: playerId === localPlayerIdOf(state) ? 'YOU' : 'OPPONENT',
        },
      })
    : undefined
}

export type ConfiguredSpellCost = {
  alternativeManaCost?: string
  additionalManaCost?: string
  variables?: Record<string, number>
}

/**
 * Computes a chosen alternative/additional mana cost before generic cost modifiers.
 * Non-mana casting costs intentionally live in the casting-cost engine, not here.
 */
export const calculateConfiguredSpellManaCost = (
  state: GameState,
  card: CardDefinition,
  configuration: ConfiguredSpellCost = {},
  playerId = activePlayerIdOf(state),
): SpellManaCost | undefined => {
  const variables = configuration.variables ?? {}
  const base = parseManaCost(
    configuration.alternativeManaCost ?? card.manaCost,
    variables,
  )
  if (!base) return undefined
  const additional = configuration.additionalManaCost
    ? parseManaCost(configuration.additionalManaCost, variables)
    : { generic: 0, colors: {} }
  if (!additional) return undefined
  const colors = [
    ...new Set([
      ...Object.keys(base.colors),
      ...Object.keys(additional.colors),
    ]),
  ] as ManaColor[]
  const combinedColors = Object.fromEntries(
    colors.map((color) => [
      color,
      (base.colors[color] ?? 0) + (additional.colors[color] ?? 0),
    ]),
  ) as Partial<Record<ManaColor, number>>
  return calculateTotalCost({
    baseGeneric: base.generic + additional.generic,
    colors: combinedColors,
    activeStaticEffects: deriveActiveStaticEffects(state),
    spell: {
      instanceId: `spell-cost:${card.scryfallId}`,
      card,
      zone: 'stack',
      tapped: false,
      counters: {},
      ownerId: playerId,
      controllerId: playerId,
      controller: playerId === localPlayerIdOf(state) ? 'YOU' : 'OPPONENT',
    },
  })
}

export type ManaPaymentPlan =
  | { kind: 'PAYABLE'; actions: GameAction[] }
  | { kind: 'NOT_ENOUGH_MANA' }
  | {
      kind: 'AMBIGUOUS'
      options: Array<{ id: string; label: string; actions: GameAction[] }>
    }

const paymentLabel = (spends: Partial<Record<ManaColor, number>>): string =>
  colors
    .filter((color) => spends[color])
    .map((color) => `${spends[color]} ${color}`)
    .join(' + ')

/**
 * Pays mandatory coloured symbols first, then enumerates generic allocations.
 * We only choose automatically when the allocation itself is unique.
 */
export const planManaPayment = (
  state: GameState,
  cost: SpellManaCost,
  card?: CardDefinition,
  playerId = activePlayerIdOf(state),
): ManaPaymentPlan => {
  const restrictedByColor = Object.fromEntries(
    colors.map((color) => [
      color,
      (state.restrictedMana ?? [])
        .filter(
          (entry) =>
            entry.playerId === playerId &&
            entry.color === color &&
            entry.restriction === 'CREATURE_SPELLS_ONLY',
        )
        .reduce((sum, entry) => sum + entry.amount, 0),
    ]),
  ) as Record<ManaColor, number>
  const creatureSpell = Boolean(card && /\bcreature\b/i.test(card.typeLine))
  const unrestricted = Object.fromEntries(
    colors.map((color) => [
      color,
      Math.max(
        0,
        playerManaPool(state, playerId)[color] - restrictedByColor[color],
      ),
    ]),
  ) as Record<ManaColor, number>
  const usableRestricted = Object.fromEntries(
    colors.map((color) => [
      color,
      creatureSpell ? restrictedByColor[color] : 0,
    ]),
  ) as Record<ManaColor, number>

  type Allocation = {
    normal: Partial<Record<ManaColor, number>>
    restricted: Partial<Record<ManaColor, number>>
    remainingNormal: Record<ManaColor, number>
    remainingRestricted: Record<ManaColor, number>
  }
  let allocations: Allocation[] = [
    {
      normal: {},
      restricted: {},
      remainingNormal: { ...unrestricted },
      remainingRestricted: { ...usableRestricted },
    },
  ]
  for (const color of colors) {
    const required = cost.colors[color] ?? 0
    if (!required) continue
    allocations = allocations.flatMap((allocation) => {
      const options: Allocation[] = []
      const minRestricted = Math.max(
        0,
        required - allocation.remainingNormal[color],
      )
      const maxRestricted = Math.min(
        required,
        allocation.remainingRestricted[color],
      )
      for (
        let restricted = minRestricted;
        restricted <= maxRestricted;
        restricted += 1
      ) {
        const normal = required - restricted
        options.push({
          normal: {
            ...allocation.normal,
            ...(normal
              ? { [color]: (allocation.normal[color] ?? 0) + normal }
              : {}),
          },
          restricted: {
            ...allocation.restricted,
            ...(restricted
              ? {
                  [color]: (allocation.restricted[color] ?? 0) + restricted,
                }
              : {}),
          },
          remainingNormal: {
            ...allocation.remainingNormal,
            [color]: allocation.remainingNormal[color] - normal,
          },
          remainingRestricted: {
            ...allocation.remainingRestricted,
            [color]: allocation.remainingRestricted[color] - restricted,
          },
        })
      }
      return options
    })
    if (!allocations.length) return { kind: 'NOT_ENOUGH_MANA' }
  }

  const finalAllocations: Allocation[] = []
  const visitGeneric = (
    allocation: Allocation,
    index: number,
    left: number,
  ) => {
    if (index === colors.length) {
      if (left === 0) finalAllocations.push(allocation)
      return
    }
    const color = colors[index]
    const maxNormal = Math.min(left, allocation.remainingNormal[color])
    for (let normal = 0; normal <= maxNormal; normal += 1) {
      const leftAfterNormal = left - normal
      const maxRestricted = Math.min(
        leftAfterNormal,
        allocation.remainingRestricted[color],
      )
      for (let restricted = 0; restricted <= maxRestricted; restricted += 1) {
        visitGeneric(
          {
            normal: {
              ...allocation.normal,
              ...(normal
                ? { [color]: (allocation.normal[color] ?? 0) + normal }
                : {}),
            },
            restricted: {
              ...allocation.restricted,
              ...(restricted
                ? {
                    [color]: (allocation.restricted[color] ?? 0) + restricted,
                  }
                : {}),
            },
            remainingNormal: {
              ...allocation.remainingNormal,
              [color]: allocation.remainingNormal[color] - normal,
            },
            remainingRestricted: {
              ...allocation.remainingRestricted,
              [color]: allocation.remainingRestricted[color] - restricted,
            },
          },
          index + 1,
          leftAfterNormal - restricted,
        )
      }
    }
  }
  for (const allocation of allocations)
    visitGeneric(allocation, 0, cost.generic)
  if (!finalAllocations.length) return { kind: 'NOT_ENOUGH_MANA' }

  const actionsFor = (allocation: Allocation): GameAction[] => [
    ...colors
      .filter((color) => allocation.normal[color])
      .map((color) => ({
        type: 'SPEND_MANA' as const,
        color,
        amount: allocation.normal[color] as number,
        actorPlayerId: playerId,
      })),
    ...colors
      .filter((color) => allocation.restricted[color])
      .map((color) => ({
        type: 'SPEND_RESTRICTED_MANA' as const,
        playerId,
        color,
        amount: allocation.restricted[color] as number,
        restriction: 'CREATURE_SPELLS_ONLY' as const,
      })),
  ]
  const labelFor = (allocation: Allocation): string => {
    const normal = paymentLabel(allocation.normal)
    const restricted = paymentLabel(allocation.restricted)
    if (normal && restricted) return `${normal} + ${restricted} (restringido)`
    if (restricted) return `${restricted} (restringido)`
    return normal
  }
  if (finalAllocations.length === 1)
    return { kind: 'PAYABLE', actions: actionsFor(finalAllocations[0]) }
  return {
    kind: 'AMBIGUOUS',
    options: finalAllocations.map((allocation, index) => ({
      id: `mana-payment-${index}`,
      label: labelFor(allocation),
      actions: actionsFor(allocation),
    })),
  }
}
