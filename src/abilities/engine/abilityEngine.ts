import { isPresentPermanent } from '../../rules/phasing/phasingRules'
import type { GameAction } from '../../actions/gameActions'
import type { GameEvent } from '../../events/gameEvents'
import type { GameState } from '../../types/game'
import { tokenDefinitions } from '../../tokens/tokenDefinitions'
import { parseManaCost, planManaPayment } from '../../rules/costs/manaCost'
import { planSmartManaPayment } from '../../rules/manaPlanner/manaPlanner'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import {
  effectiveCardDefinition,
  effectiveCopiableKeywords,
} from '../../rules/copy/copyCharacteristics'
import {
  effectiveAbilitiesForCard,
  effectiveTypeLine,
  effectiveCreatureSubtypes,
  hasEffectiveKeyword,
  modifiedPowerToughness,
  deriveActiveStaticEffects,
  isProtectedFromSource,
  landLosesAbilitiesToBasicType,
} from './staticEffects'
import {
  canTarget,
  canTargetPlayer,
} from '../../rules/targeting/targetingRules'
import {
  combinedCommanderColorIdentity,
  isCommanderInstance,
} from '../../rules/commander/commanderRules'
import {
  declaredModeVariableKey,
  declaredTargetCountVariableKey,
  legalDeclarationTargetOptions,
} from '../../rules/targeting/declarationTargets'
import {
  activePlayerIdOf,
  localPlayerIdOf,
  opponentPlayerIds,
  playerStateFor,
} from '../../rules/players/playerState'
import type {
  AbilityDefinition,
  ConditionDefinition,
  EffectDefinition,
  EffectAmount,
  ValueExpression,
  ObjectQuery,
  EffectReference,
  PendingDecision,
  PendingAbility,
  PendingResolution,
  ResolvedEffect,
  ResolutionContext,
  SelectionConstraints,
  SpellEffectDefinition,
  ActivatedAbilityDefinition,
  RuntimeTextReference,
  AsEntersAbilityDefinition,
  DelayedEffect,
} from '../types/abilityTypes'

const eventMatchesTrigger = (
  ability: Extract<AbilityDefinition, { kind: 'TRIGGERED' }>,
  event: GameEvent,
): boolean => ability.trigger.type === event.type

const resolveTextReferenceFromSource = (
  value: RuntimeTextReference,
  source?: {
    instanceId: string
    runtimeValues?: Record<string, string | number | boolean>
  },
): string | undefined => {
  if (typeof value === 'string') return value
  if (value.type === 'SOURCE_VALUE') {
    const stored = source?.runtimeValues?.[value.key]
    return typeof stored === 'string' ? stored : undefined
  }
  return undefined
}

const conditionMatches = (
  condition: ConditionDefinition,
  event: GameEvent,
  source?: {
    instanceId: string
    attachedToInstanceId?: string
    controller?: 'YOU' | 'OPPONENT'
    controllerId?: string
    runtimeValues?: Record<string, string | number | boolean>
  },
  state?: GameState,
): boolean => {
  if (condition.type === 'EVENT_TURN_STEP_IS')
    return 'step' in event && event.step === condition.value
  if (condition.type === 'EVENT_TRANSFORMED_TO_NAME')
    return (
      event.type === 'PERMANENT_TRANSFORMED' &&
      event.toFaceName.toLocaleLowerCase() ===
        condition.value.toLocaleLowerCase()
    )
  if (condition.type === 'EVENT_SUBJECT_IS_SOURCE')
    return Boolean(
      source &&
      (('cardInstanceId' in event &&
        event.cardInstanceId === source.instanceId) ||
        ('sourceInstanceId' in event &&
          event.sourceInstanceId === source.instanceId)),
    )
  if (condition.type === 'EVENT_SUBJECT_IS_NOT_SOURCE')
    return Boolean(
      source &&
      'cardInstanceId' in event &&
      event.cardInstanceId !== source.instanceId,
    )
  if (condition.type === 'EVENT_IS_HISTORIC')
    return (
      'cardTypes' in event &&
      (event.cardTypes.some((type) =>
        ['artifact', 'legendary'].includes(type.toLocaleLowerCase()),
      ) ||
        ('subtypes' in event &&
          event.subtypes.some(
            (subtype) => subtype.toLocaleLowerCase() === 'saga',
          )))
    )
  if (condition.type === 'EVENT_HAS_COUNTER')
    return (
      'counters' in event &&
      (event.counters[condition.counterType] ?? 0) >= (condition.atLeast ?? 1)
    )
  if (condition.type === 'EVENT_HAS_ANY_COUNTERS')
    return (
      'counters' in event &&
      Object.values(event.counters).some((amount) => amount > 0)
    )
  if (condition.type === 'EVENT_SOURCE_IS_ATTACHED_OBJECT')
    return Boolean(
      source?.attachedToInstanceId &&
      'sourceInstanceId' in event &&
      event.sourceInstanceId === source.attachedToInstanceId,
    )
  if (condition.type === 'EVENT_SUBJECT_IS_ATTACHED_OBJECT')
    return Boolean(
      source?.attachedToInstanceId &&
      'cardInstanceId' in event &&
      event.cardInstanceId === source.attachedToInstanceId,
    )
  if (condition.type === 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER') {
    if (!source || !('activePlayerId' in event) || !event.activePlayerId)
      return false
    return source.controllerId
      ? source.controllerId === event.activePlayerId
      : (source.controller ?? 'YOU') === 'YOU'
  }
  if (condition.type === 'EVENT_PLAYER_IS_SOURCE_CONTROLLER') {
    if (!source || !('playerId' in event)) return false
    if (source.controllerId && event.playerId)
      return source.controllerId === event.playerId
    return (
      'controller' in event && event.controller === (source.controller ?? 'YOU')
    )
  }
  if (condition.type === 'EVENT_PLAYER_IS_OPPONENT_OF_SOURCE_CONTROLLER') {
    if (!source || !('playerId' in event) || !event.playerId) return false
    const sourceControllerId =
      source.controllerId ??
      (source.controller === 'OPPONENT'
        ? state
          ? (opponentPlayerIds(state, localPlayerIdOf(state))[0] ?? 'player-2')
          : 'player-2'
        : state
          ? localPlayerIdOf(state)
          : 'player-1')
    return event.playerId !== sourceControllerId
  }
  if (condition.type === 'SPELL_IS_CREATURE')
    return event.type === 'SPELL_CAST' && event.isCreature === condition.value
  if (condition.type === 'EVENT_NUMBER_COMPARE') {
    const actual =
      condition.field === 'blueManaSymbols' && event.type === 'SPELL_CAST'
        ? event.blueManaSymbols
        : condition.field === 'castNumberThisTurn' &&
            event.type === 'SPELL_CAST'
          ? event.castNumberThisTurn
          : condition.field === 'manaSpent' && event.type === 'SPELL_CAST'
            ? event.manaSpent
            : condition.field === 'damageAmount' && 'amount' in event
              ? event.amount
              : undefined
    if (actual === undefined) return false
    if (condition.operator === 'GT') return actual > condition.value
    if (condition.operator === 'GTE') return actual >= condition.value
    return actual === condition.value
  }
  const controller =
    event.type === 'PLAYER_SHUFFLED'
      ? event.controller
      : 'controller' in event
        ? event.controller
        : 'YOU'
  if (condition.type === 'EVENT_CONTROLLER_IS') {
    if (source && state && 'playerId' in event && event.playerId) {
      const sourcePlayerId =
        source.controllerId ??
        (source.controller === 'OPPONENT'
          ? (opponentPlayerIds(state, localPlayerIdOf(state))[0] ?? 'player-2')
          : localPlayerIdOf(state))
      return condition.value === 'YOU'
        ? event.playerId === sourcePlayerId
        : event.playerId !== sourcePlayerId
    }
    return controller === condition.value
  }
  if (condition.type === 'EVENT_IS_TOKEN')
    return 'isToken' in event && event.isToken === condition.value
  if (condition.type === 'EVENT_HAS_KEYWORD') {
    if (!state || !('cardInstanceId' in event)) return false
    const card = state.cards.find(
      (candidate) => candidate.instanceId === event.cardInstanceId,
    )
    return Boolean(card && hasEffectiveKeyword(state, card, condition.value))
  }
  if (condition.type === 'EVENT_DAMAGE_KIND_IS')
    return 'damageKind' in event && event.damageKind === condition.value
  if (condition.type === 'EVENT_DAMAGE_TARGET_IS_PLAYER_OR_PLANESWALKER') {
    if (!('damageKind' in event)) return false
    if (event.targetPlayerId) return true
    if (!event.targetPermanentInstanceId || !state) return false
    const target = state.cards.find(
      (card) => card.instanceId === event.targetPermanentInstanceId,
    )
    return Boolean(
      target && /\bplaneswalker\b/i.test(effectiveTypeLine(state, target)),
    )
  }
  if (
    condition.type === 'EVENT_ATTACKS_PLAYER_WITH_GREATEST_LIFE_AMONG_OPPONENTS'
  ) {
    if (!source || !state || event.type !== 'CREATURE_ATTACKED') return false
    const attacker = state.combatState.attackers.find(
      (entry) => entry.attackerInstanceId === source.instanceId,
    )
    if (!attacker || attacker.defendingTarget.kind !== 'PLAYER') return false
    const sourceControllerId =
      source.controllerId ??
      (source.controller === 'OPPONENT'
        ? (opponentPlayerIds(state, localPlayerIdOf(state))[0] ?? 'player-2')
        : localPlayerIdOf(state))
    const defendingPlayerId =
      attacker.defendingTarget.playerId ??
      (attacker.defendingTarget.id === 'local'
        ? localPlayerIdOf(state)
        : attacker.defendingTarget.id === 'opponent'
          ? (opponentPlayerIds(state, sourceControllerId)[0] ?? 'player-2')
          : attacker.defendingTarget.id)
    const defendingLife =
      playerStateFor(state, defendingPlayerId)?.life ??
      (defendingPlayerId === localPlayerIdOf(state)
        ? state.life
        : state.opponentLife)
    return opponentPlayerIds(state, sourceControllerId).every((playerId) => {
      const life =
        playerStateFor(state, playerId)?.life ??
        (playerId === localPlayerIdOf(state) ? state.life : state.opponentLife)
      return life <= defendingLife
    })
  }
  if (condition.type === 'EVENT_HAS_TYPE')
    return (
      'cardTypes' in event &&
      event.cardTypes.some(
        (type) =>
          type.toLocaleLowerCase() === condition.value.toLocaleLowerCase(),
      )
    )
  const expected = resolveTextReferenceFromSource(condition.value, source)
  return Boolean(
    expected &&
    'subtypes' in event &&
    event.subtypes.some(
      (subtype) => subtype.toLocaleLowerCase() === expected.toLocaleLowerCase(),
    ),
  )
}

const resolveEffect = (
  effect: EffectDefinition,
  event: GameEvent,
  variables: Record<string, string | number | boolean> = {},
): ResolvedEffect => {
  const resolveAmount = (value: EffectAmount): number => {
    if (value.type === 'LITERAL') return value.value
    if (value.type === 'VARIABLE') {
      const variable = variables[value.name]
      return typeof variable === 'number' && Number.isFinite(variable)
        ? variable
        : 0
    }
    if (value.type === 'EVENT_COUNTER_COUNT')
      return 'counters' in event ? (event.counters[value.counterType] ?? 0) : 0
    if (value.type === 'EVENT_VALUE') {
      if (value.field === 'blueManaSymbols' && event.type === 'SPELL_CAST')
        return event.blueManaSymbols
      if (value.field === 'castNumberThisTurn' && event.type === 'SPELL_CAST')
        return event.castNumberThisTurn ?? 0
      if (value.field === 'manaSpent' && event.type === 'SPELL_CAST')
        return event.manaSpent ?? 0
      if (value.field === 'damageAmount' && 'amount' in event)
        return event.amount
    }
    return 0
  }
  // Keep all executable effects declarative: references are resolved only later,
  // against the active resolution context.
  switch (effect.type) {
    case 'PLAYER_SELECTION':
      return {
        ...effect,
        effects: effect.effects.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
      }
    case 'FOR_EACH_PLAYER':
      return {
        ...effect,
        effects: effect.effects.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
      }
    case 'DRAW_FOR_PLAYER':
      return effect
    case 'GAIN_LIFE_FOR_PLAYER':
      return effect
    case 'SCRY_PLAYER':
      return effect
    case 'SURVEIL_PLAYER':
      return effect
    case 'MILL_PLAYER':
      return effect
    case 'SHUFFLE_PLAYER_ZONES_INTO_LIBRARY':
      return effect
    case 'CONTROL_PLAYER':
      return effect
    case 'CONTROL_ATTACHED_OBJECT':
      return effect
    case 'COPY_OBJECT_CHARACTERISTICS':
      return effect
    case 'CREATE_TOKEN':
      return {
        type: 'CREATE_TOKEN',
        tokenId: effect.tokenId,
        amount: resolveAmount(effect.amount),
        ...(effect.player ? { player: effect.player } : {}),
        ...(effect.tapped !== undefined ? { tapped: effect.tapped } : {}),
      }
    case 'DRAW_CARD':
      return { type: 'DRAW_CARD', amount: resolveAmount(effect.amount) }
    case 'MOVE_ZONE':
      return {
        type: 'MOVE_ZONE',
        target: effect.target,
        destination: effect.destination,
        ...(effect.controller ? { controller: effect.controller } : {}),
      }
    case 'UNTAP_PERMANENT':
      return { type: 'UNTAP_PERMANENT', target: effect.target }
    case 'TAP_PERMANENT':
      return { type: 'TAP_PERMANENT', target: effect.target }
    case 'TRANSFORM_PERMANENT':
      return { type: 'TRANSFORM_PERMANENT', target: effect.target }
    case 'PHASE_OUT_PERMANENT':
      return { type: 'PHASE_OUT_PERMANENT', target: effect.target }
    case 'PHASE_IN_PERMANENT':
      return { type: 'PHASE_IN_PERMANENT', target: effect.target }
    case 'ADD_COUNTER':
      return {
        type: 'ADD_COUNTER',
        target: effect.target,
        counterType: effect.counterType,
        amount: resolveAmount(effect.amount),
      }
    case 'PUT_EVENT_COUNTERS':
      return effect
    case 'MOVE_COUNTERS_BETWEEN_TARGETS':
      return effect
    case 'DISTRIBUTE_COUNTERS':
      return {
        ...effect,
        amount: resolveAmount(effect.amount),
      }
    case 'ADD_MANA':
      return effect
    case 'ADD_MANA_CHOICE':
      return effect
    case 'ADD_MANA_FROM_LINKED_COLORS':
      return effect
    case 'ADD_MANA_FROM_PUBLIC_ZONE_COLORS':
      return effect
    case 'SELECT_HIDDEN_ZONE_CARD': {
      const { lookAtTop, ...rest } = effect
      return {
        ...rest,
        count: resolveAmount(effect.count ?? { type: 'LITERAL', value: 1 }),
        ...(lookAtTop ? { lookAtTop: resolveAmount(lookAtTop) } : {}),
      }
    }
    case 'SELECT_PUBLIC_ZONE_CARD':
      return effect
    case 'CAST_LINKED_CARD_WITHOUT_PAYING_MANA_COST':
      return effect
    case 'COUNTER_SPELL':
      return effect
    case 'DESTROY_PERMANENT':
      return effect
    case 'CHANGE_CONTROLLER':
      return effect
    case 'ATTACH':
      return effect
    case 'DETACH':
      return effect
    case 'CREATE_TOKEN_COPY':
      return { ...effect, amount: resolveAmount(effect.amount) }
    case 'ENCORE':
      return effect
    case 'COPY_SPELL':
      return effect
    case 'RESET_STACK_TARGETS':
      return effect
    case 'RETARGET_STACK_OBJECT':
      return effect
    case 'LINK_OBJECT':
      return effect
    case 'RETURN_LINKED_OBJECTS':
      return effect
    case 'DEAL_DAMAGE':
      return effect
    case 'SET_BASE_POWER_TOUGHNESS':
      return effect
    case 'REMOVE_ALL_COUNTERS':
      return effect
    case 'ADD_CREATURE_SUBTYPE':
      return effect
    case 'SET_COLORS':
      return effect
    case 'GRANT_PROTECTION':
      return effect
    case 'PREVENT_NEXT_DAMAGE':
      return effect
    case 'ADD_PLAYER_RULE':
      return effect
    case 'AIRBEND':
      return effect
    case 'PUT_SOURCE_ONTO_BATTLEFIELD_ATTACKING':
      return effect
    case 'ADD_RESTRICTED_MANA':
      return effect
    case 'TEMPORARY_MODIFIER':
      return effect
    case 'GRANT_TRIGGERED_ABILITY_UNTIL_END_OF_TURN':
      return effect
    case 'ADD_UNTAP_RESTRICTION':
      return effect
    case 'QUEUE_EXTRA_TURN':
      return effect
    case 'END_TURN':
      return effect
    case 'SKIP_NEXT_COMBAT_PHASES':
      return effect
    case 'ENTERS_TAPPED':
      return effect
    case 'CHANGE_LAND_SUBTYPE':
      return effect
    case 'CANNOT_BE_BLOCKED':
      return effect
    case 'DISCARD_CARD':
      return {
        type: 'DISCARD_CARD',
        player: effect.player,
        amount: resolveAmount(effect.amount),
      }
    case 'SACRIFICE':
      return effect
    case 'SET_VARIABLE':
      return effect
    case 'FOR_EACH':
      return {
        ...effect,
        effects: effect.effects.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
      }
    case 'FOR_EACH_SELECTED':
      return {
        ...effect,
        effects: effect.effects.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
      }
    case 'DELAYED_EFFECT':
      // Delayed nested effects remain declarative until the future trigger so
      // captured runtime variables are available when amounts are resolved.
      return effect
    case 'CONDITIONAL_EFFECT':
      return {
        ...effect,
        ifTrue: effect.ifTrue.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
        ifFalse: effect.ifFalse?.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
      }
    case 'PAYMENT_BRANCH':
      return {
        ...effect,
        ifPaid: effect.ifPaid.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
        ifNotPaid: effect.ifNotPaid.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
      }
    case 'CHOOSE_MODE':
      return {
        ...effect,
        modes: effect.modes.map((mode) => ({
          ...mode,
          effects: mode.effects.map((nested) =>
            resolveEffect(nested, event, variables),
          ),
        })),
      }
    case 'CHOOSE_VALUE':
      return effect
    case 'STORE_SOURCE_VALUE':
      return effect
    case 'SEARCH_LIBRARY_CARD':
      return effect
    case 'PHYSICAL_CONFIRMATION':
      return {
        ...effect,
        effects: effect.effects.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
      }
    case 'MOVE_UNKNOWN_HIDDEN_CARDS':
      return { ...effect, amount: resolveAmount(effect.amount) }
    case 'SHUFFLE_LIBRARY':
      return effect
    case 'SET_PLAYER_MAX_HAND_SIZE':
      return effect
    case 'OPTIONAL_EFFECT':
      return {
        type: 'OPTIONAL_EFFECT',
        prompt: effect.prompt,
        effects: effect.effects.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
      }
    case 'TARGET_SELECTION': {
      const constraints =
        effect.declarationConstraintOverrides?.find(
          (override) => variables[override.variableName] === override.equals,
        )?.constraints ?? effect.constraints
      return {
        type: 'TARGET_SELECTION',
        prompt: effect.prompt,
        constraints,
        ...(effect.count ? { count: resolveAmount(effect.count) } : {}),
        ...(effect.allowFewer ? { allowFewer: true } : {}),
        effects: effect.effects.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
      }
    }
    case 'CARD_SELECTION':
      return {
        type: 'CARD_SELECTION',
        prompt: effect.prompt,
        constraints: effect.constraints,
        ...(effect.count ? { count: resolveAmount(effect.count) } : {}),
        effects: effect.effects.map((nested) =>
          resolveEffect(nested, event, variables),
        ),
      }
  }
}

