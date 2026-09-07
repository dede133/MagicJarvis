import {
  compiledAbilityCacheKey,
  CompiledAbilityCache,
} from '../cache/abilityCache'
import { compileCardAbilitiesWithProvider } from '../compileCardAbilities'
import { selectCardsForProviderCompilation } from '../compileDeckWithProvider'
import { getCapabilityCoverage } from './capabilityCoverage'
import { deriveCapabilitiesForSemanticAnalysis } from './deriveCapabilities'
import type {
  AbilityCompilerInput,
  CapabilityGapCategory,
  CompiledCardAbilities,
  SemanticAbilityAnalysisProvider,
  SemanticCardAnalysis,
} from '../types/compilerTypes'
import { validateSemanticCardAnalysis } from '../validators/semanticAnalysisValidator'
import type { CardDefinition } from '../../../types/card'

export type SemanticUnderstandingStatus =
  'FULLY_UNDERSTOOD' | 'PARTIAL' | 'FAILED'
export type RuntimeSupportStatus = 'READY' | 'PARTIAL' | 'UNSUPPORTED'
export type CapabilityComplexity = 'SIMPLE' | 'MEDIUM' | 'COMPLEX'
export type SemanticFailureStatus =
  'FAILED_SEMANTIC' | 'FAILED_PROVIDER' | 'QUOTA_EXHAUSTED'

export type SemanticCoverageEntry = {
  result: CompiledCardAbilities
  semanticAnalysis: SemanticCardAnalysis
  durationMs: number
}

export class SemanticCoverageCache {
  private readonly entries = new Map<string, SemanticCoverageEntry>()

  get(key: string): SemanticCoverageEntry | undefined {
    return this.entries.get(key)
  }

