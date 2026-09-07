import type { GameAction } from '../../actions/gameActions'
import type { GameState } from '../../types/game'
import type {
  ActivatedAbilityDefinition,
  RuntimeVariableValue,
} from '../types/abilityTypes'
import {
  effectiveTypeLine,
  hasEffectiveKeyword,
  landLosesAbilitiesToBasicType,
  staticConditionMatches,
} from './staticEffects'
import {
  activePlayerIdOf,
  localPlayerIdOf,
  playerManaPool,
} from '../../rules/players/playerState'
import {
  LOYALTY_COUNTER,
  LOYALTY_USED_TURN_RUNTIME_KEY,
  loyaltyAbilityUsedThisTurn,
  loyaltyOf,
} from '../../rules/planeswalker/planeswalkerRules'

export type ActivationResult =
  | {
      ok: true
      actions: GameAction[]
      costActions: GameAction[]
      effectActions: GameAction[]
    }
  | {
      ok: false
      code:
        | 'SOURCE_TAPPED'
        | 'SUMMONING_SICKNESS'
        | 'NOT_ENOUGH_MANA'
        | 'NOT_ENOUGH_LOYALTY'
        | 'ACTIVATION_LIMIT_REACHED'
        | 'INVALID_TIMING'
        | 'COST_SELECTION_REQUIRED'
        | 'UNSUPPORTED_COST'
    }

const manaSymbols = (cost: string): string[] =>
  [...cost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1])

const resolveActivationManaCost = (
  cost: string,
  variables: Record<string, RuntimeVariableValue>,
): string | undefined => {
  let resolved = cost
  for (const [name, value] of Object.entries(variables)) {
    if (typeof value !== 'number') continue
    if (!Number.isSafeInteger(value) || value < 0) return undefined
    resolved = resolved.replaceAll(`{${name}}`, `{${value}}`)
  }
  return /\{X\}/.test(resolved) ? undefined : resolved
}

const manaPaymentActions = (
  state: GameState,
  cost: string,
  playerId: string,
): GameAction[] | undefined => {
  const available = { ...playerManaPool(state, playerId) }
  const actions: GameAction[] = []
  for (const symbol of manaSymbols(cost)) {
    if (/^\d+$/.test(symbol)) {
      let remaining = Number(symbol)
      for (const color of ['C', 'W', 'U', 'B', 'R', 'G'] as const) {
        const amount = Math.min(available[color], remaining)
        if (!amount) continue
        available[color] -= amount
        remaining -= amount
        actions.push(
          playerId === localPlayerIdOf(state)
            ? { type: 'SPEND_MANA', color, amount, actorPlayerId: playerId }
            : { type: 'SPEND_PLAYER_MANA', playerId, color, amount },
        )
        if (!remaining) break
      }
      if (remaining) return undefined
      continue
    }
    if (
      !['W', 'U', 'B', 'R', 'G', 'C'].includes(symbol) ||
      !available[symbol as keyof typeof available]
    )
      return undefined
    available[symbol as keyof typeof available] -= 1
    const color = symbol as 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
    actions.push(
      playerId === localPlayerIdOf(state)
        ? { type: 'SPEND_MANA', color, amount: 1, actorPlayerId: playerId }
        : { type: 'SPEND_PLAYER_MANA', playerId, color, amount: 1 },
    )
  }
  return actions
}