/** Evaluates declaratively-defined battlefield abilities without making player decisions. */
export const evaluateAbilities = (
  state: GameState,
  event: GameEvent,
  lastKnownState: GameState = state,
  getAbilities: typeof getAbilitiesForCard = getAbilitiesForCard,
): PendingAbility[] => {
  const useLastKnownBattlefield =
    event.type === 'CARD_LEFT_BATTLEFIELD' || event.type === 'CARD_DIED'
  const sourceState = useLastKnownBattlefield ? lastKnownState : state
  return sourceState.cards.flatMap((source) => {
    const abilities = landLosesAbilitiesToBasicType(sourceState, source)
      ? []
      : getAbilities === getAbilitiesForCard
        ? effectiveAbilitiesForCard(sourceState, source)
        : getAbilities(effectiveCardDefinition(sourceState, source))
    return abilities
      .filter(
        (
          ability,
        ): ability is Extract<AbilityDefinition, { kind: 'TRIGGERED' }> =>
          ability.kind === 'TRIGGERED',
      )
      .filter((ability) =>
        ability.activeZones?.length
          ? ability.activeZones.includes(source.zone)
          : isPresentPermanent(source),
      )
      .filter((ability) => eventMatchesTrigger(ability, event))
      .filter((ability) =>
        ability.conditions.every((condition) =>
          conditionMatches(condition, event, source, sourceState),
        ),
      )
      .filter(
        (ability) =>
          ability.triggerLimit !== 'ONCE_EACH_TURN' ||
          state.triggeredAbilityTurnMarkers?.[
            `${source.instanceId}:${ability.id}`
          ] !== state.turn,
      )
      .map((ability, index) => ({
        id: `pending-${source.instanceId}-${ability.id}-${state.pendingAbilities.length + index + 1}`,
        abilityId: ability.id,
        sourceInstanceId: source.instanceId,
        sourceCardName: effectiveCardDefinition(sourceState, source).name,
        createdFromEvent: event,
        resolvedEffects: ability.effects.map((effect) =>
          resolveEffect(effect, event),
        ),
        automation: ability.automation,
        ...(ability.triggerLimit ? { triggerLimit: ability.triggerLimit } : {}),
      }))
      .filter(
        (pending) =>
          !state.pendingAbilities.some(
            (existing) =>
              existing.sourceInstanceId === pending.sourceInstanceId &&
              existing.abilityId === pending.abilityId &&
              existing.createdFromEvent.type ===
                pending.createdFromEvent.type &&
              existing.createdFromEvent.type === 'PERMANENT_BECAME_TAPPED' &&
              pending.createdFromEvent.type === 'PERMANENT_BECAME_TAPPED' &&
              existing.createdFromEvent.eventGroupId !== undefined &&
              existing.createdFromEvent.eventGroupId ===
                pending.createdFromEvent.eventGroupId,
          ),
      )
  })
}

const activePlayerIdFromEvent = (event: GameEvent): string | undefined =>
  'activePlayerId' in event ? event.activePlayerId : undefined

/** Converts one-shot scheduled effects into normal pending abilities when their event occurs. */
export const evaluateDelayedEffects = (
  state: GameState,
  event: GameEvent,
): { pending: PendingAbility[]; consumedIds: string[] } => {
  const matching = (state.delayedEffects ?? []).filter((delayed) => {
    if (delayed.trigger.type !== event.type) return false
    if (!delayed.triggerPlayer) return true
    if (delayed.triggerPlayer === 'SOURCE_CONTROLLER')
      return (
        activePlayerIdFromEvent(event) !== undefined &&
        activePlayerIdFromEvent(event) === delayed.sourceControllerId
      )
    if (delayed.triggerPlayer === 'ACTIVE_PLAYER')
      return activePlayerIdFromEvent(event) !== undefined
    return false
  })
  return {
    consumedIds: matching.map((delayed) => delayed.id),
    pending: matching.map((delayed) => ({
      id: `pending-delayed-${delayed.id}-${'turn' in event ? event.turn : 'event'}`,
      abilityId: delayed.sourceAbilityId,
      sourceInstanceId: delayed.sourceInstanceId,
      sourceCardName: delayed.sourceCardName,
      createdFromEvent: event,
      resolvedEffects: delayed.effects.map((effect) =>
        resolveEffect(effect, event, delayed.capturedContext.variables),
      ),
      automation: delayed.automation,
      capturedContext: delayed.capturedContext,
    })),
  }
}

/** Turns a confirmed pending ability into generic game actions. */
export const resolvePendingAbilityEffects = (
  pending: PendingAbility,
): GameAction[] => {
  const actions: GameAction[] = []
  pending.resolvedEffects.forEach((effect) => {
    if (effect.type === 'CREATE_TOKEN') {
      if (effect.amount <= 0) return
      const token = tokenDefinitions[effect.tokenId]
      if (token)
        actions.push({ type: 'CREATE_TOKEN', token, amount: effect.amount })
    }
    if (effect.type === 'DRAW_CARD')
      actions.push(
        ...Array.from({ length: effect.amount }, () => ({
          type: 'DRAW_CARD' as const,
        })),
      )
    if (effect.type === 'ADD_COUNTER') {
      const instanceId = referenceInstanceId(
        effect.target,
        pendingContext(pending),
      )
      if (instanceId && effect.amount > 0)
        actions.push({
          type: 'ADD_COUNTER',
          instanceId,
          counter: effect.counterType,
          amount: effect.amount,
        })
    }
    if (effect.type === 'ADD_MANA')
      actions.push({
        type: 'ADD_MANA',
        color: effect.color,
        amount: effect.amount,
      })
    if (effect.type === 'DESTROY_PERMANENT') {
      const instanceId = referenceInstanceId(
        effect.target,
        pendingContext(pending),
      )
      if (instanceId)
        actions.push({ type: 'MOVE_CARD', instanceId, toZone: 'graveyard' })
    }
  })
  return actions
}

const pendingContext = (pending: PendingAbility): ResolutionContext => ({
  sourceInstanceId: pending.sourceInstanceId,
  triggeringEvent: pending.createdFromEvent,
  selectedTargets: [],
  selectedCards: [],
  selectedStackObjects: [],
  selectedPlayers: [],
  variables: {},
})

const referenceInstanceId = (
  reference: EffectReference,
  context: ResolutionContext,
): string | undefined => {
  if (reference === 'SOURCE') return context.sourceInstanceId
  if (reference === 'EVENT_SUBJECT')
    return 'cardInstanceId' in context.triggeringEvent
      ? context.triggeringEvent.cardInstanceId
      : undefined
  if (reference === 'SELECTED_TARGET') return context.selectedTargets.at(-1)
  if (reference === 'FIRST_SELECTED_TARGET') return context.selectedTargets[0]
  if (reference === 'SECOND_SELECTED_TARGET') return context.selectedTargets[1]
  if (reference === 'SELECTED_CARD') return context.selectedCards.at(-1)
  if (reference === 'CURRENT_OBJECT') return context.currentObjectId
  if (reference === 'ATTACHED_OBJECT') return undefined
  return undefined
}

const resolveRuntimeTextReference = (
  state: GameState,
  value: RuntimeTextReference,
  context: ResolutionContext,
): string | undefined => {
  if (typeof value === 'string') return value
  if (value.type === 'VARIABLE') {
    const variable = context.variables[value.name]
    return typeof variable === 'string' ? variable : undefined
  }
  const source = state.cards.find(
    (card) => card.instanceId === context.sourceInstanceId,
  )
  const stored = source?.runtimeValues?.[value.key]
  return typeof stored === 'string' ? stored : undefined
}

const queryObjects = (
  state: GameState,
  query: ObjectQuery,
  context: ResolutionContext,
) =>
  state.cards.filter((card) => {
    if (card.zone === 'battlefield' && card.phasedOut) return false
    const definition = effectiveCardDefinition(state, card)
    const lower = effectiveTypeLine(state, card).toLocaleLowerCase()
    if (query.zones && !query.zones.includes(card.zone)) return false
    if (query.controller) {
      const expected = resolvePlayerReferenceId(
        state,
        query.controller,
        context,
      )
      if (!expected || controllerId(card) !== expected) return false
    }
    if (query.owner) {
      const expected = resolvePlayerReferenceId(state, query.owner, context)
      if (!expected || (card.ownerId ?? localPlayerIdOf(state)) !== expected)
        return false
    }
    if (
      query.controllerRelation === 'NOT_SOURCE_CONTROLLER' &&
      controllerId(card) === sourceControllerId(state, context)
    )
      return false
    if (
      query.cardTypes?.some((type) => !lower.includes(type.toLocaleLowerCase()))
    )
      return false
    if (
      query.cardTypesAnyOf?.length &&
      !query.cardTypesAnyOf.some((type) =>
        lower.includes(type.toLocaleLowerCase()),
      )
    )
      return false
    if (
      query.excludeCardTypes?.some((type) =>
        lower.includes(type.toLocaleLowerCase()),
      )
    )
      return false
    if (
      query.subtypes?.some((type) => {
        const resolved = resolveRuntimeTextReference(state, type, context)
        return !resolved || !lower.includes(resolved.toLocaleLowerCase())
      })
    )
      return false
    if (
      query.excludeSubtypes?.some((type) => {
        const resolved = resolveRuntimeTextReference(state, type, context)
        return Boolean(resolved && lower.includes(resolved.toLocaleLowerCase()))
      })
    )
      return false
    if (
      query.subtypesAnyOf?.length &&
      !query.subtypesAnyOf.some((type) => {
        const resolved = resolveRuntimeTextReference(state, type, context)
        return Boolean(resolved && lower.includes(resolved.toLocaleLowerCase()))
      })
    )
      return false
    if (query.historic !== undefined) {
      const historic = /\bartifact\b|\blegendary\b|\bsaga\b/i.test(lower)
      if (historic !== query.historic) return false
    }
    if (query.hasAnyCounters !== undefined) {
      const hasAny = Object.values(card.counters).some((amount) => amount > 0)
      if (hasAny !== query.hasAnyCounters) return false
    }
    if (query.hasCounterType) {
      const amount = card.counters[query.hasCounterType] ?? 0
      if (amount < (query.counterCountAtLeast ?? 1)) return false
    }
    if (
      query.powerAtLeast !== undefined ||
      query.toughnessAtLeast !== undefined
    ) {
      const pt = modifiedPowerToughness(card, deriveActiveStaticEffects(state))
      if (
        query.powerAtLeast !== undefined &&
        (pt?.power ?? Number.NEGATIVE_INFINITY) < query.powerAtLeast
      )
        return false
      if (
        query.toughnessAtLeast !== undefined &&
        (pt?.toughness ?? Number.NEGATIVE_INFINITY) < query.toughnessAtLeast
      )
        return false
    }
    if (query.isToken !== undefined && Boolean(card.isToken) !== query.isToken)
      return false
    if (
      query.colors?.some((color) => !definition.colors.includes(color)) ||
      (query.colorsAnyOf?.length &&
        !query.colorsAnyOf.some((color) =>
          definition.colors.includes(color),
        )) ||
      query.excludeColors?.some((color) => definition.colors.includes(color))
    )
      return false
    if (
      query.manaValueMax &&
      definition.cmc > evaluateValue(state, query.manaValueMax, context)
    )
      return false
    if (query.attacking !== undefined) {
      const attacking = state.combatState.attackers.some(
        (attacker) => attacker.attackerInstanceId === card.instanceId,
      )
      if (attacking !== query.attacking) return false
    }
    if (query.tapped !== undefined && card.tapped !== query.tapped) return false
    if (query.excludeSource && card.instanceId === context.sourceInstanceId)
      return false
    return true
  })

