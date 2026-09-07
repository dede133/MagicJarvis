import { readFile } from 'node:fs/promises'
import { CompiledAbilityCache } from '../src/abilities/compiler/cache/abilityCache'
import { compileCardAbilitiesWithProvider } from '../src/abilities/compiler/compileCardAbilities'
import {
  DEFAULT_OLLAMA_BASE_URL,
  OllamaAbilityCompilerProvider,
} from '../src/abilities/compiler/providers/ollamaAbilityCompilerProvider'
import { getCapabilityCoverage } from '../src/abilities/compiler/semantic/capabilityCoverage'
import type { AbilityCompilerInput } from '../src/abilities/compiler/types/compilerTypes'
import { parseDeckList } from '../src/data/deckParser'
import { resolveDeckEntries } from '../src/services/scryfall/scryfall'
import type { CardDefinition } from '../src/types/card'

const args = process.argv.slice(2)
const readFlag = (name: string): string | undefined => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const cardsFlag = readFlag('--cards')
if (!cardsFlag) throw new Error('Use --cards "Card A,Card B".')
const requestedNames = cardsFlag
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean)
if (!requestedNames.length)
  throw new Error('--cards must include at least one card.')
const requestedModels = readFlag('--models') ?? readFlag('--model')
const models = (
  requestedModels
    ? requestedModels.split(',')
    : ['qwen3:4b-instruct', 'qwen3.5:4b']
)
  .map((model) => model.trim())
  .filter(Boolean)

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
if (notFound.length) throw new Error(`Unresolved cards: ${notFound.join(', ')}`)
const cards = selectedEntries.map((entry) => {
  const definition = definitions.get(
    entry.setCode && entry.collectorNumber
      ? `printing:${entry.setCode.toLocaleLowerCase()}:${entry.collectorNumber.toLocaleLowerCase()}`
      : `name:${entry.name.toLocaleLowerCase()}`,
  )
  if (!definition) throw new Error(`No definition found for ${entry.name}`)
  return definition
})

type Diagnostic = {
  card: CardDefinition
  model: string
  status: string
  durationMs: number
  validation: string
  required: string[]
  supported: string[]
  missing: string[]
}
const diagnostics: Diagnostic[] = []

for (const model of models) {
  const rawOutputs = new Map<string, string>()
  const provider = new OllamaAbilityCompilerProvider({
    baseUrl: process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    model,
    onRawOutput: (output, input: AbilityCompilerInput) =>
      rawOutputs.set(input.cardName, output),
  })
  const health = await provider.healthCheck()
  if (!health.available)
    throw new Error(`Ollama unavailable: ${health.error ?? 'unknown error'}`)
  if (!health.modelAvailable) throw new Error(`Ollama model missing: ${model}`)

  console.log(`\n=== Semantic diagnosis: ${model} ===`)
  for (const [index, card] of cards.entries()) {
    console.log(`\n[${index + 1}/${cards.length}] ${card.name}`)
    const startedAt = performance.now()
    // A fresh cache per model guarantees no cross-model reuse.
    const compilation = await compileCardAbilitiesWithProvider(card, provider, {
      cache: new CompiledAbilityCache(),
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
    console.log(`Oracle text:\n${card.oracleText ?? '(none)'}`)
    console.log(
      `SemanticAbilityAnalysis:\n${JSON.stringify(analysis ?? null, null, 2)}`,
    )
    console.log(`Required capabilities: ${required.join(', ') || 'None'}`)
    console.log(
      `Supported capabilities: ${coverage.supported.join(', ') || 'None'}`,
    )
    console.log(
      `Missing capabilities: ${coverage.missing.join(', ') || 'None'}`,
    )
    console.log(`Status: ${compilation.result.status}`)
    console.log(`Semantic validation: ${validation}`)
    console.log(`Raw Ollama output:\n${rawOutputs.get(card.name) ?? '(none)'}`)
    diagnostics.push({
      card,
      model,
      status: compilation.result.status,
      durationMs,
      validation,
      required,
      supported: coverage.supported,
      missing: coverage.missing,
    })
  }
}

console.log('\n=== A/B comparison ===')
console.log(`Card | ${models.join(' | ')} | time | semantic validation`)
cards.forEach((card) => {
  const rows = diagnostics.filter(
    (diagnostic) => diagnostic.card.name === card.name,
  )
  const statuses = models.map(
    (model) => rows.find((row) => row.model === model)?.status ?? 'not run',
  )
  const times = models.map((model) => {
    const duration = rows.find((row) => row.model === model)?.durationMs
    return duration === undefined ? 'n/a' : `${(duration / 1000).toFixed(1)}s`
  })
  const validation = models.map((model) => {
    const value =
      rows.find((row) => row.model === model)?.validation ?? 'not run'
    return value === 'valid' ? 'valid' : 'rejected/failed'
  })
  console.log(
    `${card.name} | ${statuses.join(' | ')} | ${times.join(', ')} | ${validation.join(', ')}`,
  )
})
