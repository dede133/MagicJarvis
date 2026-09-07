import type { GameAction } from '../../actions/gameActions'
import { normalizeCommandText } from '../parser/normalizeText'
import { resolveCardQuery } from './cardResolver'
import { auraCastTargetConstraints } from '../../rules/attachments/attachmentRules'
import {
  manaColorAliases,
  type ActivatedAbilityHint,
  type CommandError,
  type ParsedCommand,
  type ResolvedCommand,
} from '../types/commandTypes'
import type { GameState } from '../../types/game'
import type { ManaColor } from '../../types/card'
import { getResolvedDeckCommanders } from '../../types/deck'
import { deckDefinitionForPlayer } from '../../game/deckLookup'
import {
  combinedCommanderColorIdentity,
  controlledCommanderIds,
  isCommanderInstance,
} from '../../rules/commander/commanderRules'
import {
  activePlayerIdOf,
  localPlayerIdOf,
  opponentPlayerIds,
  playerManaPool,
  playerStateFor,
} from '../../rules/players/playerState'
import { getVisualCardLabel } from '../../utils/cardLabels'
import { getAbilitiesForCard } from '../../abilities/definitions/abilityRegistry'
import type {
  ActivatedAbilityDefinition,
  PendingDecision,
} from '../../abilities/types/abilityTypes'
import { resolveActivatedAbility } from '../../abilities/engine/activationEngine'
import { activatedAbilityMatchesHint } from './activatedAbilityHints'
import { isLandCard, basicLandManaColor } from '../../rules/legality/basicLands'
import { validateDeclaredCardAction } from '../../rules/legality/declarations'
import {
  calculateConfiguredSpellManaCost,
  calculateSpellManaCost,
  planManaPayment,
  type SpellManaCost,
} from '../../rules/costs/manaCost'
import {
  findAvailableManaAbilities,
  planSmartManaPayment,
} from '../../rules/manaPlanner/manaPlanner'
import { planActivationManaPreparation } from '../../rules/activation/activationPlanning'
import { requiresPlayerInteraction } from '../../rules/turn/autoAdvance'
import {
  validateCastTiming,
  validateLandTiming,
} from '../../rules/legality/timing'
import { nextStep } from '../../types/turn'
import {
  canAttack,
  canBlock,
  planCombatDamage,
  validateAttackDeclaration,
  validateAttackRequirements,
  validateBlockDeclaration,
} from '../../rules/combat/combatRules'
import { getCastOptionsForCard } from '../../casting/generated/castingOptionLoader'
import type {
  CastGenericContributionDefinition,
  CastNonManaCostDefinition,
  CastOptionDefinition,
} from '../../casting/types/castingTypes'
import {
  attackTaxForDeclaration,
  blockTaxForDeclaration,
  castRestrictionViolation,
  canCastFromLibraryTop,
  effectiveAbilitiesForCard,
  effectiveTypeLine,
  hasEffectiveKeyword,
} from '../../abilities/engine/staticEffects'
import {
  declarationModeRequirement,
  declarationTargetRequirement,
  declaredTargetCountVariableKey,
  declaredModeVariableKey,
  declaredTargetCard,
  legalDeclarationTargetOptions,
} from '../../rules/targeting/declarationTargets'
import { targetingCosts } from '../../rules/targeting/targetingRules'
import { effectiveCardDefinition } from '../../rules/copy/copyCharacteristics'

const turnPassCancelableDecisionTypes = new Set<PendingDecision['type']>([
  'ABILITY_SELECTION',
  'MANA_PAYMENT_SELECTION',
  'MANA_SOURCE_SELECTION',
  'ATTACK_TARGET_SELECTION',
  'CAST_OPTION_SELECTION',
  'CAST_MODE_SELECTION',
  'CAST_GIFT_SELECTION',
  'CAST_GIFT_RECIPIENT_SELECTION',
  'CAST_TARGET_SELECTION',
  'EXTERNAL_SPELL_TARGET_SELECTION',
  'CAST_COST_CARD_SELECTION',
  'CAST_GENERIC_CONTRIBUTION_COUNT',
  'CAST_GENERIC_CONTRIBUTION_SELECTION',
  'ACTIVATION_MODE_SELECTION',
  'ACTIVATION_TARGET_SELECTION',
  'ACTIVATION_VARIABLE_SELECTION',
  'ACTIVATION_COST_PERMANENT_SELECTION',
  'ACTIVATION_WATERBEND_COUNT',
  'ACTIVATION_WATERBEND_SELECTION',
])

const canCancelDecisionForTurnPass = (decision: PendingDecision): boolean =>
  turnPassCancelableDecisionTypes.has(decision.type)

const manaAbilityColors = (
  state: GameState,
  sourceInstanceId: string,
  ability: ActivatedAbilityDefinition,
): Set<ManaColor> => {
  const colors = new Set<ManaColor>()
  for (const effect of ability.effects) {
    if (effect.type === 'ADD_MANA' || effect.type === 'ADD_RESTRICTED_MANA') {
      colors.add(effect.color)
      continue
    }
    if (effect.type === 'ADD_MANA_CHOICE') {
      const allowed = Array.isArray(effect.allowedColors)
        ? effect.allowedColors
        : combinedCommanderColorIdentity(
            state,
            state.cards.find((card) => card.instanceId === sourceInstanceId)
              ?.controllerId ?? activePlayerIdOf(state),
          ).filter((color) => color !== 'C')
      allowed.forEach((color) => colors.add(color))
      continue
    }
    if (effect.type === 'ADD_MANA_FROM_LINKED_COLORS') {
      const linked = (state.linkedObjectGroups ?? []).find(
        (group) =>
          group.sourceInstanceId === sourceInstanceId &&
          group.key === effect.key,
      )
      for (const instanceId of linked?.linkedInstanceIds ?? []) {
        const card = state.cards.find(
          (candidate) =>
            candidate.instanceId === instanceId && candidate.zone === 'exile',
        )
        if (!card) continue
        effectiveCardDefinition(state, card).colors.forEach((color) =>
          colors.add(color),
        )
      }
    }
  }
  return colors
}

const failure = (
  code: CommandError['code'],
  message: string,
): ResolvedCommand => ({ status: 'error', error: { code, message } })

const entryForPlayer = (state: GameState, playerId: string, name: string) => {
  const deck = deckDefinitionForPlayer(state, playerId)
  return (
    deck &&
    [...getResolvedDeckCommanders(deck), ...deck.mainboard].find(
      (entry) =>
        normalizeCommandText(entry.name) === normalizeCommandText(name),
    )
  )
}

const activeEntry = (state: GameState, name: string) =>
  entryForPlayer(state, activePlayerIdOf(state), name)

const instanceMatchesDeckName = (
  state: GameState,
  card: GameState['cards'][number],
  name: string,
  playerId = activePlayerIdOf(state),
): boolean => {
  const entry = entryForPlayer(state, playerId, name)
  return entry
    ? card.card.scryfallId === entry.card.scryfallId
    : normalizeCommandText(effectiveCardDefinition(state, card).name) ===
        normalizeCommandText(name)
}

const resolveName = (
  state: GameState,
  query: string,
): string | ResolvedCommand => {
  const playerId = activePlayerIdOf(state)
  const deck = deckDefinitionForPlayer(state, playerId)
  if (!deck) return failure('CARD_NOT_FOUND', 'No hay un mazo activo.')
  const match = resolveCardQuery(deck, query)
  if (match.status === 'resolved') return match.name
  if (match.status === 'ambiguous')
    return failure(
      'AMBIGUOUS_CARD',
      `Objetivo ambiguo: ${match.names.join(', ')}.`,
    )
  return failure('CARD_NOT_FOUND', `No encontré “${query}” en ${deck.name}.`)
}

const resolveActivatedName = (
  state: GameState,
  query: string,
  hint?: ActivatedAbilityHint,
): string | ResolvedCommand => {
  const deck = deckDefinitionForPlayer(state, activePlayerIdOf(state))
  if (!deck) return failure('CARD_NOT_FOUND', 'No hay un mazo activo.')
  const match = resolveCardQuery(deck, query)
  if (match.status === 'resolved') return match.name
  if (match.status === 'ambiguous' && hint) {
    const mechanicMatches = match.names.filter((name) =>
      state.cards.some((card) => {
        if (!instanceMatchesDeckName(state, card, name)) return false
        return effectiveAbilitiesForCard(state, card).some(
          (ability) =>
            ability.kind === 'ACTIVATED' &&
            (ability.activeZones?.length
              ? ability.activeZones.includes(card.zone)
              : card.zone === 'battlefield') &&
            activatedAbilityMatchesHint(ability, hint),
        )
      }),
    )
    if (mechanicMatches.length === 1) return mechanicMatches[0]
  }
  if (match.status === 'ambiguous')
    return failure(
      'AMBIGUOUS_CARD',
      `Objetivo ambiguo: ${match.names.join(', ')}.`,
    )
  return failure('CARD_NOT_FOUND', `No encontré “${query}” en el mazo activo.`)
}

const activeActivatedAbilitiesForSource = (
  state: GameState,
  source: GameState['cards'][number],
): ActivatedAbilityDefinition[] =>
  effectiveAbilitiesForCard(state, source).filter(
    (ability): ability is ActivatedAbilityDefinition =>
      ability.kind === 'ACTIVATED' &&
      (ability.activeZones?.length
        ? ability.activeZones.includes(source.zone)
        : source.zone === 'battlefield'),
  )

const activationCommandFailure = (
  state: GameState,
  source: GameState['cards'][number],
  ability: ActivatedAbilityDefinition,
): ResolvedCommand | undefined => {
  const direct = resolveActivatedAbility(state, source.instanceId, ability)
  if (direct.ok) return undefined
  if (direct.code === 'NOT_ENOUGH_MANA') {
    const mana = planActivationManaPreparation({ state, source, ability })
    if (mana.kind === 'AUTO_PLAN' || mana.kind === 'ALREADY_PAYABLE')
      return undefined
    return failure(
      'NOT_ENOUGH_MANA',
      `No hay una forma segura de pagar la habilidad de ${source.card.name}.`,
    )
  }
  if (direct.code === 'SOURCE_TAPPED')
    return failure('ALREADY_TAPPED', `${source.card.name} ya está girada.`)
  if (direct.code === 'SUMMONING_SICKNESS')
    return failure(
      'SUMMONING_SICKNESS',
      `${source.card.name} no puede pagar {T} este turno por mareo de invocación.`,
    )
  if (direct.code === 'INVALID_TIMING')
    return failure(
      'INVALID_TIMING',
      `Ahora no puedes activar esa habilidad de ${source.card.name}.`,
    )
  if (direct.code === 'ACTIVATION_LIMIT_REACHED')
    return failure(
      'INVALID_TIMING',
      `${source.card.name} ya usó esa habilidad el máximo de veces permitido.`,
    )
  if (direct.code === 'NOT_ENOUGH_LOYALTY')
    return failure(
      'INVALID_TIMING',
      `${source.card.name} no tiene suficiente lealtad para esa habilidad.`,
    )
  // COST_SELECTION_REQUIRED and UNSUPPORTED_COST may intentionally open a
  // declaration/choice flow in the store, so the command layer must not guess.
  return undefined
}

const isResolvedError = (
  value: string | ResolvedCommand,
): value is ResolvedCommand => typeof value !== 'string'

const resolveKnownPublicName = (
  state: GameState,
  query: string,
  zones: readonly import('../../types/card').Zone[],
): string | ResolvedCommand => {
  const deckResolved = resolveName(state, query)
  if (!isResolvedError(deckResolved)) return deckResolved
  if (
    deckResolved.status === 'error' &&
    deckResolved.error.code === 'AMBIGUOUS_CARD'
  )
    return deckResolved

  const normalized = normalizeCommandText(query)
  const names = [
    ...new Set(
      state.cards
        .filter((card) => zones.includes(card.zone))
        .map((card) => effectiveCardDefinition(state, card).name)
        .filter((name) => normalizeCommandText(name) === normalized),
    ),
  ]
  if (names.length === 1) return names[0]
  if (names.length > 1)
    return failure(
      'AMBIGUOUS_CARD',
      `Hay varias cartas públicas que coinciden con “${query}”.`,
    )
  return deckResolved
}

const targetsFor = (
  state: GameState,
  name: string,
  indexes?: number[],
  count?: number,
  tapped?: boolean,
  actorPlayerId = localPlayerIdOf(state),
  instanceId?: string,
): CardInstanceResolution | ResolvedCommand => {
  const localPlayerId = localPlayerIdOf(state)
  const cards = state.cards.filter(
    (card) =>
      card.zone === 'battlefield' &&
      (!instanceId || card.instanceId === instanceId) &&
      (card.controllerId ?? localPlayerId) === actorPlayerId &&
      instanceMatchesDeckName(state, card, name, actorPlayerId),
  )
  if (!cards.length)
    return failure('CARD_NOT_FOUND', `${name} no está en el campo de batalla.`)
  if (indexes?.length) {
    const targets = indexes.map((index) => cards[index - 1]).filter(Boolean)
    if (targets.length !== indexes.length)
      return failure(
        'NOT_ENOUGH_MATCHING_CARDS',
        'No existe uno de esos índices visuales.',
      )
    const wrongState = targets.some((card) => card.tapped !== tapped)
    if (wrongState)
      return failure(
        tapped ? 'ALREADY_UNTAPPED' : 'ALREADY_TAPPED',
        tapped ? 'La carta ya está enderezada.' : 'La carta ya está girada.',
      )
    return { cards: targets }
  }
  if (count) {
    const targets = cards
      .filter((card) => card.tapped === tapped)
      .slice(0, count)
    if (targets.length < count)
      return failure(
        'NOT_ENOUGH_MATCHING_CARDS',
        'No hay suficientes cartas que coincidan.',
      )
    return { cards: targets }
  }
  if (cards.length > 1)
    return failure(
      'AMBIGUOUS_CARD',
      `Hay varias copias de ${name}; indica un índice.`,
    )
  if (cards[0].tapped !== tapped)
    return failure(
      tapped ? 'ALREADY_UNTAPPED' : 'ALREADY_TAPPED',
      tapped ? 'La carta ya está enderezada.' : 'La carta ya está girada.',
    )
  return { cards }
}

