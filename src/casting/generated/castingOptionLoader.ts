import catalog from './tritones-casting-options.json'
import type {
  CastCondition,
  CastGenericContributionDefinition,
  CastNonManaCostDefinition,
  CastOptionDefinition,
} from '../types/castingTypes'

const normalize = (name: string) =>
  name
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')

const isCondition = (value: unknown): value is CastCondition => {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'CONTROLS_COMMANDER' || type === 'NOT_YOUR_TURN'
}

const isRuntimeVariable = (
  value: unknown,
): value is string | number | boolean =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'

const isManaColor = (value: unknown) =>
  value === 'W' ||
  value === 'U' ||
  value === 'B' ||
  value === 'R' ||
  value === 'G' ||
  value === 'C'

const isNonManaCost = (value: unknown): value is CastNonManaCostDefinition => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CastNonManaCostDefinition> & {
    colors?: unknown
  }
  if (candidate.type === 'PAY_LIFE')
    return (
      Number.isSafeInteger(candidate.amount) &&
      typeof candidate.amount === 'number' &&
      candidate.amount > 0
    )
  if (candidate.type !== 'EXILE_CARD_FROM_HAND') return false
  return (
    Number.isSafeInteger(candidate.count) &&
    typeof candidate.count === 'number' &&
    candidate.count > 0 &&
    (candidate.colors === undefined ||
      (Array.isArray(candidate.colors) &&
        candidate.colors.every(isManaColor))) &&
    (candidate.excludeSource === undefined ||
      typeof candidate.excludeSource === 'boolean')
  )
}

const isContributionMax = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
  (Boolean(value) &&
    typeof value === 'object' &&
    (value as { variable?: unknown }).variable !== undefined &&
    typeof (value as { variable?: unknown }).variable === 'string')

const isGenericContribution = (
  value: unknown,
): value is CastGenericContributionDefinition => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CastGenericContributionDefinition> & {
    cardTypesAnyOf?: unknown
    max?: unknown
  }
  if (!isContributionMax(candidate.max)) return false
  if (candidate.type === 'EXILE_CARDS_FROM_GRAVEYARD') return true
  if (candidate.type === 'EXILE_DECLARED_CARDS_FROM_HAND') {
    const hidden = candidate as typeof candidate & {
      colors?: unknown
      excludeSource?: unknown
      genericReductionPerCard?: unknown
    }
    return (
      (hidden.colors === undefined ||
        (Array.isArray(hidden.colors) && hidden.colors.every(isManaColor))) &&
      (hidden.excludeSource === undefined ||
        typeof hidden.excludeSource === 'boolean') &&
      typeof hidden.genericReductionPerCard === 'number' &&
      Number.isSafeInteger(hidden.genericReductionPerCard) &&
      hidden.genericReductionPerCard > 0
    )
  }
  return (
    candidate.type === 'TAP_PERMANENTS' &&
    Array.isArray(candidate.cardTypesAnyOf) &&
    candidate.cardTypesAnyOf.length > 0 &&
    candidate.cardTypesAnyOf.every(
      (cardType) => typeof cardType === 'string' && cardType.length > 0,
    )
  )
}

const isDefinition = (value: unknown): value is CastOptionDefinition => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CastOptionDefinition>
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.label !== 'string' ||
    (candidate.kind !== 'ALTERNATIVE' &&
      candidate.kind !== 'ADDITIONAL' &&
      candidate.kind !== 'PAYMENT_MODIFIER') ||
    typeof candidate.manaCost !== 'string'
  )
    return false
  if (
    candidate.required !== undefined &&
    typeof candidate.required !== 'boolean'
  )
    return false
  if (candidate.condition !== undefined && !isCondition(candidate.condition))
    return false
  if (candidate.variable !== undefined) {
    if (
      typeof candidate.variable.name !== 'string' ||
      (candidate.variable.min !== undefined &&
        (!Number.isSafeInteger(candidate.variable.min) ||
          candidate.variable.min < 0)) ||
      (candidate.variable.max !== undefined &&
        (!Number.isSafeInteger(candidate.variable.max) ||
          candidate.variable.max < 0))
    )
      return false
  }
  if (
    candidate.nonManaCosts !== undefined &&
    (!Array.isArray(candidate.nonManaCosts) ||
      !candidate.nonManaCosts.every(isNonManaCost))
  )
    return false
  if (
    candidate.genericContribution !== undefined &&
    !isGenericContribution(candidate.genericContribution)
  )
    return false
  return (
    candidate.setVariables === undefined ||
    Object.values(candidate.setVariables).every(isRuntimeVariable)
  )
}

type RawCatalog = { definitions?: Record<string, unknown> }

const load = (raw: RawCatalog): ReadonlyMap<string, CastOptionDefinition[]> => {
  const result = new Map<string, CastOptionDefinition[]>()
  for (const [name, definitions] of Object.entries(raw.definitions ?? {})) {
    if (!Array.isArray(definitions) || !definitions.every(isDefinition))
      continue
    result.set(normalize(name), definitions)
  }
  return result
}

const loaded = load(catalog)

export const getCastOptionsForCard = (
  cardName: string,
): readonly CastOptionDefinition[] => loaded.get(normalize(cardName)) ?? []

export const castOptionDefinitionCount = loaded.size