  set(key: string, value: SemanticCoverageEntry): void {
    this.entries.set(key, value)
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  entriesArray(): Array<[string, SemanticCoverageEntry]> {
    return [...this.entries.entries()]
  }

  restore(entries: Array<[string, SemanticCoverageEntry]>): void {
    entries.forEach(([key, value]) => this.entries.set(key, value))
  }
}

export type SemanticCoverageCard = {
  card: CardDefinition
  semanticAnalysis?: SemanticCardAnalysis
  result: CompiledCardAbilities
  durationMs: number
  providerCall: boolean
  cacheHit: boolean
  understanding: SemanticUnderstandingStatus
  runtime: RuntimeSupportStatus
  requiredCapabilities: CapabilityGapCategory[]
  missingCapabilities: CapabilityGapCategory[]
  failure?: SemanticFailureStatus
}

export type CapabilityCoverageItem = {
  capability: CapabilityGapCategory
  count: number
  cards: string[]
  complexity: CapabilityComplexity
  unlocksAlone: string[]
  cooccursWith: Array<{ capability: CapabilityGapCategory; count: number }>
}

export type CapabilityCombination = {
  capabilities: CapabilityGapCategory[]
  unlockedCards: string[]
}

export type SemanticCoverageReport = {
  cards: SemanticCoverageCard[]
  semanticAnalyzed: number
  fullyUnderstood: number
  partial: number
  failed: number
  failedSemantic: number
  failedProvider: number
  quotaExhausted: number
  providerCalls: number
  cacheHits: number
  totalDurationMs: number
  averageDurationMs: number
  capabilities: CapabilityCoverageItem[]
  unlockCombinations: CapabilityCombination[]
  stoppedForRateLimit: boolean
}

const toInput = (card: CardDefinition): AbilityCompilerInput => ({
  cardName: card.name,
  oracleId: card.oracleId,
  typeLine: card.typeLine,
  manaCost: card.manaCost,
  oracleText: card.oracleText,
})

export const semanticCoverageCacheKey = (
  card: CardDefinition,
  provider: SemanticAbilityAnalysisProvider,
): string =>
  compiledAbilityCacheKey(card.oracleId, card.oracleText, card.name, {
    provider: provider.providerId,
    model: provider.model,
  })

const unique = <T>(values: T[]): T[] => [...new Set(values)]

const semanticUnderstanding = (
  analysis: SemanticCardAnalysis | undefined,
): SemanticUnderstandingStatus => {
  if (!analysis) return 'FAILED'
  const unclear =
    analysis.unsupportedOrUnclear.length > 0 ||
    analysis.abilities.some(
      (ability) => ability.unsupportedOrUnclear.length > 0,
    )
  return unclear ? 'PARTIAL' : 'FULLY_UNDERSTOOD'
}

const isValidCachedAnalysis = (
  card: CardDefinition,
  analysis: SemanticCardAnalysis,
): boolean =>
  validateSemanticCardAnalysis(toInput(card), {
    abilities: analysis.abilities,
    unsupportedOrUnclear: analysis.unsupportedOrUnclear,
  }).valid

const runtimeSupport = (
  result: CompiledCardAbilities,
  required: CapabilityGapCategory[],
): RuntimeSupportStatus => {
  if (result.status === 'COMPILED') return 'READY'
  const coverage = getCapabilityCoverage(required)
  if (coverage.supported.length > 0 && coverage.missing.length > 0)
    return 'PARTIAL'
  return 'UNSUPPORTED'
}

export const capabilityComplexity = (
  capability: CapabilityGapCategory,
): CapabilityComplexity => {
  if (
    [
      'DRAW_CARD',
      'DISCARD_CARD',
      'ADD_COUNTER',
      'REMOVE_COUNTER',
      'GAIN_LIFE',
      'SCRY',
      'SURVEIL',
      'GIFT',
      'PREVENT_DAMAGE',
      'PROTECTION',
      'AIRBEND',
      'RESTRICTED_MANA',
      'CHANNEL',
      'WATERBEND',
      'LOSE_LIFE',
      'TAP_SOURCE',
      'TAP_PERMANENT',
      'UNTAP_PERMANENT',
      'CREATE_TOKEN',
      'MOVE_ZONE',
    ].includes(capability)
  )
    return 'SIMPLE'
  if (
    [
      'ACTIVATED_ABILITY',
      'TARGET_SELECTION',
      'CARD_SELECTION',
      'PLAYER_CHOICE',
      'COST_MODIFICATION',
      'STATIC_ABILITY',
      'STATIC_EFFECT',
      'NON_TOKEN_FILTER',
      'TYPE_MODIFICATION',
      'POWER_TOUGHNESS_MODIFICATION',
      'CHARACTERISTIC_MODIFICATION',
      'GRANT_TRIGGERED_ABILITY',
    ].includes(capability)
  )
    return 'MEDIUM'
  return 'COMPLEX'
}

const cardMissingCapabilities = (
  card: SemanticCoverageCard,
): CapabilityGapCategory[] => card.missingCapabilities

export const buildCapabilityReport = (
  cards: SemanticCoverageCard[],
): CapabilityCoverageItem[] => {
  const all = unique(cards.flatMap((card) => card.requiredCapabilities))
  return all
    .map((capability) => {
      const affected = cards.filter((card) =>
        card.requiredCapabilities.includes(capability),
      )
      const cooccurrences = affected.flatMap((card) =>
        cardMissingCapabilities(card).filter((value) => value !== capability),
      )
      const cooccursWith = unique(cooccurrences)
        .map((other) => ({
          capability: other,
          count: cooccurrences.filter((value) => value === other).length,
        }))
        .sort(
          (a, b) =>
            b.count - a.count || a.capability.localeCompare(b.capability),
        )
      return {
        capability,
        count: affected.length,
        cards: affected.map((card) => card.card.name).sort(),
        complexity: capabilityComplexity(capability),
        unlocksAlone: cards
          .filter((card) => {
            const missing = cardMissingCapabilities(card)
            return missing.length === 1 && missing[0] === capability
          })
          .map((card) => card.card.name)
          .sort(),
        cooccursWith,
      }
    })
    .sort(
      (a, b) => b.count - a.count || a.capability.localeCompare(b.capability),
    )
}

/**
 * Small, transparent heuristic: card requirement sets plus prefixes of the
 * frequency ranking. It finds practical 2–5 capability implementation slices
 * without pretending to solve a global optimization problem.
 */
export const buildUnlockCombinations = (
  cards: SemanticCoverageCard[],
  capabilities: CapabilityCoverageItem[],
): CapabilityCombination[] => {
  const candidates = new Map<string, CapabilityGapCategory[]>()
  cards.forEach((card) => {
    const missing = unique(cardMissingCapabilities(card)).sort()
    if (missing.length >= 2 && missing.length <= 5)
      candidates.set(missing.join('|'), missing)
  })
  const ranked = capabilities.map((item) => item.capability)
  for (let size = 2; size <= Math.min(5, ranked.length); size += 1) {
    const values = ranked.slice(0, size).sort()
    candidates.set(values.join('|'), values)
  }
  return [...candidates.values()]
    .map((combination) => ({
      capabilities: combination,
      unlockedCards: cards
        .filter((card) => {
          const missing = cardMissingCapabilities(card)
          return (
            missing.length > 0 &&
            missing.every((capability) => combination.includes(capability))
          )
        })
        .map((card) => card.card.name)
        .sort(),
    }))
    .filter((item) => item.unlockedCards.length > 0)
    .sort(
      (a, b) =>
        b.unlockedCards.length - a.unlockedCards.length ||
        a.capabilities.length - b.capabilities.length ||
        a.capabilities.join('|').localeCompare(b.capabilities.join('|')),
    )
}

const summarize = (
  cards: SemanticCoverageCard[],
  stoppedForRateLimit: boolean,
): SemanticCoverageReport => {
  const semantic = cards.filter((card) => card.semanticAnalysis)
  const capabilities = buildCapabilityReport(semantic)
  const providerDurations = cards
    .filter((card) => card.providerCall)
    .map((card) => card.durationMs)
  return {
    cards,
    semanticAnalyzed: semantic.length,
    fullyUnderstood: cards.filter(
      (card) => card.understanding === 'FULLY_UNDERSTOOD',
    ).length,
    partial: cards.filter((card) => card.understanding === 'PARTIAL').length,
    failed: cards.filter((card) => card.understanding === 'FAILED').length,
    failedSemantic: cards.filter((card) => card.failure === 'FAILED_SEMANTIC')
      .length,
    failedProvider: cards.filter((card) => card.failure === 'FAILED_PROVIDER')
      .length,
    quotaExhausted: cards.filter((card) => card.failure === 'QUOTA_EXHAUSTED')
      .length,
    providerCalls: cards.filter((card) => card.providerCall).length,
    cacheHits: cards.filter((card) => card.cacheHit).length,
    totalDurationMs: providerDurations.reduce(
      (total, value) => total + value,
      0,
    ),
    averageDurationMs: providerDurations.length
      ? Math.round(
          providerDurations.reduce((total, value) => total + value, 0) /
            providerDurations.length,
        )
      : 0,
    capabilities,
    unlockCombinations: buildUnlockCombinations(semantic, capabilities),
    stoppedForRateLimit,
  }
}

const isRateLimitFailure = (entry: SemanticCoverageCard): boolean =>
  entry.result.status === 'FAILED' &&
  Boolean(
    entry.result.warnings?.some((warning) =>
      /\b429\b|resource_exhausted|quota|rate limit/i.test(warning),
    ),
  )

const failureStatus = (
  result: CompiledCardAbilities,
  semanticValidationErrors: string[] | undefined,
): SemanticFailureStatus | undefined => {
  if (result.status !== 'FAILED') return undefined
  if (
    result.warnings?.some((warning) =>
      /\b429\b|resource_exhausted|quota|rate limit/i.test(warning),
    )
  )
    return 'QUOTA_EXHAUSTED'
  return semanticValidationErrors?.length
    ? 'FAILED_SEMANTIC'
    : 'FAILED_PROVIDER'
}

const pause = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

export const analyzeSemanticCoverage = async (
  cards: CardDefinition[],
  provider: SemanticAbilityAnalysisProvider,
  options: {
    cache?: SemanticCoverageCache
    force?: boolean
    cardName?: string
    cacheOnly?: boolean
    onProgress?: (progress: {
      current: number
      total: number
      card: CardDefinition
      source: 'cache' | 'Gemini'
    }) => void
    onCachedEntry?: () => Promise<void> | void
    minRequestIntervalMs?: number
  } = {},
): Promise<SemanticCoverageReport> => {
  const selected = selectCardsForProviderCompilation(cards, {
    cardName: options.cardName,
  })
  const semanticCache = options.cache ?? new SemanticCoverageCache()
  const providerCache = new CompiledAbilityCache()
  const reportCards: SemanticCoverageCard[] = []
  let lastProviderRequestAt: number | undefined
  let stoppedForRateLimit = false

  for (const [index, card] of selected.entries()) {
    const key = semanticCoverageCacheKey(card, provider)
    const cached = !options.force ? semanticCache.get(key) : undefined
    if (cached && isValidCachedAnalysis(card, cached.semanticAnalysis)) {
      options.onProgress?.({
        current: index + 1,
        total: selected.length,
        card,
        source: 'cache',
      })
      const required = deriveCapabilitiesForSemanticAnalysis(
        cached.semanticAnalysis,
      )
      reportCards.push({
        card,
        result: cached.result,
        semanticAnalysis: cached.semanticAnalysis,
        durationMs: cached.durationMs,
        providerCall: false,
        cacheHit: true,
        understanding: semanticUnderstanding(cached.semanticAnalysis),
        runtime: runtimeSupport(cached.result, required),
        requiredCapabilities: required,
        missingCapabilities: getCapabilityCoverage(required).missing,
      })
      continue
    }
    if (cached) semanticCache.delete(key)
    if (options.cacheOnly) continue
    options.onProgress?.({
      current: index + 1,
      total: selected.length,
      card,
      source: 'Gemini',
    })
    if (lastProviderRequestAt !== undefined && options.minRequestIntervalMs) {
      const remaining =
        options.minRequestIntervalMs -
        (performance.now() - lastProviderRequestAt)
      if (remaining > 0) await pause(remaining)
    }
    lastProviderRequestAt = performance.now()
    const startedAt = performance.now()
    const compilation = await compileCardAbilitiesWithProvider(card, provider, {
      cache: providerCache,
      force: options.force,
    })
    const durationMs = Math.round(performance.now() - startedAt)
    const analysis = compilation.semanticAnalysis
    const required = analysis
      ? deriveCapabilitiesForSemanticAnalysis(analysis)
      : []
    const entry: SemanticCoverageCard = {
      card,
      result: compilation.result,
      ...(analysis ? { semanticAnalysis: analysis } : {}),
      durationMs,
      providerCall: compilation.providerCall,
      cacheHit: false,
      understanding: semanticUnderstanding(analysis),
      runtime: runtimeSupport(compilation.result, required),
      requiredCapabilities: required,
      missingCapabilities: getCapabilityCoverage(required).missing,
      ...(failureStatus(
        compilation.result,
        compilation.semanticValidationErrors,
      )
        ? {
            failure: failureStatus(
              compilation.result,
              compilation.semanticValidationErrors,
            ),
          }
        : {}),
    }
    reportCards.push(entry)
    if (analysis && compilation.result.status !== 'FAILED') {
      semanticCache.set(key, {
        result: compilation.result,
        semanticAnalysis: analysis,
        durationMs,
      })
      await options.onCachedEntry?.()
    }
    if (isRateLimitFailure(entry)) {
      stoppedForRateLimit = true
      break
    }
  }
  return summarize(reportCards, stoppedForRateLimit)
}