type CardInstanceResolution = { cards: GameState['cards'] }
const isTargetError = (
  value: CardInstanceResolution | ResolvedCommand,
): value is ResolvedCommand => 'status' in value

const moveZoneLabel: Record<import('../../types/card').Zone, string> = {
  library: 'biblioteca',
  hand: 'mano',
  battlefield: 'campo de batalla',
  graveyard: 'cementerio',
  exile: 'exilio',
  command: 'zona de mando',
  stack: 'stack',
}

const resolveKnownCardForMove = (
  state: GameState,
  query: string,
  index?: number,
  instanceId?: string,
): GameState['cards'][number] | ResolvedCommand => {
  if (instanceId) {
    const exact = state.cards.find((card) => card.instanceId === instanceId)
    return (
      exact ??
      failure('CARD_NOT_FOUND', `La carta “${query}” ya no está disponible.`)
    )
  }
  const normalized = normalizeCommandText(query)
  const activeDeck = deckDefinitionForPlayer(state, activePlayerIdOf(state))
  const deckMatch = activeDeck ? resolveCardQuery(activeDeck, query) : undefined

  let candidates =
    deckMatch?.status === 'resolved'
      ? state.cards.filter((card) =>
          instanceMatchesDeckName(state, card, deckMatch.name),
        )
      : state.cards.filter(
          (card) =>
            normalizeCommandText(effectiveCardDefinition(state, card).name) ===
            normalized,
        )

  if (!candidates.length && deckMatch?.status !== 'resolved') {
    candidates = state.cards.filter((card) => {
      const name = normalizeCommandText(
        effectiveCardDefinition(state, card).name,
      )
      return normalized.length >= 3 && name.includes(normalized)
    })
  }

  if (!candidates.length)
    return failure(
      'CARD_NOT_FOUND',
      `No encontré “${query}” entre las cartas conocidas.`,
    )

  if (index !== undefined) {
    if (!Number.isSafeInteger(index) || index < 1 || index > candidates.length)
      return failure(
        'NOT_ENOUGH_MATCHING_CARDS',
        `No existe la copia ${index} de ${query}.`,
      )
    return candidates[index - 1]
  }

  if (candidates.length > 1)
    return failure(
      'AMBIGUOUS_CARD',
      `Hay varias cartas conocidas que coinciden con ${query}; indica un índice visual.`,
    )
  return candidates[0]
}

const materializedId = (
  state: GameState,
  scryfallId: string,
  playerId = activePlayerIdOf(state),
): string =>
  `known-${playerId}-${scryfallId}-${
    state.cards.filter(
      (card) =>
        card.card.scryfallId === scryfallId &&
        (card.ownerId ?? localPlayerIdOf(state)) === playerId,
    ).length + 1
  }`

const copyUnavailable = (name: string): ResolvedCommand =>
  failure('CARD_COPY_UNAVAILABLE', `No queda una copia disponible de ${name}.`)

const knownCombatCreature = (
  state: GameState,
  query: string,
  controller: 'YOU' | 'OPPONENT' | string,
): GameState['cards'][number] | ResolvedCommand => {
  const controllerId =
    controller === 'YOU'
      ? activePlayerIdOf(state)
      : controller === 'OPPONENT'
        ? opponentPlayerIds(state, activePlayerIdOf(state))[0]
        : controller
  const deck = deckDefinitionForPlayer(state, controllerId)
  const deckMatch = deck ? resolveCardQuery(deck, query) : undefined
  const normalized = normalizeCommandText(
    deckMatch?.status === 'resolved' ? deckMatch.name : query,
  )
  const candidates = state.cards.filter(
    (card) =>
      card.zone === 'battlefield' &&
      (card.controllerId ?? localPlayerIdOf(state)) === controllerId &&
      (() => {
        const cardName = normalizeCommandText(
          effectiveCardDefinition(state, card).name,
        )
        const printedName = normalizeCommandText(card.card.name)
        return (
          cardName === normalized ||
          printedName === normalized ||
          (normalized.length >= 3 &&
            (cardName.includes(normalized) || printedName.includes(normalized)))
        )
      })(),
  )
  if (candidates.length !== 1)
    return failure(
      candidates.length ? 'AMBIGUOUS_CARD' : 'CARD_NOT_FOUND',
      `Necesito una única criatura conocida para “${query}”.`,
    )
  return candidates[0]
}

const knownDefendingPlaneswalker = (
  state: GameState,
  query: string,
  defendingPlayerId = opponentPlayerIds(state, activePlayerIdOf(state))[0],
): GameState['cards'][number] | ResolvedCommand => {
  const deck = deckDefinitionForPlayer(state, defendingPlayerId)
  const match = deck ? resolveCardQuery(deck, query) : undefined
  const normalized = normalizeCommandText(
    match?.status === 'resolved' ? match.name : query,
  )
  const candidates = state.cards.filter(
    (card) =>
      card.zone === 'battlefield' &&
      !card.phasedOut &&
      (card.controllerId ?? localPlayerIdOf(state)) === defendingPlayerId &&
      /\bplaneswalker\b/i.test(effectiveTypeLine(state, card)) &&
      (normalizeCommandText(effectiveCardDefinition(state, card).name) ===
        normalized ||
        normalizeCommandText(card.card.name) === normalized),
  )
  if (candidates.length !== 1)
    return failure(
      candidates.length ? 'AMBIGUOUS_CARD' : 'CARD_NOT_FOUND',
      `Necesito un único planeswalker rival conocido para “${query}”.`,
    )
  return candidates[0]
}

const isCombatError = (
  value: GameState['cards'][number] | ResolvedCommand,
): value is ResolvedCommand => 'status' in value

const availableInstance = (
  state: GameState,
  scryfallId: string,
  playerId = activePlayerIdOf(state),
) =>
  state.cards.find(
    (card) =>
      card.zone === 'hand' &&
      card.card.scryfallId === scryfallId &&
      (card.ownerId ?? localPlayerIdOf(state)) === playerId,
  )

const canMaterialize = (
  state: GameState,
  entry: NonNullable<ReturnType<typeof activeEntry>>,
  playerId = activePlayerIdOf(state),
) =>
  state.cards.filter(
    (card) =>
      card.card.scryfallId === entry.card.scryfallId &&
      (card.ownerId ?? localPlayerIdOf(state)) === playerId,
  ).length < entry.quantity

const resolveLandPlay = (
  state: GameState,
  cardQuery: string,
): ResolvedCommand => {
  const name = resolveName(state, cardQuery)
  if (isResolvedError(name)) return name
  const entry = activeEntry(state, name)
  if (!entry) return failure('CARD_NOT_FOUND', `No encontré “${cardQuery}”.`)
  const actorPlayerId = activePlayerIdOf(state)
  const legality = validateDeclaredCardAction(state, entry.card, actorPlayerId)
  if (legality.status === 'ILLEGAL')
    return failure(legality.code, legality.message)
  if (requiresPlayerInteraction(state))
    return failure(
      'STACK_NOT_EMPTY',
      `Hay una interacción pendiente en ${state.turnState.step}; resuélvela antes de jugar una tierra.`,
    )
  const timing = validateLandTiming(state)
  if (!timing.legal) return failure(timing.code, timing.message)
  const knownHand = availableInstance(
    state,
    entry.card.scryfallId,
    actorPlayerId,
  )
  if (knownHand)
    return {
      status: 'resolved',
      actions: [
        {
          type: 'PLAY_LAND',
          instanceId: knownHand.instanceId,
          card: entry.card,
          fromZone: 'hand',
          actorPlayerId,
        },
      ],
      description: `Jugar tierra ${entry.name}`,
    }
  if (!canMaterialize(state, entry, actorPlayerId))
    return copyUnavailable(entry.name)
  return {
    status: 'resolved',
    actions: [
      {
        type: 'PLAY_LAND',
        instanceId: materializedId(state, entry.card.scryfallId, actorPlayerId),
        card: entry.card,
        fromZone: 'hand',
        actorPlayerId,
      },
    ],
    description: `Jugar tierra ${entry.name}`,
  }
}

const resolveStackTarget = (
  state: GameState,
  query: string,
): string | ResolvedCommand => {
  const normalized = normalizeCommandText(query)
  let candidates = state.cards.filter(
    (card) => card.zone === 'stack' && card.stackObjectId,
  )
  if (/spell de mi oponente|spell oponente/.test(normalized))
    candidates = candidates.filter((card) => card.controller === 'OPPONENT')
  else if (/^(?:el )?segundo spell$/.test(normalized))
    candidates = candidates.slice(1, 2)
  else if (!/^(?:el )?spell$/.test(normalized)) {
    const byName = candidates.filter(
      (card) => normalizeCommandText(card.card.name) === normalized,
    )
    if (byName.length) candidates = byName
  }
  if (!candidates.length)
    return failure('CARD_NOT_FOUND', `No encontré “${query}” en el stack.`)
  if (candidates.length > 1)
    return failure(
      'AMBIGUOUS_TARGET',
      `Hay varios objetivos posibles para “${query}”.`,
    )
  return candidates[0].stackObjectId as string
}

const applyCommanderTax = (
  state: GameState,
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
  cost: NonNullable<ReturnType<typeof calculateSpellManaCost>>,
) =>
  isCommanderInstance(state, castAction.instanceId) &&
  castAction.fromZone === 'command'
    ? {
        ...cost,
        generic:
          cost.generic +
          2 * (state.commanderCastsFromCommandZone[castAction.instanceId] ?? 0),
      }
    : cost

const spellEffectForCast = (
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
) =>
  getAbilitiesForCard(castAction.card).find(
    (
      ability,
    ): ability is import('../../abilities/types/abilityTypes').SpellEffectDefinition =>
      ability.kind === 'SPELL_EFFECT',
  )

const giftDeclarationDecision = (
  state: GameState,
  cardName: string,
  displayedManaCost: string | undefined,
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
  cost: NonNullable<ReturnType<typeof calculateSpellManaCost>>,
): ResolvedCommand | undefined => {
  const gift = spellEffectForCast(castAction)?.gift
  if (!gift) return undefined
  const promised = castAction.variables?.[gift.promisedVariableName]
  const controllerId =
    castAction.actorPlayerId ?? localPlayerIdOf(state) ?? 'player-1'
  const continuation = {
    cardName,
    ...(displayedManaCost ? { displayedManaCost } : {}),
    castAction,
    cost,
    promisedVariableName: gift.promisedVariableName,
    recipientVariableName: gift.recipientVariableName,
    ...(gift.prompt ? { prompt: gift.prompt } : {}),
    ...(gift.recipientPrompt ? { recipientPrompt: gift.recipientPrompt } : {}),
  }

  if (promised !== 0 && promised !== 1)
    return {
      status: 'resolved',
      actions: [
        {
          type: 'ADD_PENDING_DECISION',
          decision: {
            id: `cast-gift-${castAction.instanceId}`,
            sourceAbilityId: 'cast-gift-declaration',
            sourceInstanceId: castAction.instanceId,
            decisionPlayerId: controllerId,
            type: 'CAST_GIFT_SELECTION',
            prompt:
              gift.prompt ?? `¿Quieres prometer un Gift al lanzar ${cardName}?`,
            options: [
              { instanceId: 'NO_GIFT', label: 'No prometer Gift' },
              { instanceId: 'PROMISE_GIFT', label: 'Prometer Gift' },
            ],
            continuation: {
              effectsToExecute: [],
              resumeEffectIndex: 0,
              castGiftDeclaration: continuation,
            },
          },
        },
      ],
      description: `Elegir Gift para ${cardName}`,
    }

  if (promised === 0) return undefined
  const recipient = castAction.variables?.[gift.recipientVariableName]
  if (typeof recipient === 'string' && recipient.length > 0) return undefined
  const opponents = state.players.filter((player) => player.id !== controllerId)
  if (!opponents.length)
    return failure(
      'CARD_NOT_FOUND',
      `No hay un oponente conocido al que prometer el Gift de ${cardName}.`,
    )
  return {
    status: 'resolved',
    actions: [
      {
        type: 'ADD_PENDING_DECISION',
        decision: {
          id: `cast-gift-recipient-${castAction.instanceId}`,
          sourceAbilityId: 'cast-gift-declaration',
          sourceInstanceId: castAction.instanceId,
          decisionPlayerId: controllerId,
          type: 'CAST_GIFT_RECIPIENT_SELECTION',
          prompt:
            gift.recipientPrompt ??
            `Elige qué oponente recibirá el Gift de ${cardName}.`,
          options: opponents.map((player) => ({
            instanceId: player.id,
            label: player.name ?? player.id,
          })),
          continuation: {
            effectsToExecute: [],
            resumeEffectIndex: 0,
            castGiftDeclaration: continuation,
          },
        },
      },
    ],
    description: `Elegir destinatario del Gift de ${cardName}`,
  }
}