const evaluateValue = (
  state: GameState,
  value: ValueExpression,
  context: ResolutionContext,
): number => {
  if (value.type === 'LITERAL') return value.value
  if (value.type === 'VARIABLE')
    return Number(context.variables[value.name] ?? 0)
  if (value.type === 'SOURCE_VALUE') {
    const stored = state.cards.find(
      (card) => card.instanceId === context.sourceInstanceId,
    )?.runtimeValues?.[value.key]
    return Number(stored ?? 0)
  }
  if (value.type === 'EVENT_COUNTER_COUNT')
    return 'counters' in context.triggeringEvent
      ? (context.triggeringEvent.counters[value.counterType] ?? 0)
      : 0
  if (value.type === 'EVENT_VALUE') {
    if (
      value.field === 'blueManaSymbols' &&
      context.triggeringEvent.type === 'SPELL_CAST'
    )
      return context.triggeringEvent.blueManaSymbols
    if (
      value.field === 'castNumberThisTurn' &&
      context.triggeringEvent.type === 'SPELL_CAST'
    )
      return context.triggeringEvent.castNumberThisTurn ?? 0
    if (value.field === 'damageAmount' && 'amount' in context.triggeringEvent)
      return context.triggeringEvent.amount
    return 0
  }
  if (value.type === 'COUNT_OBJECTS')
    return queryObjects(state, value.query, context).length
  if (value.type === 'COUNTER_COUNT')
    return (
      state.cards.find(
        (card) =>
          card.instanceId === referenceInstanceId(value.target, context),
      )?.counters[value.counterType] ?? 0
    )
  if (value.type === 'TOTAL_COUNTER_COUNT')
    return Object.values(
      state.cards.find(
        (card) =>
          card.instanceId === referenceInstanceId(value.target, context),
      )?.counters ?? {},
    ).reduce((sum, amount) => sum + amount, 0)
  if (value.type === 'MANA_VALUE') {
    const instanceId = referenceInstanceId(value.target, context)
    const stackObjectId = referenceStackObjectId(value.target, context)
    const card = state.cards.find(
      (candidate) =>
        (instanceId !== undefined && candidate.instanceId === instanceId) ||
        (stackObjectId !== undefined &&
          candidate.stackObjectId === stackObjectId),
    )
    return card ? effectiveCardDefinition(state, card).cmc : 0
  }
  if (value.type === 'POWER') {
    const base = evaluateValue(state, value.base, context)
    const exponent = evaluateValue(state, value.exponent, context)
    const result = Math.pow(base, exponent)
    return Number.isSafeInteger(result) && result >= 0 ? result : 0
  }
  if (value.type === 'MAX_SHARED_CREATURE_SUBTYPE_COUNT') {
    const sourcePlayerId = sourceControllerId(state, context)
    const counts = new Map<string, number>()
    state.cards
      .filter(
        (card) =>
          isPresentPermanent(card) &&
          /\bcreature\b/i.test(effectiveTypeLine(state, card)) &&
          (value.controller !== 'SOURCE_CONTROLLER' ||
            controllerId(card) === sourcePlayerId),
      )
      .forEach((card) => {
        const [, subtypePart = ''] = effectiveTypeLine(state, card).split(
          /\s+[—-]\s+/,
        )
        subtypePart
          .split(/\s+/)
          .filter(Boolean)
          .forEach((subtype) =>
            counts.set(
              subtype.toLocaleLowerCase(),
              (counts.get(subtype.toLocaleLowerCase()) ?? 0) + 1,
            ),
          )
      })
    return Math.max(0, ...counts.values())
  }
  if (value.type === 'SUBTRACT')
    return Math.max(
      0,
      evaluateValue(state, value.left, context) -
        evaluateValue(state, value.right, context),
    )
  const values = value.values.map((entry) =>
    evaluateValue(state, entry, context),
  )
  return value.type === 'ADD'
    ? values.reduce((sum, entry) => sum + entry, 0)
    : values.reduce((product, entry) => product * entry, 1)
}

const resolveRuntimeValueSource = (
  value: import('../types/abilityTypes').RuntimeValueSource,
  context: ResolutionContext,
): string | number | boolean | undefined =>
  value.type === 'LITERAL' ? value.value : context.variables[value.name]

const referenceCard = (
  state: GameState,
  reference: EffectReference,
  context: ResolutionContext,
): GameState['cards'][number] | undefined => {
  if (reference === 'ATTACHED_OBJECT') {
    const source = state.cards.find(
      (card) => card.instanceId === context.sourceInstanceId,
    )
    const attachedInstanceId =
      source?.attachedToInstanceId ?? source?.lastAttachedToInstanceId
    return attachedInstanceId
      ? state.cards.find((card) => card.instanceId === attachedInstanceId)
      : undefined
  }
  const instanceId = referenceInstanceId(reference, context)
  if (instanceId)
    return state.cards.find((card) => card.instanceId === instanceId)
  const stackObjectId = referenceStackObjectId(reference, context)
  return stackObjectId
    ? state.cards.find(
        (card) => card.zone === 'stack' && card.stackObjectId === stackObjectId,
      )
    : undefined
}

const resolvedCardInstanceId = (
  state: GameState,
  reference: EffectReference,
  context: ResolutionContext,
): string | undefined => referenceCard(state, reference, context)?.instanceId

const controllerId = (card: GameState['cards'][number]): string =>
  card.controllerId ??
  (card.controller === 'OPPONENT' ? 'player-2' : 'player-1')

const sourceControllerId = (
  state: GameState,
  context: ResolutionContext,
): string => {
  const source = state.cards.find(
    (card) => card.instanceId === context.sourceInstanceId,
  )
  return source ? controllerId(source) : localPlayerIdOf(state)
}

const relativeControllerForCard = (
  state: GameState,
  card: GameState['cards'][number],
  context: ResolutionContext,
): 'YOU' | 'OPPONENT' =>
  controllerId(card) === sourceControllerId(state, context) ? 'YOU' : 'OPPONENT'

const resolvePlayerReferenceId = (
  state: GameState,
  reference: import('../types/abilityTypes').PlayerReference,
  context: ResolutionContext,
): string | undefined => {
  if (typeof reference !== 'string') {
    if (reference.type === 'VARIABLE') {
      const value = context.variables[reference.name]
      return typeof value === 'string' ? value : undefined
    }
    const source = state.cards.find(
      (card) => card.instanceId === context.sourceInstanceId,
    )
    const value = source?.runtimeValues?.[reference.key]
    return typeof value === 'string' ? value : undefined
  }
  const sourcePlayerId = sourceControllerId(state, context)
  if (reference === 'SOURCE_CONTROLLER') return sourcePlayerId
  if (reference === 'CURRENT_PLAYER') return context.currentPlayerId
  if (reference === 'EVENT_PLAYER')
    return 'playerId' in context.triggeringEvent
      ? context.triggeringEvent.playerId
      : context.triggeringEvent.type === 'SPELL_CAST'
        ? (context.triggeringEvent.playerId ??
          (context.triggeringEvent.controller === 'YOU'
            ? localPlayerIdOf(state)
            : opponentPlayerIds(state, localPlayerIdOf(state))[0]))
        : undefined
  if (reference === 'ACTIVE_PLAYER')
    return 'activePlayerId' in context.triggeringEvent
      ? (context.triggeringEvent.activePlayerId ?? activePlayerIdOf(state))
      : activePlayerIdOf(state)
  if (reference === 'DEFENDING_PLAYER') {
    if (
      'targetPlayerId' in context.triggeringEvent &&
      context.triggeringEvent.targetPlayerId
    )
      return context.triggeringEvent.targetPlayerId
    const triggeringEvent = context.triggeringEvent
    const attacker =
      triggeringEvent.type === 'CREATURE_ATTACKED'
        ? state.combatState.attackers.find(
            (entry) =>
              entry.attackerInstanceId === triggeringEvent.cardInstanceId,
          )
        : undefined
    return (
      attacker?.defendingTarget.playerId ??
      opponentPlayerIds(state, sourcePlayerId)[0]
    )
  }
  if (reference === 'TARGET_CONTROLLER') {
    const targetCard = referenceCard(state, 'SELECTED_TARGET', context)
    if (targetCard) return controllerId(targetCard)
    const stackObjectId = referenceStackObjectId(
      'SELECTED_STACK_OBJECT',
      context,
    )
    return stackObjectId
      ? state.stack.find((object) => object.stackObjectId === stackObjectId)
          ?.controllerId
      : undefined
  }
  if (reference === 'ATTACHED_OBJECT_OWNER') {
    const source = state.cards.find(
      (card) => card.instanceId === context.sourceInstanceId,
    )
    const attachedInstanceId =
      source?.attachedToInstanceId ?? source?.lastAttachedToInstanceId
    if (!attachedInstanceId) return undefined
    const attached = state.cards.find(
      (card) => card.instanceId === attachedInstanceId,
    )
    return attached?.ownerId ?? (attached ? controllerId(attached) : undefined)
  }
  if (reference === 'TARGET_PLAYER') {
    const targetPlayerId = context.selectedPlayers?.at(-1)
    if (!targetPlayerId) return undefined
    const declared = [...(context.declaredTargets ?? [])]
      .reverse()
      .find(
        (target) =>
          target.targetId === targetPlayerId &&
          target.constraints.playerRelation !== undefined,
      )
    if (!declared) return targetPlayerId
    const source = state.cards.find(
      (card) => card.instanceId === context.sourceInstanceId,
    )
    const kind =
      context.triggeringEvent.type === 'SPELL_CAST'
        ? 'SPELL'
        : context.triggeringEvent.type === 'ABILITY_ACTIVATED'
          ? 'ACTIVATED_ABILITY'
          : 'TRIGGERED_ABILITY'
    return canTargetPlayer(
      state,
      targetPlayerId,
      {
        sourceInstanceId: context.sourceInstanceId,
        sourceCard: source?.card,
        controllerId: sourcePlayerId,
        kind,
      },
      declared.constraints.playerRelation,
    )
      ? targetPlayerId
      : undefined
  }
  return undefined
}

const constraintsCanTargetStack = (
  constraints: SelectionConstraints,
): boolean =>
  constraints.stackKind === 'SPELL' ||
  constraints.zones?.includes('stack') === true ||
  constraints.anyOf?.some(constraintsCanTargetStack) === true

const selectedTargetCardIsLegal = (
  state: GameState,
  target: GameState['cards'][number],
  constraints: SelectionConstraints,
  context: ResolutionContext,
): boolean => {
  if (constraints.controllerPlayer) {
    const expected = resolvePlayerReferenceId(
      state,
      constraints.controllerPlayer,
      context,
    )
    if (!expected || controllerId(target) !== expected) return false
  }
  if (constraints.sharesCreatureSubtypeWithFirstTarget) {
    const firstTargetId = context.selectedTargets[0]
    if (firstTargetId && firstTargetId !== target.instanceId) {
      const first = state.cards.find(
        (card) => card.instanceId === firstTargetId,
      )
      if (!first) return false
      const firstSubtypes = new Set(effectiveCreatureSubtypes(state, first))
      const targetSubtypes = new Set(effectiveCreatureSubtypes(state, target))
      if (![...firstSubtypes].some((subtype) => targetSubtypes.has(subtype)))
        return false
    }
  }
  if (
    constraints.manaValueMax !== undefined &&
    effectiveCardDefinition(state, target).cmc >
      evaluateValue(state, constraints.manaValueMax, context)
  )
    return false
  const stackKind = state.stack.find(
    (object) => object.sourceInstanceId === context.sourceInstanceId,
  )?.kind
  return canTarget(
    state,
    target,
    {
      sourceInstanceId: context.sourceInstanceId,
      controllerId: sourceControllerId(state, context),
      kind: stackKind ?? 'SPELL',
    },
    constraints,
  )
}

const targetIsLegal = (
  state: GameState,
  reference: EffectReference,
  context: ResolutionContext,
): boolean => {
  const target = referenceCard(state, reference, context)
  if (!target) return false
  if (reference !== 'SELECTED_TARGET') return true
  const constraints: SelectionConstraints =
    context.selectedTargetConstraints?.at(-1) ?? { zones: ['battlefield'] }
  return selectedTargetCardIsLegal(state, target, constraints, context)
}

const objectMatchesQuery = (
  state: GameState,
  reference: EffectReference,
  query: ObjectQuery,
  context: ResolutionContext,
): boolean => {
  const target = referenceCard(state, reference, context)
  if (!target) return false
  return queryObjects(state, query, context).some(
    (candidate) => candidate.instanceId === target.instanceId,
  )
}

const referenceStackObjectId = (
  reference: EffectReference,
  context: ResolutionContext,
): string | undefined => {
  if (reference === 'SELECTED_STACK_OBJECT')
    return context.selectedStackObjects.at(-1)
  if (reference === 'EVENT_STACK_OBJECT')
    return context.triggeringEvent.type === 'SPELL_CAST'
      ? context.triggeringEvent.stackObjectId
      : undefined
  return undefined
}

export const createPendingResolution = (
  pending: PendingAbility,
): PendingResolution => ({
  id: `resolution-${pending.id}`,
  sourceAbilityId: pending.abilityId,
  sourceInstanceId: pending.sourceInstanceId,
  sourceCardName: pending.sourceCardName,
  effects: pending.resolvedEffects,
  currentEffectIndex: 0,
  context: {
    sourceInstanceId: pending.sourceInstanceId,
    triggeringEvent: pending.createdFromEvent,
    selectedTargets: [...(pending.capturedContext?.selectedTargets ?? [])],
    declaredTargets: [...(pending.capturedContext?.declaredTargets ?? [])],
    selectedCards: [...(pending.capturedContext?.selectedCards ?? [])],
    selectedStackObjects: [
      ...(pending.capturedContext?.selectedStackObjects ?? []),
    ],
    selectedPlayers: [...(pending.capturedContext?.selectedPlayers ?? [])],
    variables: { ...(pending.capturedContext?.variables ?? {}) },
  },
})

/** Activated abilities reuse the same serializable resolution pipeline as triggers. */
export const createActivatedPendingAbility = (
  source: { instanceId: string; card: { name: string; typeLine: string } },
  ability: ActivatedAbilityDefinition,
  variables: Record<string, string | number | boolean> = {},
  declaredTargets: import('../types/abilityTypes').DeclaredTarget[] = [],
): PendingAbility => ({
  id: `activated-${source.instanceId}-${ability.id}`,
  abilityId: ability.id,
  sourceInstanceId: source.instanceId,
  sourceCardName: source.card.name,
  createdFromEvent: {
    type: 'ABILITY_ACTIVATED',
  },
  resolvedEffects: ability.effects.map((effect) =>
    resolveEffect(effect, { type: 'ABILITY_ACTIVATED' }, variables),
  ),
  capturedContext: {
    selectedTargets: [],
    selectedCards: [],
    selectedStackObjects: [],
    selectedPlayers: [],
    declaredTargets: [...declaredTargets],
    variables: { ...variables },
  },
  automation: ability.automation,
})

/** Builds a serializable resolution for a spell instruction already on stack. */
export const createSpellEffectResolution = (
  source: {
    instanceId: string
    card: { name: string; manaCost?: string; typeLine: string }
    declaredTargetStackObjectId?: string
  },
  ability: SpellEffectDefinition,
  variables: Record<string, string | number | boolean> = {},
  declaredTargets: import('../types/abilityTypes').DeclaredTarget[] = [],
): PendingResolution => {
  const event: GameEvent = {
    type: 'SPELL_CAST',
    cardInstanceId: source.instanceId,
    cardName: source.card.name,
    isCreature: /creature/i.test(source.card.typeLine),
    manaCost: source.card.manaCost,
    blueManaSymbols: 0,
    controller: 'YOU',
    cardTypes: [],
    subtypes: [],
    isToken: false,
  }
  return {
    id: `resolution-spell-${source.instanceId}-${ability.id}`,
    sourceAbilityId: ability.id,
    sourceInstanceId: source.instanceId,
    sourceCardName: source.card.name,
    effects: ability.effects.map((effect) =>
      resolveEffect(effect, event, variables),
    ),
    currentEffectIndex: 0,
    context: {
      sourceInstanceId: source.instanceId,
      triggeringEvent: event,
      selectedTargets: [],
      declaredTargets: [...declaredTargets],
      selectedCards: [],
      selectedStackObjects:
        declaredTargets.length === 0 && source.declaredTargetStackObjectId
          ? [source.declaredTargetStackObjectId]
          : [],
      selectedPlayers: [],
      variables: { ...variables },
    },
    completionActions: [
      { type: 'RESOLVE_SPELL', instanceId: source.instanceId },
    ],
  }
}

