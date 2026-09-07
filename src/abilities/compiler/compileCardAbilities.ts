import { compileOracleText } from './deterministic/compileOracleText'
import type { CardDefinition } from '../../types/card'
import { validateAbilityDefinitions } from './validators/abilityDefinitionValidator'
import { validateAbilitySemantics } from './validators/semanticValidator'
import {
  ABILITY_COMPILER_VERSION,
  ABILITY_DSL_VERSION,
  type AbilityCompilerCandidate,
  type CompiledCardAbilities,
  type SemanticAbilityAnalysisProvider,
  type SemanticCardAnalysis,
} from './types/compilerTypes'
import {
  CompiledAbilityCache,
  compiledAbilityCacheKey,
} from './cache/abilityCache'
import { validateCapabilityGaps } from './validators/capabilityGapValidator'
import { validateSemanticCardAnalysis } from './validators/semanticAnalysisValidator'
import { mapSemanticAnalysisToRuntime } from './semantic/mapSemanticAnalysisToRuntime'

const defaultCache = new CompiledAbilityCache()
type CompilerCard = Pick<
  CardDefinition,
  'name' | 'oracleId' | 'typeLine' | 'manaCost' | 'oracleText'
>

const toInput = (card: CompilerCard) => ({
  cardName: card.name,
  oracleId: card.oracleId,
  typeLine: card.typeLine,
  manaCost: card.manaCost,
  oracleText: card.oracleText,
})

const failedCompilation = (
  card: CompilerCard,
  warnings: string[],
  candidate?: AbilityCompilerCandidate,
): CompiledCardAbilities => ({
  cardName: card.name,
  oracleId: card.oracleId,
  oracleText: card.oracleText,
  abilities: [],
  status: 'FAILED',
  unsupportedFragments: candidate?.unsupportedFragments,
  warnings: [...(candidate?.warnings ?? []), ...warnings],
  compilerVersion: ABILITY_COMPILER_VERSION,
  abilityDslVersion: ABILITY_DSL_VERSION,
})

/** Applies the same strict schema and semantic boundary to every compiler source. */
export const finalizeAbilityCompilerCandidate = (
  card: CompilerCard,
  candidate: AbilityCompilerCandidate,
): CompiledCardAbilities => {
  if (
    !['COMPILED', 'PARTIAL', 'MANUAL', 'NO_RUNTIME_ABILITY'].includes(
      candidate.status,
    )
  )
    return failedCompilation(
      card,
      ['Compiler returned an invalid status.'],
      candidate,
    )
  const validated = validateAbilityDefinitions(candidate.abilities)
  if (!validated.valid)
    return failedCompilation(card, validated.errors, candidate)
  const semanticErrors = validated.value.flatMap((ability) =>
    validateAbilitySemantics(ability, toInput(card)),
  )
  if (semanticErrors.length)
    return failedCompilation(card, semanticErrors, candidate)
  const gaps = validateCapabilityGaps(candidate.capabilityGaps ?? [])
  if (!gaps.valid) return failedCompilation(card, gaps.errors, candidate)
  return {
    cardName: card.name,
    oracleId: card.oracleId,
    oracleText: card.oracleText,
    abilities: validated.value,
    status: candidate.status,
    unsupportedFragments: candidate.unsupportedFragments,
    warnings: candidate.warnings,
    capabilityGaps: gaps.value,
    compilerVersion: ABILITY_COMPILER_VERSION,
    abilityDslVersion: ABILITY_DSL_VERSION,
  }
}

/** Hybrid compiler entry point. Providers may be added later, after this local validation boundary. */
export const compileCardAbilities = (
  card: CompilerCard,
  cache: CompiledAbilityCache = defaultCache,
): CompiledCardAbilities => {
  const cacheKey = compiledAbilityCacheKey(
    card.oracleId,
    card.oracleText,
    card.name,
  )
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const finish = (result: CompiledCardAbilities): CompiledCardAbilities => {
    cache.set(cacheKey, result)
    return result
  }
  return finish(
    finalizeAbilityCompilerCandidate(card, compileOracleText(toInput(card))),
  )
}

export type ProviderCompilationOptions = {
  cache?: CompiledAbilityCache
  force?: boolean
}

export type ProviderCompilationResult = {
  result: CompiledCardAbilities
  providerCall: boolean
  cacheHit: boolean
  semanticAnalysis?: SemanticCardAnalysis
  semanticValidationErrors?: string[]
}

/** Deterministic results always win; providers only return non-executable semantic analysis. */
export const compileCardAbilitiesWithProvider = async (
  card: CompilerCard,
  provider: SemanticAbilityAnalysisProvider,
  options: ProviderCompilationOptions = {},
): Promise<ProviderCompilationResult> => {
  const deterministic = compileCardAbilities(card)
  if (deterministic.status !== 'MANUAL' && deterministic.status !== 'PARTIAL')
    return { result: deterministic, providerCall: false, cacheHit: false }

  const cache = options.cache ?? defaultCache
  const cacheKey = compiledAbilityCacheKey(
    card.oracleId,
    card.oracleText,
    card.name,
    {
      provider: provider.providerId,
      model: provider.model,
    },
  )
  if (!options.force) {
    const cached = cache.get(cacheKey)
    if (cached) return { result: cached, providerCall: false, cacheHit: true }
  }
  try {
    const rawAnalysis = await provider.analyze(toInput(card))
    const analysis = validateSemanticCardAnalysis(toInput(card), rawAnalysis)
    if (!analysis.valid) {
      const result = failedCompilation(card, analysis.errors)
      return {
        result,
        providerCall: true,
        cacheHit: false,
        semanticValidationErrors: analysis.errors,
      }
    }
    const result = finalizeAbilityCompilerCandidate(
      card,
      mapSemanticAnalysisToRuntime(toInput(card), analysis.value),
    )
    cache.set(cacheKey, result)
    return {
      result,
      providerCall: true,
      cacheHit: false,
      semanticAnalysis: analysis.value,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown provider failure.'
    const result = failedCompilation(card, [message])
    return { result, providerCall: true, cacheHit: false }
  }
}