const spellDeclarationTargetRequirement = (
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
) => {
  const auraConstraints = auraCastTargetConstraints(castAction.card)
  if (auraConstraints)
    return {
      prompt: `Elige qué permanente encantará ${castAction.card.name}.`,
      constraints: auraConstraints,
      requiredCount: 1,
      minimumCount: 1,
      allowFewer: false,
    }
  const spellEffect = spellEffectForCast(castAction)
  return spellEffect
    ? declarationTargetRequirement(spellEffect, castAction.variables ?? {})
    : undefined
}

const castModeDeclarationDecision = (
  state: GameState,
  cardName: string,
  displayedManaCost: string | undefined,
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
  cost: NonNullable<ReturnType<typeof calculateSpellManaCost>>,
): ResolvedCommand | undefined => {
  const spellEffect = spellEffectForCast(castAction)
  if (!spellEffect) return undefined
  const requirement = declarationModeRequirement(spellEffect)
  if (!requirement) return undefined
  const key = declaredModeVariableKey(spellEffect.id)
  if (typeof castAction.variables?.[key] === 'string') return undefined
  return {
    status: 'resolved',
    actions: [
      {
        type: 'ADD_PENDING_DECISION',
        decision: {
          id: `cast-mode-${castAction.instanceId}-${spellEffect.id}`,
          sourceAbilityId: spellEffect.id,
          sourceInstanceId: castAction.instanceId,
          decisionPlayerId:
            castAction.actorPlayerId ?? state.localPlayerId ?? 'player-1',
          type: 'CAST_MODE_SELECTION',
          prompt: requirement.prompt,
          options: requirement.modes.map((mode) => ({
            instanceId: mode.id,
            label: mode.label,
          })),
          continuation: {
            effectsToExecute: [],
            resumeEffectIndex: 0,
            castModeDeclaration: {
              cardName,
              ...(displayedManaCost ? { displayedManaCost } : {}),
              castAction,
              cost,
              abilityId: spellEffect.id,
              modes: requirement.modes,
            },
          },
        },
      },
    ],
    description: `Elegir modo para ${cardName}`,
  }
}

const normalizeDeclaredCastTargets = (
  state: GameState,
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
): Extract<GameAction, { type: 'CAST_SPELL' }> => {
  const requirement = spellDeclarationTargetRequirement(castAction)
  if (
    !requirement ||
    castAction.declaredTargets?.length ||
    !castAction.targetStackObjectId
  )
    return castAction
  const legal = legalDeclarationTargetOptions(
    state,
    {
      sourceInstanceId: castAction.instanceId,
      sourceCard: castAction.card,
      controllerId:
        castAction.actorPlayerId ?? state.localPlayerId ?? 'player-1',
      kind: 'SPELL',
    },
    requirement.constraints,
  ).some((option) => option.instanceId === castAction.targetStackObjectId)
  return legal
    ? {
        ...castAction,
        declaredTargets: [
          {
            targetId: castAction.targetStackObjectId,
            constraints: requirement.constraints,
          },
        ],
      }
    : castAction
}

const additionalDeclaredCastTargetCost = (
  state: GameState,
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
): number =>
  (castAction.declaredTargets ?? []).reduce((sum, declared) => {
    const target = declaredTargetCard(state, declared)
    if (!target) return sum
    return (
      sum +
      targetingCosts(state, target, {
        sourceInstanceId: castAction.instanceId,
        controllerId:
          castAction.actorPlayerId ?? state.localPlayerId ?? 'player-1',
        kind: 'SPELL',
      }).additionalGeneric
    )
  }, 0)

const castTargetDeclarationDecision = (
  state: GameState,
  cardName: string,
  displayedManaCost: string | undefined,
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
  cost: NonNullable<ReturnType<typeof calculateSpellManaCost>>,
): ResolvedCommand | undefined => {
  const requirement = spellDeclarationTargetRequirement(castAction)
  if (!requirement || requirement.requiredCount === 0) return undefined
  const spellEffect = spellEffectForCast(castAction)
  const selectedCount = castAction.declaredTargets?.length ?? 0
  const completedCount =
    castAction.variables?.[
      spellEffect ? declaredTargetCountVariableKey(spellEffect.id) : ''
    ]
  if (
    selectedCount >= requirement.requiredCount ||
    (requirement.allowFewer &&
      typeof completedCount === 'number' &&
      completedCount === selectedCount)
  )
    return undefined
  const options = legalDeclarationTargetOptions(
    state,
    {
      sourceInstanceId: castAction.instanceId,
      sourceCard: castAction.card,
      controllerId:
        castAction.actorPlayerId ?? state.localPlayerId ?? 'player-1',
      kind: 'SPELL',
    },
    requirement.constraints,
  ).filter(
    (option) =>
      !(castAction.declaredTargets ?? []).some(
        (target) => target.targetId === option.instanceId,
      ),
  )
  const missing =
    requirement.requiredCount - (castAction.declaredTargets?.length ?? 0)
  if (!requirement.allowFewer && options.length < missing)
    return failure(
      'CARD_NOT_FOUND',
      `No hay ${requirement.requiredCount} objetivo(s) legal(es) conocidos para ${cardName}.`,
    )
  return {
    status: 'resolved',
    actions: [
      {
        type: 'ADD_PENDING_DECISION',
        decision: {
          id: `cast-target-${castAction.instanceId}-${(castAction.declaredTargets?.length ?? 0) + 1}`,
          sourceAbilityId: 'cast-target-declaration',
          sourceInstanceId: castAction.instanceId,
          decisionPlayerId:
            castAction.actorPlayerId ?? state.localPlayerId ?? 'player-1',
          type: 'CAST_TARGET_SELECTION',
          prompt: requirement.prompt,
          options: requirement.allowFewer
            ? [...options, { instanceId: 'DONE', label: 'Hecho' }]
            : options,
          constraints: requirement.constraints,
          continuation: {
            effectsToExecute: [],
            resumeEffectIndex: 0,
            castTargetDeclaration: {
              cardName,
              ...(displayedManaCost ? { displayedManaCost } : {}),
              castAction,
              cost,
              prompt: requirement.prompt,
              constraints: requirement.constraints,
              requiredCount: requirement.requiredCount,
              minimumCount: requirement.minimumCount,
              allowFewer: requirement.allowFewer,
              ...(spellEffect ? { abilityId: spellEffect.id } : {}),
              selectedTargets: [...(castAction.declaredTargets ?? [])],
            },
          },
        },
      },
    ],
    description: `Elegir objetivo para ${cardName}`,
  }
}

export const resolvePreparedCast = (
  state: GameState,
  cardName: string,
  displayedManaCost: string | undefined,
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
  cost: NonNullable<ReturnType<typeof calculateSpellManaCost>>,
): ResolvedCommand => {
  const castViolation = castRestrictionViolation(
    state,
    castAction.card,
    castAction.actorPlayerId ?? localPlayerIdOf(state),
  )
  if (castViolation)
    return failure(
      'CAST_RESTRICTED',
      `No puedes lanzar ${cardName}: ${castViolation}`,
    )
  const giftDecision = giftDeclarationDecision(
    state,
    cardName,
    displayedManaCost,
    castAction,
    cost,
  )
  if (giftDecision) return giftDecision
  const modeDecision = castModeDeclarationDecision(
    state,
    cardName,
    displayedManaCost,
    castAction,
    cost,
  )
  if (modeDecision) return modeDecision
  const declaredCastAction = normalizeDeclaredCastTargets(state, castAction)
  const targetDecision = castTargetDeclarationDecision(
    state,
    cardName,
    displayedManaCost,
    declaredCastAction,
    cost,
  )
  if (targetDecision) return targetDecision
  const targetTax = additionalDeclaredCastTargetCost(state, declaredCastAction)
  const totalCost = { ...cost, generic: cost.generic + targetTax }
  const manaSpent =
    totalCost.generic +
    Object.values(totalCost.colors).reduce(
      (sum, amount) => sum + (amount ?? 0),
      0,
    )
  const paidCastAction: Extract<GameAction, { type: 'CAST_SPELL' }> = {
    ...declaredCastAction,
    variables: {
      ...(declaredCastAction.variables ?? {}),
      MANA_SPENT_TO_CAST: manaSpent,
    },
  }
  const castPlayerId = paidCastAction.actorPlayerId ?? activePlayerIdOf(state)
  const payment = planManaPayment(
    state,
    totalCost,
    paidCastAction.card,
    castPlayerId,
  )
  if (payment.kind === 'NOT_ENOUGH_MANA') {
    const autoMana = planSmartManaPayment({
      state,
      manaCost: totalCost,
      card: paidCastAction.card,
      mode: state.autoManaMode,
      playerId: castPlayerId,
    })
    if (autoMana.kind === 'UNIQUE_SAFE_PLAN')
      return {
        status: 'resolved',
        actions: [...autoMana.plan.actions, paidCastAction],
        description: `Lanzar ${cardName} (maná automático: ${autoMana.plan.label})`,
      }
    if (
      autoMana.kind === 'MULTIPLE_SAFE_PLANS' ||
      autoMana.kind === 'REQUIRES_CONFIRMATION'
    ) {
      const confirmation = autoMana.kind === 'REQUIRES_CONFIRMATION'
      return {
        status: 'resolved',
        actions: [
          {
            type: 'ADD_PENDING_DECISION',
            decision: {
              id: `mana-source-${castAction.instanceId}`,
              sourceAbilityId: 'mana-planner',
              sourceInstanceId: declaredCastAction.instanceId,
              type: 'MANA_SOURCE_SELECTION',
              prompt: confirmation
                ? `Confirma la fuente de maná para ${cardName}; dejará maná sobrante.`
                : `Elige las fuentes de maná para ${cardName}.`,
              options: autoMana.plans.map((plan) => ({
                instanceId: plan.id,
                label: plan.label,
              })),
              continuation: {
                effectsToExecute: [],
                resumeEffectIndex: 0,
                manaSourcePayment: {
                  castAction: paidCastAction,
                  options: autoMana.plans.map((plan) => ({
                    id: plan.id,
                    actions: plan.actions,
                  })),
                },
              },
            },
          },
        ],
        description: confirmation
          ? `Confirmar maná sobrante para ${cardName}`
          : `Elegir fuentes de maná para ${cardName}`,
      }
    }
    return failure(
      'NOT_ENOUGH_MANA',
      `No tienes suficiente maná para ${cardName}. Necesitas ${displayedManaCost ?? 'un coste válido'} y no hay un plan de maná conocido seguro.`,
    )
  }
  if (payment.kind === 'AMBIGUOUS')
    return {
      status: 'resolved',
      actions: [
        {
          type: 'ADD_PENDING_DECISION',
          decision: {
            id: `mana-payment-${declaredCastAction.instanceId}`,
            sourceAbilityId: 'mana-payment',
            sourceInstanceId: declaredCastAction.instanceId,
            type: 'MANA_PAYMENT_SELECTION',
            prompt: `Elige cómo pagar ${displayedManaCost ?? 'el coste'}.`,
            options: payment.options.map((option) => ({
              instanceId: option.id,
              label: option.label,
            })),
            continuation: {
              effectsToExecute: [],
              resumeEffectIndex: 0,
              manaPayment: {
                castAction: paidCastAction,
                options: payment.options.map((option) => ({
                  id: option.id,
                  actions: option.actions,
                })),
              },
            },
          },
        },
      ],
      description: `Elegir pago para ${cardName}`,
    }
  return {
    status: 'resolved',
    actions: [...payment.actions, paidCastAction],
    description: `Lanzar ${cardName}`,
  }
}

const knownManaUpperBound = (state: GameState): number => {
  const playerId = activePlayerIdOf(state)
  const pool = Object.values(playerManaPool(state, playerId)).reduce(
    (sum, value) => sum + value,
    0,
  )
  const sources = findAvailableManaAbilities(state, playerId).reduce(
    (sum, source) =>
      sum +
      Object.values(source.production).reduce(
        (total, value) => total + value,
        0,
      ),
    0,
  )
  return pool + sources
}

const hasVariableX = (manaCost?: string): boolean =>
  /\{X\}/.test(manaCost ?? '')

const castConditionMet = (
  state: GameState,
  condition: CastOptionDefinition['condition'],
  playerId: string,
): boolean => {
  if (!condition) return true
  if (condition.type === 'CONTROLS_COMMANDER')
    return controlledCommanderIds(state, playerId).length > 0
  if (condition.type === 'NOT_YOUR_TURN')
    return activePlayerIdOf(state) !== playerId
  return false
}

type CastVariant = {
  id: string
  label: string
  actions: GameAction[]
}

const cardMatchesCastCost = (
  card: GameState['cards'][number]['card'],
  cost: Extract<CastNonManaCostDefinition, { type: 'EXILE_CARD_FROM_HAND' }>,
): boolean =>
  !cost.colors?.length ||
  cost.colors.some((color) => card.colors.includes(color))

const describeCastCardCost = (
  cost: Extract<CastNonManaCostDefinition, { type: 'EXILE_CARD_FROM_HAND' }>,
): string => {
  const color = cost.colors?.length === 1 ? `${cost.colors[0]} ` : ''
  return `Declara ${cost.count === 1 ? 'una' : cost.count} carta${cost.count === 1 ? '' : 's'} ${color}de tu mano para exiliar como coste.`
}

