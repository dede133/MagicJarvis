import { isPresentPermanent } from '../../rules/phasing/phasingRules'
import {
  combinedCommanderColorIdentity,
  isCommanderInstance,
} from '../../rules/commander/commanderRules'
import {
  activePlayerIdOf,
  localPlayerIdOf,
} from '../../rules/players/playerState'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import { hasPrintedKeywordAbility } from '../../rules/combat/keywords'
import type {
  StaticAbilityDefinition,
  StaticEffectDefinition,
  StaticObjectFilter,
  BlockingRestriction,
  PlayerReference,
  RuntimeTextReference,
  StaticCondition,
} from '../types/abilityTypes'
import type { CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import type { CombatAttacker } from '../../types/combat'
import type { ValueExpression } from '../types/abilityTypes'
import {
  copiableCardDefinitionFromParts,
  effectiveCardDefinition,
  effectiveCardInstance,
  effectiveCopiableKeywords,
} from '../../rules/copy/copyCharacteristics'

export type ActiveStaticEffect = StaticEffectDefinition & {
  sourceInstanceId: string
  sourceCardName: string
}

/** Derived view only: battlefield remains the source of truth for passives. */
export type ActiveStaticEffects = {
  costModifiers: Array<Extract<ActiveStaticEffect, { type: 'MODIFY_COST' }>>
  castRestrictions?: Array<
    Extract<ActiveStaticEffect, { type: 'CAST_RESTRICTION' }>
  >
  drawLimits?: Array<Extract<ActiveStaticEffect, { type: 'DRAW_LIMIT' }>>
  enterTappedModifiers?: Array<
    Extract<ActiveStaticEffect, { type: 'ENTERS_TAPPED_FILTER' }>
  >
  attackTaxes?: Array<Extract<ActiveStaticEffect, { type: 'ATTACK_TAX' }>>
  blockTaxes?: Array<Extract<ActiveStaticEffect, { type: 'BLOCK_TAX' }>>
  combatRestrictions?: Array<
    Extract<ActiveStaticEffect, { type: 'COMBAT_RESTRICTION' }>
  >
  untapRestrictionModifiers?: Array<
    Extract<ActiveStaticEffect, { type: 'UNTAP_RESTRICTION' }>
  >
  extraUntapModifiers?: Array<
    Extract<ActiveStaticEffect, { type: 'UNTAP_DURING_EACH_PLAYERS_UNTAP' }>
  >
  powerToughnessModifiers: Array<
    Extract<ActiveStaticEffect, { type: 'MODIFY_POWER_TOUGHNESS' }>
  >
  keywordGrants: Array<Extract<ActiveStaticEffect, { type: 'GRANT_KEYWORD' }>>
  wardModifiers: Array<Extract<ActiveStaticEffect, { type: 'WARD' }>>
  protectionModifiers: Array<
    Extract<ActiveStaticEffect, { type: 'PROTECTION_FROM_COLORS' }>
  >
  protectionCardTypeModifiers: Array<
    Extract<ActiveStaticEffect, { type: 'PROTECTION_FROM_CARD_TYPES' }>
  >
  protectionEverythingModifiers: Array<
    Extract<ActiveStaticEffect, { type: 'PROTECTION_FROM_EVERYTHING' }>
  >
  basePowerToughnessSetters: Array<
    Extract<ActiveStaticEffect, { type: 'SET_BASE_POWER_TOUGHNESS' }>
  >
  characteristicModifiers: Array<
    Extract<
      ActiveStaticEffect,
      {
        type:
          | 'ADD_CARD_TYPE'
          | 'REMOVE_CARD_TYPE'
          | 'SET_CREATURE_SUBTYPES'
          | 'ADD_CREATURE_SUBTYPE'
          | 'SET_NAME'
          | 'LOSE_ALL_ABILITIES'
          | 'GRANT_ACTIVATED_ABILITY'
          | 'GRANT_TRIGGERED_ABILITY'
      }
    >
  >
  damagePreventionModifiers: Array<
    Extract<ActiveStaticEffect, { type: 'PREVENT_ALL_DAMAGE' }>
  >
  targetingCostModifiers: Array<
    Extract<ActiveStaticEffect, { type: 'MODIFY_TARGETING_COST' }>
  >
  typeModifiers: Array<
    Extract<ActiveStaticEffect, { type: 'SET_LAND_SUBTYPE' }>
  >
  otherSupported: []
  blockingRestrictions?: Array<
    BlockingRestriction & { sourceInstanceId: string; sourceCardName: string }
  >
  maxHandSizeModifiers?: Array<{
    player: PlayerReference
    value: number | 'UNLIMITED'
    sourceInstanceId: string
    sourceCardName: string
  }>
  castFromLibraryTopPermissions?: Array<{
    filter: StaticObjectFilter
    sourceInstanceId: string
    sourceCardName: string
  }>
  tokenReplacementModifiers?: Array<{
    optional: boolean
    sourceInstanceId: string
    sourceCardName: string
  }>
  knownCards?: CardInstance[]
  temporaryContinuousEffects?: GameState['temporaryContinuousEffects']
  temporaryCharacteristicEffects?: GameState['temporaryCharacteristicEffects']
  temporaryProtectionEffects?: GameState['temporaryProtectionEffects']
  typeContinuousEffects?: GameState['typeContinuousEffects']
  copyContinuousEffects?: GameState['copyContinuousEffects']
  state?: GameState
}

export const deriveActiveStaticEffects = (
  state: GameState,
  getAbilities: typeof getAbilitiesForCard = getAbilitiesForCard,
): ActiveStaticEffects => {
  const battlefield = state.cards.filter(isPresentPermanent)
  const rawStatic: ActiveStaticEffect[] = battlefield.flatMap((source) => {
    const effectiveSource = effectiveCardInstance(state, source)
    const abilities = getAbilities(effectiveSource.card)
    return abilities
      .filter(
        (ability): ability is StaticAbilityDefinition =>
          ability.kind === 'STATIC',
      )
      .flatMap((ability) =>
        ability.effects.map((effect) => ({
          ...effect,
          sourceInstanceId: source.instanceId,
          sourceCardName: effectiveSource.card.name,
        })),
      )
  })
  const losesAbilities = (source: CardInstance): boolean => {
    const losesFromCharacteristic = rawStatic.some((effect) => {
      if (effect.type !== 'LOSE_ALL_ABILITIES') return false
      const effectSource = battlefield.find(
        (card) => card.instanceId === effect.sourceInstanceId,
      )
      return (
        matchesStaticFilter(
          source,
          effect.filter,
          effect.sourceInstanceId,
          effectSource,
          state,
        ) && staticConditionMatchesBase(state, effectSource, effect.condition)
      )
    })
    if (losesFromCharacteristic) return true
    if (
      (state.temporaryCharacteristicEffects ?? []).some(
        (effect) =>
          effect.targetInstanceId === source.instanceId &&
          effect.loseAllAbilities,
      )
    )
      return true
    if (!/\bland\b/i.test(effectiveCardDefinition(state, source).typeLine))
      return false
    if (
      (state.typeContinuousEffects ?? []).some(
        (effect) =>
          effect.targetInstanceId === source.instanceId &&
          effect.mode === 'SET' &&
          (effect.duration !== 'WHILE_COUNTER_PRESENT' ||
            Boolean(
              effect.counterType &&
              (source.counters[effect.counterType] ?? 0) > 0,
            )),
      )
    )
      return true
    return rawStatic.some(
      (effect) =>
        effect.type === 'SET_LAND_SUBTYPE' &&
        effect.sourceInstanceId !== source.instanceId &&
        matchesStaticFilter(
          source,
          effect.filter,
          effect.sourceInstanceId,
          battlefield.find(
            (card) => card.instanceId === effect.sourceInstanceId,
          ),
          state,
        ),
    )
  }
  const active: ActiveStaticEffect[] = rawStatic.filter((effect) => {
    const source = battlefield.find(
      (card) => card.instanceId === effect.sourceInstanceId,
    )
    return !source || !losesAbilities(source)
  })
  return {
    costModifiers: active.filter(
      (
        effect,
      ): effect is Extract<ActiveStaticEffect, { type: 'MODIFY_COST' }> =>
        effect.type === 'MODIFY_COST',
    ),
    castRestrictions: active.filter(
      (
        effect,
      ): effect is Extract<ActiveStaticEffect, { type: 'CAST_RESTRICTION' }> =>
        effect.type === 'CAST_RESTRICTION',
    ),
    drawLimits: active.filter(
      (effect): effect is Extract<ActiveStaticEffect, { type: 'DRAW_LIMIT' }> =>
        effect.type === 'DRAW_LIMIT',
    ),
    enterTappedModifiers: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        { type: 'ENTERS_TAPPED_FILTER' }
      > => effect.type === 'ENTERS_TAPPED_FILTER',
    ),
    attackTaxes: active.filter(
      (effect): effect is Extract<ActiveStaticEffect, { type: 'ATTACK_TAX' }> =>
        effect.type === 'ATTACK_TAX',
    ),
    blockTaxes: active.filter(
      (effect): effect is Extract<ActiveStaticEffect, { type: 'BLOCK_TAX' }> =>
        effect.type === 'BLOCK_TAX',
    ),
    combatRestrictions: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        { type: 'COMBAT_RESTRICTION' }
      > => effect.type === 'COMBAT_RESTRICTION',
    ),
    untapRestrictionModifiers: active.filter(
      (
        effect,
      ): effect is Extract<ActiveStaticEffect, { type: 'UNTAP_RESTRICTION' }> =>
        effect.type === 'UNTAP_RESTRICTION',
    ),
    extraUntapModifiers: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        { type: 'UNTAP_DURING_EACH_PLAYERS_UNTAP' }
      > => effect.type === 'UNTAP_DURING_EACH_PLAYERS_UNTAP',
    ),
    powerToughnessModifiers: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        { type: 'MODIFY_POWER_TOUGHNESS' }
      > => effect.type === 'MODIFY_POWER_TOUGHNESS',
    ),
    keywordGrants: active.filter(
      (
        effect,
      ): effect is Extract<ActiveStaticEffect, { type: 'GRANT_KEYWORD' }> =>
        effect.type === 'GRANT_KEYWORD',
    ),
    wardModifiers: active.filter(
      (effect): effect is Extract<ActiveStaticEffect, { type: 'WARD' }> =>
        effect.type === 'WARD',
    ),
    protectionModifiers: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        { type: 'PROTECTION_FROM_COLORS' }
      > => effect.type === 'PROTECTION_FROM_COLORS',
    ),
    protectionCardTypeModifiers: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        { type: 'PROTECTION_FROM_CARD_TYPES' }
      > => effect.type === 'PROTECTION_FROM_CARD_TYPES',
    ),
    protectionEverythingModifiers: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        { type: 'PROTECTION_FROM_EVERYTHING' }
      > => effect.type === 'PROTECTION_FROM_EVERYTHING',
    ),
    basePowerToughnessSetters: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        { type: 'SET_BASE_POWER_TOUGHNESS' }
      > => effect.type === 'SET_BASE_POWER_TOUGHNESS',
    ),
    characteristicModifiers: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        {
          type:
            | 'ADD_CARD_TYPE'
            | 'REMOVE_CARD_TYPE'
            | 'SET_CREATURE_SUBTYPES'
            | 'ADD_CREATURE_SUBTYPE'
            | 'SET_NAME'
            | 'LOSE_ALL_ABILITIES'
            | 'GRANT_ACTIVATED_ABILITY'
            | 'GRANT_TRIGGERED_ABILITY'
        }
      > =>
        effect.type === 'ADD_CARD_TYPE' ||
        effect.type === 'REMOVE_CARD_TYPE' ||
        effect.type === 'SET_CREATURE_SUBTYPES' ||
        effect.type === 'ADD_CREATURE_SUBTYPE' ||
        effect.type === 'SET_NAME' ||
        effect.type === 'LOSE_ALL_ABILITIES' ||
        effect.type === 'GRANT_ACTIVATED_ABILITY' ||
        effect.type === 'GRANT_TRIGGERED_ABILITY',
    ),
    damagePreventionModifiers: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        { type: 'PREVENT_ALL_DAMAGE' }
      > => effect.type === 'PREVENT_ALL_DAMAGE',
    ),
    targetingCostModifiers: active.filter(
      (
        effect,
      ): effect is Extract<
        ActiveStaticEffect,
        { type: 'MODIFY_TARGETING_COST' }
      > => effect.type === 'MODIFY_TARGETING_COST',
    ),
    typeModifiers: active.filter(
      (
        effect,
      ): effect is Extract<ActiveStaticEffect, { type: 'SET_LAND_SUBTYPE' }> =>
        effect.type === 'SET_LAND_SUBTYPE',
    ),
    otherSupported: [],
    blockingRestrictions: active.flatMap((effect) =>
      effect.type === 'BLOCKING_RESTRICTION'
        ? [
            {
              ...effect.restriction,
              sourceInstanceId: effect.sourceInstanceId,
              sourceCardName: effect.sourceCardName,
            },
          ]
        : [],
    ),
    castFromLibraryTopPermissions: active.flatMap((effect) =>
      effect.type === 'ALLOW_CAST_FROM_LIBRARY_TOP'
        ? [
            {
              filter: effect.filter,
              sourceInstanceId: effect.sourceInstanceId,
              sourceCardName: effect.sourceCardName,
            },
          ]
        : [],
    ),
    tokenReplacementModifiers: active.flatMap((effect) =>
      effect.type === 'REPLACE_FIRST_TOKEN_CREATION_WITH_ATTACHED_COPIES'
        ? [
            {
              optional: effect.optional,
              sourceInstanceId: effect.sourceInstanceId,
              sourceCardName: effect.sourceCardName,
            },
          ]
        : [],
    ),
    maxHandSizeModifiers: [
      ...active.flatMap((effect) =>
        effect.type === 'SET_MAX_HAND_SIZE'
          ? [
              {
                player: effect.player,
                value: effect.value,
                sourceInstanceId: effect.sourceInstanceId,
                sourceCardName: effect.sourceCardName,
              },
            ]
          : [],
      ),
      ...(state.maxHandSizeOverride !== undefined
        ? [
            {
              player: 'SOURCE_CONTROLLER' as const,
              value: state.maxHandSizeOverride,
              sourceInstanceId: 'game-rule',
              sourceCardName: 'Persistent game effect',
            },
          ]
        : []),
    ],
    knownCards: state.cards,
    temporaryContinuousEffects: state.temporaryContinuousEffects,
    temporaryCharacteristicEffects: state.temporaryCharacteristicEffects,
    temporaryProtectionEffects: state.temporaryProtectionEffects,
    typeContinuousEffects: state.typeContinuousEffects,
    copyContinuousEffects: state.copyContinuousEffects,
    state,
  }
}

