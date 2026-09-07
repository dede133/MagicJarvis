import type { SemanticCoverageCard } from './semanticCoverage'

export type SemanticSanityResult = {
  passed: boolean
  checks: Record<string, boolean>
}

const semanticText = (entry: SemanticCoverageCard | undefined): string =>
  JSON.stringify(entry?.semanticAnalysis?.abilities ?? []).toLocaleLowerCase()

/** Deterministic post-analysis checks. They never become part of the prompt. */
export const evaluateGeminiSanity = (
  entry: SemanticCoverageCard | undefined,
): SemanticSanityResult => {
  const text = semanticText(entry)
  const triggered = entry?.semanticAnalysis?.abilities.some(
    (ability) => ability.abilityKind === 'TRIGGERED',
  )
  const activated = entry?.semanticAnalysis?.abilities.some(
    (ability) => ability.abilityKind === 'ACTIVATED',
  )
  const checks: Record<string, boolean> =
    entry?.card.name === 'Chrome Mox'
      ? {
          imprintEtb: /enter/.test(text) && /exile/.test(text),
          handSelection: /hand/.test(text),
          restriction: /nonartifact/.test(text) && /nonland/.test(text),
          linkedCard: /exiled card/.test(text),
          activated: Boolean(activated),
          tapCost: /\{t\}/.test(text),
          mana: /mana/.test(text),
          color: /color/.test(text),
        }
      : entry?.card.name === "Cosi's Trickster"
        ? {
            triggered: Boolean(triggered),
            opponentShuffle: /opponent/.test(text) && /shuffle/.test(text),
            optional: /may|choice/.test(text),
            addCounter: /\+1\/\+1/.test(text) && /counter/.test(text),
            source: /this creature/.test(text),
          }
        : {
            triggered: Boolean(triggered),
            tapped: /become tapped/.test(text),
            controller: /you control/.test(text),
            merfolk: /merfolk/.test(text),
            nontoken: /nontoken/.test(text),
            token: /token/.test(text),
            oneOneBlue: /1\/1/.test(text) && /blue/.test(text),
            hexproof: /hexproof/.test(text),
          }
  const values = Object.values(checks)
  return {
    checks,
    passed:
      Boolean(entry?.semanticAnalysis) &&
      values.filter(Boolean).length >= Math.ceil(values.length * 0.8),
  }
}

export const passesGeminiSanityGate = (
  entries: SemanticCoverageCard[],
): boolean =>
  entries.length === 3 &&
  entries.every((entry) => evaluateGeminiSanity(entry).passed)