export const withNonManaCastCosts = (
  state: GameState,
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
  plannedActions: GameAction[],
  costs: readonly CastNonManaCostDefinition[] | undefined,
): GameAction[] | undefined => {
  if (!costs?.length) return plannedActions
  if (
    plannedActions.length === 1 &&
    plannedActions[0].type === 'ADD_PENDING_DECISION' &&
    plannedActions[0].decision.type === 'CAST_TARGET_SELECTION' &&
    plannedActions[0].decision.continuation.castTargetDeclaration
  ) {
    const decision = plannedActions[0].decision
    const targetDeclaration = decision.continuation.castTargetDeclaration!
    return [
      {
        type: 'ADD_PENDING_DECISION',
        decision: {
          ...decision,
          continuation: {
            ...decision.continuation,
            castTargetDeclaration: {
              ...targetDeclaration,
              nonManaCosts: [...costs],
            },
          },
        },
      },
    ]
  }
  const castPlayerId = castAction.actorPlayerId ?? activePlayerIdOf(state)
  const lifeToPay = costs
    .filter(
      (
        cost,
      ): cost is Extract<CastNonManaCostDefinition, { type: 'PAY_LIFE' }> =>
        cost.type === 'PAY_LIFE',
    )
    .reduce((sum, cost) => sum + cost.amount, 0)
  const castPlayerLife =
    playerStateFor(state, castPlayerId)?.life ??
    (castPlayerId === localPlayerIdOf(state) ? state.life : 0)
  if (castPlayerLife < lifeToPay) return undefined
  const exileCosts = costs.filter(
    (
      cost,
    ): cost is Extract<
      CastNonManaCostDefinition,
      { type: 'EXILE_CARD_FROM_HAND' }
    > => cost.type === 'EXILE_CARD_FROM_HAND',
  )
  if (exileCosts.length > 1) return undefined
  const costActions: GameAction[] = lifeToPay
    ? [{ type: 'LOSE_PLAYER_LIFE', playerId: castPlayerId, amount: lifeToPay }]
    : []
  const exileCost = exileCosts[0]
  if (!exileCost) return [...costActions, ...plannedActions]
  const knownOptions = state.cards
    .filter(
      (card) =>
        card.zone === 'hand' &&
        (card.ownerId ?? localPlayerIdOf(state)) === castPlayerId &&
        (!exileCost.excludeSource ||
          card.instanceId !== castAction.instanceId) &&
        cardMatchesCastCost(card.card, exileCost),
    )
    .map((card) => ({ instanceId: card.instanceId, label: card.card.name }))
  return [
    {
      type: 'ADD_PENDING_DECISION',
      decision: {
        id: `cast-card-cost-${castAction.instanceId}`,
        sourceAbilityId: 'cast-card-cost',
        sourceInstanceId: castAction.instanceId,
        type: 'CAST_COST_CARD_SELECTION',
        prompt: `${describeCastCardCost(exileCost)} (1/${exileCost.count})`,
        options: knownOptions,
        acceptsTextValue: true,
        textValueLabel: 'Nombre de la carta declarada',
        continuation: {
          effectsToExecute: [],
          resumeEffectIndex: 0,
          castCardCost: {
            pendingActions: plannedActions,
            costActions,
            requiredCount: exileCost.count,
            selected: [],
            ...(exileCost.colors?.length ? { colors: exileCost.colors } : {}),
            ...(exileCost.excludeSource
              ? { excludeSourceInstanceId: castAction.instanceId }
              : {}),
            sourceScryfallId: castAction.card.scryfallId,
          },
        },
      },
    },
  ]
}

const contributionCandidates = (
  state: GameState,
  contribution: CastGenericContributionDefinition,
  playerId: string,
): GameState['cards'] => {
  if (contribution.type === 'EXILE_CARDS_FROM_GRAVEYARD')
    return state.cards.filter(
      (card) =>
        card.zone === 'graveyard' &&
        (card.ownerId ?? localPlayerIdOf(state)) === playerId,
    )
  if (contribution.type === 'EXILE_DECLARED_CARDS_FROM_HAND') return []
  return state.cards.filter((card) => {
    if (
      card.zone !== 'battlefield' ||
      card.tapped ||
      (card.controllerId ?? localPlayerIdOf(state)) !== playerId
    )
      return false
    const typeLine = effectiveTypeLine(state, card).toLocaleLowerCase()
    return contribution.cardTypesAnyOf.some((type) =>
      typeLine.includes(type.toLocaleLowerCase()),
    )
  })
}

const hiddenHandContributionCapacity = (
  state: GameState,
  contribution: Extract<
    CastGenericContributionDefinition,
    { type: 'EXILE_DECLARED_CARDS_FROM_HAND' }
  >,
  playerId: string,
  sourceScryfallId?: string,
): number => {
  const deck = deckDefinitionForPlayer(state, playerId)
  if (!deck) return 0
  return [deck.commander, ...deck.mainboard]
    .filter(
      (entry) =>
        !contribution.colors?.length ||
        contribution.colors.some((color) => entry.card.colors.includes(color)),
    )
    .reduce(
      (sum, entry) =>
        sum +
        Math.max(
          0,
          entry.quantity -
            (contribution.excludeSource &&
            entry.card.scryfallId === sourceScryfallId
              ? 1
              : 0),
        ),
      0,
    )
}

const contributionCapacity = (
  state: GameState,
  contribution: CastGenericContributionDefinition,
  playerId: string,
  sourceScryfallId?: string,
): number =>
  contribution.type === 'EXILE_DECLARED_CARDS_FROM_HAND'
    ? hiddenHandContributionCapacity(
        state,
        contribution,
        playerId,
        sourceScryfallId,
      )
    : contributionCandidates(state, contribution, playerId).length

const configuredContributionMax = (
  contribution: CastGenericContributionDefinition,
  variables: Record<string, number>,
  cost: SpellManaCost,
  candidateCount: number,
): number => {
  const configured = contribution.max
  const maximum =
    typeof configured === 'number'
      ? configured
      : configured && typeof configured === 'object'
        ? (variables[configured.variable] ?? 0)
        : cost.generic
  return Math.max(
    0,
    contribution.type === 'EXILE_DECLARED_CARDS_FROM_HAND'
      ? Math.min(maximum, candidateCount)
      : Math.min(maximum, cost.generic, candidateCount),
  )
}

const contributionPrompt = (
  contribution: CastGenericContributionDefinition,
  cardName: string,
): string =>
  contribution.type === 'TAP_PERMANENTS'
    ? `Elige cuántos artefactos/criaturas quieres girar para pagar el waterbend de ${cardName}.`
    : contribution.type === 'EXILE_DECLARED_CARDS_FROM_HAND'
      ? `Elige cuántas cartas de tu mano quieres declarar y exiliar para reducir el coste de ${cardName}.`
      : `Elige cuántas cartas quieres exiliar de tu cementerio para pagar delve de ${cardName}.`

const configuredCastVariants = (
  state: GameState,
  entry: NonNullable<ReturnType<typeof activeEntry>>,
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
  option: CastOptionDefinition,
): CastVariant[] => {
  const castPlayerId = castAction.actorPlayerId ?? activePlayerIdOf(state)
  if (!castConditionMet(state, option.condition, castPlayerId)) return []
  const contributionCandidatesCount = option.genericContribution
    ? contributionCapacity(
        state,
        option.genericContribution,
        castPlayerId,
        entry.card.scryfallId,
      )
    : 0
  const contributionManaCapacity =
    option.genericContribution?.type === 'EXILE_DECLARED_CARDS_FROM_HAND'
      ? contributionCandidatesCount *
        option.genericContribution.genericReductionPerCard
      : contributionCandidatesCount
  const variable = option.variable
  const min = variable?.min ?? 0
  const max = Math.min(
    variable?.max ?? knownManaUpperBound(state) + contributionManaCapacity,
    knownManaUpperBound(state) + contributionManaCapacity,
  )
  const values = variable
    ? Array.from(
        { length: Math.max(0, max - min + 1) },
        (_, index) => min + index,
      )
    : [undefined]
  return values.flatMap((value) => {
    const numericVariables =
      variable && value !== undefined ? { [variable.name]: value } : {}
    const variables = {
      ...(castAction.variables ?? {}),
      ...(option.setVariables ?? {}),
      ...numericVariables,
    }
    const configuredCost =
      option.kind === 'PAYMENT_MODIFIER'
        ? calculateSpellManaCost(
            state,
            entry.card,
            numericVariables,
            castAction.actorPlayerId ?? activePlayerIdOf(state),
          )
        : calculateConfiguredSpellManaCost(
            state,
            entry.card,
            {
              ...(option.kind === 'ALTERNATIVE'
                ? { alternativeManaCost: option.manaCost }
                : { additionalManaCost: option.manaCost }),
              variables: numericVariables,
            },
            castAction.actorPlayerId ?? activePlayerIdOf(state),
          )
    if (!configuredCost) return []
    const actionWithOption: Extract<GameAction, { type: 'CAST_SPELL' }> = {
      ...castAction,
      variables,
    }
    const taxedCost = applyCommanderTax(state, actionWithOption, configuredCost)
    if (option.genericContribution) {
      const candidates = contributionCandidates(
        state,
        option.genericContribution,
        castPlayerId,
      )
      const capacity = contributionCapacity(
        state,
        option.genericContribution,
        castPlayerId,
        entry.card.scryfallId,
      )
      const maxContribution = configuredContributionMax(
        option.genericContribution,
        numericVariables,
        taxedCost,
        capacity,
      )
      const countOptions = Array.from(
        { length: maxContribution + 1 },
        (_, count) => count,
      )
      const targetDeclaration = castTargetDeclarationDecision(
        state,
        entry.name,
        option.label,
        actionWithOption,
        taxedCost,
      )
      if (targetDeclaration?.status === 'error') return []
      if (
        targetDeclaration?.status === 'resolved' &&
        targetDeclaration.actions.length === 1 &&
        targetDeclaration.actions[0].type === 'ADD_PENDING_DECISION' &&
        targetDeclaration.actions[0].decision.type === 'CAST_TARGET_SELECTION'
      ) {
        const targetDecision = targetDeclaration.actions[0].decision
        return [
          {
            id: variable ? `${option.id}:${variable.name}=${value}` : option.id,
            label: variable
              ? `${option.label} (${variable.name} = ${value})`
              : option.label,
            actions: [
              {
                type: 'ADD_PENDING_DECISION',
                decision: {
                  ...targetDecision,
                  continuation: {
                    ...targetDecision.continuation,
                    castContribution: {
                      cardName: entry.name,
                      displayedManaCost: option.label,
                      castAction: actionWithOption,
                      cost: taxedCost,
                      contributionType: option.genericContribution.type,
                      candidateIds: candidates.map((card) => card.instanceId),
                      countOptions,
                      ...(option.genericContribution.type ===
                      'EXILE_DECLARED_CARDS_FROM_HAND'
                        ? {
                            colors: option.genericContribution.colors,
                            excludeSource:
                              option.genericContribution.excludeSource,
                            genericReductionPerCard:
                              option.genericContribution
                                .genericReductionPerCard,
                          }
                        : {}),
                    },
                  },
                },
              },
            ],
          },
        ]
      }
      return [
        {
          id: variable ? `${option.id}:${variable.name}=${value}` : option.id,
          label: variable
            ? `${option.label} (${variable.name} = ${value})`
            : option.label,
          actions: [
            {
              type: 'ADD_PENDING_DECISION',
              decision: {
                id: `cast-contribution-${actionWithOption.instanceId}-${option.id}-${value ?? 'fixed'}`,
                sourceAbilityId: 'cast-generic-contribution',
                sourceInstanceId: actionWithOption.instanceId,
                type: 'CAST_GENERIC_CONTRIBUTION_COUNT',
                prompt: contributionPrompt(
                  option.genericContribution,
                  entry.name,
                ),
                options: countOptions.map((count) => ({
                  instanceId: String(count),
                  label:
                    option.genericContribution?.type === 'TAP_PERMANENTS'
                      ? `${count} permanente${count === 1 ? '' : 's'} girado${count === 1 ? '' : 's'}`
                      : `${count} carta${count === 1 ? '' : 's'} exiliada${count === 1 ? '' : 's'}`,
                })),
                continuation: {
                  effectsToExecute: [],
                  resumeEffectIndex: 0,
                  castContribution: {
                    cardName: entry.name,
                    displayedManaCost: option.label,
                    castAction: actionWithOption,
                    cost: taxedCost,
                    contributionType: option.genericContribution.type,
                    candidateIds: candidates.map((card) => card.instanceId),
                    countOptions,
                    ...(option.genericContribution.type ===
                    'EXILE_DECLARED_CARDS_FROM_HAND'
                      ? {
                          colors: option.genericContribution.colors,
                          excludeSource:
                            option.genericContribution.excludeSource,
                          genericReductionPerCard:
                            option.genericContribution.genericReductionPerCard,
                        }
                      : {}),
                  },
                },
              },
            },
          ],
        },
      ]
    }
    const planned = resolvePreparedCast(
      state,
      entry.name,
      option.label,
      actionWithOption,
      taxedCost,
    )
    if (planned.status !== 'resolved') return []
    const actions = withNonManaCastCosts(
      state,
      actionWithOption,
      planned.actions,
      option.nonManaCosts,
    )
    if (!actions) return []
    return [
      {
        id: variable ? `${option.id}:${variable.name}=${value}` : option.id,
        label: variable
          ? `${option.label} (${variable.name} = ${value})`
          : option.label,
        actions,
      },
    ]
  })
}