const resolveStaticTextReference = (
  value: RuntimeTextReference,
  source?: CardInstance,
): string | undefined => {
  if (typeof value === 'string') return value
  if (value.type === 'SOURCE_VALUE') {
    const stored = source?.runtimeValues?.[value.key]
    return typeof stored === 'string' ? stored : undefined
  }
  return undefined
}

export const matchesStaticFilter = (
  card: CardInstance,
  filter: StaticObjectFilter,
  sourceInstanceId?: string,
  source?: CardInstance,
  state?: GameState,
): boolean => {
  if (filter.sourceOnly && card.instanceId !== sourceInstanceId) return false
  if (filter.excludeSource && card.instanceId === sourceInstanceId) return false
  if (
    filter.attachedToSource &&
    source?.attachedToInstanceId !== card.instanceId
  )
    return false
  const definition = state ? effectiveCardDefinition(state, card) : card.card
  const typeLine = definition.typeLine.toLocaleLowerCase()
  if (filter.nonbasicLand) {
    if (
      !/\bland\b/i.test(definition.typeLine) ||
      /\bbasic\b/i.test(definition.typeLine)
    )
      return false
  }
  if (
    filter.cardType &&
    !typeLine.includes(filter.cardType.toLocaleLowerCase())
  )
    return false
  if (
    filter.excludeCardType &&
    typeLine.includes(filter.excludeCardType.toLocaleLowerCase())
  )
    return false
  if (filter.subtype) {
    const subtype = resolveStaticTextReference(filter.subtype, source)
    if (!subtype || !typeLine.includes(subtype.toLocaleLowerCase()))
      return false
  }
  if (filter.excludeSubtype) {
    const subtype = resolveStaticTextReference(filter.excludeSubtype, source)
    if (subtype && typeLine.includes(subtype.toLocaleLowerCase())) return false
  }
  if (
    filter.subtypesAnyOf?.length &&
    !filter.subtypesAnyOf.some((entry) => {
      const subtype = resolveStaticTextReference(entry, source)
      return Boolean(subtype && typeLine.includes(subtype.toLocaleLowerCase()))
    })
  )
    return false
  if (
    filter.isCommander !== undefined &&
    filter.isCommander !==
      Boolean(state && isCommanderInstance(state, card.instanceId))
  )
    return false
  if (filter.hasCounterType) {
    const count = card.counters[filter.hasCounterType] ?? 0
    if (count < (filter.counterCountAtLeast ?? 1)) return false
  }
  if (
    filter.colors?.some((color) => !definition.colors.includes(color)) ||
    filter.excludeColors?.some((color) => definition.colors.includes(color))
  )
    return false
  if (
    filter.hasKeyword &&
    !(card.keywords as string[] | undefined)?.some(
      (keyword) =>
        keyword.toLocaleLowerCase() === filter.hasKeyword?.toLocaleLowerCase(),
    ) &&
    !hasPrintedKeywordAbility(card, filter.hasKeyword)
  )
    return false
  if (filter.controller) {
    const sourceControllerId =
      source?.controllerId ??
      (source?.controller === 'OPPONENT' ? 'player-2' : 'player-1')
    const cardControllerId =
      card.controllerId ??
      (card.controller === 'OPPONENT' ? 'player-2' : 'player-1')
    if (filter.controller === 'YOU' && cardControllerId !== sourceControllerId)
      return false
    if (
      filter.controller === 'OPPONENT' &&
      cardControllerId === sourceControllerId
    )
      return false
  }
  if (filter.owner) {
    const sourceControllerId =
      source?.controllerId ??
      (source?.controller === 'OPPONENT' ? 'player-2' : 'player-1')
    const cardOwnerId =
      card.ownerId ??
      card.controllerId ??
      (card.controller === 'OPPONENT' ? 'player-2' : 'player-1')
    if (filter.owner === 'YOU' && cardOwnerId !== sourceControllerId)
      return false
    if (filter.owner === 'OPPONENT' && cardOwnerId === sourceControllerId)
      return false
  }
  return true
}

