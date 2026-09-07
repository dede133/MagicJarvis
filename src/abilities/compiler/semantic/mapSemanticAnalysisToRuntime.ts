import { compileOracleText } from '../deterministic/compileOracleText'
import { getCapabilityCoverage } from './capabilityCoverage'
import type {
  AbilityCompilerCandidate,
  AbilityCompilerInput,
  CapabilityGap,
  SemanticCardAnalysis,
} from '../types/compilerTypes'

const unique = <T>(values: T[]): T[] => [...new Set(values)]

/**
 * Maps only deterministic, already-proven Oracle patterns to the executable DSL.
 * An LLM semantic description can never create a runtime effect by itself.
 */
export const mapSemanticAnalysisToRuntime = (
  input: AbilityCompilerInput,
  analysis: SemanticCardAnalysis,
): AbilityCompilerCandidate => {
  const deterministic = compileOracleText(input)
  // A deterministic partial mapping is still useful (for example, a spell can
  // counter its target even when a later delayed instruction is unsupported).
  if (deterministic.abilities.length) return deterministic

  const required = unique(
    analysis.abilities.flatMap((ability) => ability.requiredCapabilities),
  )
  const coverage = getCapabilityCoverage(required)
  const capabilityGaps: CapabilityGap[] = coverage.missing.map((category) => {
    const ability = analysis.abilities.find((candidate) =>
      candidate.requiredCapabilities.includes(category),
    )
    return {
      category,
      description: `Runtime DSL v1 does not support ${category}.`,
      oracleFragment:
        ability?.unsupportedOrUnclear[0] ??
        ability?.effects[0] ??
        ability?.triggerDescription ??
        input.oracleText ??
        input.cardName,
    }
  })
  const hasUnclear =
    analysis.unsupportedOrUnclear.length > 0 ||
    analysis.abilities.some(
      (ability) => ability.unsupportedOrUnclear.length > 0,
    )
  return {
    status: coverage.missing.length ? 'PARTIAL' : 'MANUAL',
    abilities: [],
    unsupportedFragments: unique([
      ...analysis.unsupportedOrUnclear,
      ...analysis.abilities.flatMap((ability) => ability.unsupportedOrUnclear),
    ]),
    warnings: [
      hasUnclear
        ? 'Semantic analysis contains unclear fragments; no runtime mapping was attempted.'
        : 'No deterministic runtime mapping exists for this semantic analysis.',
    ],
    capabilityGaps,
  }
}
