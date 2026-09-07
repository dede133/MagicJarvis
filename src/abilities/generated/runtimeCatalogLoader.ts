import readyCatalog from './tritones-runtime-ready-definitions.json'
import runtimeCatalog from './tritones-runtime-catalog.json'
import type { AbilityDefinition } from '../types/abilityTypes'
import { validateAbilityDefinitions } from '../compiler/validators/abilityDefinitionValidator'

type ReadyCatalog = { definitions?: Record<string, unknown> }

export type RuntimeCatalogStatus =
  'READY' | 'PARTIAL' | 'MANUAL' | 'UNSUPPORTED' | 'NO_RUNTIME_ABILITY'

type RuntimeCatalogEntry = {
  status?: string
  runtimeAbilities?: unknown
}

type RuntimeCatalog = {
  uniqueActiveCards?: number
  statusSummary?: Partial<Record<RuntimeCatalogStatus, number>>
  cards?: Record<string, RuntimeCatalogEntry>
}

export type RuntimeCatalogValidation = {
  valid: boolean
  errors: string[]
  actualStatusSummary: Record<RuntimeCatalogStatus, number>
}

const RUNTIME_CATALOG_STATUSES: RuntimeCatalogStatus[] = [
  'READY',
  'PARTIAL',
  'MANUAL',
  'UNSUPPORTED',
  'NO_RUNTIME_ABILITY',
]

const normalize = (name: string) =>
  name
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')

export const validateRuntimeCatalogMetadata = (
  catalog: RuntimeCatalog = runtimeCatalog,
): RuntimeCatalogValidation => {
  const actualStatusSummary = Object.fromEntries(
    RUNTIME_CATALOG_STATUSES.map((status) => [status, 0]),
  ) as Record<RuntimeCatalogStatus, number>
  const errors: string[] = []
  const cards = catalog.cards ?? {}

  for (const [cardName, entry] of Object.entries(cards)) {
    if (
      !RUNTIME_CATALOG_STATUSES.includes(entry.status as RuntimeCatalogStatus)
    ) {
      errors.push(
        `${cardName}: invalid runtime status ${String(entry.status ?? 'undefined')}.`,
      )
      continue
    }
    const status = entry.status as RuntimeCatalogStatus
    actualStatusSummary[status] += 1
    if (status === 'READY') {
      if (!Array.isArray(entry.runtimeAbilities)) {
        errors.push(`${cardName}: READY entry must declare runtimeAbilities.`)
      } else {
        const validated = validateAbilityDefinitions(entry.runtimeAbilities)
        if (!validated.valid)
          errors.push(`${cardName}: READY runtimeAbilities are invalid.`)
        else if (
          !validated.value.every(
            (ability) => ability.sourceCardName === cardName,
          )
        )
          errors.push(
            `${cardName}: READY runtimeAbilities contain a different sourceCardName.`,
          )
      }
    }
  }

  for (const status of RUNTIME_CATALOG_STATUSES) {
    const declared = catalog.statusSummary?.[status] ?? 0
    const actual = actualStatusSummary[status]
    if (declared !== actual)
      errors.push(
        `statusSummary.${status} declares ${declared}, but catalog entries contain ${actual}.`,
      )
  }

  if (
    catalog.uniqueActiveCards !== undefined &&
    catalog.uniqueActiveCards !== Object.keys(cards).length
  )
    errors.push(
      `uniqueActiveCards declares ${catalog.uniqueActiveCards}, but catalog contains ${Object.keys(cards).length} entries.`,
    )

  return { valid: errors.length === 0, errors, actualStatusSummary }
}

export const loadReadyRuntimeDefinitions = (
  catalog: ReadyCatalog = readyCatalog,
): ReadonlyMap<string, AbilityDefinition[]> => {
  const result = new Map<string, AbilityDefinition[]>()
  for (const [name, raw] of Object.entries(catalog.definitions ?? {})) {
    if (!Array.isArray(raw) || raw.length === 0) continue
    const validated = validateAbilityDefinitions(raw)
    if (
      validated.valid &&
      validated.value.every((ability) => ability.sourceCardName === name)
    )
      result.set(normalize(name), validated.value)
  }
  return result
}

/**
 * Runtime catalogs are strict: only READY entries can contribute executable
 * AbilityDefinitions. PARTIAL remains useful as build-time diagnostics, but no
 * subset of a PARTIAL card is ever loaded into the game engine.
 */
export const loadRuntimeCatalogReadyDefinitions = (
  catalog: RuntimeCatalog = runtimeCatalog,
): ReadonlyMap<string, AbilityDefinition[]> => {
  const result = new Map<string, AbilityDefinition[]>()
  for (const [name, entry] of Object.entries(catalog.cards ?? {})) {
    if (entry.status !== 'READY' || !Array.isArray(entry.runtimeAbilities))
      continue
    const validated = validateAbilityDefinitions(entry.runtimeAbilities)
    if (
      validated.valid &&
      validated.value.every((ability) => ability.sourceCardName === name)
    )
      result.set(normalize(name), validated.value)
  }
  return result
}

export const runtimeCatalogValidation = validateRuntimeCatalogMetadata()

const promotedReadyDefinitions = loadRuntimeCatalogReadyDefinitions()
const readyDefinitions = new Map<string, AbilityDefinition[]>(
  promotedReadyDefinitions,
)
for (const [name, abilities] of loadReadyRuntimeDefinitions())
  readyDefinitions.set(name, abilities)

export const getReadyRuntimeDefinitions = (cardName: string) =>
  readyDefinitions.get(normalize(cardName))

export const readyRuntimeDefinitionCount = readyDefinitions.size