export const landLosesAbilitiesToBasicType = (
  state: GameState,
  card: CardInstance,
  getAbilities: typeof getAbilitiesForCard = getAbilitiesForCard,
): boolean => {
  if (
    card.zone !== 'battlefield' ||
    !/\bland\b/i.test(effectiveCardDefinition(state, card).typeLine)
  )
    return false
  if (
    (state.typeContinuousEffects ?? []).some(
      (effect) =>
        effect.targetInstanceId === card.instanceId &&
        effect.mode === 'SET' &&
        (effect.duration !== 'WHILE_COUNTER_PRESENT' ||
          Boolean(
            effect.counterType && (card.counters[effect.counterType] ?? 0) > 0,
          )),
    )
  )
    return true
  return state.cards
    .filter(
      (source) =>
        source.zone === 'battlefield' && source.instanceId !== card.instanceId,
    )
    .some((source) =>
      getAbilities(effectiveCardDefinition(state, source))
        .filter(
          (ability): ability is StaticAbilityDefinition =>
            ability.kind === 'STATIC',
        )
        .flatMap((ability) => ability.effects)
        .some(
          (effect) =>
            effect.type === 'SET_LAND_SUBTYPE' &&
            matchesStaticFilter(
              card,
              effect.filter,
              source.instanceId,
              source,
              state,
            ),
        ),
    )
}

const withLandSubtype = (
  typeLine: string,
  subtype: string,
  mode: 'ADD' | 'SET',
): string => {
  const [main, rawSubtypes = ''] = typeLine.split(/\s+[—-]\s+/, 2)
  if (!/\bland\b/i.test(main)) return typeLine
  if (mode === 'SET') return `${main} — ${subtype}`
  const subtypes = rawSubtypes.split(/\s+/).filter(Boolean)
  if (
    !subtypes.some(
      (item) => item.toLocaleLowerCase() === subtype.toLocaleLowerCase(),
    )
  )
    subtypes.push(subtype)
  return subtypes.length ? `${main} — ${subtypes.join(' ')}` : main
}

const splitTypeLine = (
  typeLine: string,
): { main: string; subtypes: string[] } => {
  const [main, rawSubtypes = ''] = typeLine.split(/\s+[—-]\s+/, 2)
  return { main, subtypes: rawSubtypes.split(/\s+/).filter(Boolean) }
}

const addCardType = (typeLine: string, cardType: string): string => {
  const { main, subtypes } = splitTypeLine(typeLine)
  if (new RegExp(`\\b${cardType}\\b`, 'i').test(main)) return typeLine
  const nextMain = `${main} ${cardType}`.replace(/\s+/g, ' ').trim()
  return subtypes.length ? `${nextMain} — ${subtypes.join(' ')}` : nextMain
}

const removeCardType = (typeLine: string, cardType: string): string => {
  const { main, subtypes } = splitTypeLine(typeLine)
  const nextMain = main
    .replace(new RegExp(`\\b${cardType}\\b`, 'gi'), '')
    .replace(/\s+/g, ' ')
    .trim()
  return subtypes.length ? `${nextMain} — ${subtypes.join(' ')}` : nextMain
}