const resolveCatalogCastOptions = (
  state: GameState,
  entry: NonNullable<ReturnType<typeof activeEntry>>,
  castAction: Extract<GameAction, { type: 'CAST_SPELL' }>,
  options: readonly CastOptionDefinition[],
): ResolvedCommand => {
  const variants: CastVariant[] = []
  const castPlayerId = castAction.actorPlayerId ?? activePlayerIdOf(state)
  const normalCost = calculateSpellManaCost(state, entry.card, {}, castPlayerId)
  const normalAllowed = !options.some(
    (option) =>
      option.required === true &&
      castConditionMet(state, option.condition, castPlayerId),
  )
  if (normalCost && normalAllowed) {
    const normal = resolvePreparedCast(
      state,
      entry.name,
      entry.card.manaCost,
      castAction,
      applyCommanderTax(state, castAction, normalCost),
    )
    if (normal.status === 'resolved')
      variants.push({
        id: 'normal',
        label: 'Normal cost',
        actions: normal.actions,
      })
  }
  variants.push(
    ...options.flatMap((option) =>
      configuredCastVariants(state, entry, castAction, option),
    ),
  )
  if (!variants.length)
    return failure(
      'NOT_ENOUGH_MANA',
      `No hay una forma conocida y legal de pagar el coste de ${entry.name}.`,
    )
  if (variants.length === 1)
    return {
      status: 'resolved',
      actions: variants[0].actions,
      description: `Lanzar ${entry.name}: ${variants[0].label}`,
    }
  return {
    status: 'resolved',
    actions: [
      {
        type: 'ADD_PENDING_DECISION',
        decision: {
          id: `cast-option-${castAction.instanceId}`,
          sourceAbilityId: 'cast-option',
          sourceInstanceId: castAction.instanceId,
          type: 'CAST_OPTION_SELECTION',
          prompt: `Elige cómo lanzar ${entry.name}.`,
          options: variants.map((variant) => ({
            instanceId: variant.id,
            label: variant.label,
          })),
          continuation: {
            effectsToExecute: [],
            resumeEffectIndex: 0,
            castOptions: variants.map((variant) => ({
              id: variant.id,
              actions: variant.actions,
            })),
          },
        },
      },
    ],
    description: `Elegir coste para ${entry.name}`,
  }
}

/**
 * Casts a known public card using "without paying its mana cost". The card may
 * come from exile (Key to the Vault) or another player's graveyard (Sorcerous
 * Squall). Additional costs and global cost increases still apply; alternative
 * costs are not offered and X in the mana cost is treated as 0.
 */
export const resolveFreeCastKnownCard = (
  state: GameState,
  instanceId: string,
  options: {
    fromZone: 'exile' | 'graveyard'
    actorPlayerId?: string
    exileIfWouldEnterGraveyard?: boolean
  },
): ResolvedCommand => {
  const instance = state.cards.find(
    (card) => card.instanceId === instanceId && card.zone === options.fromZone,
  )
  if (!instance)
    return failure(
      'CARD_NOT_FOUND',
      `La carta ya no está disponible en ${options.fromZone}.`,
    )
  const entry =
    activeEntry(state, instance.card.name) ??
    ({ quantity: 1, name: instance.card.name, card: instance.card } as const)
  const castAction: Extract<GameAction, { type: 'CAST_SPELL' }> = {
    type: 'CAST_SPELL',
    instanceId: instance.instanceId,
    card: instance.card,
    fromZone: options.fromZone,
    actorPlayerId:
      options.actorPlayerId ??
      instance.controllerId ??
      state.localPlayerId ??
      'player-1',
    variables: {
      FREE_CAST_WITHOUT_MANA_COST: true,
      X: 0,
      ...(options.exileIfWouldEnterGraveyard
        ? { EXILE_IF_WOULD_ENTER_GRAVEYARD: true }
        : {}),
    },
  }
  const freeEntry = {
    ...entry,
    card: { ...entry.card, manaCost: '{0}' },
  }
  const additionalOptions = getCastOptionsForCard(entry.name).filter(
    (option) => option.kind === 'ADDITIONAL',
  )
  const requiredAdditional = additionalOptions.some(
    (option) =>
      option.required === true &&
      castConditionMet(
        state,
        option.condition,
        castAction.actorPlayerId ?? activePlayerIdOf(state),
      ),
  )
  const variants: CastVariant[] = []
  const freeCost = calculateSpellManaCost(
    state,
    freeEntry.card,
    { X: 0 },
    castAction.actorPlayerId ?? activePlayerIdOf(state),
  )
  if (freeCost && !requiredAdditional) {
    const planned = resolvePreparedCast(
      state,
      entry.name,
      'sin pagar su coste de maná',
      castAction,
      freeCost,
    )
    if (planned.status === 'resolved')
      variants.push({
        id: 'free-cast',
        label: 'Sin pagar su coste de maná',
        actions: planned.actions,
      })
  }
  variants.push(
    ...additionalOptions.flatMap((option) =>
      configuredCastVariants(state, freeEntry, castAction, option),
    ),
  )
  const preparedVariants = variants
  if (!preparedVariants.length)
    return failure(
      'NOT_ENOUGH_MANA',
      `No hay una forma legal conocida de lanzar ${entry.name} con el permiso gratuito.`,
    )
  if (preparedVariants.length === 1)
    return {
      status: 'resolved',
      actions: preparedVariants[0].actions,
      description: `Lanzar ${entry.name} sin pagar su coste de maná`,
    }
  return {
    status: 'resolved',
    actions: [
      {
        type: 'ADD_PENDING_DECISION',
        decision: {
          id: `free-cast-option-${instanceId}`,
          sourceAbilityId: 'free-cast-option',
          sourceInstanceId: instanceId,
          type: 'CAST_OPTION_SELECTION',
          prompt: `Elige los costes adicionales para ${entry.name}.`,
          options: preparedVariants.map((variant) => ({
            instanceId: variant.id,
            label: variant.label,
          })),
          continuation: {
            effectsToExecute: [],
            resumeEffectIndex: 0,
            castOptions: preparedVariants.map((variant) => ({
              id: variant.id,
              actions: variant.actions,
            })),
          },
        },
      },
    ],
    description: `Elegir costes adicionales para ${entry.name}`,
  }
}

/** Backwards-compatible wrapper used by The Key to the Vault. */
export const resolveFreeCastFromExile = (
  state: GameState,
  instanceId: string,
): ResolvedCommand =>
  resolveFreeCastKnownCard(state, instanceId, { fromZone: 'exile' })

const resolveCast = (
  state: GameState,
  cardQuery: string,
  targetQuery?: string,
  fromZone?: 'library',
): ResolvedCommand => {
  const actorPlayerId = activePlayerIdOf(state)
  const name = resolveName(state, cardQuery)
  if (isResolvedError(name)) return name
  const entry = activeEntry(state, name)
  if (!entry) return failure('CARD_NOT_FOUND', `No encontré “${cardQuery}”.`)
  const timing = validateCastTiming(state, entry.card)
  if (!timing.legal) return failure(timing.code, timing.message)
  const stackObjectId = targetQuery
    ? resolveStackTarget(state, targetQuery)
    : undefined
  if (stackObjectId && isResolvedError(stackObjectId)) return stackObjectId
  const knownHand = state.cards.find(
    (card) =>
      card.zone === 'hand' &&
      card.card.scryfallId === entry.card.scryfallId &&
      (card.ownerId ?? localPlayerIdOf(state)) === actorPlayerId,
  )
  const knownCommand = state.cards.find(
    (card) =>
      card.zone === 'command' &&
      card.card.scryfallId === entry.card.scryfallId &&
      (card.ownerId ?? localPlayerIdOf(state)) === actorPlayerId,
  )
  const airbendPermission = (state.airbendPermissions ?? []).find(
    (permission) => {
      const card = state.cards.find(
        (candidate) => candidate.instanceId === permission.cardInstanceId,
      )
      return (
        card?.zone === 'exile' &&
        card.card.scryfallId === entry.card.scryfallId &&
        permission.ownerId === actorPlayerId
      )
    },
  )
  const knownAirbent = airbendPermission
    ? state.cards.find(
        (card) => card.instanceId === airbendPermission.cardInstanceId,
      )
    : undefined
  const knownLibraryTop = state.knownLibraryTopInstanceId
    ? state.cards.find(
        (card) =>
          card.instanceId === state.knownLibraryTopInstanceId &&
          card.zone === 'library',
      )
    : undefined
  if (fromZone === 'library') {
    if (!canCastFromLibraryTop(state, entry.card))
      return failure(
        'INVALID_TIMING',
        `${entry.name} no puede lanzarse desde la parte superior de la biblioteca con el estado conocido.`,
      )
    if (
      knownLibraryTop &&
      knownLibraryTop.card.scryfallId !== entry.card.scryfallId
    )
      return failure(
        'CARD_NOT_FOUND',
        `La carta superior pública conocida es ${knownLibraryTop.card.name}, no ${entry.name}.`,
      )
  }
  const source =
    fromZone === 'library'
      ? knownLibraryTop?.card.scryfallId === entry.card.scryfallId
        ? knownLibraryTop
        : undefined
      : (knownHand ?? knownCommand ?? knownAirbent)
  if (!source && !canMaterialize(state, entry))
    return copyUnavailable(entry.name)
  const castAction: Extract<GameAction, { type: 'CAST_SPELL' }> = {
    type: 'CAST_SPELL',
    instanceId:
      source?.instanceId ?? materializedId(state, entry.card.scryfallId),
    card: entry.card,
    fromZone: source?.zone ?? fromZone ?? 'hand',
    actorPlayerId,
    ...(typeof stackObjectId === 'string'
      ? { targetStackObjectId: stackObjectId }
      : {}),
  }
  if (source?.zone === 'exile' && airbendPermission) {
    const airbendCost = calculateConfiguredSpellManaCost(state, entry.card, {
      alternativeManaCost: airbendPermission.alternativeManaCost,
    })
    if (!airbendCost)
      return failure(
        'INVALID_AMOUNT',
        `No puedo calcular el coste alternativo de Airbend para ${entry.name}.`,
      )
    return resolvePreparedCast(
      state,
      entry.name,
      airbendPermission.alternativeManaCost,
      {
        ...castAction,
        variables: { ...(castAction.variables ?? {}), AIRBEND_CAST: true },
      },
      airbendCost,
    )
  }
  const castOptions = getCastOptionsForCard(entry.name)
  if (castOptions.length)
    return resolveCatalogCastOptions(state, entry, castAction, castOptions)

  if (hasVariableX(entry.card.manaCost)) {
    const options = Array.from(
      { length: knownManaUpperBound(state) + 1 },
      (_, x) => x,
    ).flatMap((x) => {
      const normalCost = calculateSpellManaCost(
        state,
        entry.card,
        { X: x },
        actorPlayerId,
      )
      if (!normalCost) return []
      const cost = applyCommanderTax(state, castAction, normalCost)
      const actionWithX: Extract<GameAction, { type: 'CAST_SPELL' }> = {
        ...castAction,
        variables: { ...(castAction.variables ?? {}), X: x },
      }
      const planned = resolvePreparedCast(
        state,
        entry.name,
        entry.card.manaCost,
        actionWithX,
        cost,
      )
      return planned.status === 'resolved'
        ? [
            {
              id: `X:${x}`,
              value: x,
              actions: planned.actions,
            },
          ]
        : []
    })
    if (!options.length)
      return failure(
        'NOT_ENOUGH_MANA',
        `No hay ningún valor conocido de X que puedas pagar para ${entry.name}.`,
      )
    return {
      status: 'resolved',
      actions: [
        {
          type: 'ADD_PENDING_DECISION',
          decision: {
            id: `cast-variable-${castAction.instanceId}-X`,
            sourceAbilityId: 'cast-variable',
            sourceInstanceId: castAction.instanceId,
            type: 'NUMBER_SELECTION',
            prompt: `Elige el valor de X para ${entry.name}.`,
            options: options.map((option) => ({
              instanceId: option.id,
              label: `X = ${option.value}`,
            })),
            continuation: {
              effectsToExecute: [],
              resumeEffectIndex: 0,
              castVariable: {
                variableName: 'X',
                options,
              },
            },
          },
        },
      ],
      description: `Elegir X para ${entry.name}`,
    }
  }

  const normalCost = calculateSpellManaCost(
    state,
    entry.card,
    {},
    actorPlayerId,
  )
  if (!normalCost)
    return failure(
      'INVALID_AMOUNT',
      `El coste de ${entry.name} usa símbolos aún no soportados.`,
    )
  return resolvePreparedCast(
    state,
    entry.name,
    entry.card.manaCost,
    castAction,
    applyCommanderTax(state, castAction, normalCost),
  )
}