const activationValue = (
  state: GameState,
  sourceInstanceId: string,
  value: import('../types/abilityTypes').ValueExpression,
  variables: Record<string, RuntimeVariableValue>,
): number => {
  if (value.type === 'LITERAL') return value.value
  if (value.type === 'VARIABLE') {
    const resolved = variables[value.name]
    return typeof resolved === 'number' ? resolved : 0
  }
  if (value.type === 'COUNT_OBJECTS') {
    const source = state.cards.find(
      (card) => card.instanceId === sourceInstanceId,
    )
    if (!source) return 0
    const sourceControllerId = source.controllerId ?? localPlayerIdOf(state)
    return state.cards.filter((card) => {
      const query = value.query
      if (query.zones?.length && !query.zones.includes(card.zone)) return false
      if (
        query.controller === 'SOURCE_CONTROLLER' &&
        (card.controllerId ?? localPlayerIdOf(state)) !== sourceControllerId
      )
        return false
      const line = effectiveTypeLine(state, card).toLocaleLowerCase()
      if (
        query.cardTypes?.some(
          (type) => !line.includes(type.toLocaleLowerCase()),
        )
      )
        return false
      if (
        query.cardTypesAnyOf?.length &&
        !query.cardTypesAnyOf.some((type) =>
          line.includes(type.toLocaleLowerCase()),
        )
      )
        return false
      if (
        query.excludeCardTypes?.some((type) =>
          line.includes(type.toLocaleLowerCase()),
        )
      )
        return false
      if (
        query.subtypes?.some(
          (subtype) =>
            typeof subtype !== 'string' ||
            !line.includes(subtype.toLocaleLowerCase()),
        )
      )
        return false
      if (
        query.subtypesAnyOf?.length &&
        !query.subtypesAnyOf.some(
          (subtype) =>
            typeof subtype === 'string' &&
            line.includes(subtype.toLocaleLowerCase()),
        )
      )
        return false
      if (query.historic !== undefined) {
        const historic = /\bartifact\b|\blegendary\b|\bsaga\b/i.test(line)
        if (historic !== query.historic) return false
      }
      if (query.hasAnyCounters !== undefined) {
        const hasAny = Object.values(card.counters).some((amount) => amount > 0)
        if (hasAny !== query.hasAnyCounters) return false
      }
      if (
        query.hasCounterType &&
        (card.counters[query.hasCounterType] ?? 0) <
          (query.counterCountAtLeast ?? 1)
      )
        return false
      return true
    }).length
  }
  if (value.type === 'COUNTER_COUNT') {
    const targetId = value.target === 'SOURCE' ? sourceInstanceId : undefined
    return targetId
      ? (state.cards.find((card) => card.instanceId === targetId)?.counters[
          value.counterType
        ] ?? 0)
      : 0
  }
  if (value.type === 'ADD')
    return value.values.reduce(
      (sum, entry) =>
        sum + activationValue(state, sourceInstanceId, entry, variables),
      0,
    )
  if (value.type === 'SUBTRACT')
    return Math.max(
      0,
      activationValue(state, sourceInstanceId, value.left, variables) -
        activationValue(state, sourceInstanceId, value.right, variables),
    )
  return 0
}

const reduceGenericManaCost = (cost: string, reduction: number): string => {
  let remainingReduction = Math.max(0, Math.floor(reduction))
  return cost.replace(/\{(\d+)\}/g, (_whole, amount: string) => {
    const current = Number(amount)
    const reduced = Math.max(0, current - remainingReduction)
    remainingReduction = Math.max(0, remainingReduction - current)
    return reduced > 0 ? `{${reduced}}` : ''
  })
}

export const activationWaterbendCostCandidates = (
  state: GameState,
  sourceInstanceId: string,
): GameState['cards'] => {
  const source = state.cards.find(
    (card) => card.instanceId === sourceInstanceId,
  )
  if (!source) return []
  const sourceControllerId = source.controllerId ?? localPlayerIdOf(state)
  return state.cards.filter(
    (card) =>
      card.zone === 'battlefield' &&
      !card.phasedOut &&
      !card.tapped &&
      (card.controllerId ?? localPlayerIdOf(state)) === sourceControllerId &&
      /\b(?:artifact|creature)\b/i.test(effectiveTypeLine(state, card)),
  )
}

