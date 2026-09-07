import { readFile } from 'node:fs/promises'
import { CompiledAbilityCache } from '../src/abilities/compiler/cache/abilityCache'
import { compileCardAbilitiesWithProvider } from '../src/abilities/compiler/compileCardAbilities'
import {
  DEFAULT_GEMINI_ABILITY_MODEL,
  GeminiSemanticAbilityProvider,
} from '../src/abilities/compiler/providers/geminiSemanticAbilityProvider'
import { getCapabilityCoverage } from '../src/abilities/compiler/semantic/capabilityCoverage'
import type {
  AbilityCompilerInput,
  SemanticCardAnalysis,
} from '../src/abilities/compiler/types/compilerTypes'
import { parseDeckList } from '../src/data/deckParser'
import { resolveDeckEntries } from '../src/services/scryfall/scryfall'
import type { CardDefinition } from '../src/types/card'
import { loadDevEnvironment } from './load-dev-environment'

const flattened = (analysis: SemanticCardAnalysis | undefined): string =>
  analysis ? JSON.stringify(analysis).toLocaleLowerCase() : ''

const formatSanityChecks = (
  card: CardDefinition,
  analysis: SemanticCardAnalysis | undefined,
): string => {
  const text = flattened(analysis)
  const hasTriggered = analysis?.abilities.some(
    (ability) => ability.abilityKind === 'TRIGGERED',
  )
  const hasActivated = analysis?.abilities.some(
    (ability) => ability.abilityKind === 'ACTIVATED',
  )
  const checks =
    card.name === "Cosi's Trickster"
      ? {
          triggered: hasTriggered,
          opponentShuffle: /opponent/.test(text) && /shuffle/.test(text),
          optional: /may/.test(text),
          plusOneCounter: /\+1\/\+1/.test(text),
        }
      : card.name === 'Deeproot Pilgrimage'
        ? {
            triggered: hasTriggered,
            tappedMerfolk: /tap/.test(text) && /merfolk/.test(text),
            youControl: /you control/.test(text),
            nontoken: /nontoken/.test(text),
            token: /create/.test(text) && /token/.test(text),
            merfolkToken:
              /1\/1/.test(text) && /blue/.test(text) && /hexproof/.test(text),
          }
        : {
            imprintEtb: /enter/.test(text) && /exile/.test(text),
            optionalHandSelection: /may/.test(text) && /hand/.test(text),
            restriction: /nonartifact/.test(text) && /nonland/.test(text),
            linkedObject: /exiled card/.test(text),
            activated: hasActivated,
            tapCost: /\{t\}/.test(text),
            mana: /mana/.test(text),
            colorFromExiledCard: /color/.test(text) && /exiled card/.test(text),
          }
  return Object.entries(checks)
    .map(([name, passed]) => `${passed ? '✓' : '✗'} ${name}`)
    .join(', ')
}

await loadDevEnvironment()

const requestedNames = ['Chrome Mox', "Cosi's Trickster", 'Deeproot Pilgrimage']
const model = process.env.GEMINI_ABILITY_MODEL ?? DEFAULT_GEMINI_ABILITY_MODEL
const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error(
    'Gemini diagnosis cancelled: set GEMINI_API_KEY in .env.local (never VITE_GEMINI_API_KEY).',
  )
  process.exitCode = 1
} else {
  const deckText = await readFile(
    new URL('../src/data/decks/tritones.txt', import.meta.url),
    'utf8',
  )
  const deck = parseDeckList(deckText)
  const activeEntries = [deck.commander, ...deck.mainboard]
  const selectedEntries = requestedNames.map((name) => {
    const entry = activeEntries.find(
      (candidate) =>
        candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
    if (!entry) throw new Error(`Card is not in the active deck: ${name}`)
    return entry
  })
  const { definitions, notFound } = await resolveDeckEntries(selectedEntries)
  if (notFound.length)
    throw new Error(`Unresolved cards: ${notFound.join(', ')}`)
  const cards = selectedEntries.map((entry) => {
    const key =
      entry.setCode && entry.collectorNumber
        ? `printing:${entry.setCode.toLocaleLowerCase()}:${entry.collectorNumber.toLocaleLowerCase()}`
        : `name:${entry.name.toLocaleLowerCase()}`
    const card = definitions.get(key)
    if (!card) throw new Error(`No definition found for ${entry.name}`)
    return card
  })

  const rawOutputs = new Map<string, string>()
  const provider = new GeminiSemanticAbilityProvider({
    apiKey,
    model,
    onRawOutput: (output, input: AbilityCompilerInput) =>
      rawOutputs.set(input.cardName, output),
  })
  const cache = new CompiledAbilityCache()
  console.log(`Gemini Semantic Ability Diagnosis (${model})`)

  for (const [index, card] of cards.entries()) {
    console.log(`\n[${index + 1}/${cards.length}] ${card.name}`)
    const startedAt = performance.now()
    const compilation = await compileCardAbilitiesWithProvider(card, provider, {
      cache,
      force: true,
    })
    const durationMs = Math.round(performance.now() - startedAt)
    const analysis = compilation.semanticAnalysis
    const required = [
      ...new Set(
        analysis?.abilities.flatMap(
          (ability) => ability.requiredCapabilities,
        ) ?? [],
      ),
    ]
    const coverage = getCapabilityCoverage(required)
    const validation = compilation.semanticValidationErrors?.length
      ? compilation.semanticValidationErrors.join('; ')
      : compilation.result.status === 'FAILED'
        ? (compilation.result.warnings?.join('; ') ?? 'Provider failure')
        : 'valid'

    console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`)
    console.log(`Oracle text:\n${card.oracleText ?? '(none)'}`)
    console.log(
      `SemanticAbilityAnalysis:\n${JSON.stringify(analysis ?? null, null, 2)}`,
    )
    console.log(`Semantic validation: ${validation}`)
    console.log(`Sanity checks: ${formatSanityChecks(card, analysis)}`)
    console.log(`Required capabilities: ${required.join(', ') || 'None'}`)
    console.log(`Runtime-supported: ${coverage.supported.join(', ') || 'None'}`)
    console.log(`Runtime-missing: ${coverage.missing.join(', ') || 'None'}`)
    console.log(`Status: ${compilation.result.status}`)
    // Raw model output is only a local diagnostic; it is never executed.
    console.log(`Raw Gemini output:\n${rawOutputs.get(card.name) ?? '(none)'}`)
  }
}
