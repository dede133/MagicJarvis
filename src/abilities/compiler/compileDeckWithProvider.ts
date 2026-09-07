import {
  compileCardAbilities,
  compileCardAbilitiesWithProvider,
} from './compileCardAbilities'
import { CompiledAbilityCache } from './cache/abilityCache'
import type {
  CapabilityGapCategory,
  CompilationStatus,
  CompiledCardAbilities,
  SemanticAbilityAnalysisProvider,
  SemanticCardAnalysis,
} from './types/compilerTypes'
import type { CardDefinition } from '../../types/card'

export type AbilityCompilationSelection = {
  limit?: number
  cardName?: string
}

export type DeckAbilityCompilationReport = {
  cardsAnalyzed: number
  results: Array<{
    result: CompiledCardAbilities
    durationMs: number
    semanticAnalysis?: SemanticCardAnalysis
    semanticValidationErrors?: string[]
  }>
  counts: Record<CompilationStatus, number>
  capabilityGaps: Partial<Record<CapabilityGapCategory, number>>
  providerCalls: number
  cacheHits: number
  model?: string
}

export const selectCardsForProviderCompilation = (
  cards: CardDefinition[],
  selection: AbilityCompilationSelection = {},
): CardDefinition[] => {
  const requested = selection.cardName?.trim().toLocaleLowerCase()
  const eligible = cards.filter((card) => {
    const status = compileCardAbilities(card).status
    return (
      (status === 'MANUAL' || status === 'PARTIAL') &&
      (!requested || card.name.toLocaleLowerCase() === requested)
    )
  })
  return selection.limit === undefined
    ? eligible
    : eligible.slice(0, selection.limit)
}

/** Sequential by design: local CPU inference should remain predictable on a development Mac. */
export const compileDeckWithProvider = async (
  cards: CardDefinition[],
  provider: SemanticAbilityAnalysisProvider,
  selection: AbilityCompilationSelection = {},
  options: {
    cache?: CompiledAbilityCache
    force?: boolean
    onProgress?: (current: number, total: number, card: CardDefinition) => void
  } = {},
): Promise<DeckAbilityCompilationReport> => {
  const selected = selectCardsForProviderCompilation(cards, selection)
  const cache = options.cache ?? new CompiledAbilityCache()
  const results: DeckAbilityCompilationReport['results'] = []
  let providerCalls = 0
  let cacheHits = 0
  for (const [index, card] of selected.entries()) {
    options.onProgress?.(index + 1, selected.length, card)
    const startedAt = performance.now()
    const compilation = await compileCardAbilitiesWithProvider(card, provider, {
      cache,
      force: options.force,
    })
    results.push({
      result: compilation.result,
      durationMs: Math.round(performance.now() - startedAt),
      ...(compilation.semanticAnalysis
        ? { semanticAnalysis: compilation.semanticAnalysis }
        : {}),
      ...(compilation.semanticValidationErrors
        ? { semanticValidationErrors: compilation.semanticValidationErrors }
        : {}),
    })
    if (compilation.providerCall) providerCalls += 1
    if (compilation.cacheHit) cacheHits += 1
  }
  const counts: DeckAbilityCompilationReport['counts'] = {
    COMPILED: 0,
    PARTIAL: 0,
    MANUAL: 0,
    FAILED: 0,
    NO_RUNTIME_ABILITY: 0,
  }
  const capabilityGaps: DeckAbilityCompilationReport['capabilityGaps'] = {}
  results.forEach(({ result }) => {
    counts[result.status] += 1
    result.capabilityGaps?.forEach((gap) => {
      capabilityGaps[gap.category] = (capabilityGaps[gap.category] ?? 0) + 1
    })
  })
  return {
    cardsAnalyzed: selected.length,
    results,
    counts,
    capabilityGaps,
    providerCalls,
    cacheHits,
    model: provider.model,
  }
}