const setCreatureSubtypes = (typeLine: string, subtypes: string[]): string => {
  const { main } = splitTypeLine(typeLine)
  if (!/\bcreature\b/i.test(main)) return typeLine
  return subtypes.length ? `${main} — ${subtypes.join(' ')}` : main
}

const addCreatureSubtype = (typeLine: string, subtype: string): string => {
  const { main, subtypes } = splitTypeLine(typeLine)
  if (!/\bcreature\b/i.test(main)) return typeLine
  if (
    !subtypes.some(
      (item) => item.toLocaleLowerCase() === subtype.toLocaleLowerCase(),
    )
  )
    subtypes.push(subtype)
  return subtypes.length ? `${main} — ${subtypes.join(' ')}` : main
}

const effectiveTypeLineFromActive = (
  state: GameState,
  card: CardInstance,
  active: ActiveStaticEffects,
): string => {
  const copied = copiableCardDefinitionFromParts(
    state.cards,
    state.copyContinuousEffects ?? active.copyContinuousEffects ?? [],
    card,
  )
  if (card.zone !== 'battlefield') return copied.typeLine
  let line = copied.typeLine
  for (const modifier of active.characteristicModifiers) {
    if (
      modifier.type !== 'ADD_CARD_TYPE' &&
      modifier.type !== 'REMOVE_CARD_TYPE' &&
      modifier.type !== 'SET_CREATURE_SUBTYPES' &&
      modifier.type !== 'ADD_CREATURE_SUBTYPE'
    )
      continue
    const source = state.cards.find(
      (item) => item.instanceId === modifier.sourceInstanceId,
    )
    if (
      !matchesStaticFilter(
        card,
        modifier.filter,
        modifier.sourceInstanceId,
        source,
        state,
      ) ||
      !staticConditionMatchesBase(state, source, modifier.condition)
    )
      continue
    if (modifier.type === 'ADD_CARD_TYPE')
      line = addCardType(line, modifier.cardType)
    else if (modifier.type === 'REMOVE_CARD_TYPE')
      line = removeCardType(line, modifier.cardType)
    else if (modifier.type === 'SET_CREATURE_SUBTYPES')
      line = setCreatureSubtypes(line, modifier.subtypes)
    else {
      const subtype = resolveStaticTextReference(modifier.subtype, source)
      if (subtype) line = addCreatureSubtype(line, subtype)
    }
  }
  for (const modifier of active.typeModifiers) {
    const source = state.cards.find(
      (item) => item.instanceId === modifier.sourceInstanceId,
    )
    if (
      matchesStaticFilter(
        card,
        modifier.filter,
        modifier.sourceInstanceId,
        source,
        state,
      )
    )
      line = withLandSubtype(line, modifier.subtype, 'SET')
  }
  for (const modifier of state.typeContinuousEffects ??
    active.typeContinuousEffects ??
    []) {
    if (modifier.targetInstanceId !== card.instanceId) continue
    if (
      modifier.duration === 'WHILE_COUNTER_PRESENT' &&
      (!modifier.counterType || (card.counters[modifier.counterType] ?? 0) <= 0)
    )
      continue
    line = withLandSubtype(line, modifier.landSubtype, modifier.mode)
  }
  for (const modifier of state.temporaryCharacteristicEffects ??
    active.temporaryCharacteristicEffects ??
    []) {
    if (modifier.targetInstanceId !== card.instanceId) continue
    for (const type of modifier.removeCardTypes ?? [])
      line = removeCardType(line, type)
    for (const type of modifier.addCardTypes ?? [])
      line = addCardType(line, type)
    if (modifier.setCreatureSubtypes)
      line = setCreatureSubtypes(line, modifier.setCreatureSubtypes)
    for (const subtype of modifier.addCreatureSubtypes ?? [])
      line = addCreatureSubtype(line, subtype)
  }
  return line
}

/** Type line after currently-supported continuous land-type effects. */
export const effectiveTypeLine = (
  state: GameState,
  card: CardInstance,
): string =>
  effectiveTypeLineFromActive(state, card, deriveActiveStaticEffects(state))

export const effectiveCreatureSubtypes = (
  state: GameState,
  card: CardInstance,
): string[] => {
  const line = effectiveTypeLine(state, card)
  const separator = line.includes('—')
    ? '—'
    : line.includes(' - ')
      ? ' - '
      : undefined
  if (!separator) return []
  return line
    .split(separator, 2)[1]
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => value.toLocaleLowerCase())
}

const controllerIdForStaticSource = (
  state: GameState,
  source: CardInstance,
): string =>
  source.controllerId ??
  (source.controller === 'OPPONENT'
    ? (state.turnOrder.find((id) => id !== state.localPlayerId) ?? 'player-2')
    : (state.localPlayerId ?? 'player-1'))