export const activationPermanentCostCandidates = (
  state: GameState,
  sourceInstanceId: string,
  ability: ActivatedAbilityDefinition,
): GameState['cards'] => {
  const source = state.cards.find(
    (card) => card.instanceId === sourceInstanceId,
  )
  const cost = ability.costs.find((item) => item.type === 'SACRIFICE_PERMANENT')
  if (!source || !cost || cost.type !== 'SACRIFICE_PERMANENT') return []
  const sourceControllerId = source.controllerId ?? localPlayerIdOf(state)
  return state.cards.filter((card) => {
    if (card.zone !== 'battlefield') return false
    if ((card.controllerId ?? localPlayerIdOf(state)) !== sourceControllerId)
      return false
    const lower = effectiveTypeLine(state, card).toLocaleLowerCase()
    const constraints = cost.constraints
    if (constraints.excludeSource && card.instanceId === sourceInstanceId)
      return false
    if (
      constraints.isToken !== undefined &&
      Boolean(card.isToken) !== constraints.isToken
    )
      return false
    if (
      constraints.cardTypes?.some(
        (type) => !lower.includes(type.toLocaleLowerCase()),
      )
    )
      return false
    if (
      constraints.cardTypesAnyOf?.length &&
      !constraints.cardTypesAnyOf.some((type) =>
        lower.includes(type.toLocaleLowerCase()),
      )
    )
      return false
    if (
      constraints.excludeCardTypes?.some((type) =>
        lower.includes(type.toLocaleLowerCase()),
      )
    )
      return false
    if (
      constraints.subtypes?.some(
        (subtype) => !lower.includes(subtype.toLocaleLowerCase()),
      )
    )
      return false
    if (
      constraints.subtypesAnyOf?.length &&
      !constraints.subtypesAnyOf.some((subtype) =>
        lower.includes(subtype.toLocaleLowerCase()),
      )
    )
      return false
    return true
  })
}

