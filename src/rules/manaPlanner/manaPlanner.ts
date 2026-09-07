import { isPresentPermanent } from '../phasing/phasingRules'
import { resolveActivatedAbility } from '../../abilities/engine/activationEngine'
import type { GameAction } from '../../actions/gameActions'
import { emptyManaPool } from '../../engine/gameEngine'
import { basicLandManaColor } from '../legality/basicLands'
import { planManaPayment, type SpellManaCost } from '../costs/manaCost'
import type { CardDefinition, ManaColor } from '../../types/card'
import type { AutoManaMode, GameState, ManaPool } from '../../types/game'
import { localPlayerIdOf, playerManaPool } from '../players/playerState'
import { combinedCommanderColorIdentity } from '../commander/commanderRules'
import { getVisualCardLabel } from '../../utils/cardLabels'
import {
  effectiveAbilitiesForCard,
  effectiveTypeLine,
  hasEffectiveKeyword,
} from '../../abilities/engine/staticEffects'

export type ManaPlannerMode = AutoManaMode

export type AvailableManaAbility = {
  sourceInstanceId: string
  label: string
  production: ManaPool
  activationActions: GameAction[]
  /** Stable rules-relevant fingerprint used to collapse interchangeable sources. */
  equivalenceKey: string
}

export type PlannedManaPayment = {
  id: string
  sourceIds: string[]
  sourceEquivalenceKeys: string[]
  label: string
  activationActions: GameAction[]
  paymentActions: GameAction[]
  actions: GameAction[]
  resultingManaPool: ManaPool
  leavesProducedMana: boolean
}

export type ManaPlannerResult =
  | { kind: 'ALREADY_PAYABLE' }
  | { kind: 'UNIQUE_SAFE_PLAN'; plan: PlannedManaPayment }
  | { kind: 'MULTIPLE_SAFE_PLANS'; plans: PlannedManaPayment[] }
  | { kind: 'REQUIRES_CONFIRMATION'; plans: PlannedManaPayment[] }
  | { kind: 'NO_SAFE_PLAN' }
  | { kind: 'UNSUPPORTED' }

const manaColors: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C']
const maximumPlans = 64

const addPools = (left: ManaPool, right: ManaPool): ManaPool =>
  manaColors.reduce<ManaPool>(
    (pool, color) => ({ ...pool, [color]: pool[color] + right[color] }),
    { ...left },
  )

const subtractSpends = (pool: ManaPool, actions: GameAction[]): ManaPool =>
  actions.reduce<ManaPool>(
    (next, action) =>
      action.type === 'SPEND_MANA'
        ? { ...next, [action.color]: next[action.color] - action.amount }
        : next,
    { ...pool },
  )

const hasNewManaRemaining = (before: ManaPool, after: ManaPool): boolean =>
  manaColors.some((color) => after[color] > before[color])

const labelForProduction = (production: ManaPool): string =>
  manaColors
    .filter((color) => production[color])
    .map((color) => `{${color}}`.repeat(production[color]))
    .join('')

const stableRecordEntries = <T extends string | number | boolean>(
  record: Record<string, T> | undefined,
) =>
  Object.entries(record ?? {})
    .filter(([, value]) => value !== 0 && value !== false && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))

/**
 * Two mana sources may be chosen interchangeably only when their public,
 * rules-relevant state is the same and neither instance is singled out by an
 * ongoing effect. This deliberately errs on the side of asking when unsure.
 */