const staticConditionMatchesBase = (
  state: GameState,
  source: CardInstance | undefined,
  condition: StaticCondition | undefined,
): boolean => {
  if (!condition) return true
  if (!source) return false
  const sourceControllerId = controllerIdForStaticSource(state, source)
  if (condition.type === 'SOURCE_CONTROLLER_LIFE_AT_LEAST')
    return (
      (state.players.find((player) => player.id === sourceControllerId)?.life ??
        0) >= condition.value
    )
  if (condition.type === 'DEVOTION_COMPARE') {
    const devotion = state.cards
      .filter(
        (candidate) =>
          isPresentPermanent(candidate) &&
          (candidate.controllerId ??
            (candidate.controller === 'OPPONENT'
              ? (state.turnOrder.find((id) => id !== state.localPlayerId) ??
                'player-2')
              : (state.localPlayerId ?? 'player-1'))) === sourceControllerId,
      )
      .reduce((sum, candidate) => {
        const cost = effectiveCardDefinition(state, candidate).manaCost ?? ''
        const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map(
          (match) => match[1],
        )
        return (
          sum +
          symbols.filter((symbol) =>
            symbol.split('/').includes(condition.color),
          ).length
        )
      }, 0)
    return condition.operator === 'LT'
      ? devotion < condition.value
      : devotion >= condition.value
  }
  if (condition.type === 'SOURCE_IS_UNTAPPED') return !source.tapped
  if (condition.type === 'SOURCE_CONTROLLER_IS_ACTIVE_PLAYER')
    return sourceControllerId === activePlayerIdOf(state)
  if (condition.type === 'PERMANENT_ENTERED_THIS_TURN') {
    const query = condition.query
    return (state.permanentsEnteredThisTurn ?? []).some((entry) => {
      if (entry.playerId !== sourceControllerId) return false
      const lowerTypes = entry.cardTypes.map((item) => item.toLocaleLowerCase())
      const lowerSubtypes = entry.subtypes.map((item) =>
        item.toLocaleLowerCase(),
      )
      if (
        query.cardTypes?.some(
          (type) => !lowerTypes.includes(type.toLocaleLowerCase()),
        )
      )
        return false
      if (
        query.cardTypesAnyOf?.length &&
        !query.cardTypesAnyOf.some((type) =>
          lowerTypes.includes(type.toLocaleLowerCase()),
        )
      )
        return false
      if (
        query.subtypes?.some((subtype) => {
          const value = typeof subtype === 'string' ? subtype : undefined
          return !value || !lowerSubtypes.includes(value.toLocaleLowerCase())
        })
      )
        return false
      if (
        query.subtypesAnyOf?.length &&
        !query.subtypesAnyOf.some((subtype) => {
          const value = typeof subtype === 'string' ? subtype : undefined
          return Boolean(
            value && lowerSubtypes.includes(value.toLocaleLowerCase()),
          )
        })
      )
        return false
      return true
    })
  }
  if (condition.type === 'ATTACKED_WITH_CREATURES_AT_LEAST')
    return (
      (state.creaturesAttackedThisTurnByPlayer?.[sourceControllerId]?.length ??
        0) >= condition.count
    )
  if (condition.type === 'CONTROL_COUNT_AT_LEAST') {
    const query = condition.query
    const count = state.cards.filter((candidate) => {
      if (query.zones && !query.zones.includes(candidate.zone)) return false
      const candidateControllerId =
        candidate.controllerId ??
        (candidate.controller === 'OPPONENT'
          ? (state.turnOrder.find((id) => id !== state.localPlayerId) ??
            'player-2')
          : (state.localPlayerId ?? 'player-1'))
      if (
        query.controller === 'SOURCE_CONTROLLER' &&
        candidateControllerId !== sourceControllerId
      )
        return false
      if (query.excludeSource && candidate.instanceId === source.instanceId)
        return false
      const line = effectiveCardDefinition(
        state,
        candidate,
      ).typeLine.toLocaleLowerCase()
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
        query.subtypes?.some((subtype) => {
          const value =
            typeof subtype === 'string'
              ? subtype
              : subtype.type === 'SOURCE_VALUE'
                ? source.runtimeValues?.[subtype.key]
                : undefined
          return (
            typeof value !== 'string' ||
            !line.includes(value.toLocaleLowerCase())
          )
        })
      )
        return false
      if (
        query.subtypesAnyOf?.length &&
        !query.subtypesAnyOf.some((subtype) => {
          const value = typeof subtype === 'string' ? subtype : undefined
          return Boolean(value && line.includes(value.toLocaleLowerCase()))
        })
      )
        return false
      if (query.historic !== undefined) {
        const historic = /\bartifact\b|\blegendary\b|\bsaga\b/i.test(line)
        if (historic !== query.historic) return false
      }
      if (query.hasAnyCounters !== undefined) {
        const hasAny = Object.values(candidate.counters).some(
          (amount) => amount > 0,
        )
        if (hasAny !== query.hasAnyCounters) return false
      }
      if (query.hasCounterType) {
        if (
          (candidate.counters[query.hasCounterType] ?? 0) <
          (query.counterCountAtLeast ?? 1)
        )
          return false
      }
      return true
    }).length
    return count >= condition.count
  }
  return false
}

export const effectiveCardName = (
  state: GameState,
  card: CardInstance,
): string => {
  const active = deriveActiveStaticEffects(state)
  let name = effectiveCardDefinition(state, card).name
  if (card.zone === 'battlefield') {
    for (const modifier of active.characteristicModifiers) {
      if (modifier.type !== 'SET_NAME') continue
      const source = state.cards.find(
        (item) => item.instanceId === modifier.sourceInstanceId,
      )
      if (
        matchesStaticFilter(
          card,
          modifier.filter,
          modifier.sourceInstanceId,
          source,
          state,
        ) &&
        staticConditionMatchesBase(state, source, modifier.condition)
      )
        name = modifier.name
    }
    for (const modifier of state.temporaryCharacteristicEffects ?? [])
      if (modifier.targetInstanceId === card.instanceId && modifier.setName)
        name = modifier.setName
  }
  return name
}

export const losesAllAbilities = (
  state: GameState,
  card: CardInstance,
): boolean => {
  if (
    (state.temporaryCharacteristicEffects ?? []).some(
      (effect) =>
        effect.targetInstanceId === card.instanceId && effect.loseAllAbilities,
    )
  )
    return true
  const active = deriveActiveStaticEffects(state)
  return active.characteristicModifiers.some((modifier) => {
    if (modifier.type !== 'LOSE_ALL_ABILITIES') return false
    const source = state.cards.find(
      (item) => item.instanceId === modifier.sourceInstanceId,
    )
    return (
      matchesStaticFilter(
        card,
        modifier.filter,
        modifier.sourceInstanceId,
        source,
        state,
      ) && staticConditionMatchesBase(state, source, modifier.condition)
    )
  })
}

export const grantedActivatedAbilitiesFor = (
  state: GameState,
  card: CardInstance,
): import('../types/abilityTypes').ActivatedAbilityDefinition[] => {
  const active = deriveActiveStaticEffects(state)
  return active.characteristicModifiers.flatMap((modifier) => {
    if (modifier.type !== 'GRANT_ACTIVATED_ABILITY') return []
    const source = state.cards.find(
      (item) => item.instanceId === modifier.sourceInstanceId,
    )
    if (
      !matchesStaticFilter(
        card,
        modifier.filter,
        modifier.sourceInstanceId,
        source,
        state,
      ) ||
      !staticConditionMatchesBase(state, source, modifier.condition)
    )
      return []
    return [
      {
        ...modifier.ability,
        sourceCardName: effectiveCardName(state, card),
      },
    ]
  })
}

export const grantedTriggeredAbilitiesFor = (
  state: GameState,
  card: CardInstance,
): import('../types/abilityTypes').TriggeredAbilityDefinition[] => {
  const active = deriveActiveStaticEffects(state)
  return active.characteristicModifiers.flatMap((modifier) => {
    if (modifier.type !== 'GRANT_TRIGGERED_ABILITY') return []
    const source = state.cards.find(
      (item) => item.instanceId === modifier.sourceInstanceId,
    )
    if (
      !matchesStaticFilter(
        card,
        modifier.filter,
        modifier.sourceInstanceId,
        source,
        state,
      ) ||
      !staticConditionMatchesBase(state, source, modifier.condition)
    )
      return []
    return [
      {
        ...modifier.ability,
        id: `${modifier.ability.id}@grant:${modifier.sourceInstanceId}`,
        sourceCardName: effectiveCardName(state, card),
      },
    ]
  })
}

export const temporaryGrantedTriggeredAbilitiesFor = (
  state: GameState,
  card: CardInstance,
): import('../types/abilityTypes').TriggeredAbilityDefinition[] =>
  (state.temporaryGrantedTriggeredAbilities ?? [])
    .filter((entry) => entry.targetInstanceId === card.instanceId)
    .map((entry) => ({
      ...entry.ability,
      id: `${entry.ability.id}@temporary:${entry.id}`,
      sourceCardName: effectiveCardName(state, card),
    }))

export const effectiveAbilitiesForCard = (
  state: GameState,
  card: CardInstance,
): import('../types/abilityTypes').AbilityDefinition[] => {
  const printed = losesAllAbilities(state, card)
    ? []
    : getAbilitiesForCard(effectiveCardDefinition(state, card))
  return [
    ...printed,
    ...grantedActivatedAbilitiesFor(state, card),
    ...grantedTriggeredAbilitiesFor(state, card),
    ...temporaryGrantedTriggeredAbilitiesFor(state, card),
  ]
}

export const staticConditionMatches = (
  state: GameState,
  source: CardInstance | undefined,
  condition: StaticCondition | undefined,
): boolean => staticConditionMatchesBase(state, source, condition)

