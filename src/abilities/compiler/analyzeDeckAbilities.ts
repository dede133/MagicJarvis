import { compileCardAbilities } from './compileCardAbilities'
import type { CardDefinition } from '../../types/card'
import type { CompilationStatus } from './types/compilerTypes'

export type AbilityAnalysis = {
  total: number
  counts: Record<CompilationStatus, number>
  results: ReturnType<typeof compileCardAbilities>[]
}

export const analyzeDeckAbilities = (
  cards: CardDefinition[],
): AbilityAnalysis => {
  const results = cards.map((card) => compileCardAbilities(card))
  const counts: Record<CompilationStatus, number> = {
    COMPILED: 0,
    PARTIAL: 0,
    MANUAL: 0,
    FAILED: 0,
    NO_RUNTIME_ABILITY: 0,
  }
  results.forEach((result) => {
    counts[result.status] += 1
  })
  return { total: cards.length, counts, results }
}