const manaSourceEquivalenceKey = (
  state: GameState,
  sourceInstanceId: string,
  production: ManaPool,
): string => {
  const source = state.cards.find(
    (card) => card.instanceId === sourceInstanceId,
  )
  if (!source) return `missing:${sourceInstanceId}`

  const incomingAttachments = state.cards
    .filter((card) => card.attachedToInstanceId === source.instanceId)
    .map((card) => card.instanceId)
    .sort()
  const instanceSpecificState = {
    linkedObjectGroups: (state.linkedObjectGroups ?? []).filter(
      (group) =>
        group.sourceInstanceId === source.instanceId ||
        group.linkedInstanceIds.includes(source.instanceId),
    ),
    temporaryContinuousEffects: (state.temporaryContinuousEffects ?? []).filter(
      (effect) =>
        effect.sourceInstanceId === source.instanceId ||
        effect.targetInstanceId === source.instanceId,
    ),
    untapRestrictions: (state.untapRestrictions ?? []).filter(
      (restriction) =>
        restriction.sourceInstanceId === source.instanceId ||
        restriction.targetInstanceId === source.instanceId,
    ),
    typeContinuousEffects: (state.typeContinuousEffects ?? []).filter(
      (effect) =>
        effect.sourceInstanceId === source.instanceId ||
        effect.targetInstanceId === source.instanceId,
    ),
    copyContinuousEffects: (state.copyContinuousEffects ?? []).filter(
      (effect) =>
        effect.sourceInstanceId === source.instanceId ||
        effect.targetInstanceId === source.instanceId ||
        effect.copiedFromInstanceId === source.instanceId,
    ),
    blockingRestrictions: (state.temporaryBlockingRestrictions ?? []).filter(
      (restriction) =>
        restriction.sourceInstanceId === source.instanceId ||
        restriction.targetInstanceId === source.instanceId,
    ),
  }

  return JSON.stringify({
    cardIdentity:
      source.card.oracleId ?? source.card.scryfallId ?? source.card.name,
    effectiveTypeLine: effectiveTypeLine(state, source),
    production: manaColors.map((color) => production[color]),
    counters: stableRecordEntries(source.counters),
    keywords: [...(source.keywords ?? [])].sort(),
    runtimeValues: stableRecordEntries(source.runtimeValues),
    attachedToInstanceId: source.attachedToInstanceId ?? null,
    incomingAttachments,
    isToken: source.isToken ?? false,
    tokenDefinitionId: source.tokenDefinitionId ?? null,
    copiedFromInstanceId: source.copiedFromInstanceId ?? null,
    ownerId: source.ownerId ?? null,
    controllerId: source.controllerId ?? null,
    controller: source.controller ?? 'YOU',
    controlledSinceTurn: source.controlledSinceTurn ?? null,
    damageMarked: source.damageMarked ?? 0,
    deathtouchDamageMarked: source.deathtouchDamageMarked ?? false,
    instanceSpecificState,
  })
}

const paymentSignature = (actions: GameAction[]) =>
  actions
    .filter(
      (action): action is Extract<GameAction, { type: 'SPEND_MANA' }> =>
        action.type === 'SPEND_MANA',
    )
    .map((action) => `${action.color}:${action.amount}`)
    .sort()
    .join('|')

const productionSignature = (production: ManaPool): string =>
  manaColors.map((color) => `${color}:${production[color]}`).join('|')