export const hasEffectiveKeyword = (
  state: GameState,
  card: CardInstance,
  keyword: string,
): boolean => {
  const normalized = keyword.toLocaleUpperCase()
  const losesPrintedAbilities = losesAllAbilities(state, card)
  if (
    !losesPrintedAbilities &&
    (effectiveCopiableKeywords(state, card) as string[] | undefined)?.some(
      (item) => item.toLocaleUpperCase() === normalized,
    )
  )
    return true
  if (
    !losesPrintedAbilities &&
    hasPrintedKeywordAbility(effectiveCardInstance(state, card), keyword)
  )
    return true
  const active = deriveActiveStaticEffects(state)
  const staticGrant = active.keywordGrants.some((grant) => {
    const source = state.cards.find(
      (item) => item.instanceId === grant.sourceInstanceId,
    )
    return (
      grant.keyword.toLocaleUpperCase() === normalized &&
      matchesStaticFilter(
        card,
        grant.filter,
        grant.sourceInstanceId,
        source,
        state,
      ) &&
      staticConditionMatches(state, source, grant.condition)
    )
  })
  if (staticGrant) return true
  return (state.temporaryContinuousEffects ?? []).some(
    (effect) =>
      effect.targetInstanceId === card.instanceId &&
      effect.grantKeywords?.some(
        (item) => item.toLocaleUpperCase() === normalized,
      ),
  )
}

/** @deprecated Prefer hasEffectiveKeyword for rules consumers. */
export const hasDerivedKeyword = hasEffectiveKeyword

export const wardCostsForTarget = (
  state: GameState,
  target: CardInstance,
  targetingControllerId: string,
): string[] => {
  const targetControllerId =
    target.controllerId ??
    (target.controller === 'OPPONENT'
      ? (state.turnOrder.find((id) => id !== state.localPlayerId) ?? 'player-2')
      : (state.localPlayerId ?? 'player-1'))
  if (targetControllerId === targetingControllerId) return []
  const active = deriveActiveStaticEffects(state)
  return active.wardModifiers.flatMap((ward) => {
    const source = state.cards.find(
      (card) => card.instanceId === ward.sourceInstanceId,
    )
    return matchesStaticFilter(
      target,
      ward.filter,
      ward.sourceInstanceId,
      source,
      state,
    ) && staticConditionMatchesBase(state, source, ward.condition)
      ? [ward.cost]
      : []
  })
}

export const combatRestrictionFor = (
  state: GameState,
  card: CardInstance,
): { cannotAttack: boolean; cannotBlock: boolean } => {
  const active = deriveActiveStaticEffects(state)
  let cannotAttack = false
  let cannotBlock = false
  for (const restriction of active.combatRestrictions ?? []) {
    const source = state.cards.find(
      (candidate) => candidate.instanceId === restriction.sourceInstanceId,
    )
    if (
      !matchesStaticFilter(
        card,
        restriction.filter,
        restriction.sourceInstanceId,
        source,
        state,
      )
    )
      continue
    if (restriction.rule !== 'CANNOT_BLOCK') cannotAttack = true
    if (restriction.rule !== 'CANNOT_ATTACK') cannotBlock = true
  }
  return { cannotAttack, cannotBlock }
}

export const hasStaticUntapRestriction = (
  state: GameState,
  card: CardInstance,
): boolean => {
  const active = deriveActiveStaticEffects(state)
  return (active.untapRestrictionModifiers ?? []).some((restriction) => {
    const source = state.cards.find(
      (candidate) => candidate.instanceId === restriction.sourceInstanceId,
    )
    return matchesStaticFilter(
      card,
      restriction.filter,
      restriction.sourceInstanceId,
      source,
      state,
    )
  })
}

export const untapsDuringOtherPlayersUntap = (
  state: GameState,
  card: CardInstance,
): boolean => {
  const active = deriveActiveStaticEffects(state)
  return (active.extraUntapModifiers ?? []).some((modifier) => {
    const source = state.cards.find(
      (candidate) => candidate.instanceId === modifier.sourceInstanceId,
    )
    return matchesStaticFilter(
      card,
      modifier.filter,
      modifier.sourceInstanceId,
      source,
      state,
    )
  })
}

export const protectionColorsFor = (
  state: GameState,
  target: CardInstance,
): import('../../types/card').ManaColor[] => {
  const active = deriveActiveStaticEffects(state)
  const commanderIdentity = combinedCommanderColorIdentity(
    state,
    target.controllerId ?? localPlayerIdOf(state),
  )
  const allColors: import('../../types/card').ManaColor[] = [
    'W',
    'U',
    'B',
    'R',
    'G',
  ]
  const fromStatic = active.protectionModifiers.flatMap((protection) => {
    const source = state.cards.find(
      (card) => card.instanceId === protection.sourceInstanceId,
    )
    if (
      !matchesStaticFilter(
        target,
        protection.filter,
        protection.sourceInstanceId,
        source,
        state,
      )
    )
      return []
    return Array.isArray(protection.colors)
      ? protection.colors
      : allColors.filter((color) => !commanderIdentity.includes(color))
  })
  const temporary = (state.temporaryProtectionEffects ?? [])
    .filter((effect) => effect.targetInstanceId === target.instanceId)
    .flatMap((effect) => effect.colors ?? [])
  return [...new Set([...fromStatic, ...temporary])]
}

export const protectionCardTypesFor = (
  state: GameState,
  target: CardInstance,
): string[] => {
  const active = deriveActiveStaticEffects(state)
  const fromStatic = active.protectionCardTypeModifiers.flatMap(
    (protection) => {
      const source = state.cards.find(
        (card) => card.instanceId === protection.sourceInstanceId,
      )
      return matchesStaticFilter(
        target,
        protection.filter,
        protection.sourceInstanceId,
        source,
        state,
      )
        ? protection.cardTypes
        : []
    },
  )
  const temporary = (state.temporaryProtectionEffects ?? [])
    .filter((effect) => effect.targetInstanceId === target.instanceId)
    .flatMap((effect) => effect.cardTypes ?? [])
  return [...new Set([...fromStatic, ...temporary])]
}

export const hasProtectionFromEverything = (
  state: GameState,
  target: CardInstance,
): boolean => {
  const active = deriveActiveStaticEffects(state)
  return (
    active.protectionEverythingModifiers.some((protection) => {
      const source = state.cards.find(
        (card) => card.instanceId === protection.sourceInstanceId,
      )
      return matchesStaticFilter(
        target,
        protection.filter,
        protection.sourceInstanceId,
        source,
        state,
      )
    }) ||
    (state.temporaryProtectionEffects ?? []).some(
      (effect) =>
        effect.targetInstanceId === target.instanceId &&
        effect.protectionFromEverything,
    )
  )
}

export const isProtectedFromSource = (
  state: GameState,
  target: CardInstance,
  source: CardInstance | undefined,
): boolean => {
  if (!source) return false
  if (hasProtectionFromEverything(state, target)) return true
  if (
    effectiveCardDefinition(state, source).colors.some((color) =>
      protectionColorsFor(state, target).includes(color),
    )
  )
    return true
  const sourceTypeLine = effectiveTypeLine(state, source).toLocaleLowerCase()
  return protectionCardTypesFor(state, target).some((type) =>
    sourceTypeLine.includes(type.toLocaleLowerCase()),
  )
}