/** Validates and expands simple activation costs before ability effects. */
export const resolveActivatedAbility = (
  state: GameState,
  sourceInstanceId: string,
  ability: ActivatedAbilityDefinition,
  variables: Record<string, RuntimeVariableValue> = {},
  selectedCostInstanceIds: string[] = [],
  additionalGenericCost = 0,
): ActivationResult => {
  const source = state.cards.find(
    (card) => card.instanceId === sourceInstanceId,
  )
  if (!source || landLosesAbilitiesToBasicType(state, source))
    return { ok: false, code: 'UNSUPPORTED_COST' }
  if (ability.activeZones?.length && !ability.activeZones.includes(source.zone))
    return { ok: false, code: 'INVALID_TIMING' }
  const selectedCostIds = [...selectedCostInstanceIds]
  const sourceControllerId = source.controllerId ?? localPlayerIdOf(state)
  if (
    ability.activationConditions?.some(
      (condition) => !staticConditionMatches(state, source, condition),
    )
  )
    return { ok: false, code: 'INVALID_TIMING' }
  const loyaltyCost = ability.costs.find((cost) => cost.type === 'LOYALTY')
  if (loyaltyCost) {
    const inMain =
      state.turnState.step === 'MAIN_1' || state.turnState.step === 'MAIN_2'
    if (
      source.zone !== 'battlefield' ||
      source.phasedOut ||
      activePlayerIdOf(state) !== sourceControllerId ||
      !inMain ||
      state.stack.length > 0
    )
      return { ok: false, code: 'INVALID_TIMING' }
    if (loyaltyAbilityUsedThisTurn(state, source))
      return { ok: false, code: 'ACTIVATION_LIMIT_REACHED' }
  }
  if (
    ability.restrictions?.includes('YOUR_TURN') &&
    activePlayerIdOf(state) !== sourceControllerId
  )
    return { ok: false, code: 'INVALID_TIMING' }
  for (const restriction of ability.restrictions ?? []) {
    const match = /^VARIABLE_MIN:([^:]+):(\d+)$/.exec(restriction)
    if (!match) continue
    const actual = variables[match[1]]
    if (typeof actual !== 'number' || actual < Number(match[2]))
      return { ok: false, code: 'INVALID_TIMING' }
  }
  if (ability.restrictions?.includes('SORCERY_SPEED')) {
    const inMain =
      state.turnState.step === 'MAIN_1' || state.turnState.step === 'MAIN_2'
    if (
      activePlayerIdOf(state) !== sourceControllerId ||
      !inMain ||
      state.stack.length > 0
    )
      return { ok: false, code: 'INVALID_TIMING' }
  }
  const activationMarker = `ABILITY_USED:${ability.id}`
  if (
    ability.activationLimit === 'ONCE_PER_OBJECT' &&
    source.runtimeValues?.[activationMarker] === true
  )
    return { ok: false, code: 'ACTIVATION_LIMIT_REACHED' }
  const actions: GameAction[] = []
  const manaCosts: string[] = []
  for (const cost of ability.costs) {
    if (cost.type === 'TAP_SOURCE') {
      if (source.tapped) return { ok: false, code: 'SOURCE_TAPPED' }
      if (
        /\bcreature\b/i.test(effectiveTypeLine(state, source)) &&
        source.controlledSinceTurn === state.turn &&
        !hasEffectiveKeyword(state, source, 'HASTE')
      )
        return { ok: false, code: 'SUMMONING_SICKNESS' }
      actions.push({ type: 'TAP_CARD', instanceId: sourceInstanceId })
    } else if (cost.type === 'MANA_COST') {
      const resolvedCost = resolveActivationManaCost(cost.cost, variables)
      if (!resolvedCost) return { ok: false, code: 'UNSUPPORTED_COST' }
      const reduction = cost.genericReduction
        ? activationValue(
            state,
            sourceInstanceId,
            cost.genericReduction,
            variables,
          )
        : 0
      manaCosts.push(reduceGenericManaCost(resolvedCost, reduction))
    } else if (cost.type === 'WATERBEND') {
      const required = activationValue(
        state,
        sourceInstanceId,
        cost.amount,
        variables,
      )
      if (!Number.isSafeInteger(required) || required < 0)
        return { ok: false, code: 'UNSUPPORTED_COST' }
      const legal = new Set(
        activationWaterbendCostCandidates(state, sourceInstanceId).map(
          (card) => card.instanceId,
        ),
      )
      const selected = [
        ...new Set(selectedCostIds.filter((id) => legal.has(id))),
      ]
      if (
        selected.length !== selectedCostIds.length ||
        selected.length > required
      )
        return { ok: false, code: 'UNSUPPORTED_COST' }
      for (const instanceId of selected)
        actions.push({ type: 'TAP_CARD', instanceId })
      const remaining = required - selected.length
      if (remaining > 0) manaCosts.push(`{${remaining}}`)
      selectedCostIds.splice(0, selectedCostIds.length)
    } else if (cost.type === 'DISCARD_SOURCE') {
      if (source.zone !== 'hand') return { ok: false, code: 'UNSUPPORTED_COST' }
      actions.push({
        type: 'MOVE_CARD',
        instanceId: sourceInstanceId,
        toZone: 'graveyard',
      })
    } else if (cost.type === 'SACRIFICE_SOURCE') {
      if (source.zone !== 'battlefield')
        return { ok: false, code: 'UNSUPPORTED_COST' }
      actions.push({
        type: 'MOVE_CARD',
        instanceId: sourceInstanceId,
        toZone: 'graveyard',
      })
    } else if (cost.type === 'EXILE_SOURCE_FROM_GRAVEYARD') {
      if (source.zone !== 'graveyard')
        return { ok: false, code: 'UNSUPPORTED_COST' }
      actions.push({
        type: 'MOVE_CARD',
        instanceId: sourceInstanceId,
        toZone: 'exile',
      })
    } else if (cost.type === 'EXILE_SOURCE_FROM_BATTLEFIELD') {
      if (source.zone !== 'battlefield' || source.phasedOut)
        return { ok: false, code: 'UNSUPPORTED_COST' }
      actions.push({
        type: 'MOVE_CARD',
        instanceId: sourceInstanceId,
        toZone: 'exile',
      })
    } else if (cost.type === 'REMOVE_COUNTERS_FROM_SOURCE') {
      if (source.zone !== 'battlefield' || source.phasedOut)
        return { ok: false, code: 'UNSUPPORTED_COST' }
      const amount = activationValue(
        state,
        sourceInstanceId,
        cost.amount,
        variables,
      )
      if (!Number.isSafeInteger(amount) || amount < 0)
        return { ok: false, code: 'UNSUPPORTED_COST' }
      if ((source.counters[cost.counterType] ?? 0) < amount)
        return { ok: false, code: 'UNSUPPORTED_COST' }
      if (amount > 0)
        actions.push({
          type: 'REMOVE_COUNTER',
          instanceId: sourceInstanceId,
          counter: cost.counterType,
          amount,
        })
    } else if (cost.type === 'LOYALTY') {
      if (!Number.isSafeInteger(cost.amount))
        return { ok: false, code: 'UNSUPPORTED_COST' }
      if (cost.amount < 0 && loyaltyOf(source) < -cost.amount)
        return { ok: false, code: 'NOT_ENOUGH_LOYALTY' }
      if (cost.amount > 0)
        actions.push({
          type: 'ADD_COUNTER',
          instanceId: sourceInstanceId,
          counter: LOYALTY_COUNTER,
          amount: cost.amount,
        })
      else if (cost.amount < 0)
        actions.push({
          type: 'REMOVE_COUNTER',
          instanceId: sourceInstanceId,
          counter: LOYALTY_COUNTER,
          amount: -cost.amount,
        })
    } else if (cost.type === 'SACRIFICE_PERMANENT') {
      const selected = selectedCostIds.shift()
      if (!selected) return { ok: false, code: 'COST_SELECTION_REQUIRED' }
      const legal = activationPermanentCostCandidates(
        state,
        sourceInstanceId,
        ability,
      )
      if (!legal.some((card) => card.instanceId === selected))
        return { ok: false, code: 'UNSUPPORTED_COST' }
      actions.push({
        type: 'MOVE_CARD',
        instanceId: selected,
        toZone: 'graveyard',
      })
    } else {
      return { ok: false, code: 'UNSUPPORTED_COST' }
    }
  }
  if (additionalGenericCost > 0) manaCosts.push(`{${additionalGenericCost}}`)
  if (manaCosts.length) {
    const payment = manaPaymentActions(
      state,
      manaCosts.join(''),
      sourceControllerId,
    )
    if (!payment) return { ok: false, code: 'NOT_ENOUGH_MANA' }
    actions.push(...payment)
  }
  if (ability.activationLimit === 'ONCE_PER_OBJECT')
    actions.push({
      type: 'SET_CARD_RUNTIME_VALUE',
      instanceId: sourceInstanceId,
      key: activationMarker,
      value: true,
    })
  if (loyaltyCost)
    actions.push({
      type: 'SET_CARD_RUNTIME_VALUE',
      instanceId: sourceInstanceId,
      key: LOYALTY_USED_TURN_RUNTIME_KEY,
      value: state.turn,
    })
  const deterministicManaEffects =
    ability.isManaAbility &&
    ability.effects.every(
      (effect) =>
        effect.type === 'ADD_MANA' || effect.type === 'ADD_RESTRICTED_MANA',
    )
      ? ability.effects
      : undefined
  const effectActions: GameAction[] = []
  for (const effect of deterministicManaEffects ?? []) {
    if (effect.type === 'ADD_MANA') {
      effectActions.push({
        type: 'ADD_PLAYER_MANA',
        playerId: sourceControllerId,
        color: effect.color,
        amount: effect.amount,
      })
    } else {
      effectActions.push({
        type: 'ADD_RESTRICTED_MANA',
        playerId: sourceControllerId,
        color: effect.color,
        amount: effect.amount,
        restriction: effect.restriction,
        sourceInstanceId,
      })
    }
  }
  return {
    ok: true,
    actions: [...actions, ...effectActions],
    costActions: actions,
    effectActions,
  }
}