export const resolveCommand = (
  state: GameState,
  command: ParsedCommand,
): ResolvedCommand => {
  if (state.gameStatus !== 'IN_PROGRESS' && command.type !== 'UNDO')
    return failure(
      'GAME_OVER',
      'La partida ha terminado; usa una corrección manual si la mesa física difiere.',
    )
  if (command.type === 'UNDO')
    return { status: 'undo', description: 'Deshacer última acción' }
  if (command.type === 'CONCEDE') {
    const actorPlayerId = activePlayerIdOf(state)
    return {
      status: 'resolved',
      actions: [{ type: 'CONCEDE', actorPlayerId }],
      description: 'Conceder la partida',
    }
  }
  if (command.type === 'START_TURN') {
    if (requiresPlayerInteraction(state))
      return failure(
        'STACK_NOT_EMPTY',
        'Resuelve o decide las interacciones pendientes antes de comenzar el turno.',
      )
    return {
      status: 'resolved',
      actions: [{ type: 'START_TURN' }],
      description: 'Comenzar turno',
    }
  }
  if (command.type === 'NEXT_TURN') {
    const cancelableDecisions = state.pendingDecisions.filter(
      canCancelDecisionForTurnPass,
    )
    const hasBlockingInteraction =
      state.stack.length > 0 ||
      state.pendingAbilities.length > 0 ||
      state.pendingResolutions.length > 0 ||
      state.pendingDecisions.some(
        (decision) => !canCancelDecisionForTurnPass(decision),
      )
    if (hasBlockingInteraction)
      return failure(
        'STACK_NOT_EMPTY',
        'Resuelve o decide las interacciones obligatorias antes de terminar el turno.',
      )
    return {
      status: 'resolved',
      actions: [
        ...cancelableDecisions.map((decision): GameAction => ({
          type: 'REMOVE_PENDING_DECISION',
          decisionId: decision.id,
        })),
        { type: 'NEXT_TURN' },
      ],
      description:
        cancelableDecisions.length > 0
          ? `Cancelar ${cancelableDecisions.length} declaración pendiente y pasar turno`
          : 'Siguiente turno',
    }
  }
  if (command.type === 'ADVANCE_STEP') {
    if (state.stack.length)
      return failure(
        'STACK_NOT_EMPTY',
        'Resuelve el stack antes de avanzar el paso.',
      )
    if (command.targetStep === state.turnState.step)
      return {
        status: 'resolved',
        actions: [],
        description: `Ya estás en ${command.targetStep}`,
      }
    const actions: GameAction[] = []
    let current = state.turnState.step
    do {
      const next = nextStep(current)
      if (!next) {
        actions.push({ type: 'NEXT_TURN' })
        current = 'UNTAP'
      } else {
        actions.push({ type: 'ADVANCE_STEP' })
        current = next
      }
    } while (command.targetStep && current !== command.targetStep)
    return {
      status: 'resolved',
      actions,
      description: `Avanzar a ${command.targetStep ?? current}`,
    }
  }
  if (command.type === 'COMBAT_ACTION')
    return failure(
      'COMBAT_NOT_IMPLEMENTED',
      'Combat Core 2 todavía no está implementado.',
    )
  if (command.type === 'DECLARE_ATTACKERS') {
    const attackingPlayerId = activePlayerIdOf(state)
    if (command.none) {
      if (
        state.turnState.step !== 'DECLARE_ATTACKERS' ||
        !state.combatState.active
      )
        return failure('INVALID_TIMING', 'No estás declarando atacantes.')
      const requirementValidation = validateAttackRequirements(state, [])
      if ('code' in requirementValidation)
        return failure(
          requirementValidation.code as CommandError['code'],
          requirementValidation.message,
        )
      return {
        status: 'resolved',
        actions: [
          {
            type: 'DECLARE_ATTACKERS',
            actorPlayerId: attackingPlayerId,
            attackers: [],
            eventGroupId: `attack-${state.turn}-none`,
          },
        ],
        description: 'Sin atacantes',
      }
    }
    const defendingPlayerId = opponentPlayerIds(state, attackingPlayerId)[0]
    const exactAttackers = command.attackerInstanceIds?.length
      ? command.attackerInstanceIds.map((instanceId) =>
          state.cards.find((card) => card.instanceId === instanceId),
        )
      : undefined
    if (exactAttackers?.some((card) => !card))
      return failure(
        'CARD_NOT_FOUND',
        'Uno de los atacantes seleccionados ya no está disponible.',
      )
    const candidates = exactAttackers
      ? (exactAttackers as GameState['cards'])
      : command.all
        ? state.cards.filter(
            (card) =>
              card.zone === 'battlefield' &&
              (card.controllerId ?? localPlayerIdOf(state)) ===
                attackingPlayerId &&
              /\bcreature\b/i.test(effectiveTypeLine(state, card)) &&
              (!command.subtype ||
                effectiveTypeLine(state, card)
                  .toLocaleLowerCase()
                  .includes(
                    {
                      triton: 'merfolk',
                      tritone: 'merfolk',
                    }[command.subtype.replace(/s$/, '').toLocaleLowerCase()] ??
                      command.subtype.replace(/s$/, '').toLocaleLowerCase(),
                  )),
          )
        : command.attackerQueries.map((query) =>
            knownCombatCreature(state, query, attackingPlayerId),
          )
    if (!candidates.length)
      return failure('CARD_NOT_FOUND', 'No encontré atacantes conocidos.')
    if (candidates.some(isCombatError))
      return candidates.find(isCombatError) as ResolvedCommand
    const attackers = candidates as GameState['cards']
    const invalid = attackers
      .map((attacker) => canAttack(state, attacker))
      .find((result) => !result.legal)
    if (invalid && 'code' in invalid)
      return failure(invalid.code as CommandError['code'], invalid.message)
    const exactDefendingPlaneswalker = command.defenderInstanceId
      ? state.cards.find(
          (card) =>
            card.instanceId === command.defenderInstanceId &&
            card.zone === 'battlefield' &&
            !card.phasedOut,
        )
      : undefined
    if (command.defenderInstanceId && !exactDefendingPlaneswalker)
      return failure(
        'CARD_NOT_FOUND',
        'El defensor seleccionado ya no está disponible.',
      )
    const defendingPlaneswalker =
      exactDefendingPlaneswalker ??
      (command.defenderQuery
        ? knownDefendingPlaneswalker(
            state,
            command.defenderQuery,
            defendingPlayerId,
          )
        : undefined)
    if (defendingPlaneswalker && isCombatError(defendingPlaneswalker))
      return defendingPlaneswalker
    const defendingPlaneswalkerCard =
      defendingPlaneswalker && !isCombatError(defendingPlaneswalker)
        ? defendingPlaneswalker
        : undefined
    const defendingTarget = defendingPlaneswalkerCard
      ? {
          kind: 'PLANESWALKER' as const,
          id: defendingPlaneswalkerCard.instanceId,
        }
      : undefined
    const requirementValidation = validateAttackRequirements(
      state,
      attackers.map((attacker) => ({
        attackerInstanceId: attacker.instanceId,
        defendingTarget: defendingTarget ?? {
          kind: 'PLAYER' as const,
          id: 'opponent',
          playerId: defendingPlayerId,
        },
      })),
    )
    if ('code' in requirementValidation)
      return failure(
        requirementValidation.code as CommandError['code'],
        requirementValidation.message,
      )
    const declaredAttackers = attackers.map((attacker) => ({
      attackerInstanceId: attacker.instanceId,
      defendingTarget: defendingTarget ?? {
        kind: 'PLAYER' as const,
        id: 'opponent',
        playerId: defendingPlayerId,
      },
    }))
    const declarationValidation = validateAttackDeclaration(
      state,
      declaredAttackers,
    )
    if (!declarationValidation.legal)
      return failure(
        declarationValidation.code as CommandError['code'],
        declarationValidation.message,
      )
    const attackTax = attackTaxForDeclaration(
      state,
      attackingPlayerId,
      declaredAttackers,
    )
    const declarationAction: Extract<
      GameAction,
      { type: 'DECLARE_ATTACKERS' }
    > = {
      type: 'DECLARE_ATTACKERS',
      actorPlayerId: attackingPlayerId,
      attackers: declaredAttackers,
      eventGroupId: `attack-${state.turn}-${attackers.map((card) => card.instanceId).join('-')}`,
      ...(attackTax ? { genericTaxPaid: attackTax } : {}),
    }
    const description = `Atacar${defendingPlaneswalkerCard ? ` a ${effectiveCardDefinition(state, defendingPlaneswalkerCard).name}` : ''} con ${attackers.map((attacker) => attacker.card.name).join(', ')}`
    if (!attackTax)
      return {
        status: 'resolved',
        actions: [declarationAction],
        description,
      }
    const taxCost: SpellManaCost = { generic: attackTax, colors: {} }
    const payment = planManaPayment(
      state,
      taxCost,
      undefined,
      attackingPlayerId,
    )
    if (payment.kind === 'PAYABLE')
      return {
        status: 'resolved',
        actions: [...payment.actions, declarationAction],
        description: `${description} (impuesto de ataque {${attackTax}})`,
      }
    if (payment.kind === 'AMBIGUOUS')
      return {
        status: 'resolved',
        actions: [
          {
            type: 'ADD_PENDING_DECISION',
            decision: {
              id: `attack-tax-payment-${state.turn}`,
              sourceAbilityId: 'attack-tax-payment',
              sourceInstanceId: attackers[0]?.instanceId ?? 'attack-tax',
              type: 'MANA_PAYMENT_SELECTION',
              prompt: `Elige cómo pagar {${attackTax}} por esta declaración de atacantes.`,
              options: payment.options.map((option) => ({
                instanceId: option.id,
                label: option.label,
              })),
              continuation: {
                effectsToExecute: [],
                resumeEffectIndex: 0,
                actionPayment: {
                  options: payment.options.map((option) => ({
                    id: option.id,
                    actions: option.actions,
                  })),
                  completionActions: [declarationAction],
                },
              },
            },
          },
        ],
        description: `Pagar impuesto de ataque {${attackTax}}`,
      }
    const autoMana = planSmartManaPayment({
      state,
      manaCost: taxCost,
      mode: state.autoManaMode,
      playerId: attackingPlayerId,
    })
    if (autoMana.kind === 'UNIQUE_SAFE_PLAN')
      return {
        status: 'resolved',
        actions: [...autoMana.plan.actions, declarationAction],
        description: `${description} (impuesto de ataque {${attackTax}})`,
      }
    if (
      autoMana.kind === 'MULTIPLE_SAFE_PLANS' ||
      autoMana.kind === 'REQUIRES_CONFIRMATION'
    )
      return {
        status: 'resolved',
        actions: [
          {
            type: 'ADD_PENDING_DECISION',
            decision: {
              id: `attack-tax-source-${state.turn}`,
              sourceAbilityId: 'attack-tax-payment',
              sourceInstanceId: attackers[0]?.instanceId ?? 'attack-tax',
              type: 'MANA_SOURCE_SELECTION',
              prompt: `Elige las fuentes para pagar {${attackTax}} por esta declaración de atacantes.`,
              options: autoMana.plans.map((plan) => ({
                instanceId: plan.id,
                label: plan.label,
              })),
              continuation: {
                effectsToExecute: [],
                resumeEffectIndex: 0,
                actionPayment: {
                  options: autoMana.plans.map((plan) => ({
                    id: plan.id,
                    actions: plan.actions,
                  })),
                  completionActions: [declarationAction],
                },
              },
            },
          },
        ],
        description: `Pagar impuesto de ataque {${attackTax}}`,
      }
    return failure(
      'NOT_ENOUGH_MANA',
      `Necesitas pagar {${attackTax}} para declarar esos atacantes.`,
    )
  }
  if (command.type === 'DECLARE_EXTERNAL_ATTACKER') {
    const attacker = knownCombatCreature(
      state,
      command.cardQuery,
      opponentPlayerIds(state, activePlayerIdOf(state))[0],
    )
    if (isCombatError(attacker)) return attacker
    return {
      status: 'resolved',
      actions: [
        { type: 'DECLARE_EXTERNAL_ATTACKER', instanceId: attacker.instanceId },
      ],
      description: `${attacker.card.name} ataca por el rival`,
    }
  }
  if (command.type === 'DECLARE_BLOCKERS') {
    if (
      state.turnState.step !== 'DECLARE_BLOCKERS' ||
      !state.combatState.active
    )
      return failure('INVALID_TIMING', 'No estás declarando bloqueadores.')
    if (command.none)
      return {
        status: 'resolved',
        actions: [{ type: 'DECLARE_BLOCKERS', blockers: [] }],
        description: 'Sin bloqueos',
      }
    const attacker = command.attackerInstanceId
      ? state.cards.find(
          (card) => card.instanceId === command.attackerInstanceId,
        )
      : command.attackerQuery
        ? knownCombatCreature(
            state,
            command.attackerQuery,
            state.combatState.attackingPlayerStableId ??
              activePlayerIdOf(state),
          )
        : state.combatState.attackers.length === 1
          ? state.cards.find(
              (card) =>
                card.instanceId ===
                state.combatState.attackers[0].attackerInstanceId,
            )
          : undefined
    if (!attacker || isCombatError(attacker))
      return attacker && isCombatError(attacker)
        ? attacker
        : failure(
            'AMBIGUOUS_CARD',
            'Indica qué atacante recibe los bloqueadores.',
          )
    const combatAttacker = state.combatState.attackers.find(
      (item) => item.attackerInstanceId === attacker.instanceId,
    )
    if (!combatAttacker)
      return failure('INVALID_ATTACKER', 'Esa criatura no está atacando.')
    const defendingPlayerId = opponentPlayerIds(
      state,
      state.combatState.attackingPlayerStableId ?? activePlayerIdOf(state),
    )[0]
    const resolveBlockDeclarationWithTax = (
      blockers: import('../../types/combat').CombatBlocker[],
      description: string,
    ): ResolvedCommand => {
      const blockTax = blockTaxForDeclaration(
        state,
        defendingPlayerId,
        blockers,
      )
      const declarationAction: Extract<
        GameAction,
        { type: 'DECLARE_BLOCKERS' }
      > = {
        type: 'DECLARE_BLOCKERS',
        actorPlayerId: defendingPlayerId,
        blockers,
        ...(blockTax ? { genericTaxPaid: blockTax } : {}),
      }
      if (!blockTax)
        return { status: 'resolved', actions: [declarationAction], description }
      const taxCost: SpellManaCost = { generic: blockTax, colors: {} }
      const payment = planManaPayment(
        state,
        taxCost,
        undefined,
        defendingPlayerId,
      )
      if (payment.kind === 'PAYABLE')
        return {
          status: 'resolved',
          actions: [...payment.actions, declarationAction],
          description: `${description} (coste de bloqueo {${blockTax}})`,
        }
      if (payment.kind === 'AMBIGUOUS')
        return {
          status: 'resolved',
          actions: [
            {
              type: 'ADD_PENDING_DECISION',
              decision: {
                id: `block-tax-payment-${state.turn}`,
                sourceAbilityId: 'block-tax-payment',
                sourceInstanceId: blockers[0]?.blockerInstanceId ?? 'block-tax',
                decisionPlayerId: defendingPlayerId,
                type: 'MANA_PAYMENT_SELECTION',
                prompt: `Elige cómo pagar {${blockTax}} por esta declaración de bloqueadores.`,
                options: payment.options.map((option) => ({
                  instanceId: option.id,
                  label: option.label,
                })),
                continuation: {
                  effectsToExecute: [],
                  resumeEffectIndex: 0,
                  actionPayment: {
                    options: payment.options.map((option) => ({
                      id: option.id,
                      actions: option.actions,
                    })),
                    completionActions: [declarationAction],
                  },
                },
              },
            },
          ],
          description: `Pagar coste de bloqueo {${blockTax}}`,
        }
      const autoMana = planSmartManaPayment({
        state,
        manaCost: taxCost,
        mode: state.autoManaMode,
        playerId: defendingPlayerId,
      })
      if (autoMana.kind === 'UNIQUE_SAFE_PLAN')
        return {
          status: 'resolved',
          actions: [...autoMana.plan.actions, declarationAction],
          description: `${description} (coste de bloqueo {${blockTax}})`,
        }
      if (
        autoMana.kind === 'MULTIPLE_SAFE_PLANS' ||
        autoMana.kind === 'REQUIRES_CONFIRMATION'
      )
        return {
          status: 'resolved',
          actions: [
            {
              type: 'ADD_PENDING_DECISION',
              decision: {
                id: `block-tax-source-${state.turn}`,
                sourceAbilityId: 'block-tax-payment',
                sourceInstanceId: blockers[0]?.blockerInstanceId ?? 'block-tax',
                decisionPlayerId: defendingPlayerId,
                type: 'MANA_SOURCE_SELECTION',
                prompt: `Elige las fuentes para pagar {${blockTax}} por esta declaración de bloqueadores.`,
                options: autoMana.plans.map((plan) => ({
                  instanceId: plan.id,
                  label: plan.label,
                })),
                continuation: {
                  effectsToExecute: [],
                  resumeEffectIndex: 0,
                  actionPayment: {
                    options: autoMana.plans.map((plan) => ({
                      id: plan.id,
                      actions: plan.actions,
                    })),
                    completionActions: [declarationAction],
                  },
                },
              },
            },
          ],
          description: `Pagar coste de bloqueo {${blockTax}}`,
        }
      return failure(
        'NOT_ENOUGH_MANA',
        `Necesitas pagar {${blockTax}} para declarar esos bloqueadores.`,
      )
    }
    const blockers = command.blockerInstanceIds?.length
      ? command.blockerInstanceIds.map((instanceId) =>
          state.cards.find((card) => card.instanceId === instanceId),
        )
      : command.blockerQueries.map((query) =>
          knownCombatCreature(state, query, defendingPlayerId),
        )
    if (blockers.some((blocker) => !blocker))
      return failure(
        'CARD_NOT_FOUND',
        'Uno de los bloqueadores seleccionados ya no está disponible.',
      )
    if (blockers.some((blocker) => blocker && isCombatError(blocker)))
      return blockers.find((blocker): blocker is ResolvedCommand =>
        Boolean(blocker && isCombatError(blocker)),
      ) as ResolvedCommand
    const knownBlockers = blockers as GameState['cards']
    const invalid = knownBlockers
      .map((blocker) => canBlock(state, combatAttacker, blocker))
      .find((result) => !result.legal)
    if (invalid && 'code' in invalid)
      return failure(invalid.code as CommandError['code'], invalid.message)
    if (
      hasEffectiveKeyword(state, attacker, 'MENACE') &&
      knownBlockers.length === 1
    )
      return failure(
        'INVALID_BLOCKER',
        'Menace no permite exactamente un bloqueador.',
      )
    return resolveBlockDeclarationWithTax(
      knownBlockers.map((blocker) => ({
        blockerInstanceId: blocker.instanceId,
        blocking: [attacker.instanceId],
      })),
      `Bloquear ${attacker.card.name}`,
    )
  }
  if (command.type === 'RESOLVE_COMBAT_DAMAGE') {
    const plan = planCombatDamage(state)
    if (plan.type === 'ERROR')
      return failure(plan.code as CommandError['code'], plan.message)
    if (plan.type === 'DECISION')
      return {
        status: 'resolved',
        actions: [{ type: 'ADD_PENDING_DECISION', decision: plan.decision }],
        description: 'Elegir asignación de daño de combate',
      }
    return {
      status: 'resolved',
      actions: plan.actions,
      description: 'Resolver daño de combate',
    }
  }
  if (command.type === 'DECLARE_ASSISTED_BLOCKER') {
    const attacker = knownCombatCreature(
      state,
      command.attackerQuery,
      state.combatState.attackingPlayerStableId ?? activePlayerIdOf(state),
    )
    if (isCombatError(attacker)) return attacker
    if (
      !state.combatState.attackers.some(
        (item) => item.attackerInstanceId === attacker.instanceId,
      )
    )
      return failure('INVALID_ATTACKER', 'Esa criatura no está atacando.')
    return {
      status: 'resolved',
      actions: [
        {
          type: 'DECLARE_ASSISTED_BLOCKER',
          attackerInstanceId: attacker.instanceId,
          participant: {
            temporaryId: `external-blocker-${state.combatState.combatId}-${attacker.instanceId}`,
            controller: 'OPPONENT',
            ...(command.power !== undefined ? { power: command.power } : {}),
            ...(command.toughness !== undefined
              ? { toughness: command.toughness }
              : {}),
            damageMarked: 0,
            keywords: [],
          },
        },
      ],
      description: `${attacker.card.name} queda bloqueado (asistido)`,
    }
  }
  if (command.type === 'DECLARE_DAMAGE') {
    if (!Number.isSafeInteger(command.amount) || command.amount <= 0)
      return failure('INVALID_AMOUNT', 'La cantidad de daño debe ser positiva.')
    if (command.targetQuery === 'yo')
      return {
        status: 'resolved',
        actions: [
          {
            type: 'DEAL_DAMAGE',
            damage: {
              target: { kind: 'PLAYER', player: 'local' },
              amount: command.amount,
              damageKind: 'NONCOMBAT',
              hasDeathtouch: false,
            },
          },
        ],
        description: `Recibir ${command.amount} daño`,
      }
    const target = state.cards.find(
      (card) =>
        card.zone === 'battlefield' &&
        (normalizeCommandText(effectiveCardDefinition(state, card).name) ===
          normalizeCommandText(command.targetQuery) ||
          normalizeCommandText(card.card.name) ===
            normalizeCommandText(command.targetQuery)),
    )
    if (!target)
      return failure('CARD_NOT_FOUND', 'No encontré el objetivo de daño.')
    return {
      status: 'resolved',
      actions: [
        {
          type: 'DEAL_DAMAGE',
          damage: {
            target: { kind: 'CREATURE', instanceId: target.instanceId },
            amount: command.amount,
            damageKind: 'NONCOMBAT',
            hasDeathtouch: false,
          },
        },
      ],
      description: `${target.card.name} recibe ${command.amount} daño`,
    }
  }
  if (command.type === 'DECLARE_PLAYER_SHUFFLED') {
    const actorPlayerId = command.actorPlayerId ?? activePlayerIdOf(state)
    return {
      status: 'resolved',
      actions: [
        {
          type: 'DECLARE_PLAYER_SHUFFLED',
          player:
            actorPlayerId === localPlayerIdOf(state) ? 'local' : 'opponent',
          playerId: actorPlayerId,
          actorPlayerId,
        },
      ],
      description: 'Barajar biblioteca',
    }
  }
  if (command.type === 'DRAW') {
    const actorPlayerId = command.actorPlayerId ?? activePlayerIdOf(state)
    const actor = state.players.find((player) => player.id === actorPlayerId)
    if (!Number.isSafeInteger(command.amount) || command.amount < 1)
      return failure('INVALID_AMOUNT', 'La cantidad debe ser positiva.')
    if (
      actor?.hiddenZoneTracking === 'COUNTS_ONLY' &&
      command.amount > (actor.libraryCount ?? 0)
    )
      return failure(
        'NOT_ENOUGH_MATCHING_CARDS',
        'No hay suficientes cartas en la biblioteca.',
      )
    return {
      status: 'resolved',
      actions: Array.from({ length: command.amount }, (): GameAction => ({
        type: 'DRAW_CARD',
        playerId: actorPlayerId,
        actorPlayerId,
      })),
      description: `Robar ${command.amount}`,
    }
  }
  if (
    command.type === 'GAIN_LIFE' ||
    command.type === 'LOSE_LIFE' ||
    command.type === 'SET_LIFE'
  ) {
    const actorPlayerId = command.actorPlayerId ?? activePlayerIdOf(state)
    if (
      !Number.isSafeInteger(command.amount) ||
      command.amount < 0 ||
      (command.type !== 'SET_LIFE' && command.amount === 0)
    )
      return failure('INVALID_AMOUNT', 'La cantidad no es válida.')
    return {
      status: 'resolved',
      actions: [{ type: command.type, amount: command.amount, actorPlayerId }],
      description: `${command.type} ${command.amount}`,
    }
  }
  if (
    command.type === 'SET_HAND_COUNT' ||
    command.type === 'SET_LIBRARY_COUNT'
  ) {
    if (!Number.isSafeInteger(command.count) || command.count < 0)
      return failure('INVALID_AMOUNT', 'La cantidad de cartas no es válida.')
    const actorPlayerId = command.actorPlayerId ?? activePlayerIdOf(state)
    return {
      status: 'resolved',
      actions: [
        command.type === 'SET_HAND_COUNT'
          ? {
              type: 'SET_HAND_COUNT',
              count: command.count,
              playerId: actorPlayerId,
              actorPlayerId,
            }
          : { type: 'SET_LIBRARY_COUNT', count: command.count, actorPlayerId },
      ],
      description:
        command.type === 'SET_HAND_COUNT'
          ? `Sincronizar mano a ${command.count}`
          : `Sincronizar biblioteca a ${command.count}`,
    }
  }
  if (command.type === 'ADD_MANA' || command.type === 'SPEND_MANA') {
    const actorPlayerId = command.actorPlayerId ?? activePlayerIdOf(state)
    const color = manaColorAliases[normalizeCommandText(command.colorQuery)]
    if (!color || !Number.isSafeInteger(command.amount) || command.amount < 1)
      return failure('INVALID_AMOUNT', 'Color o cantidad de maná no válidos.')
    if (
      command.type === 'SPEND_MANA' &&
      playerManaPool(state, actorPlayerId)[color] < command.amount
    )
      return failure('NOT_ENOUGH_MANA', 'No hay suficiente maná en la reserva.')
    return {
      status: 'resolved',
      actions: [
        { type: command.type, color, amount: command.amount, actorPlayerId },
      ],
      description: `${command.type} ${command.amount} ${color}`,
    }
  }
  if (command.type === 'UNTAP_ALL')
    return {
      status: 'resolved',
      actions: [
        {
          type: 'UNTAP_ALL',
          actorPlayerId: command.actorPlayerId ?? activePlayerIdOf(state),
        },
      ],
      description: 'Enderezar todos tus permanentes',
    }
  if (command.type === 'MOVE_CARD') {
    const card = resolveKnownCardForMove(
      state,
      command.cardQuery,
      command.index,
      command.instanceId,
    )
    if ('status' in card) return card
    if (
      command.destination === 'command' &&
      !isCommanderInstance(state, card.instanceId)
    )
      return failure(
        'INVALID_TIMING',
        'Solo una carta que sea tu comandante puede moverse a la zona de mando.',
      )
    if (card.zone === command.destination)
      return {
        status: 'resolved',
        actions: [],
        description: `${effectiveCardDefinition(state, card).name} ya está en ${
          moveZoneLabel[command.destination]
        }`,
      }
    return {
      status: 'resolved',
      actions: [
        {
          type: 'MOVE_CARD',
          instanceId: card.instanceId,
          toZone: command.destination,
        },
      ],
      description: `Mover ${effectiveCardDefinition(state, card).name} a ${
        moveZoneLabel[command.destination]
      }`,
    }
  }
  if (command.type === 'PLAY_CARD' || command.type === 'DECLARE_CARD') {
    const name = resolveName(state, command.cardQuery)
    if (isResolvedError(name)) return name
    const entry = activeEntry(state, name)
    if (!entry)
      return failure('CARD_NOT_FOUND', `No encontré “${command.cardQuery}”.`)
    return isLandCard(entry.card.typeLine)
      ? resolveLandPlay(state, command.cardQuery)
      : resolveCast(state, command.cardQuery)
  }
  if (command.type === 'CAST_SPELL')
    return resolveCast(
      state,
      command.cardQuery,
      command.targetQuery,
      command.fromZone,
    )
  if (command.type === 'RESOLVE_SPELL') {
    const spells = state.cards.filter((card) => card.zone === 'stack')
    if (command.instanceId) {
      const spell = spells.find(
        (card) => card.instanceId === command.instanceId,
      )
      if (!spell)
        return failure(
          'SPELL_ALREADY_LEFT_STACK',
          'El hechizo seleccionado ya no existe en el stack.',
        )
      if (state.stack.at(-1)?.spellInstanceId !== spell.instanceId)
        return failure(
          'NOT_TOP_OF_STACK',
          'Solo puedes resolver el objeto superior del stack.',
        )
      return {
        status: 'resolved',
        actions: [{ type: 'RESOLVE_SPELL', instanceId: spell.instanceId }],
        description: `Resolver ${spell.card.name}`,
      }
    }
    if (command.cardQuery) {
      const name = resolveKnownPublicName(state, command.cardQuery, ['stack'])
      if (isResolvedError(name)) return name
      const matching = spells.filter((card) =>
        instanceMatchesDeckName(state, card, name),
      )
      if (matching.length !== 1)
        return failure(
          matching.length ? 'AMBIGUOUS_TARGET' : 'CARD_NOT_FOUND',
          `Necesito identificar un único hechizo ${name} en el stack.`,
        )
      if (state.stack.at(-1)?.spellInstanceId !== matching[0].instanceId)
        return failure(
          'NOT_TOP_OF_STACK',
          'Solo puedes resolver el objeto superior del stack.',
        )
      return {
        status: 'resolved',
        actions: [
          { type: 'RESOLVE_SPELL', instanceId: matching[0].instanceId },
        ],
        description: `Resolver ${name}`,
      }
    }
    const top = state.stack.at(-1)
    if (!top || top.kind !== 'SPELL')
      return failure(
        top ? 'NOT_TOP_OF_STACK' : 'SPELL_ALREADY_LEFT_STACK',
        top
          ? 'El objeto superior no es un hechizo.'
          : 'No hay ningún hechizo en el stack.',
      )
    const spell = spells.find((card) => card.instanceId === top.spellInstanceId)
    if (!spell)
      return failure(
        'SPELL_ALREADY_LEFT_STACK',
        'El spell superior ya no existe.',
      )
    return {
      status: 'resolved',
      actions: [{ type: 'RESOLVE_SPELL', instanceId: spell.instanceId }],
      description: `Resolver ${spell.card.name}`,
    }
  }
  if (command.type === 'DISCARD_CARD') {
    if (command.amount !== 1)
      return failure(
        'INVALID_AMOUNT',
        'Identifica y descarta las cartas una a una por ahora.',
      )
    if (command.unknown)
      return failure(
        'CARD_NOT_IN_HAND',
        'El descarte desconocido requiere sincronización manual por ahora.',
      )
    if (!command.cardQuery) return failure('CARD_NOT_FOUND', 'Falta la carta.')
    const name = resolveName(state, command.cardQuery)
    if (isResolvedError(name)) return name
    const entry = activeEntry(state, name)
    if (!entry) return failure('CARD_NOT_FOUND', `No encontré “${name}”.`)
    const known = state.cards.find(
      (card) =>
        card.zone === 'hand' && card.card.scryfallId === entry.card.scryfallId,
    )
    if (known)
      return {
        status: 'resolved',
        actions: [
          {
            type: 'MOVE_CARD',
            instanceId: known.instanceId,
            toZone: 'graveyard',
          },
        ],
        description: `Descartar ${entry.name}`,
      }
    const knownCopies = state.cards.filter(
      (card) => card.card.scryfallId === entry.card.scryfallId,
    ).length
    if (knownCopies >= entry.quantity)
      return failure(
        'NOT_ENOUGH_MATCHING_CARDS',
        `No queda una copia disponible de ${entry.name}.`,
      )
    return {
      status: 'resolved',
      actions: [
        {
          type: 'MATERIALIZE_CARD',
          instanceId: materializedId(state, entry.card.scryfallId),
          card: entry.card,
          fromZone: 'hand',
          toZone: 'graveyard',
        },
      ],
      description: `Descartar ${entry.name}`,
    }
  }
  if (command.type === 'ACTIVATE_ABILITY') {
    if (state.turnState.priority !== 'WINDOW_OPEN')
      return failure(
        'NO_PRIORITY',
        'No hay prioridad para activar una habilidad.',
      )
    const name = resolveActivatedName(
      state,
      command.cardQuery,
      command.abilityHint,
    )
    if (isResolvedError(name)) return name
    const sources = state.cards.filter((card) => {
      if (command.instanceId && card.instanceId !== command.instanceId)
        return false
      if (!instanceMatchesDeckName(state, card, name)) return false
      return effectiveAbilitiesForCard(state, card).some(
        (ability) =>
          ability.kind === 'ACTIVATED' &&
          (ability.activeZones?.length
            ? ability.activeZones.includes(card.zone)
            : card.zone === 'battlefield'),
      )
    })
    if (sources.length !== 1)
      return failure(
        sources.length ? 'AMBIGUOUS_CARD' : 'CARD_NOT_FOUND',
        `Necesito una única copia activable de ${name} en una zona válida.`,
      )
    const activeAbilities = effectiveAbilitiesForCard(state, sources[0]).filter(
      (ability): ability is ActivatedAbilityDefinition =>
        ability.kind === 'ACTIVATED' &&
        (ability.activeZones?.length
          ? ability.activeZones.includes(sources[0].zone)
          : sources[0].zone === 'battlefield'),
    )
    const abilities = command.abilityHint
      ? activeAbilities.filter((ability) =>
          activatedAbilityMatchesHint(ability, command.abilityHint!),
        )
      : activeAbilities
    if (!abilities.length) {
      const color =
        !command.abilityHint || command.abilityHint === 'MANA'
          ? basicLandManaColor(effectiveTypeLine(state, sources[0]))
          : undefined
      if (color) {
        if (sources[0].tapped)
          return failure('ALREADY_TAPPED', `${name} ya está girada.`)
        return {
          status: 'resolved',
          actions: [
            {
              type: 'TAP_CARD',
              instanceId: sources[0].instanceId,
              actorPlayerId: sources[0].controllerId ?? localPlayerIdOf(state),
            },
            {
              type: 'ADD_MANA',
              color,
              amount: 1,
              actorPlayerId: sources[0].controllerId ?? localPlayerIdOf(state),
            },
          ],
          description: `Activar ${name} para ${color}`,
        }
      }
      return failure(
        'CARD_NOT_FOUND',
        command.abilityHint
          ? `${name} no tiene una habilidad ${command.abilityHint.toLocaleLowerCase()} activa y soportada.`
          : `${name} no tiene una habilidad activada soportada.`,
      )
    }
    if (abilities.length === 1) {
      const activationFailure = activationCommandFailure(
        state,
        sources[0],
        abilities[0],
      )
      if (activationFailure) return activationFailure
    }
    return {
      status: 'resolved',
      actions: [
        {
          type: 'ACTIVATE_ABILITY',
          instanceId: sources[0].instanceId,
          ...(abilities.length === 1 ? { abilityId: abilities[0].id } : {}),
        },
      ],
      description: `Activar ${name}`,
    }
  }
  if (command.type === 'ACTIVATE_MANA') {
    if (state.turnState.priority !== 'WINDOW_OPEN')
      return failure(
        'NO_PRIORITY',
        'No hay prioridad para activar una habilidad de maná.',
      )
    const name = resolveName(state, command.cardQuery)
    if (isResolvedError(name)) return name
    const sources = state.cards.filter((card) => {
      if (command.instanceId && card.instanceId !== command.instanceId)
        return false
      if (!instanceMatchesDeckName(state, card, name)) return false
      return card.zone === 'battlefield' && !card.phasedOut
    })
    if (sources.length !== 1)
      return failure(
        sources.length ? 'AMBIGUOUS_CARD' : 'CARD_NOT_FOUND',
        `Necesito una única copia de ${name} en el campo de batalla.`,
      )
    const source = sources[0]
    const requested = command.colorQuery
      ? manaColorAliases[normalizeCommandText(command.colorQuery)]
      : undefined

    const manaAbilities = effectiveAbilitiesForCard(state, source).filter(
      (ability): ability is ActivatedAbilityDefinition =>
        ability.kind === 'ACTIVATED' &&
        ability.isManaAbility === true &&
        (ability.activeZones?.length
          ? ability.activeZones.includes(source.zone)
          : source.zone === 'battlefield') &&
        resolveActivatedAbility(state, source.instanceId, ability).ok,
    )
    const matchingManaAbilities = requested
      ? manaAbilities.filter((ability) =>
          manaAbilityColors(state, source.instanceId, ability).has(requested),
        )
      : manaAbilities

    if (matchingManaAbilities.length === 1)
      return {
        status: 'resolved',
        actions: [
          {
            type: 'ACTIVATE_ABILITY',
            instanceId: source.instanceId,
            abilityId: matchingManaAbilities[0].id,
          },
        ],
        description: requested
          ? `Activar ${name} para maná ${requested}`
          : `Activar habilidad de maná de ${name}`,
      }
    if (matchingManaAbilities.length > 1)
      return failure(
        'AMBIGUOUS_MANA_PAYMENT',
        `${name} tiene varias habilidades de maná compatibles; especifica la habilidad.`,
      )

    const basicColor = basicLandManaColor(effectiveTypeLine(state, source))
    if (!basicColor)
      return failure(
        requested ? 'INVALID_AMOUNT' : 'CARD_NOT_FOUND',
        requested
          ? `${name} no puede producir maná ${requested} mediante una habilidad disponible.`
          : `${name} no tiene una habilidad de maná disponible.`,
      )
    if (source.tapped)
      return failure('ALREADY_TAPPED', `${name} ya está girada.`)
    if (requested && requested !== basicColor)
      return failure(
        'INVALID_AMOUNT',
        `${name} no puede producir maná ${requested}.`,
      )
    return {
      status: 'resolved',
      actions: [
        {
          type: 'TAP_CARD',
          instanceId: source.instanceId,
          actorPlayerId: source.controllerId ?? localPlayerIdOf(state),
        },
        {
          type: 'ADD_MANA',
          color: basicColor,
          amount: 1,
          actorPlayerId: source.controllerId ?? localPlayerIdOf(state),
        },
      ],
      description: `Activar ${name} para ${basicColor}`,
    }
  }
  const name = resolveKnownPublicName(state, command.cardQuery, ['battlefield'])
  if (isResolvedError(name)) return name
  const targets = targetsFor(
    state,
    name,
    command.indexes,
    command.count,
    command.type === 'TAP_CARD' ? false : true,
    command.actorPlayerId ?? localPlayerIdOf(state),
    command.instanceId,
  )
  if (isTargetError(targets)) return targets
  if (command.type === 'TAP_CARD') {
    const actions: GameAction[] = []
    for (const card of targets.cards) {
      const tapAbilities = activeActivatedAbilitiesForSource(
        state,
        card,
      ).filter((ability) =>
        ability.costs.some((cost) => cost.type === 'TAP_SOURCE'),
      )
      if (tapAbilities.length === 1) {
        const activationFailure = activationCommandFailure(
          state,
          card,
          tapAbilities[0],
        )
        if (activationFailure) return activationFailure
        actions.push({
          type: 'ACTIVATE_ABILITY',
          instanceId: card.instanceId,
          abilityId: tapAbilities[0].id,
        })
        continue
      }
      if (tapAbilities.length > 1) {
        actions.push({ type: 'ACTIVATE_ABILITY', instanceId: card.instanceId })
        continue
      }
      const basicColor = basicLandManaColor(effectiveTypeLine(state, card))
      if (basicColor) {
        const actorPlayerId = card.controllerId ?? activePlayerIdOf(state)
        actions.push(
          { type: 'TAP_CARD', instanceId: card.instanceId, actorPlayerId },
          actorPlayerId === localPlayerIdOf(state)
            ? { type: 'ADD_MANA', color: basicColor, amount: 1, actorPlayerId }
            : {
                type: 'ADD_PLAYER_MANA',
                playerId: actorPlayerId,
                color: basicColor,
                amount: 1,
                actorPlayerId,
              },
        )
        continue
      }
      return failure(
        'INVALID_TIMING',
        `${card.card.name} no tiene una habilidad activada soportada cuyo coste sea girarla.`,
      )
    }
    return {
      status: 'resolved',
      actions,
      description: `Activar al girar ${targets.cards
        .map((card) =>
          getVisualCardLabel(
            card,
            state.cards.filter(
              (candidate) =>
                candidate.zone === 'battlefield' &&
                candidate.card.name === card.card.name,
            ),
          ),
        )
        .join(', ')}`,
    }
  }
  return {
    status: 'resolved',
    actions: targets.cards.map((card) => ({
      type: 'UNTAP_CARD' as const,
      instanceId: card.instanceId,
    })),
    description: `UNTAP_CARD ${targets.cards
      .map((card) =>
        getVisualCardLabel(
          card,
          state.cards.filter(
            (candidate) =>
              candidate.zone === 'battlefield' &&
              candidate.card.name === card.card.name,
          ),
        ),
      )
      .join(', ')}`,
  }
}