export const preventedDamageAmountForPermanent = (
  state: GameState,
  target: CardInstance,
): number => {
  const active = deriveActiveStaticEffects(state)
  const preventAll = active.damagePreventionModifiers.some((modifier) => {
    const source = state.cards.find(
      (card) => card.instanceId === modifier.sourceInstanceId,
    )
    return (
      matchesStaticFilter(
        target,
        modifier.filter,
        modifier.sourceInstanceId,
        source,
        state,
      ) && staticConditionMatchesBase(state, source, modifier.condition)
    )
  })
  return preventAll ? Number.POSITIVE_INFINITY : 0
}

export const additionalTargetingCost = (
  state: GameState,
  target: CardInstance,
  sourceControllerId: string,
  kind: 'SPELL' | 'ACTIVATED_ABILITY',
): number => {
  const targetControllerId =
    target.controllerId ??
    (target.controller === 'OPPONENT'
      ? (state.turnOrder.find((id) => id !== state.localPlayerId) ?? 'player-2')
      : (state.localPlayerId ?? 'player-1'))
  if (targetControllerId === sourceControllerId) return 0
  const active = deriveActiveStaticEffects(state)
  return active.targetingCostModifiers.reduce((sum, modifier) => {
    if (modifier.appliesTo !== 'BOTH' && modifier.appliesTo !== kind) return sum
    const source = state.cards.find(
      (card) => card.instanceId === modifier.sourceInstanceId,
    )
    return matchesStaticFilter(
      target,
      modifier.targetFilter,
      modifier.sourceInstanceId,
      source,
      state,
    )
      ? sum + modifier.amount
      : sum
  }, 0)
}

export const canCastFromLibraryTop = (
  state: GameState,
  cardDefinition: CardInstance['card'],
): boolean => {
  const active = deriveActiveStaticEffects(state)
  const candidate: CardInstance = {
    instanceId: 'declared-library-top',
    card: cardDefinition,
    zone: 'library',
    tapped: false,
    counters: {},
    ownerId: state.localPlayerId ?? 'player-1',
    controllerId: state.localPlayerId ?? 'player-1',
    controller: 'YOU',
  }
  return (active.castFromLibraryTopPermissions ?? []).some((permission) => {
    const source = state.cards.find(
      (item) => item.instanceId === permission.sourceInstanceId,
    )
    return matchesStaticFilter(
      candidate,
      permission.filter,
      permission.sourceInstanceId,
      source,
      state,
    )
  })
}

export const entersBattlefieldTappedByStaticEffects = (
  stateBeforeEntry: GameState,
  entering: CardInstance,
): boolean => {
  const active = deriveActiveStaticEffects(stateBeforeEntry)
  return (active.enterTappedModifiers ?? []).some((modifier) => {
    const source = stateBeforeEntry.cards.find(
      (card) => card.instanceId === modifier.sourceInstanceId,
    )
    return Boolean(
      source &&
      matchesStaticFilter(
        entering,
        modifier.filter,
        modifier.sourceInstanceId,
        source,
        stateBeforeEntry,
      ),
    )
  })
}

export const attackTaxForDeclaration = (
  state: GameState,
  attackingPlayerId: string,
  attackers: Array<
    Pick<CombatAttacker, 'attackerInstanceId' | 'defendingTarget'>
  >,
): number => {
  const active = deriveActiveStaticEffects(state)
  return (active.attackTaxes ?? []).reduce((total, tax) => {
    const source = state.cards.find(
      (card) => card.instanceId === tax.sourceInstanceId,
    )
    if (!source) return total
    const defendingPlayerId = controllerIdForStaticSource(state, source)
    if (attackingPlayerId === defendingPlayerId) return total
    const taxedAttackers = attackers.filter((attacker) => {
      if (attacker.defendingTarget.kind !== 'PLAYER') return false
      const targetPlayerId =
        attacker.defendingTarget.playerId ?? attacker.defendingTarget.id
      return targetPlayerId === defendingPlayerId
    }).length
    return total + taxedAttackers * tax.genericPerAttacker
  }, 0)
}

export const blockTaxForDeclaration = (
  state: GameState,
  blockingPlayerId: string,
  blockers: Array<
    Pick<
      import('../../types/combat').CombatBlocker,
      'blockerInstanceId' | 'blocking'
    >
  >,
): number => {
  const active = deriveActiveStaticEffects(state)
  return (active.blockTaxes ?? []).reduce((total, tax) => {
    const source = state.cards.find(
      (card) => card.instanceId === tax.sourceInstanceId,
    )
    if (!source) return total
    const attackingPlayerId = controllerIdForStaticSource(state, source)
    if (blockingPlayerId === attackingPlayerId) return total
    const taxedBlockers = blockers.filter((blocker) =>
      blocker.blocking.some((attackerId) => {
        const attacker = state.cards.find(
          (card) => card.instanceId === attackerId,
        )
        return (
          attacker &&
          controllerIdForStaticSource(state, attacker) === attackingPlayerId
        )
      }),
    ).length
    return total + taxedBlockers * tax.genericPerBlocker
  }, 0)
}

export const castRestrictionViolation = (
  state: GameState,
  cardDefinition: CardInstance['card'],
  playerId: string = localPlayerIdOf(state),
): string | undefined => {
  const active = deriveActiveStaticEffects(state)
  const candidate: CardInstance = {
    instanceId: `declared-spell:${cardDefinition.scryfallId}`,
    card: cardDefinition,
    zone: 'stack',
    tapped: false,
    counters: {},
    ownerId: playerId,
    controllerId: playerId,
    controller: playerId === localPlayerIdOf(state) ? 'YOU' : 'OPPONENT',
  }
  for (const restriction of active.castRestrictions ?? []) {
    const source = state.cards.find(
      (item) => item.instanceId === restriction.sourceInstanceId,
    )
    if (
      !matchesStaticFilter(
        candidate,
        restriction.filter,
        restriction.sourceInstanceId,
        source,
        state,
      )
    )
      continue
    if (restriction.rule === 'MANA_VALUE_AT_MOST_LANDS_CONTROLLED') {
      const lands = state.cards.filter(
        (permanent) =>
          isPresentPermanent(permanent) &&
          (permanent.controllerId ??
            (permanent.controller === 'OPPONENT'
              ? 'player-2'
              : localPlayerIdOf(state))) === playerId &&
          /\bland\b/i.test(effectiveTypeLine(state, permanent)),
      ).length
      if (cardDefinition.cmc > lands)
        return `${cardDefinition.name} tiene valor de maná ${cardDefinition.cmc}, mayor que las ${lands} tierras que controla ese jugador.`
    }
  }
  return undefined
}

export const drawLimitForPlayer = (
  state: GameState,
  playerId: string,
): number | undefined => {
  const active = deriveActiveStaticEffects(state)
  const limits = (active.drawLimits ?? []).flatMap((modifier) => {
    const source = state.cards.find(
      (item) => item.instanceId === modifier.sourceInstanceId,
    )
    if (!source) return []
    const sourceControllerId = controllerIdForStaticSource(state, source)
    if (modifier.player === 'OPPONENT' && playerId === sourceControllerId)
      return []
    return [modifier.maxPerTurn]
  })
  return limits.length ? Math.min(...limits) : undefined
}