const collapseEquivalentPlans = (
  plans: PlannedManaPayment[],
): PlannedManaPayment[] => {
  const seen = new Set<string>()
  return plans.filter((plan) => {
    const sourceKeys = [...plan.sourceEquivalenceKeys].sort()
    const key = JSON.stringify({
      sourceKeys,
      payment: paymentSignature(plan.paymentActions),
      resultingManaPool: manaColors.map(
        (color) => plan.resultingManaPool[color],
      ),
      leavesProducedMana: plan.leavesProducedMana,
    })
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const newlyFloatingMana = (before: ManaPool, after: ManaPool): number =>
  manaColors.reduce(
    (sum, color) => sum + Math.max(0, after[color] - before[color]),
    0,
  )

const sourceFlexibilityByInstance = (
  available: AvailableManaAbility[],
): Map<string, number> => {
  const productions = new Map<string, Set<string>>()
  for (const source of available) {
    const current =
      productions.get(source.sourceInstanceId) ?? new Set<string>()
    current.add(productionSignature(source.production))
    productions.set(source.sourceInstanceId, current)
  }
  return new Map(
    [...productions].map(([instanceId, choices]) => [instanceId, choices.size]),
  )
}

/**
 * SMART mana deliberately prefers the least committal payment:
 * 1. fewer physical sources,
 * 2. less newly-floating mana,
 * 3. less-flexible sources before rainbow/choice sources,
 * 4. a stable deterministic tie-breaker.
 *
 * If a player wants to choose every materially different plan, CONFIRM mode
 * keeps the old pending-decision behaviour.
 */
const rankSmartPlans = (
  plans: PlannedManaPayment[],
  available: AvailableManaAbility[],
  currentPool: ManaPool,
): PlannedManaPayment[] => {
  const flexibility = sourceFlexibilityByInstance(available)
  const score = (plan: PlannedManaPayment) => ({
    sources: plan.sourceIds.length,
    floating: newlyFloatingMana(currentPool, plan.resultingManaPool),
    flexibility: plan.sourceIds.reduce(
      (sum, sourceId) =>
        sum + Math.max(0, (flexibility.get(sourceId) ?? 1) - 1),
      0,
    ),
    stable: `${[...plan.sourceIds].sort().join('|')}::${paymentSignature(plan.paymentActions)}`,
  })
  return [...plans].sort((left, right) => {
    const a = score(left)
    const b = score(right)
    return (
      a.sources - b.sources ||
      a.floating - b.floating ||
      a.flexibility - b.flexibility ||
      a.stable.localeCompare(b.stable)
    )
  })
}

const isAutoSafeManaAbilities = (
  state: GameState,
  sourceInstanceId: string,
  playerId: string,
): AvailableManaAbility[] => {
  const source = state.cards.find(
    (card) =>
      card.instanceId === sourceInstanceId &&
      isPresentPermanent(card) &&
      (card.controllerId ?? localPlayerIdOf(state)) === playerId,
  )
  if (!source || source.tapped) return []

  const isSummoningSick =
    /\bcreature\b/i.test(effectiveTypeLine(state, source)) &&
    source.controlledSinceTurn === state.turn &&
    !hasEffectiveKeyword(state, source, 'HASTE')
  if (isSummoningSick) return []

  const basicColor = basicLandManaColor(effectiveTypeLine(state, source))
  if (basicColor)
    return [
      {
        sourceInstanceId,
        label: getVisualCardLabel(
          source,
          state.cards.filter(isPresentPermanent),
        ),
        production: { ...emptyManaPool(), [basicColor]: 1 },
        activationActions: [
          { type: 'TAP_CARD', instanceId: source.instanceId },
          playerId === localPlayerIdOf(state)
            ? {
                type: 'ADD_MANA',
                color: basicColor,
                amount: 1,
                actorPlayerId: playerId,
              }
            : {
                type: 'ADD_PLAYER_MANA',
                playerId,
                color: basicColor,
                amount: 1,
              },
        ],
        equivalenceKey: manaSourceEquivalenceKey(state, source.instanceId, {
          ...emptyManaPool(),
          [basicColor]: 1,
        }),
      },
    ]

  const abilities = effectiveAbilitiesForCard(state, source).filter(
    (
      ability,
    ): ability is import('../../abilities/types/abilityTypes').ActivatedAbilityDefinition =>
      ability.kind === 'ACTIVATED' &&
      ability.isManaAbility === true &&
      ability.costs.length === 1 &&
      ability.costs[0]?.type === 'TAP_SOURCE' &&
      ability.effects.length > 0,
  )
  if (abilities.length !== 1) return []

  const ability = abilities[0]
  const fixedMana = ability.effects.every(
    (effect) => effect.type === 'ADD_MANA' && effect.amount > 0,
  )
  if (fixedMana) {
    const activation = resolveActivatedAbility(
      state,
      source.instanceId,
      ability,
    )
    if (!activation.ok) return []
    const production = activation.effectActions.reduce<ManaPool>(
      (pool, action) =>
        action.type === 'ADD_MANA' || action.type === 'ADD_PLAYER_MANA'
          ? { ...pool, [action.color]: pool[action.color] + action.amount }
          : pool,
      emptyManaPool(),
    )
    if (!manaColors.some((color) => production[color])) return []
    return [
      {
        sourceInstanceId,
        label: getVisualCardLabel(
          source,
          state.cards.filter(isPresentPermanent),
        ),
        production,
        activationActions: activation.actions,
        equivalenceKey: manaSourceEquivalenceKey(
          state,
          source.instanceId,
          production,
        ),
      },
    ]
  }

  if (
    ability.effects.length !== 1 ||
    ability.effects[0]?.type !== 'ADD_MANA_CHOICE'
  )
    return []
  const choice = ability.effects[0]
  const choiceAmount =
    choice.amount.type === 'LITERAL' ? choice.amount.value : undefined
  if (!choiceAmount || choiceAmount <= 0) return []
  const allowedColors = Array.isArray(choice.allowedColors)
    ? choice.allowedColors
    : combinedCommanderColorIdentity(state, playerId).filter(
        (color) => color !== 'C',
      )
  const label = getVisualCardLabel(
    source,
    state.cards.filter(isPresentPermanent),
  )
  return [...new Set(allowedColors)].map((color) => {
    const production = { ...emptyManaPool(), [color]: choiceAmount }
    return {
      sourceInstanceId,
      label,
      production,
      activationActions: [
        { type: 'TAP_CARD', instanceId: source.instanceId },
        playerId === localPlayerIdOf(state)
          ? {
              type: 'ADD_MANA',
              color,
              amount: choiceAmount,
              actorPlayerId: playerId,
            }
          : {
              type: 'ADD_PLAYER_MANA',
              playerId,
              color,
              amount: choiceAmount,
            },
      ],
      equivalenceKey: manaSourceEquivalenceKey(
        state,
        source.instanceId,
        production,
      ),
    }
  })
}

/** Returns only currently legal, deterministic mana abilities. It never changes state. */
export const findAvailableManaAbilities = (
  state: GameState,
  playerId = localPlayerIdOf(state),
): AvailableManaAbility[] =>
  state.cards
    .filter(
      (card) =>
        isPresentPermanent(card) &&
        (card.controllerId ?? localPlayerIdOf(state)) === playerId,
    )
    .flatMap((card) =>
      isAutoSafeManaAbilities(state, card.instanceId, playerId),
    )

/**
 * Finds safe, deterministic ways to create just enough mana for a normal cost.
 * The bounded search stops after it has enough alternatives to prove that no
 * arbitrary source should be selected.
 */
export const planSmartManaPayment = ({
  state,
  manaCost,
  availableManaAbilities,
  mode = 'SMART',
  card,
  playerId = localPlayerIdOf(state),
}: {
  state: GameState
  manaCost: SpellManaCost
  availableManaAbilities?: AvailableManaAbility[]
  mode?: ManaPlannerMode
  card?: CardDefinition
  playerId?: string
}): ManaPlannerResult => {
  const available =
    availableManaAbilities ?? findAvailableManaAbilities(state, playerId)
  const already = planManaPayment(state, manaCost, card, playerId)
  if (already.kind !== 'NOT_ENOUGH_MANA') return { kind: 'ALREADY_PAYABLE' }
  if (mode === 'STRICT') return { kind: 'NO_SAFE_PLAN' }
  const plans: PlannedManaPayment[] = []
  const visit = (index: number, chosen: AvailableManaAbility[]) => {
    if (plans.length >= maximumPlans) return
    if (index === available.length) {
      if (!chosen.length) return
      const poolAfterActivations = chosen.reduce(
        (pool, source) => addPools(pool, source.production),
        { ...playerManaPool(state, playerId) },
      )
      const payment = planManaPayment(
        {
          ...state,
          manaPool: poolAfterActivations,
          players: state.players.map((player) =>
            player.id === playerId
              ? { ...player, manaPool: poolAfterActivations }
              : player,
          ),
        },
        manaCost,
        card,
        playerId,
      )
      if (payment.kind === 'NOT_ENOUGH_MANA') return
      const paymentOptions =
        payment.kind === 'PAYABLE'
          ? [{ id: 'unique', actions: payment.actions }]
          : payment.options
      for (const option of paymentOptions) {
        if (plans.length >= maximumPlans) break
        const resultingManaPool = subtractSpends(
          poolAfterActivations,
          option.actions,
        )
        const sourceNames = chosen.map((source) => source.label).join(' + ')
        plans.push({
          id: `mana-plan-${plans.length + 1}`,
          sourceIds: chosen.map((source) => source.sourceInstanceId),
          sourceEquivalenceKeys: chosen.map((source) => source.equivalenceKey),
          label: `${sourceNames} → ${chosen.map((source) => labelForProduction(source.production)).join(' + ')}`,
          activationActions: chosen.flatMap(
            (source) => source.activationActions,
          ),
          paymentActions: option.actions,
          actions: [
            ...chosen.flatMap((source) => source.activationActions),
            ...option.actions,
          ],
          resultingManaPool,
          leavesProducedMana: hasNewManaRemaining(
            playerManaPool(state, playerId),
            resultingManaPool,
          ),
        })
      }
      return
    }
    visit(index + 1, chosen)
    if (
      !chosen.some(
        (source) =>
          source.sourceInstanceId === available[index].sourceInstanceId,
      )
    )
      visit(index + 1, [...chosen, available[index]])
  }
  visit(0, [])
  if (!plans.length) return { kind: 'NO_SAFE_PLAN' }

  // Never activate a source that is not needed to complete this payment.
  const minimumSourceCount = Math.min(
    ...plans.map((plan) => plan.sourceIds.length),
  )
  const minimalPlans = plans.filter(
    (plan) => plan.sourceIds.length === minimumSourceCount,
  )
  const distinctPlans = collapseEquivalentPlans(minimalPlans)
  const rankedPlans = rankSmartPlans(
    distinctPlans,
    available,
    playerManaPool(state, playerId),
  )

  if (mode === 'SMART')
    return { kind: 'UNIQUE_SAFE_PLAN', plan: rankedPlans[0] }
  if (rankedPlans.length > 1)
    return { kind: 'MULTIPLE_SAFE_PLANS', plans: rankedPlans }
  return { kind: 'REQUIRES_CONFIRMATION', plans: rankedPlans }
}