/** Resolves replacement-style choices immediately before a permanent enters. */
export const createAsEntersResolution = (
  source: {
    instanceId: string
    card: { name: string; manaCost?: string; typeLine: string }
  },
  ability: AsEntersAbilityDefinition,
): PendingResolution => {
  const event: GameEvent = { type: 'ABILITY_ACTIVATED' }
  return {
    id: `resolution-as-enters-${source.instanceId}-${ability.id}`,
    sourceAbilityId: ability.id,
    sourceInstanceId: source.instanceId,
    sourceCardName: source.card.name,
    effects: ability.effects.map((effect) => resolveEffect(effect, event)),
    currentEffectIndex: 0,
    context: {
      sourceInstanceId: source.instanceId,
      triggeringEvent: event,
      selectedTargets: [],
      selectedCards: [],
      selectedStackObjects: [],
      selectedPlayers: [],
      variables: {},
    },
    completionActions: [
      {
        type: 'RESOLVE_SPELL',
        instanceId: source.instanceId,
        asEntersHandled: true,
        preserveRuntimeValues: true,
      },
    ],
  }
}

const matchesConstraints = (
  typeLine: string,
  isToken: boolean,
  controller: 'YOU' | 'OPPONENT',
  constraints: SelectionConstraints,
): boolean => {
  const lower = typeLine.toLocaleLowerCase()
  if (constraints.isToken !== undefined && constraints.isToken !== isToken)
    return false
  if (
    constraints.controller !== undefined &&
    constraints.controller !== 'ANY' &&
    constraints.controller !== controller
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
  if (constraints.historic !== undefined) {
    const historic = /\bartifact\b|\blegendary\b|\bsaga\b/i.test(lower)
    if (historic !== constraints.historic) return false
  }
  return true
}

export type ResolutionStep =
  | { type: 'ACTIONS'; actions: GameAction[]; resolution: PendingResolution }
  | {
      type: 'DECISION'
      actions: GameAction[]
      decision: PendingDecision
      resolution: PendingResolution
    }
  | { type: 'COMPLETE'; resolution: PendingResolution }
  | { type: 'ERROR'; message: string; resolution: PendingResolution }

/**
 * Advances only deterministic effects. Choices are represented as data and
 * deliberately pause here for the player, never for a callback.
 */
export const advancePendingResolution = (
  state: GameState,
  resolution: PendingResolution,
): ResolutionStep => {
  const actions: GameAction[] = []
  const continueResolution = (resumed: PendingResolution): ResolutionStep => {
    const step = advancePendingResolution(state, resumed)
    if (!actions.length) return step
    if (step.type === 'ACTIONS' || step.type === 'DECISION')
      return { ...step, actions: [...actions, ...step.actions] }
    if (step.type === 'COMPLETE')
      return {
        type: 'ACTIONS',
        actions: [...actions],
        resolution: step.resolution,
      }
    return step
  }
  let currentEffectIndex = resolution.currentEffectIndex
  while (currentEffectIndex < resolution.effects.length) {
    const effect = resolution.effects[currentEffectIndex]
    if (effect.type === 'COUNTER_STACK_OBJECT') {
      const stackObject = state.stack.find(
        (object) => object.stackObjectId === effect.stackObjectId,
      )
      const source = stackObject?.spellInstanceId
        ? state.cards.find(
            (card) =>
              card.instanceId === stackObject.spellInstanceId &&
              card.zone === 'stack',
          )
        : undefined
      if (source)
        actions.push({
          type: 'MOVE_CARD',
          instanceId: source.instanceId,
          toZone: 'graveyard',
        })
      else if (stackObject)
        actions.push({
          type: 'REMOVE_STACK_OBJECT',
          stackObjectId: stackObject.stackObjectId,
        })
      return {
        type: 'ACTIONS',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: resolution.effects.length,
          completionActions: [],
        },
      }
    } else if (effect.type === 'COUNTER_SOURCE_STACK_OBJECT') {
      const stackObject = state.stack.find(
        (object) =>
          object.sourceInstanceId === resolution.context.sourceInstanceId,
      )
      const source = state.cards.find(
        (card) =>
          card.instanceId === resolution.context.sourceInstanceId &&
          card.zone === 'stack',
      )
      if (source && stackObject?.kind === 'SPELL')
        actions.push({
          type: 'MOVE_CARD',
          instanceId: source.instanceId,
          toZone: 'graveyard',
        })
      else if (stackObject)
        actions.push({
          type: 'REMOVE_STACK_OBJECT',
          stackObjectId: stackObject.stackObjectId,
        })
      return {
        type: 'ACTIONS',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: resolution.effects.length,
          completionActions: [],
        },
      }
    } else if (effect.type === 'SET_CURRENT_PLAYER') {
      const resumed: PendingResolution = {
        ...resolution,
        context: { ...resolution.context, currentPlayerId: effect.playerId },
        currentEffectIndex: currentEffectIndex + 1,
      }
      return continueResolution(resumed)
    } else if (effect.type === 'PLAYER_SELECTION') {
      const sourcePlayerId = sourceControllerId(state, resolution.context)
      const candidates = state.players.filter((player) => {
        if (effect.relation === 'YOU') return player.id === sourcePlayerId
        if (effect.relation === 'OPPONENT') return player.id !== sourcePlayerId
        return true
      })
      if (!candidates.length)
        return {
          type: 'ERROR',
          message: 'No legal player target is available.',
          resolution,
        }
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}-player`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourcePlayerId,
          type: 'PLAYER_SELECTION',
          prompt: effect.prompt,
          options: candidates.map((player) => ({
            instanceId: player.id,
            label: player.name ?? player.id,
          })),
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: effect.effects,
            resumeEffectIndex: currentEffectIndex + 1,
            playerSelection: {
              relation: effect.relation,
              effects: effect.effects,
            },
          },
        },
      }
    } else if (effect.type === 'FOR_EACH_PLAYER') {
      const sourcePlayerId = sourceControllerId(state, resolution.context)
      const playerIds =
        effect.relation === 'ALL_PLAYERS'
          ? state.players.map((player) => player.id)
          : opponentPlayerIds(state, sourcePlayerId)
      const expanded: ResolvedEffect[] = playerIds.flatMap((playerId) => [
        { type: 'SET_CURRENT_PLAYER' as const, playerId },
        ...effect.effects,
      ])
      const resumed: PendingResolution = {
        ...resolution,
        effects: [
          ...expanded,
          ...resolution.effects.slice(currentEffectIndex + 1),
        ],
        currentEffectIndex: 0,
      }
      return continueResolution(resumed)
    } else if (effect.type === 'DRAW_FOR_PLAYER') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (!playerId && effect.player === 'TARGET_PLAYER') {
        currentEffectIndex += 1
        continue
      }
      if (!playerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve player who draws.',
          resolution,
        }
      const amount = evaluateValue(state, effect.amount, resolution.context)
      if (amount > 0) {
        for (let draw = 0; draw < amount; draw += 1)
          actions.push({ type: 'DRAW_CARD', playerId })
      }
    } else if (effect.type === 'GAIN_LIFE_FOR_PLAYER') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (!playerId && effect.player === 'TARGET_PLAYER') {
        currentEffectIndex += 1
        continue
      }
      if (!playerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve player who gains life.',
          resolution,
        }
      const amount = evaluateValue(state, effect.amount, resolution.context)
      if (amount > 0)
        actions.push({ type: 'GAIN_PLAYER_LIFE', playerId, amount })
    } else if (effect.type === 'SCRY_PLAYER') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (!playerId && effect.player === 'TARGET_PLAYER') {
        currentEffectIndex += 1
        continue
      }
      if (!playerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve player who scries.',
          resolution,
        }
      const amount = evaluateValue(state, effect.amount, resolution.context)
      if (amount <= 0) {
        currentEffectIndex += 1
        continue
      }
      if (playerId === localPlayerIdOf(state))
        actions.push({ type: 'SET_KNOWN_LIBRARY_TOP', instanceId: undefined })
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}-scry`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: playerId,
          type: 'PHYSICAL_CONFIRMATION',
          prompt: `Scry ${amount}: look at the top ${amount} card${amount === 1 ? '' : 's'} of your library, put any number on the bottom, and the rest on top in any order.`,
          options: [{ instanceId: 'CONFIRM', label: 'Hecho' }],
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
          },
        },
      }
    } else if (effect.type === 'SURVEIL_PLAYER') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (!playerId && effect.player === 'TARGET_PLAYER') {
        currentEffectIndex += 1
        continue
      }
      if (!playerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve player who surveils.',
          resolution,
        }
      const amount = evaluateValue(state, effect.amount, resolution.context)
      if (amount <= 0) {
        currentEffectIndex += 1
        continue
      }
      const variableName = `__SURVEIL_COUNT_${currentEffectIndex}`
      const selectedCount = resolution.context.variables[variableName]
      if (selectedCount === undefined) {
        if (playerId === localPlayerIdOf(state))
          actions.push({ type: 'SET_KNOWN_LIBRARY_TOP', instanceId: undefined })
        return {
          type: 'DECISION',
          actions,
          resolution,
          decision: {
            id: `decision-${resolution.id}-${currentEffectIndex}-surveil-count`,
            sourceAbilityId: resolution.sourceAbilityId,
            sourceInstanceId: resolution.sourceInstanceId,
            decisionPlayerId: playerId,
            type: 'CHOOSE_VALUE',
            prompt: `Surveil ${amount}: look at the top ${amount} card${amount === 1 ? '' : 's'} of your library, then choose how many you will put into your graveyard.`,
            options: Array.from({ length: amount + 1 }, (_, count) => ({
              instanceId: String(count),
              label: String(count),
            })),
            continuation: {
              resolutionId: resolution.id,
              effectsToExecute: [],
              resumeEffectIndex: currentEffectIndex,
              chooseValue: {
                variableName,
                options: Array.from({ length: amount + 1 }, (_, count) => ({
                  id: String(count),
                  value: count,
                })),
                allowCustomValue: false,
              },
            },
          },
        }
      }
      if (
        typeof selectedCount !== 'number' ||
        !Number.isSafeInteger(selectedCount) ||
        selectedCount < 0 ||
        selectedCount > amount
      )
        return {
          type: 'ERROR',
          message: 'Invalid surveil selection count.',
          resolution,
        }
      if (playerId !== localPlayerIdOf(state)) {
        return {
          type: 'DECISION',
          actions,
          resolution: {
            ...resolution,
            currentEffectIndex: currentEffectIndex + 1,
          },
          decision: {
            id: `decision-${resolution.id}-${currentEffectIndex}-surveil-opponent`,
            sourceAbilityId: resolution.sourceAbilityId,
            sourceInstanceId: resolution.sourceInstanceId,
            decisionPlayerId: playerId,
            type: 'PHYSICAL_CONFIRMATION',
            prompt: `Complete surveil ${amount} physically (${selectedCount} card${selectedCount === 1 ? '' : 's'} to the graveyard) and confirm when the public zones are updated.`,
            options: [{ instanceId: 'CONFIRM', label: 'Hecho' }],
            continuation: {
              resolutionId: resolution.id,
              effectsToExecute: [],
              resumeEffectIndex: currentEffectIndex + 1,
            },
          },
        }
      }
      const expanded: ResolvedEffect[] = [
        ...(selectedCount > 0
          ? [
              {
                type: 'SELECT_HIDDEN_ZONE_CARD' as const,
                player: effect.player,
                zone: 'library' as const,
                prompt: `Declare a card among the top ${amount} that you are putting into your graveyard.`,
                constraints: {},
                destination: 'graveyard' as const,
                count: selectedCount,
                lookAtTop: amount,
              },
            ]
          : []),
        {
          type: 'PHYSICAL_CONFIRMATION' as const,
          prompt: `Put the remaining card${amount - selectedCount === 1 ? '' : 's'} back on top of your library in any order.`,
          effects: [],
        },
        ...resolution.effects.slice(currentEffectIndex + 1),
      ]
      const resumed: PendingResolution = {
        ...resolution,
        effects: expanded,
        currentEffectIndex: 0,
      }
      return continueResolution(resumed)
    } else if (effect.type === 'MILL_PLAYER') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (!playerId && effect.player === 'TARGET_PLAYER') {
        currentEffectIndex += 1
        continue
      }
      if (!playerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve player who mills.',
          resolution,
        }
      const amount = evaluateValue(state, effect.amount, resolution.context)
      if (amount > 0)
        actions.push({ type: 'MILL_PLAYER', playerId, count: amount })
    } else if (effect.type === 'SHUFFLE_PLAYER_ZONES_INTO_LIBRARY') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (!playerId && effect.player === 'TARGET_PLAYER') {
        currentEffectIndex += 1
        continue
      }
      if (!playerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve player who shuffles.',
          resolution,
        }
      actions.push({
        type: 'SHUFFLE_PLAYER_ZONES_INTO_LIBRARY',
        playerId,
        zones: effect.zones,
      })
      actions.push({
        type: 'DECLARE_PLAYER_SHUFFLED',
        player: playerId === localPlayerIdOf(state) ? 'local' : 'opponent',
        playerId,
      })
    } else if (effect.type === 'CONTROL_PLAYER') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      const controllerPlayerId = resolvePlayerReferenceId(
        state,
        effect.controller,
        resolution.context,
      )
      if (!playerId && effect.player === 'TARGET_PLAYER') {
        currentEffectIndex += 1
        continue
      }
      if (!playerId || !controllerPlayerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve player-control effect.',
          resolution,
        }
      actions.push({
        type: 'ADD_PLAYER_CONTROL_EFFECT',
        targetPlayerId: playerId,
        controllerPlayerId,
        duration: effect.duration,
      })
    } else if (effect.type === 'CONTROL_ATTACHED_OBJECT') {
      const source = state.cards.find(
        (card) => card.instanceId === resolution.context.sourceInstanceId,
      )
      const target = source?.attachedToInstanceId
        ? state.cards.find(
            (card) => card.instanceId === source.attachedToInstanceId,
          )
        : undefined
      const controllerPlayerId = resolvePlayerReferenceId(
        state,
        effect.controller,
        resolution.context,
      )
      if (!source || !target || !controllerPlayerId) {
        currentEffectIndex += 1
        continue
      }
      actions.push({
        type: 'ADD_ATTACHMENT_CONTROL_EFFECT',
        sourceInstanceId: source.instanceId,
        targetInstanceId: target.instanceId,
        controllerId: controllerPlayerId,
      })
    } else if (effect.type === 'COPY_OBJECT_CHARACTERISTICS') {
      const target = referenceCard(state, effect.target, resolution.context)
      const copied = referenceCard(state, effect.source, resolution.context)
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      if (!target || !copied)
        return {
          type: 'ERROR',
          message: 'Cannot resolve objects for copy effect.',
          resolution,
        }
      actions.push({
        type: 'ADD_COPY_CONTINUOUS_EFFECT',
        sourceInstanceId: resolution.context.sourceInstanceId,
        targetInstanceId: target.instanceId,
        copiedFromInstanceId: copied.instanceId,
        copiedCard: effectiveCardDefinition(state, copied),
        copiedKeywords: effectiveCopiableKeywords(state, copied),
        duration: effect.duration,
      })
    } else if (effect.type === 'CREATE_TOKEN') {
      const token = tokenDefinitions[effect.tokenId]
      const playerId = effect.player
        ? resolvePlayerReferenceId(state, effect.player, resolution.context)
        : sourceControllerId(state, resolution.context)
      if (effect.player === 'TARGET_PLAYER' && !playerId) {
        currentEffectIndex += 1
        continue
      }
      if (!playerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve player who receives token.',
          resolution,
        }
      if (token && effect.amount > 0)
        actions.push({
          type: 'CREATE_TOKEN',
          token,
          amount: effect.amount,
          controllerId: playerId,
          ownerId: playerId,
          ...(effect.tapped !== undefined ? { tapped: effect.tapped } : {}),
        })
    } else if (effect.type === 'DRAW_CARD') {
      const playerId = sourceControllerId(state, resolution.context)
      for (let draw = 0; draw < effect.amount; draw += 1)
        actions.push({ type: 'DRAW_CARD', playerId })
    } else if (
      effect.type === 'MOVE_ZONE' ||
      effect.type === 'UNTAP_PERMANENT' ||
      effect.type === 'TAP_PERMANENT' ||
      effect.type === 'TRANSFORM_PERMANENT' ||
      effect.type === 'PHASE_OUT_PERMANENT' ||
      effect.type === 'PHASE_IN_PERMANENT'
    ) {
      const instanceId = resolvedCardInstanceId(
        state,
        effect.target,
        resolution.context,
      )
      if (!instanceId)
        return {
          type: 'ERROR',
          message: `No known object for ${effect.target}.`,
          resolution,
        }
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      const referenced = state.cards.find(
        (card) => card.instanceId === instanceId,
      )
      actions.push(
        effect.type === 'MOVE_ZONE'
          ? {
              type: 'MOVE_CARD',
              instanceId,
              toZone: effect.destination,
              ...(effect.controller === 'OWNER' && referenced?.ownerId
                ? { controllerId: referenced.ownerId }
                : {}),
            }
          : effect.type === 'UNTAP_PERMANENT'
            ? { type: 'UNTAP_CARD', instanceId }
            : effect.type === 'TAP_PERMANENT'
              ? { type: 'TAP_CARD', instanceId }
              : effect.type === 'TRANSFORM_PERMANENT'
                ? { type: 'TRANSFORM_CARD', instanceId }
                : effect.type === 'PHASE_OUT_PERMANENT'
                  ? { type: 'PHASE_OUT_CARD', instanceId }
                  : { type: 'PHASE_IN_CARD', instanceId },
      )
    } else if (effect.type === 'ADD_COUNTER') {
      const instanceId = resolvedCardInstanceId(
        state,
        effect.target,
        resolution.context,
      )
      if (!instanceId)
        return {
          type: 'ERROR',
          message: `No known object for ${effect.target}.`,
          resolution,
        }
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      if (effect.amount > 0)
        actions.push({
          type: 'ADD_COUNTER',
          instanceId,
          counter: effect.counterType,
          amount: effect.amount,
        })
    } else if (effect.type === 'PUT_EVENT_COUNTERS') {
      const instanceId = resolvedCardInstanceId(
        state,
        effect.target,
        resolution.context,
      )
      if (!instanceId) {
        currentEffectIndex += 1
        continue
      }
      const eventCounters =
        'counters' in resolution.context.triggeringEvent
          ? resolution.context.triggeringEvent.counters
          : {}
      for (const [counter, amount] of Object.entries(eventCounters))
        if (amount > 0)
          actions.push({ type: 'ADD_COUNTER', instanceId, counter, amount })
    } else if (effect.type === 'MOVE_COUNTERS_BETWEEN_TARGETS') {
      const sourceInstanceId = resolvedCardInstanceId(
        state,
        effect.from,
        resolution.context,
      )
      const targetInstanceId = resolvedCardInstanceId(
        state,
        effect.to,
        resolution.context,
      )
      const source = sourceInstanceId
        ? state.cards.find(
            (card) =>
              card.instanceId === sourceInstanceId &&
              card.zone === 'battlefield',
          )
        : undefined
      const target = targetInstanceId
        ? state.cards.find(
            (card) =>
              card.instanceId === targetInstanceId &&
              card.zone === 'battlefield',
          )
        : undefined
      if (!source || !target) {
        currentEffectIndex += 1
        continue
      }
      const available = Object.fromEntries(
        Object.entries(source.counters ?? {}).filter(
          ([, amount]) => amount > 0,
        ),
      )
      if (!Object.keys(available).length) {
        currentEffectIndex += 1
        continue
      }
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}-counter-type`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourceControllerId(state, resolution.context),
          type: 'COUNTER_MOVE_TYPE_SELECTION',
          prompt:
            effect.prompt ?? 'Elige un tipo de contador que quieras mover.',
          options: [
            ...Object.keys(available).map((counter) => ({
              instanceId: counter,
              label: `${counter} (${available[counter]})`,
            })),
            { instanceId: 'DONE', label: 'Hecho' },
          ],
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
            counterMove: {
              sourceInstanceId: source.instanceId,
              targetInstanceId: target.instanceId,
              available,
              moved: {},
            },
          },
        },
      }
    } else if (effect.type === 'DISTRIBUTE_COUNTERS') {
      if (effect.amount <= 0) {
        currentEffectIndex += 1
        continue
      }
      const candidates = queryObjects(state, effect.query, resolution.context)
      if (!candidates.length) {
        currentEffectIndex += 1
        continue
      }
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}-counter-distribution`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourceControllerId(state, resolution.context),
          type: 'COUNTER_DISTRIBUTION_SELECTION',
          prompt:
            effect.prompt ??
            `Distribuye ${effect.amount} contadores ${effect.counterType}.`,
          options: candidates.map((candidate) => ({
            instanceId: candidate.instanceId,
            label: candidate.card.name,
          })),
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
            counterDistribution: {
              counterType: effect.counterType,
              remaining: effect.amount,
              candidateIds: candidates.map((candidate) => candidate.instanceId),
              allocations: {},
              prompt: effect.prompt,
            },
          },
        },
      }
    } else if (effect.type === 'ADD_MANA') {
      if (effect.amount > 0)
        actions.push({
          type: 'ADD_MANA',
          color: effect.color,
          amount: effect.amount,
          actorPlayerId: sourceControllerId(state, resolution.context),
        })
    } else if (effect.type === 'COUNTER_SPELL') {
      const stackObjectId = referenceStackObjectId(
        effect.target,
        resolution.context,
      )
      const target = stackObjectId
        ? state.cards.find(
            (card) =>
              card.zone === 'stack' && card.stackObjectId === stackObjectId,
          )
        : undefined
      if (!target) {
        currentEffectIndex += 1
        continue
      }
      const cannotBeCountered = effectiveAbilitiesForCard(state, target).some(
        (ability) =>
          ability.kind === 'SPELL_EFFECT' && ability.cannotBeCountered,
      )
      if (cannotBeCountered) {
        currentEffectIndex += 1
        continue
      }
      actions.push({
        type: 'MOVE_CARD',
        instanceId: target.instanceId,
        toZone: effect.destination ?? 'graveyard',
      })
    } else if (effect.type === 'DESTROY_PERMANENT') {
      const target = referenceCard(state, effect.target, resolution.context)
      if (
        !target ||
        !isPresentPermanent(target) ||
        (effect.target === 'SELECTED_TARGET' &&
          !targetIsLegal(state, effect.target, resolution.context))
      ) {
        currentEffectIndex += 1
        continue
      }
      if (hasEffectiveKeyword(state, target, 'INDESTRUCTIBLE')) {
        currentEffectIndex += 1
        continue
      }
      actions.push({
        type: 'MOVE_CARD',
        instanceId: target.instanceId,
        toZone: 'graveyard',
      })
    } else if (effect.type === 'CHANGE_CONTROLLER') {
      const target = referenceCard(state, effect.target, resolution.context)
      const nextControllerId = resolvePlayerReferenceId(
        state,
        effect.controller,
        resolution.context,
      )
      if (
        !target ||
        !nextControllerId ||
        (effect.target === 'SELECTED_TARGET' &&
          !targetIsLegal(state, effect.target, resolution.context))
      ) {
        currentEffectIndex += 1
        continue
      }
      actions.push({
        type: 'SET_CARD_CONTROLLER',
        instanceId: target.instanceId,
        controllerId: nextControllerId,
      })
    } else if (effect.type === 'ATTACH') {
      const attachmentInstanceId = referenceInstanceId(
        effect.attachment,
        resolution.context,
      )
      const targetInstanceId = resolvedCardInstanceId(
        state,
        effect.target,
        resolution.context,
      )
      if (!attachmentInstanceId || !targetInstanceId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve attachment objects.',
          resolution,
        }
      const attachment = state.cards.find(
        (card) => card.instanceId === attachmentInstanceId,
      )
      const attachTarget = state.cards.find(
        (card) => card.instanceId === targetInstanceId,
      )
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      if (
        attachment &&
        attachTarget &&
        isProtectedFromSource(state, attachTarget, attachment)
      )
        return {
          type: 'ERROR',
          message: 'The attachment is illegal because of protection.',
          resolution,
        }
      actions.push({
        type: 'ATTACH_CARD',
        attachmentInstanceId,
        targetInstanceId,
      })
    } else if (effect.type === 'DETACH') {
      const attachmentInstanceId = referenceInstanceId(
        effect.attachment,
        resolution.context,
      )
      if (!attachmentInstanceId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve attachment object.',
          resolution,
        }
      actions.push({ type: 'DETACH_CARD', attachmentInstanceId })
    } else if (effect.type === 'CREATE_TOKEN_COPY') {
      const sourceInstanceId = referenceInstanceId(
        effect.target,
        resolution.context,
      )
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      if (!sourceInstanceId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve object to copy.',
          resolution,
        }
      if (effect.amount > 0)
        actions.push({
          type: 'CREATE_TOKEN_COPY',
          sourceInstanceId,
          amount: effect.amount,
          controllerId: sourceControllerId(state, resolution.context),
          ...(effect.removeLegendary ? { removeLegendary: true } : {}),
          ...(effect.overrides ? { overrides: effect.overrides } : {}),
        })
    } else if (effect.type === 'ENCORE') {
      const source = state.cards.find(
        (card) => card.instanceId === resolution.context.sourceInstanceId,
      )
      if (!source)
        return {
          type: 'ERROR',
          message: 'Encore source is no longer known.',
          resolution,
        }
      const controller = sourceControllerId(state, resolution.context)
      const opponents = opponentPlayerIds(state, controller)
      if (opponents.length) {
        const existing = state.cards.filter(
          (card) =>
            card.isToken && card.copiedFromInstanceId === source.instanceId,
        ).length
        const tokenIds = opponents.map(
          (_, index) =>
            `token-copy-${source.instanceId}-${existing + index + 1}`,
        )
        actions.push({
          type: 'CREATE_TOKEN_COPY',
          sourceInstanceId: source.instanceId,
          amount: opponents.length,
          controllerId: controller,
          instanceIds: tokenIds,
          grantKeywords: ['HASTE'],
          attackPlayerIds: opponents,
        })
        const delayedEffect: DelayedEffect = {
          id: `encore-sacrifice-${resolution.id}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          sourceCardName: resolution.sourceCardName,
          sourceControllerId: controller,
          trigger: { type: 'END_STEP_STARTED' },
          effects: [
            {
              type: 'FOR_EACH_SELECTED',
              selection: 'CARDS',
              filter: {
                zones: ['battlefield'],
                controller: 'SOURCE_CONTROLLER',
                isToken: true,
              },
              effects: [{ type: 'SACRIFICE', target: 'CURRENT_OBJECT' }],
            },
          ],
          capturedContext: {
            selectedTargets: [],
            selectedCards: tokenIds,
            selectedStackObjects: [],
            selectedPlayers: [],
            variables: {},
          },
          automation: 'AUTO',
        }
        actions.push({ type: 'ADD_DELAYED_EFFECT', delayedEffect })
      }
    } else if (effect.type === 'COPY_SPELL') {
      const sourceStackObjectId = referenceStackObjectId(
        effect.target,
        resolution.context,
      )
      if (!sourceStackObjectId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve spell to copy.',
          resolution,
        }
      const copyControllerId = effect.controller
        ? resolvePlayerReferenceId(state, effect.controller, resolution.context)
        : sourceControllerId(state, resolution.context)
      if (!copyControllerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve controller for spell copy.',
          resolution,
        }
      const resumed: PendingResolution = {
        ...resolution,
        currentEffectIndex: currentEffectIndex + 1,
        completionActions: [
          ...(resolution.completionActions ?? []),
          {
            type: 'COPY_STACK_SPELL',
            sourceStackObjectId,
            controllerId: copyControllerId,
            ...(effect.chooseNewTargets ? { chooseNewTargets: true } : {}),
            ...(effect.removeLegendary ? { removeLegendary: true } : {}),
          },
        ],
      }
      return continueResolution(resumed)
    } else if (effect.type === 'RESET_STACK_TARGETS') {
      const stackObjectId = referenceStackObjectId(
        effect.target,
        resolution.context,
      )
      if (!stackObjectId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve stack object targets.',
          resolution,
        }
      actions.push({ type: 'CLEAR_STACK_TARGETS', stackObjectId })
    } else if (effect.type === 'RETARGET_STACK_OBJECT') {
      const stackObjectId = referenceStackObjectId(
        effect.target,
        resolution.context,
      )
      const stackObject = stackObjectId
        ? state.stack.find((object) => object.stackObjectId === stackObjectId)
        : undefined
      const declaredTargets = stackObject?.declaredTargets?.map((target) => ({
        ...target,
        constraints: { ...target.constraints },
      }))
      if (!stackObjectId || !stackObject || !declaredTargets?.length) {
        currentEffectIndex += 1
        continue
      }
      const current = declaredTargets[0]
      const controlledSpell = stackObject.spellInstanceId
        ? state.cards.find(
            (card) => card.instanceId === stackObject.spellInstanceId,
          )
        : undefined
      const newControllerId = sourceControllerId(state, resolution.context)
      const legalOptions = legalDeclarationTargetOptions(
        state,
        {
          sourceInstanceId:
            controlledSpell?.instanceId ?? stackObject.sourceInstanceId,
          sourceCard: controlledSpell?.card,
          controllerId: newControllerId,
          kind: 'SPELL',
        },
        current.constraints,
      )
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}-retarget-1`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: newControllerId,
          type: 'STACK_RETARGET_SELECTION',
          prompt: 'Keep target 1, or choose a new legal target?',
          options: [
            { instanceId: '__KEEP_TARGET__', label: 'Keep current target' },
            ...legalOptions.filter(
              (option) => option.instanceId !== current.targetId,
            ),
          ],
          constraints: current.constraints,
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
            stackRetarget: {
              stackObjectId,
              targetIndex: 0,
              declaredTargets,
              resumeEffectIndex: currentEffectIndex + 1,
            },
          },
        },
      }
    } else if (effect.type === 'LINK_OBJECT') {
      const linkedInstanceId = referenceInstanceId(
        effect.target,
        resolution.context,
      )
      if (!linkedInstanceId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve object to link.',
          resolution,
        }
      actions.push({
        type: 'LINK_CARD',
        sourceInstanceId: resolution.context.sourceInstanceId,
        key: effect.key,
        linkedInstanceId,
        ...(effect.returnOnSourceLeaves
          ? { returnOnSourceLeaves: effect.returnOnSourceLeaves }
          : {}),
      })
    } else if (effect.type === 'RETURN_LINKED_OBJECTS') {
      const group = (state.linkedObjectGroups ?? []).find(
        (entry) =>
          entry.sourceInstanceId === resolution.context.sourceInstanceId &&
          entry.key === effect.key,
      )
      for (const instanceId of group?.linkedInstanceIds ?? []) {
        const linked = state.cards.find(
          (card) => card.instanceId === instanceId,
        )
        if (!linked) continue
        actions.push({
          type: 'MOVE_CARD',
          instanceId,
          toZone: effect.destination,
          ...(effect.controller === 'OWNER' && linked.ownerId
            ? { controllerId: linked.ownerId }
            : {}),
        })
      }
      actions.push({
        type: 'CLEAR_LINKED_CARDS',
        sourceInstanceId: resolution.context.sourceInstanceId,
        key: effect.key,
      })
    } else if (effect.type === 'DEAL_DAMAGE') {
      const target = referenceCard(state, effect.target, resolution.context)
      if (!target || !isPresentPermanent(target)) {
        currentEffectIndex += 1
        continue
      }
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      const amount = evaluateValue(state, effect.amount, resolution.context)
      if (amount > 0)
        actions.push({
          type: 'DEAL_DAMAGE',
          damage: {
            sourceInstanceId: resolution.context.sourceInstanceId,
            target: /\bplaneswalker\b/i.test(effectiveTypeLine(state, target))
              ? { kind: 'PLANESWALKER', instanceId: target.instanceId }
              : { kind: 'CREATURE', instanceId: target.instanceId },
            amount,
            damageKind: effect.damageKind,
            hasDeathtouch: false,
          },
        })
    } else if (effect.type === 'SET_BASE_POWER_TOUGHNESS') {
      const targetInstanceId = resolvedCardInstanceId(
        state,
        effect.target,
        resolution.context,
      )
      if (!targetInstanceId) {
        currentEffectIndex += 1
        continue
      }
      actions.push({
        type: 'ADD_TEMPORARY_CHARACTERISTIC_EFFECT',
        sourceInstanceId: resolution.context.sourceInstanceId,
        targetInstanceId,
        setBasePower: evaluateValue(state, effect.power, resolution.context),
        setBaseToughness: evaluateValue(
          state,
          effect.toughness,
          resolution.context,
        ),
        duration: effect.duration,
      })
    } else if (effect.type === 'REMOVE_ALL_COUNTERS') {
      const target = referenceCard(state, effect.target, resolution.context)
      if (!target) {
        currentEffectIndex += 1
        continue
      }
      for (const [counter, amount] of Object.entries(target.counters))
        if (amount > 0)
          actions.push({
            type: 'REMOVE_COUNTER',
            instanceId: target.instanceId,
            counter,
            amount,
          })
    } else if (effect.type === 'ADD_CREATURE_SUBTYPE') {
      const targetInstanceId = referenceInstanceId(
        effect.target,
        resolution.context,
      )
      const subtype = resolveRuntimeTextReference(
        state,
        effect.subtype,
        resolution.context,
      )
      if (!targetInstanceId || !subtype)
        return {
          type: 'ERROR',
          message: 'Cannot resolve creature subtype modifier.',
          resolution,
        }
      actions.push({
        type: 'ADD_TEMPORARY_CHARACTERISTIC_EFFECT',
        sourceInstanceId: resolution.context.sourceInstanceId,
        targetInstanceId,
        addCreatureSubtypes: [subtype],
        duration: effect.duration,
      })
    } else if (effect.type === 'SET_COLORS') {
      const targetInstanceId = resolvedCardInstanceId(
        state,
        effect.target,
        resolution.context,
      )
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      if (!targetInstanceId) {
        currentEffectIndex += 1
        continue
      }
      actions.push({
        type: 'ADD_TEMPORARY_CHARACTERISTIC_EFFECT',
        sourceInstanceId: resolution.context.sourceInstanceId,
        targetInstanceId,
        setColors: [...effect.colors],
        duration: effect.duration,
      })
    } else if (effect.type === 'GRANT_PROTECTION') {
      const targetInstanceId = resolvedCardInstanceId(
        state,
        effect.target,
        resolution.context,
      )
      if (!targetInstanceId) {
        currentEffectIndex += 1
        continue
      }
      const cardType =
        effect.protection.type === 'CARD_TYPE'
          ? resolveRuntimeTextReference(
              state,
              effect.protection.cardType,
              resolution.context,
            )
          : undefined
      actions.push({
        type: 'ADD_TEMPORARY_PROTECTION_EFFECT',
        sourceInstanceId: resolution.context.sourceInstanceId,
        targetInstanceId,
        ...(effect.protection.type === 'EVERYTHING'
          ? { protectionFromEverything: true }
          : effect.protection.type === 'COLORS'
            ? { colors: [...effect.protection.colors] }
            : cardType
              ? { cardTypes: [cardType] }
              : {}),
        duration: effect.duration,
        ...(effect.duration === 'UNTIL_SOURCE_CONTROLLER_NEXT_TURN'
          ? { expiresAtPlayerId: sourceControllerId(state, resolution.context) }
          : {}),
      })
    } else if (effect.type === 'PREVENT_NEXT_DAMAGE') {
      const targetInstanceId = resolvedCardInstanceId(
        state,
        effect.target,
        resolution.context,
      )
      const amount = evaluateValue(state, effect.amount, resolution.context)
      if (targetInstanceId && amount > 0)
        actions.push({
          type: 'ADD_DAMAGE_PREVENTION_EFFECT',
          id: `prevent-${resolution.id}-${currentEffectIndex}`,
          sourceInstanceId: resolution.context.sourceInstanceId,
          targetInstanceId,
          remainingAmount: amount,
          duration: effect.duration,
        })
    } else if (effect.type === 'ADD_PLAYER_RULE') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (playerId)
        actions.push({
          type: 'ADD_PLAYER_RULE_EFFECT',
          id: `player-rule-${resolution.id}-${currentEffectIndex}-${playerId}`,
          sourceInstanceId: resolution.context.sourceInstanceId,
          playerId,
          ...effect.rules,
          duration: effect.duration,
        })
    } else if (effect.type === 'AIRBEND') {
      const selectedStackObjectId =
        effect.target === 'SELECTED_TARGET'
          ? resolution.context.selectedStackObjects.at(-1)
          : undefined
      const target =
        referenceCard(state, effect.target, resolution.context) ??
        (selectedStackObjectId
          ? state.cards.find(
              (card) =>
                card.zone === 'stack' &&
                card.stackObjectId === selectedStackObjectId,
            )
          : undefined)
      if (!target) {
        currentEffectIndex += 1
        continue
      }
      if (
        effect.target === 'SELECTED_TARGET' &&
        resolution.context.selectedTargets.length > 0 &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      const ownerId =
        target.ownerId ?? target.controllerId ?? localPlayerIdOf(state)
      actions.push({
        type: 'MOVE_CARD',
        instanceId: target.instanceId,
        toZone: 'exile',
      })
      actions.push({
        type: 'ADD_AIRBEND_PERMISSION',
        cardInstanceId: target.instanceId,
        ownerId,
        alternativeManaCost: '{2}',
      })
    } else if (effect.type === 'PUT_SOURCE_ONTO_BATTLEFIELD_ATTACKING') {
      const source = state.cards.find(
        (card) => card.instanceId === resolution.context.sourceInstanceId,
      )
      const defendingTarget = (() => {
        if (effect.defendingTarget.type === 'PLAYER') {
          const playerId = resolvePlayerReferenceId(
            state,
            effect.defendingTarget.player,
            resolution.context,
          )
          return playerId
            ? { kind: 'PLAYER' as const, id: playerId, playerId }
            : undefined
        }
        const permanent = referenceCard(
          state,
          effect.defendingTarget.target,
          resolution.context,
        )
        if (!permanent || permanent.zone !== 'battlefield') return undefined
        if (!/\bplaneswalker\b/i.test(effectiveTypeLine(state, permanent)))
          return undefined
        return {
          kind: 'PLANESWALKER' as const,
          id: permanent.instanceId,
        }
      })()
      if (!source || source.zone !== 'exile' || !defendingTarget) {
        currentEffectIndex += 1
        continue
      }
      actions.push({
        type: 'MOVE_CARD',
        instanceId: source.instanceId,
        toZone: 'battlefield',
        controllerId: sourceControllerId(state, resolution.context),
      })
      actions.push({
        type: 'ADD_ATTACKING_CREATURE_TO_COMBAT',
        instanceId: source.instanceId,
        defendingTarget,
      })
    } else if (effect.type === 'ADD_RESTRICTED_MANA') {
      const playerId = sourceControllerId(state, resolution.context)
      if (effect.amount > 0)
        actions.push({
          type: 'ADD_RESTRICTED_MANA',
          playerId,
          color: effect.color,
          amount: effect.amount,
          restriction: effect.restriction,
          sourceInstanceId: resolution.context.sourceInstanceId,
        })
    } else if (effect.type === 'TEMPORARY_MODIFIER') {
      const targetInstanceId = resolvedCardInstanceId(
        state,
        effect.target,
        resolution.context,
      )
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      if (!targetInstanceId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve object for temporary modifier.',
          resolution,
        }
      actions.push({
        type: 'ADD_TEMPORARY_CONTINUOUS_EFFECT',
        sourceInstanceId: resolution.context.sourceInstanceId,
        targetInstanceId,
        ...(effect.power !== undefined ? { power: effect.power } : {}),
        ...(effect.toughness !== undefined
          ? { toughness: effect.toughness }
          : {}),
        ...(effect.grantKeywords
          ? { grantKeywords: effect.grantKeywords }
          : {}),
        duration: effect.duration,
      })
    } else if (effect.type === 'GRANT_TRIGGERED_ABILITY_UNTIL_END_OF_TURN') {
      const targetInstanceId = resolvedCardInstanceId(
        state,
        effect.target,
        resolution.context,
      )
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      if (!targetInstanceId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve object for granted triggered ability.',
          resolution,
        }
      actions.push({
        type: 'ADD_TEMPORARY_GRANTED_TRIGGERED_ABILITY',
        id: `temporary-trigger-${resolution.id}-${currentEffectIndex}-${targetInstanceId}`,
        sourceInstanceId: resolution.context.sourceInstanceId,
        targetInstanceId,
        ability: effect.ability,
        duration: 'UNTIL_END_OF_TURN',
      })
    } else if (effect.type === 'ADD_UNTAP_RESTRICTION') {
      const targetInstanceId = referenceInstanceId(
        effect.target,
        resolution.context,
      )
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      if (!targetInstanceId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve object for untap restriction.',
          resolution,
        }
      actions.push({
        type: 'ADD_UNTAP_RESTRICTION',
        sourceInstanceId: resolution.context.sourceInstanceId,
        sourceControllerId: sourceControllerId(state, resolution.context),
        targetInstanceId,
        duration: effect.duration,
      })
    } else if (effect.type === 'QUEUE_EXTRA_TURN') {
      actions.push({
        type: 'QUEUE_EXTRA_TURN',
        playerId: resolvePlayerReferenceId(
          state,
          effect.player,
          resolution.context,
        ),
      })
    } else if (effect.type === 'END_TURN') {
      actions.push({ type: 'END_TURN' })
    } else if (effect.type === 'SKIP_NEXT_COMBAT_PHASES') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (playerId) actions.push({ type: 'SKIP_NEXT_COMBAT_PHASES', playerId })
    } else if (effect.type === 'ENTERS_TAPPED') {
      const resumed: PendingResolution = {
        ...resolution,
        currentEffectIndex: currentEffectIndex + 1,
        completionActions: [
          ...(resolution.completionActions ?? []),
          {
            type: 'SET_CARD_TAPPED_STATE',
            instanceId: resolution.context.sourceInstanceId,
            tapped: true,
          },
        ],
      }
      return continueResolution(resumed)
    } else if (effect.type === 'CHANGE_LAND_SUBTYPE') {
      const targetInstanceId = referenceInstanceId(
        effect.target,
        resolution.context,
      )
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      const subtype = resolveRuntimeTextReference(
        state,
        effect.subtype,
        resolution.context,
      )
      if (!targetInstanceId || !subtype)
        return {
          type: 'ERROR',
          message: 'Cannot resolve land type change.',
          resolution,
        }
      actions.push({
        type: 'ADD_TYPE_CONTINUOUS_EFFECT',
        sourceInstanceId: resolution.context.sourceInstanceId,
        targetInstanceId,
        mode: effect.mode,
        landSubtype: subtype,
        duration: effect.duration,
        ...(effect.counterType ? { counterType: effect.counterType } : {}),
      })
    } else if (effect.type === 'CANNOT_BE_BLOCKED') {
      const instanceId = referenceInstanceId(effect.target, resolution.context)
      if (!instanceId)
        return {
          type: 'ERROR',
          message: 'No known creature selected for blocking restriction.',
          resolution,
        }
      if (
        effect.target === 'SELECTED_TARGET' &&
        !targetIsLegal(state, effect.target, resolution.context)
      ) {
        currentEffectIndex += 1
        continue
      }
      actions.push({
        type: 'ADD_TEMPORARY_BLOCKING_RESTRICTION',
        targetInstanceId: instanceId,
        sourceInstanceId: resolution.context.sourceInstanceId,
        restriction: {
          type: 'CANNOT_BE_BLOCKED',
          filter: { sourceOnly: true },
          duration: effect.duration,
        },
      })
    } else if (effect.type === 'ADD_MANA_CHOICE') {
      const manaAmount = evaluateValue(state, effect.amount, resolution.context)
      const manaPlayerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (manaAmount <= 0 || !manaPlayerId) {
        currentEffectIndex += 1
        continue
      }
      const manaAction = (
        color: import('../../types/card').ManaColor,
      ): GameAction =>
        manaPlayerId === localPlayerIdOf(state)
          ? { type: 'ADD_MANA', color, amount: manaAmount }
          : {
              type: 'ADD_PLAYER_MANA',
              playerId: manaPlayerId,
              color,
              amount: manaAmount,
            }
      const allowedColors = Array.isArray(effect.allowedColors)
        ? effect.allowedColors
        : combinedCommanderColorIdentity(state, manaPlayerId).filter(
            (color) => color !== 'C',
          )
      if (allowedColors.length === 0) {
        currentEffectIndex += 1
        continue
      }
      if (allowedColors.length === 1) actions.push(manaAction(allowedColors[0]))
      else
        return {
          type: 'DECISION',
          actions,
          resolution: {
            ...resolution,
            currentEffectIndex: currentEffectIndex + 1,
          },
          decision: {
            id: `decision-${resolution.id}-${currentEffectIndex}-mana-color`,
            sourceAbilityId: resolution.sourceAbilityId,
            sourceInstanceId: resolution.sourceInstanceId,
            decisionPlayerId: manaPlayerId,
            type: 'CHOOSE_MODE',
            prompt: 'Choose a mana color.',
            options: allowedColors.map((color) => ({
              instanceId: color,
              label: color,
            })),
            continuation: {
              resolutionId: resolution.id,
              effectsToExecute: [],
              resumeEffectIndex: currentEffectIndex + 1,
              modes: allowedColors.map((color) => ({
                id: color,
                effects: [
                  {
                    type: 'ADD_MANA_CHOICE',
                    player: effect.player,
                    allowedColors: [color],
                    amount: { type: 'LITERAL', value: manaAmount },
                  },
                ],
              })),
            },
          },
        }
    } else if (effect.type === 'ADD_MANA_FROM_LINKED_COLORS') {
      const manaAmount = evaluateValue(state, effect.amount, resolution.context)
      const linked = (state.linkedObjectGroups ?? []).find(
        (group) =>
          group.sourceInstanceId === resolution.context.sourceInstanceId &&
          group.key === effect.key,
      )
      const allowedColors = [
        ...new Set(
          (linked?.linkedInstanceIds ?? [])
            .map((instanceId) =>
              state.cards.find((card) => card.instanceId === instanceId),
            )
            .filter((card): card is NonNullable<typeof card> =>
              Boolean(card && card.zone === 'exile'),
            )
            .flatMap((card) => effectiveCardDefinition(state, card).colors),
        ),
      ]
      if (manaAmount <= 0 || allowedColors.length === 0) {
        currentEffectIndex += 1
        continue
      }
      const resumed = {
        ...resolution,
        effects: [
          {
            type: 'ADD_MANA_CHOICE' as const,
            player: effect.player,
            allowedColors,
            amount: { type: 'LITERAL' as const, value: manaAmount },
          },
          ...resolution.effects.slice(currentEffectIndex + 1),
        ],
        currentEffectIndex: 0,
      }
      return continueResolution(resumed)
    } else if (effect.type === 'ADD_MANA_FROM_PUBLIC_ZONE_COLORS') {
      const manaAmount = evaluateValue(state, effect.amount, resolution.context)
      const allowedColors = [
        ...new Set(
          queryObjects(state, effect.query, resolution.context)
            .flatMap((card) => effectiveCardDefinition(state, card).colors)
            .filter((color) => color !== 'C'),
        ),
      ]
      if (manaAmount <= 0 || allowedColors.length === 0) {
        currentEffectIndex += 1
        continue
      }
      const resumed: PendingResolution = {
        ...resolution,
        effects: [
          {
            type: 'ADD_MANA_CHOICE',
            player: effect.player,
            allowedColors,
            amount: { type: 'LITERAL', value: manaAmount },
          },
          ...resolution.effects.slice(currentEffectIndex + 1),
        ],
        currentEffectIndex: 0,
      }
      return continueResolution(resumed)
    } else if (effect.type === 'DISCARD_CARD') {
      if (effect.amount !== 1)
        return {
          type: 'ERROR',
          message:
            'Discarding more than one identified card is not supported yet.',
          resolution,
        }
      const playerId = sourceControllerId(state, resolution.context)
      const candidates = state.cards
        .filter(
          (card) =>
            card.zone === 'hand' &&
            (card.ownerId ?? localPlayerIdOf(state)) === playerId,
        )
        .map((card) => ({ instanceId: card.instanceId, label: card.card.name }))
      if (!candidates.length)
        return {
          type: 'ERROR',
          message: 'Identify a card in hand before discarding it.',
          resolution,
        }
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: playerId,
          type: 'CARD_SELECTION',
          prompt: 'Choose a card to discard.',
          options: candidates,
          constraints: { zones: ['hand'], controller: 'YOU' },
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [
              {
                type: 'MOVE_ZONE',
                target: 'SELECTED_CARD',
                destination: 'graveyard',
              },
            ],
            resumeEffectIndex: currentEffectIndex + 1,
          },
        },
      }
    } else if (effect.type === 'SACRIFICE') {
      const instanceId = referenceInstanceId(effect.target, resolution.context)
      const target = state.cards.find((card) => card.instanceId === instanceId)
      if (!target || !isPresentPermanent(target))
        return {
          type: 'ERROR',
          message: 'No battlefield permanent can be sacrificed.',
          resolution,
        }
      actions.push({
        type: 'MOVE_CARD',
        instanceId: target.instanceId,
        toZone: 'graveyard',
      })
    } else if (effect.type === 'SET_VARIABLE') {
      const value = evaluateValue(state, effect.value, resolution.context)
      const resumed = {
        ...resolution,
        currentEffectIndex: currentEffectIndex + 1,
        context: {
          ...resolution.context,
          variables: {
            ...resolution.context.variables,
            [effect.variableName]: value,
          },
        },
      }
      return continueResolution(resumed)
    } else if (effect.type === 'DELAYED_EFFECT') {
      const delayedEffect: DelayedEffect = {
        id: `delayed-${resolution.id}-${currentEffectIndex}`,
        sourceAbilityId: resolution.sourceAbilityId,
        sourceInstanceId: resolution.sourceInstanceId,
        sourceCardName: resolution.sourceCardName,
        sourceControllerId: sourceControllerId(state, resolution.context),
        trigger: effect.trigger,
        triggerPlayer: effect.triggerPlayer,
        effects: effect.effects,
        capturedContext: {
          selectedTargets: [...resolution.context.selectedTargets],
          selectedCards: [...resolution.context.selectedCards],
          selectedStackObjects: [...resolution.context.selectedStackObjects],
          selectedPlayers: [...(resolution.context.selectedPlayers ?? [])],
          variables: { ...resolution.context.variables },
        },
        automation: 'AUTO',
      }
      actions.push({ type: 'ADD_DELAYED_EFFECT', delayedEffect })
    } else if (effect.type === 'FOR_EACH_SELECTED') {
      const instanceIds =
        effect.selection === 'TARGETS'
          ? resolution.context.selectedTargets
          : resolution.context.selectedCards
      for (const [selectedIndex, instanceId] of instanceIds.entries()) {
        const card = state.cards.find(
          (candidate) => candidate.instanceId === instanceId,
        )
        if (!card) continue
        if (
          effect.selection === 'TARGETS' &&
          !selectedTargetCardIsLegal(
            state,
            card,
            resolution.context.selectedTargetConstraints?.[selectedIndex] ?? {
              zones: ['battlefield'],
            },
            resolution.context,
          )
        )
          continue
        if (
          effect.filter &&
          !queryObjects(state, effect.filter, resolution.context).some(
            (candidate) => candidate.instanceId === instanceId,
          )
        )
          continue
        for (const nested of effect.effects) {
          if (nested.type === 'UNTAP_PERMANENT')
            actions.push({ type: 'UNTAP_CARD', instanceId })
          else if (nested.type === 'TAP_PERMANENT')
            actions.push({ type: 'TAP_CARD', instanceId })
          else if (nested.type === 'PHASE_OUT_PERMANENT')
            actions.push({ type: 'PHASE_OUT_CARD', instanceId })
          else if (nested.type === 'PHASE_IN_PERMANENT')
            actions.push({ type: 'PHASE_IN_CARD', instanceId })
          else if (nested.type === 'ADD_COUNTER' && nested.amount > 0)
            actions.push({
              type: 'ADD_COUNTER',
              instanceId,
              counter: nested.counterType,
              amount: nested.amount,
            })
          else if (nested.type === 'MOVE_ZONE')
            actions.push({
              type: 'MOVE_CARD',
              instanceId,
              toZone: nested.destination,
              ...(nested.controller === 'OWNER' && card.ownerId
                ? { controllerId: card.ownerId }
                : {}),
            })
          else if (
            nested.type === 'SACRIFICE' ||
            nested.type === 'DESTROY_PERMANENT'
          )
            actions.push({ type: 'MOVE_CARD', instanceId, toZone: 'graveyard' })
          else if (nested.type === 'CREATE_TOKEN_COPY' && nested.amount > 0)
            actions.push({
              type: 'CREATE_TOKEN_COPY',
              sourceInstanceId: instanceId,
              amount: nested.amount,
              controllerId: sourceControllerId(state, resolution.context),
              ...(nested.removeLegendary ? { removeLegendary: true } : {}),
              ...(nested.overrides ? { overrides: nested.overrides } : {}),
            })
          else
            return {
              type: 'ERROR',
              message: `FOR_EACH_SELECTED does not support ${nested.type} yet.`,
              resolution,
            }
        }
      }
    } else if (effect.type === 'FOR_EACH') {
      for (const card of queryObjects(state, effect.query, resolution.context))
        for (const nested of effect.effects) {
          if (nested.type === 'UNTAP_PERMANENT')
            actions.push({ type: 'UNTAP_CARD', instanceId: card.instanceId })
          else if (nested.type === 'TAP_PERMANENT')
            actions.push({ type: 'TAP_CARD', instanceId: card.instanceId })
          else if (nested.type === 'PHASE_OUT_PERMANENT')
            actions.push({
              type: 'PHASE_OUT_CARD',
              instanceId: card.instanceId,
            })
          else if (nested.type === 'PHASE_IN_PERMANENT')
            actions.push({ type: 'PHASE_IN_CARD', instanceId: card.instanceId })
          else if (nested.type === 'ADD_COUNTER' && nested.amount > 0)
            actions.push({
              type: 'ADD_COUNTER',
              instanceId: card.instanceId,
              counter: nested.counterType,
              amount: nested.amount,
            })
          else if (nested.type === 'MOVE_ZONE')
            actions.push({
              type: 'MOVE_CARD',
              instanceId: card.instanceId,
              toZone: nested.destination,
              ...(nested.controller === 'OWNER' && card.ownerId
                ? { controllerId: card.ownerId }
                : {}),
            })
          else if (nested.type === 'SACRIFICE')
            actions.push({
              type: 'MOVE_CARD',
              instanceId: card.instanceId,
              toZone: 'graveyard',
            })
          else if (nested.type === 'DESTROY_PERMANENT')
            actions.push({
              type: 'MOVE_CARD',
              instanceId: card.instanceId,
              toZone: 'graveyard',
            })
          else if (nested.type === 'CREATE_TOKEN_COPY' && nested.amount > 0)
            actions.push({
              type: 'CREATE_TOKEN_COPY',
              sourceInstanceId: card.instanceId,
              amount: nested.amount,
              controllerId: sourceControllerId(state, resolution.context),
              ...(nested.removeLegendary ? { removeLegendary: true } : {}),
              ...(nested.overrides ? { overrides: nested.overrides } : {}),
            })
          else if (nested.type === 'TEMPORARY_MODIFIER')
            actions.push({
              type: 'ADD_TEMPORARY_CONTINUOUS_EFFECT',
              sourceInstanceId: resolution.context.sourceInstanceId,
              targetInstanceId: card.instanceId,
              ...(nested.power !== undefined ? { power: nested.power } : {}),
              ...(nested.toughness !== undefined
                ? { toughness: nested.toughness }
                : {}),
              ...(nested.grantKeywords
                ? { grantKeywords: nested.grantKeywords }
                : {}),
              duration: nested.duration,
            })
          else
            return {
              type: 'ERROR',
              message: `FOR_EACH does not support ${nested.type} yet.`,
              resolution,
            }
        }
    } else if (effect.type === 'CONDITIONAL_EFFECT') {
      if (effect.condition.type === 'SOURCE_CONTROLLER_IS_ACTIVE_PLAYER') {
        const matched =
          sourceControllerId(state, resolution.context) ===
          activePlayerIdOf(state)
        const resumed = {
          ...resolution,
          effects: [
            ...(matched ? effect.ifTrue : (effect.ifFalse ?? [])),
            ...resolution.effects.slice(currentEffectIndex + 1),
          ],
          currentEffectIndex: 0,
        }
        return continueResolution(resumed)
      }
      if (effect.condition.type === 'CURRENT_TURN_STEP_IS_MAIN_PHASE') {
        const matched =
          state.turnState.step === 'MAIN_1' || state.turnState.step === 'MAIN_2'
        const resumed = {
          ...resolution,
          effects: [
            ...(matched ? effect.ifTrue : (effect.ifFalse ?? [])),
            ...resolution.effects.slice(currentEffectIndex + 1),
          ],
          currentEffectIndex: 0,
        }
        return continueResolution(resumed)
      }
      if (effect.condition.type === 'OBJECT_MATCHES_QUERY') {
        const matched = objectMatchesQuery(
          state,
          effect.condition.object,
          effect.condition.query,
          resolution.context,
        )
        const resumed = {
          ...resolution,
          effects: [
            ...(matched ? effect.ifTrue : (effect.ifFalse ?? [])),
            ...resolution.effects.slice(currentEffectIndex + 1),
          ],
          currentEffectIndex: 0,
        }
        return continueResolution(resumed)
      }
      const left = evaluateValue(
        state,
        effect.condition.left,
        resolution.context,
      )
      const right = evaluateValue(
        state,
        effect.condition.right,
        resolution.context,
      )
      const matched = {
        GT: left > right,
        GTE: left >= right,
        LT: left < right,
        LTE: left <= right,
        EQ: left === right,
      }[effect.condition.operator]
      const resumed = {
        ...resolution,
        effects: [
          ...(matched ? effect.ifTrue : (effect.ifFalse ?? [])),
          ...resolution.effects.slice(currentEffectIndex + 1),
        ],
        currentEffectIndex: 0,
      }
      return continueResolution(resumed)
    } else if (effect.type === 'PAYMENT_BRANCH') {
      const manaCost =
        effect.cost.type === 'FIXED_MANA'
          ? parseManaCost(effect.cost.cost)
          : {
              generic: evaluateValue(
                state,
                effect.cost.value,
                resolution.context,
              ),
              colors: {},
            }
      const payerId = resolvePlayerReferenceId(
        state,
        effect.payer,
        resolution.context,
      )
      const trackedLocalPayment = payerId === localPlayerIdOf(state)
      const plan =
        trackedLocalPayment && manaCost
          ? planSmartManaPayment({ state, manaCost })
          : undefined
      const paymentOptions =
        plan?.kind === 'ALREADY_PAYABLE'
          ? (() => {
              const direct = planManaPayment(
                state,
                manaCost!,
                undefined,
                payerId,
              )
              return direct.kind === 'PAYABLE'
                ? [{ id: 'PAID', actions: direct.actions }]
                : []
            })()
          : plan?.kind === 'UNIQUE_SAFE_PLAN'
            ? [{ id: 'PAID', actions: plan.plan.actions }]
            : plan?.kind === 'MULTIPLE_SAFE_PLANS' ||
                plan?.kind === 'REQUIRES_CONFIRMATION'
              ? plan.plans.map((candidate) => ({
                  id: `PAID:${candidate.id}`,
                  actions: candidate.actions,
                }))
              : !trackedLocalPayment && payerId
                ? [{ id: 'PAID', actions: [] }]
                : []
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId:
            payerId ?? sourceControllerId(state, resolution.context),
          type: 'PAYMENT_CHOICE',
          prompt:
            effect.prompt ??
            `Does the player pay ${effect.cost.type === 'FIXED_MANA' ? effect.cost.cost : 'the required cost'}?`,
          options: [
            ...paymentOptions.map((option) => ({
              instanceId: option.id,
              label: 'Paid',
            })),
            { instanceId: 'NOT_PAID', label: 'Not paid' },
          ],
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
            payment: {
              payer: effect.payer,
              cost: effect.cost,
              ifPaid: effect.ifPaid,
              ifNotPaid: effect.ifNotPaid,
              options: paymentOptions,
            },
          },
        },
      }
    } else if (effect.type === 'CHOOSE_MODE') {
      const declaredMode =
        resolution.context.variables[
          declaredModeVariableKey(resolution.sourceAbilityId)
        ]
      if (
        currentEffectIndex === 0 &&
        actions.length === 0 &&
        typeof declaredMode === 'string'
      ) {
        const mode = effect.modes.find(
          (candidate) => candidate.id === declaredMode,
        )
        if (mode)
          return advancePendingResolution(state, {
            ...resolution,
            effects: [...mode.effects, ...resolution.effects.slice(1)],
            currentEffectIndex: 0,
          })
      }
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourceControllerId(state, resolution.context),
          type: 'CHOOSE_MODE',
          prompt: effect.prompt,
          options: effect.modes.map((mode) => ({
            instanceId: mode.id,
            label: mode.label,
          })),
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
            modes: effect.modes.map((mode) => ({
              id: mode.id,
              effects: mode.effects,
            })),
          },
        },
      }
    } else if (effect.type === 'CHOOSE_VALUE') {
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourceControllerId(state, resolution.context),
          type: 'CHOOSE_VALUE',
          prompt: effect.prompt,
          options: (effect.options ?? []).map((option) => ({
            instanceId: option.id,
            label: option.label,
          })),
          acceptsTextValue: effect.allowCustomValue === true,
          textValueLabel: effect.customValueLabel,
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
            chooseValue: {
              variableName: effect.variableName,
              options: (effect.options ?? []).map((option) => ({
                id: option.id,
                value: option.value,
              })),
              allowCustomValue: effect.allowCustomValue === true,
            },
          },
        },
      }
    } else if (effect.type === 'STORE_SOURCE_VALUE') {
      const value = resolveRuntimeValueSource(effect.value, resolution.context)
      if (value === undefined)
        return {
          type: 'ERROR',
          message: `Runtime variable for ${effect.key} is not defined.`,
          resolution,
        }
      actions.push({
        type: 'SET_CARD_RUNTIME_VALUE',
        instanceId: resolution.context.sourceInstanceId,
        key: effect.key,
        value,
      })
    } else if (effect.type === 'MOVE_UNKNOWN_HIDDEN_CARDS') {
      if (effect.amount > 0)
        actions.push({
          type: 'MOVE_UNKNOWN_HIDDEN_CARDS',
          fromZone: effect.fromZone,
          toZone: effect.toZone,
          count: effect.amount,
        })
    } else if (effect.type === 'SHUFFLE_LIBRARY') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (!playerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve the player whose library must be shuffled.',
          resolution,
        }
      actions.push({
        type: 'DECLARE_PLAYER_SHUFFLED',
        player: playerId === localPlayerIdOf(state) ? 'local' : 'opponent',
        playerId,
      })
    } else if (effect.type === 'SET_PLAYER_MAX_HAND_SIZE') {
      if (effect.player !== 'SOURCE_CONTROLLER')
        return {
          type: 'ERROR',
          message:
            'Only the local/source-controller max hand size is tracked currently.',
          resolution,
        }
      actions.push({ type: 'SET_MAX_HAND_SIZE_OVERRIDE', value: effect.value })
    } else if (effect.type === 'PHYSICAL_CONFIRMATION') {
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourceControllerId(state, resolution.context),
          type: 'PHYSICAL_CONFIRMATION',
          prompt: effect.prompt,
          options: [{ instanceId: 'CONFIRM', label: 'Hecho' }],
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: effect.effects,
            resumeEffectIndex: currentEffectIndex + 1,
          },
        },
      }
    } else if (effect.type === 'SELECT_HIDDEN_ZONE_CARD') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (!playerId)
        return {
          type: 'ERROR',
          message: 'Cannot resolve the player for this hidden-zone selection.',
          resolution,
        }
      const requiredCount = Math.max(0, effect.count)
      if (
        effect.lookAtTop &&
        effect.lookAtTop > 0 &&
        playerId === localPlayerIdOf(state)
      )
        actions.push({ type: 'SET_KNOWN_LIBRARY_TOP', instanceId: undefined })
      if (requiredCount === 0) {
        currentEffectIndex += 1
        continue
      }
      const knownOptions = state.cards
        .filter(
          (card) =>
            card.zone === effect.zone &&
            (card.ownerId ?? localPlayerIdOf(state)) === playerId,
        )
        .filter((card) =>
          matchesConstraints(
            effectiveTypeLine(state, card),
            card.isToken === true,
            relativeControllerForCard(state, card, resolution.context),
            effect.constraints,
          ),
        )
        .filter(
          (card) =>
            !effect.constraints.colors?.some(
              (color) =>
                !effectiveCardDefinition(state, card).colors.includes(color),
            ) &&
            (!effect.constraints.colorsAnyOf?.length ||
              effect.constraints.colorsAnyOf.some((color) =>
                effectiveCardDefinition(state, card).colors.includes(color),
              )) &&
            !effect.constraints.excludeColors?.some((color) =>
              effectiveCardDefinition(state, card).colors.includes(color),
            ),
        )
        .map((card) => ({ instanceId: card.instanceId, label: card.card.name }))
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}-hidden-${effect.zone}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: playerId,
          type: 'HIDDEN_ZONE_CARD_SELECTION',
          prompt: (() => {
            const base = effect.lookAtTop
              ? `Mira las ${effect.lookAtTop} primeras cartas de tu biblioteca. ${effect.prompt}`
              : effect.prompt
            return requiredCount > 1 ? `${base} (1/${requiredCount})` : base
          })(),
          options: [
            ...knownOptions,
            ...(effect.allowFail
              ? [
                  {
                    instanceId: 'FAIL_TO_FIND',
                    label: 'No elegir ninguna carta',
                  },
                ]
              : []),
          ],
          acceptsTextValue: true,
          textValueLabel: 'Nombre de la carta declarada',
          constraints: effect.constraints,
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
            hiddenZoneSelection: {
              player: effect.player,
              zone: effect.zone,
              constraints: effect.constraints,
              destination: effect.destination,
              requiredCount,
              selected: [],
              ...(effect.allowFail ? { allowFail: true } : {}),
              ...(effect.linkKey ? { linkKey: effect.linkKey } : {}),
            },
          },
        },
      }
    } else if (effect.type === 'SELECT_PUBLIC_ZONE_CARD') {
      const playerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (!playerId)
        return {
          type: 'ERROR',
          message: 'No se pudo determinar el jugador de la zona pública.',
          resolution,
        }
      const knownOptions = state.cards
        .filter(
          (card) =>
            card.zone === effect.zone &&
            (card.ownerId ?? localPlayerIdOf(state)) === playerId,
        )
        .filter((card) =>
          matchesConstraints(
            effectiveTypeLine(state, card),
            card.isToken === true,
            relativeControllerForCard(state, card, resolution.context),
            effect.constraints,
          ),
        )
        .map((card) => ({ instanceId: card.instanceId, label: card.card.name }))
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}-public-${effect.zone}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourceControllerId(state, resolution.context),
          type: 'PUBLIC_ZONE_CARD_SELECTION',
          prompt: effect.prompt,
          options: [
            ...knownOptions,
            ...(effect.allowFail
              ? [
                  {
                    instanceId: 'FAIL_TO_FIND',
                    label: 'No elegir ninguna carta',
                  },
                ]
              : []),
          ],
          acceptsTextValue: true,
          textValueLabel: 'Nombre exacto de la carta declarada',
          constraints: effect.constraints,
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
            publicZoneSelection: {
              playerId,
              zone: effect.zone,
              constraints: effect.constraints,
              ...(effect.allowFail ? { allowFail: true } : {}),
              ...(effect.linkKey ? { linkKey: effect.linkKey } : {}),
              knownBecause: effect.knownBecause ?? 'DECLARED',
            },
          },
        },
      }
    } else if (effect.type === 'SEARCH_LIBRARY_CARD') {
      const searchedPlayerId = resolvePlayerReferenceId(
        state,
        effect.player,
        resolution.context,
      )
      if (!searchedPlayerId)
        return {
          type: 'ERROR',
          message: 'No se pudo determinar la biblioteca que debe buscarse.',
          resolution,
        }
      const knownOptions = state.cards
        .filter(
          (card) =>
            card.zone === 'library' &&
            (card.ownerId ?? localPlayerIdOf(state)) === searchedPlayerId,
        )
        .filter((card) =>
          matchesConstraints(
            effectiveTypeLine(state, card),
            card.isToken === true,
            relativeControllerForCard(state, card, resolution.context),
            effect.constraints,
          ),
        )
        .filter(
          (card) =>
            !effect.constraints.colors?.some(
              (color) =>
                !effectiveCardDefinition(state, card).colors.includes(color),
            ) &&
            (!effect.constraints.colorsAnyOf?.length ||
              effect.constraints.colorsAnyOf.some((color) =>
                effectiveCardDefinition(state, card).colors.includes(color),
              )) &&
            !effect.constraints.excludeColors?.some((color) =>
              effectiveCardDefinition(state, card).colors.includes(color),
            ),
        )
        .map((card) => ({ instanceId: card.instanceId, label: card.card.name }))
      const searchOptions = effect.allowFail
        ? [
            ...knownOptions,
            { instanceId: 'FAIL_TO_FIND', label: 'No encontrar ninguna carta' },
          ]
        : knownOptions
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourceControllerId(state, resolution.context),
          type: 'HIDDEN_ZONE_CARD_SELECTION',
          prompt: effect.prompt,
          options: searchOptions,
          acceptsTextValue: true,
          textValueLabel:
            searchedPlayerId === localPlayerIdOf(state)
              ? effect.reveal
                ? 'Nombre de la carta revelada'
                : 'Nombre de la carta elegida'
              : 'Nombre exacto de la carta encontrada',
          constraints: effect.constraints,
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
            librarySearch: {
              player: effect.player,
              playerId: searchedPlayerId,
              constraints: effect.constraints,
              reveal: effect.reveal,
              shuffle: effect.shuffle,
              ...(effect.allowFail ? { allowFail: true } : {}),
              destination: effect.destination,
              ...(effect.controller ? { controller: effect.controller } : {}),
            },
          },
        },
      }
    } else if (effect.type === 'CAST_LINKED_CARD_WITHOUT_PAYING_MANA_COST') {
      const linked = (state.linkedObjectGroups ?? []).find(
        (group) =>
          group.sourceInstanceId === resolution.sourceInstanceId &&
          group.key === effect.key,
      )
      const fromZone = effect.fromZone ?? 'exile'
      const linkedCard = [...(linked?.linkedInstanceIds ?? [])]
        .reverse()
        .map((instanceId) =>
          state.cards.find(
            (card) => card.instanceId === instanceId && card.zone === fromZone,
          ),
        )
        .find(Boolean)
      if (!linkedCard) {
        currentEffectIndex += 1
        continue
      }
      if (currentEffectIndex !== resolution.effects.length - 1)
        return {
          type: 'ERROR',
          message:
            'CAST_LINKED_CARD_WITHOUT_PAYING_MANA_COST must be the final effect in its resolution.',
          resolution,
        }
      actions.push({
        type: 'CLEAR_LINKED_CARDS',
        sourceInstanceId: resolution.sourceInstanceId,
        key: effect.key,
      })
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}-free-cast`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourceControllerId(state, resolution.context),
          type: 'LINKED_FREE_CAST_SELECTION',
          prompt: `¿Quieres lanzar ${linkedCard.card.name} sin pagar su coste de maná?`,
          options: [
            { instanceId: 'CAST', label: `Lanzar ${linkedCard.card.name}` },
            { instanceId: 'DECLINE', label: 'No lanzar' },
          ],
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: [],
            resumeEffectIndex: currentEffectIndex + 1,
            linkedFreeCast: {
              cardInstanceId: linkedCard.instanceId,
              fromZone,
              actorPlayerId: sourceControllerId(state, resolution.context),
              ...(effect.exileIfWouldEnterGraveyard
                ? { exileIfWouldEnterGraveyard: true }
                : {}),
              finishResolution: true,
            },
          },
        },
      }
    } else if (effect.type === 'OPTIONAL_EFFECT') {
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourceControllerId(state, resolution.context),
          type: 'OPTIONAL_EFFECT',
          prompt: effect.prompt,
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: effect.effects,
            resumeEffectIndex: currentEffectIndex + 1,
          },
        },
      }
    } else if (
      effect.type === 'TARGET_SELECTION' ||
      effect.type === 'CARD_SELECTION'
    ) {
      const requiredCount = Math.max(0, effect.count ?? 1)
      const declaredTargetCount =
        effect.type === 'TARGET_SELECTION' && effect.allowFewer
          ? resolution.context.variables[
              declaredTargetCountVariableKey(resolution.sourceAbilityId)
            ]
          : undefined
      const declaredTargetTotal =
        resolution.context.declaredTargets?.length ?? 0
      const consumableDeclaredCount =
        effect.type === 'TARGET_SELECTION' && effect.allowFewer
          ? typeof declaredTargetCount === 'number' &&
            Number.isSafeInteger(declaredTargetCount) &&
            declaredTargetCount >= 0 &&
            declaredTargetCount <= requiredCount &&
            declaredTargetTotal >= declaredTargetCount
            ? declaredTargetCount
            : requiredCount === 0 || declaredTargetTotal >= requiredCount
              ? requiredCount
              : undefined
          : declaredTargetTotal >= requiredCount
            ? requiredCount
            : undefined
      if (
        effect.type === 'TARGET_SELECTION' &&
        !resolution.context.declaredTargetsConsumed &&
        consumableDeclaredCount !== undefined
      ) {
        const declared = (resolution.context.declaredTargets ?? []).slice(
          0,
          consumableDeclaredCount,
        )
        const playerTargets = declared.filter(
          (target) => target.constraints.playerRelation !== undefined,
        )
        const stackTargets = declared.filter(
          (target) =>
            target.constraints.playerRelation === undefined &&
            constraintsCanTargetStack(target.constraints),
        )
        const cardTargets = declared.filter(
          (target) =>
            target.constraints.playerRelation === undefined &&
            !constraintsCanTargetStack(target.constraints),
        )
        const resumed = {
          ...resolution,
          effects: [
            ...effect.effects,
            ...resolution.effects.slice(currentEffectIndex + 1),
          ],
          currentEffectIndex: 0,
          context: {
            ...resolution.context,
            declaredTargetsConsumed: true,
            selectedTargets: [
              ...resolution.context.selectedTargets,
              ...cardTargets.map((target) => target.targetId),
            ],
            selectedTargetConstraints: [
              ...(resolution.context.selectedTargetConstraints ?? []),
              ...cardTargets.map((target) => target.constraints),
            ],
            selectedStackObjects: [
              ...resolution.context.selectedStackObjects,
              ...stackTargets.map((target) => target.targetId),
            ],
            selectedPlayers: [
              ...(resolution.context.selectedPlayers ?? []),
              ...playerTargets.map((target) => target.targetId),
            ],
          },
        }
        return continueResolution(resumed)
      }
      if (
        effect.type === 'TARGET_SELECTION' &&
        constraintsCanTargetStack(effect.constraints) &&
        resolution.context.selectedStackObjects.length
      ) {
        const resumed = {
          ...resolution,
          effects: [
            ...effect.effects,
            ...resolution.effects.slice(currentEffectIndex + 1),
          ],
          currentEffectIndex: 0,
        }
        return continueResolution(resumed)
      }
      const candidates = effect.constraints.playerRelation
        ? state.players
            .filter((player) =>
              canTargetPlayer(
                state,
                player.id,
                {
                  sourceInstanceId: resolution.context.sourceInstanceId,
                  controllerId: sourceControllerId(state, resolution.context),
                  kind:
                    resolution.context.triggeringEvent.type === 'SPELL_CAST'
                      ? 'SPELL'
                      : resolution.context.triggeringEvent.type ===
                          'ABILITY_ACTIVATED'
                        ? 'ACTIVATED_ABILITY'
                        : 'TRIGGERED_ABILITY',
                },
                effect.constraints.playerRelation,
              ),
            )
            .map((player) => ({
              instanceId: player.id,
              label: player.name ?? player.id,
            }))
        : state.cards
            .filter((card) =>
              effect.constraints.zones
                ? effect.constraints.zones.includes(card.zone)
                : true,
            )
            .filter((card) =>
              matchesConstraints(
                effectiveTypeLine(state, card),
                card.isToken === true,
                relativeControllerForCard(state, card, resolution.context),
                effect.constraints,
              ),
            )
            .filter(
              (card) =>
                !effect.constraints.colors?.some(
                  (color) =>
                    !effectiveCardDefinition(state, card).colors.includes(
                      color,
                    ),
                ) &&
                (!effect.constraints.colorsAnyOf?.length ||
                  effect.constraints.colorsAnyOf.some((color) =>
                    effectiveCardDefinition(state, card).colors.includes(color),
                  )) &&
                !effect.constraints.excludeColors?.some((color) =>
                  effectiveCardDefinition(state, card).colors.includes(color),
                ),
            )
            .filter(
              (card) =>
                effect.constraints.manaValueMax === undefined ||
                effectiveCardDefinition(state, card).cmc <=
                  evaluateValue(
                    state,
                    effect.constraints.manaValueMax,
                    resolution.context,
                  ),
            )
            .filter(
              (card) =>
                !effect.constraints.excludeSource ||
                card.instanceId !== resolution.context.sourceInstanceId,
            )
            .filter(
              (card) =>
                effect.constraints.isCommander === undefined ||
                (effect.constraints.isCommander
                  ? isCommanderInstance(state, card.instanceId)
                  : !isCommanderInstance(state, card.instanceId)),
            )
            .filter(
              (card) =>
                effect.constraints.stackKind === undefined ||
                (card.zone === 'stack' && card.stackObjectId !== undefined),
            )
            .filter(
              (card) =>
                effect.constraints.controllerRelation !==
                  'NOT_SOURCE_CONTROLLER' ||
                controllerId(card) !==
                  sourceControllerId(state, resolution.context),
            )
            .filter((card) => {
              if (!effect.constraints.controllerPlayer) return true
              const expected = resolvePlayerReferenceId(
                state,
                effect.constraints.controllerPlayer,
                resolution.context,
              )
              return Boolean(expected && controllerId(card) === expected)
            })
            .filter((card) =>
              canTarget(
                state,
                card,
                {
                  sourceInstanceId: resolution.context.sourceInstanceId,
                  controllerId: sourceControllerId(state, resolution.context),
                  kind: 'SPELL',
                },
                effect.constraints,
              ),
            )
            .map((card) => ({
              instanceId:
                card.zone === 'stack' && card.stackObjectId
                  ? card.stackObjectId
                  : card.instanceId,
              label: card.card.name,
            }))
      if (requiredCount === 0) {
        const resumed = {
          ...resolution,
          effects: [
            ...effect.effects,
            ...resolution.effects.slice(currentEffectIndex + 1),
          ],
          currentEffectIndex: 0,
        }
        return continueResolution(resumed)
      }
      if (candidates.length < requiredCount)
        return {
          type: 'ERROR',
          message: `Need ${requiredCount} legal target(s), but only ${candidates.length} are known.`,
          resolution,
        }
      return {
        type: 'DECISION',
        actions,
        resolution: {
          ...resolution,
          currentEffectIndex: currentEffectIndex + 1,
        },
        decision: {
          id: `decision-${resolution.id}-${currentEffectIndex}`,
          sourceAbilityId: resolution.sourceAbilityId,
          sourceInstanceId: resolution.sourceInstanceId,
          decisionPlayerId: sourceControllerId(state, resolution.context),
          type: effect.type,
          prompt: effect.prompt,
          options: candidates,
          constraints: effect.constraints,
          continuation: {
            resolutionId: resolution.id,
            effectsToExecute: effect.effects,
            resumeEffectIndex: currentEffectIndex + 1,
            ...(requiredCount > 1
              ? {
                  selectionBatch: {
                    kind:
                      effect.type === 'TARGET_SELECTION'
                        ? ('TARGET' as const)
                        : ('CARD' as const),
                    prompt: effect.prompt,
                    constraints: effect.constraints,
                    requiredCount,
                    selectedIds: [],
                    effects: effect.effects,
                  },
                }
              : {}),
          },
        },
      }
    } else {
      return {
        type: 'ERROR',
        message: 'Unsupported resolved effect.',
        resolution,
      }
    }
    currentEffectIndex += 1
  }
  const advanced = { ...resolution, currentEffectIndex }
  return actions.length
    ? { type: 'ACTIONS', actions, resolution: advanced }
    : { type: 'COMPLETE', resolution: advanced }
}