export const derivedMaxHandSize = (
  active: ActiveStaticEffects,
  defaultSize = 7,
  playerId?: string,
): number | 'UNLIMITED' => {
  if (!playerId)
    return active.maxHandSizeModifiers?.at(-1)?.value ?? defaultSize
  const modifier = active.maxHandSizeModifiers
    ?.filter((entry) => {
      if (entry.sourceInstanceId === 'game-rule')
        return playerId === active.state?.localPlayerId
      const source = active.knownCards?.find(
        (card) => card.instanceId === entry.sourceInstanceId,
      )
      if (!source) return false
      const sourcePlayerId =
        source.controllerId ??
        (source.controller === 'OPPONENT' ? 'player-2' : 'player-1')
      if (entry.player === 'SOURCE_CONTROLLER')
        return playerId === sourcePlayerId
      if (entry.player === 'ACTIVE_PLAYER')
        return playerId === active.state?.activePlayerId
      return false
    })
    .at(-1)
  return modifier?.value ?? defaultSize
}

export const modifiedPowerToughness = (
  card: CardInstance,
  active: ActiveStaticEffects,
): { power: number; toughness: number } | undefined => {
  const copied = copiableCardDefinitionFromParts(
    active.knownCards ?? [card],
    active.copyContinuousEffects ?? [],
    card,
  )
  let basePower = Number(copied.power)
  let baseToughness = Number(copied.toughness)
  if (!Number.isFinite(basePower) || !Number.isFinite(baseToughness)) {
    const state = active.state
    const effectiveType = state
      ? effectiveTypeLineFromActive(state, card, active)
      : copied.typeLine
    if (!/\bcreature\b/i.test(effectiveType)) return undefined
    // Dynamic printed characteristics such as `* / 4` or `2 / *` must not erase the
    // numeric half.  The dynamic half starts from 0 and is then supplied by
    // its characteristic/static definition; the printed numeric half remains
    // its real base value.
    if (!Number.isFinite(basePower)) basePower = 0
    if (!Number.isFinite(baseToughness)) baseToughness = 0
  }
  const value = (
    expression: number | ValueExpression,
    sourceInstanceId: string,
  ): number => {
    if (typeof expression === 'number') return expression
    if (expression.type === 'LITERAL') return expression.value
    if (expression.type === 'TOTAL_COUNTER_COUNT') {
      const target = (active.knownCards ?? []).find(
        (candidate) => candidate.instanceId === card.instanceId,
      )
      return target
        ? Object.values(target.counters).reduce((sum, count) => sum + count, 0)
        : 0
    }
    if (expression.type === 'COUNT_OBJECTS')
      return (active.knownCards ?? []).filter((candidate) => {
        const query = expression.query
        const line = effectiveTypeLineFromActive(
          { cards: active.knownCards ?? [] } as GameState,
          candidate,
          active,
        ).toLocaleLowerCase()
        return (
          (!query.zones || query.zones.includes(candidate.zone)) &&
          (!query.subtypes ||
            query.subtypes.every((subtype) => {
              const source = (active.knownCards ?? []).find(
                (item) => item.instanceId === sourceInstanceId,
              )
              const resolved = resolveStaticTextReference(subtype, source)
              return Boolean(
                resolved && line.includes(resolved.toLocaleLowerCase()),
              )
            })) &&
          (!query.cardTypes ||
            query.cardTypes.every((type) =>
              line.includes(type.toLocaleLowerCase()),
            )) &&
          (!query.controller ||
            (query.controller === 'ACTIVE_PLAYER' &&
              (candidate.controllerId ??
                (candidate.controller === 'OPPONENT'
                  ? 'player-2'
                  : 'player-1')) === active.state?.activePlayerId) ||
            (query.controller === 'SOURCE_CONTROLLER' &&
              (() => {
                const source = (active.knownCards ?? []).find(
                  (item) => item.instanceId === sourceInstanceId,
                )
                if (!source) return false
                const sourcePlayerId =
                  source.controllerId ??
                  (source.controller === 'OPPONENT' ? 'player-2' : 'player-1')
                const candidatePlayerId =
                  candidate.controllerId ??
                  (candidate.controller === 'OPPONENT'
                    ? 'player-2'
                    : 'player-1')
                return candidatePlayerId === sourcePlayerId
              })())) &&
          (!query.excludeSource || candidate.instanceId !== sourceInstanceId)
        )
      }).length
    return 0
  }
  for (const setter of active.basePowerToughnessSetters) {
    const source = (active.knownCards ?? []).find(
      (candidate) => candidate.instanceId === setter.sourceInstanceId,
    )
    if (
      matchesStaticFilter(
        card,
        setter.filter,
        setter.sourceInstanceId,
        source,
      ) &&
      staticConditionMatchesBase(
        active.state ??
          ({
            cards: active.knownCards ?? [],
            players: [],
            turnOrder: [],
          } as unknown as GameState),
        source,
        setter.condition,
      )
    ) {
      basePower = value(setter.power, setter.sourceInstanceId)
      baseToughness = value(setter.toughness, setter.sourceInstanceId)
    }
  }
  for (const setter of active.temporaryCharacteristicEffects ?? []) {
    if (setter.targetInstanceId !== card.instanceId) continue
    if (setter.setBasePower !== undefined) basePower = setter.setBasePower
    if (setter.setBaseToughness !== undefined)
      baseToughness = setter.setBaseToughness
  }
  const modified = active.powerToughnessModifiers.reduce(
    (current, modifier) =>
      matchesStaticFilter(
        {
          ...card,
          card: copiableCardDefinitionFromParts(
            active.knownCards ?? [card],
            active.copyContinuousEffects ?? [],
            card,
          ),
        },
        modifier.filter,
        modifier.sourceInstanceId,
        active.knownCards?.find(
          (candidate) => candidate.instanceId === modifier.sourceInstanceId,
        ),
      ) &&
      staticConditionMatchesBase(
        active.state ??
          ({
            cards: active.knownCards ?? [],
            players: [],
            turnOrder: [],
          } as unknown as GameState),
        active.knownCards?.find(
          (candidate) => candidate.instanceId === modifier.sourceInstanceId,
        ),
        modifier.condition,
      )
        ? modifier.operation === 'ADD'
          ? {
              power:
                current.power +
                value(modifier.power, modifier.sourceInstanceId),
              toughness:
                current.toughness +
                value(modifier.toughness, modifier.sourceInstanceId),
            }
          : {
              power:
                typeof modifier.power === 'number'
                  ? current.power +
                    value(modifier.power, modifier.sourceInstanceId)
                  : value(modifier.power, modifier.sourceInstanceId),
              toughness:
                current.toughness +
                value(modifier.toughness, modifier.sourceInstanceId),
            }
        : current,
    { power: basePower, toughness: baseToughness },
  )
  const stateTemporary = active.temporaryContinuousEffects ?? []
  const transient = stateTemporary
    .filter((effect) => effect.targetInstanceId === card.instanceId)
    .reduce(
      (current, effect) => ({
        power: current.power + (effect.power ?? 0),
        toughness: current.toughness + (effect.toughness ?? 0),
      }),
      modified,
    )
  const plus = card.counters['+1/+1'] ?? 0
  const minus = card.counters['-1/-1'] ?? 0
  return {
    power: transient.power + plus - minus,
    toughness: transient.toughness + plus - minus,
  }
}
