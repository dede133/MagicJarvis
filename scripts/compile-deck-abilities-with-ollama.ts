import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import {
  compileDeckWithProvider,
  selectCardsForProviderCompilation,
} from '../src/abilities/compiler/compileDeckWithProvider'
import { CompiledAbilityCache } from '../src/abilities/compiler/cache/abilityCache'
import {
  DEFAULT_OLLAMA_ABILITY_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  OllamaAbilityCompilerProvider,
} from '../src/abilities/compiler/providers/ollamaAbilityCompilerProvider'
import type {
  AbilityCompilerInput,
  CompiledCardAbilities,
} from '../src/abilities/compiler/types/compilerTypes'
import { parseDeckList } from '../src/data/deckParser'
import { resolveDeckEntries } from '../src/services/scryfall/scryfall'

const args = process.argv.slice(2)
const readFlag = (name: string): string | undefined => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const limitValue = readFlag('--limit')
const limit = limitValue === undefined ? undefined : Number(limitValue)
if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0))
  throw new Error('--limit must be a positive integer.')
const cardName = readFlag('--card')
const force = args.includes('--force')
const saveRaw = args.includes('--save-raw')

const cachePath = resolve('.magicjarvis/compiled-abilities.json')
const rawDirectory = resolve('.magicjarvis/ollama-raw')
const cache = new CompiledAbilityCache()
try {
  const saved = JSON.parse(await readFile(cachePath, 'utf8')) as unknown
  if (Array.isArray(saved))
    cache.restore(saved as Array<[string, CompiledCardAbilities]>)
} catch (error) {
  if (
    !(error instanceof Error) ||
    !('code' in error && error.code === 'ENOENT')
  )
    console.warn('Ignoring unreadable local ability cache.')
}

const rawOutputs: Array<{ input: AbilityCompilerInput; output: string }> = []
const provider = new OllamaAbilityCompilerProvider({
  baseUrl: process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
  model: process.env.OLLAMA_ABILITY_MODEL ?? DEFAULT_OLLAMA_ABILITY_MODEL,
  ...(saveRaw
    ? {
        onRawOutput: (output, input) => rawOutputs.push({ input, output }),
      }
    : {}),
})

const deckText = await readFile(
  new URL('../src/data/decks/tritones.txt', import.meta.url),
  'utf8',
)
const deck = parseDeckList(deckText)
const entries = [deck.commander, ...deck.mainboard]
const { definitions, notFound } = await resolveDeckEntries(entries)
if (notFound.length) throw new Error(`Unresolved cards: ${notFound.join(', ')}`)
const cards = [...definitions.values()]
const selected = selectCardsForProviderCompilation(cards, { limit, cardName })
if (!selected.length) {
  console.log('No manual or partial cards matched the requested selection.')
  process.exit(0)
}

const health = await provider.healthCheck()
if (!health.available) {
  console.error(`Ollama is unavailable: ${health.error ?? 'unknown error'}`)
  console.error('Start it with: brew services start ollama')
  process.exit(1)
}
if (!health.modelAvailable) {
  console.error(`Ollama model is not installed: ${provider.model}`)
  console.error(`Install it with: ollama pull ${provider.model}`)
  process.exit(1)
}

const report = await compileDeckWithProvider(
  cards,
  provider,
  { limit, cardName },
  {
    cache,
    force,
    onProgress: (current, total, card) =>
      console.log(`[${current}/${total}] ${card.name}...`),
  },
)

await mkdir(resolve('.magicjarvis'), { recursive: true })
await writeFile(cachePath, JSON.stringify(cache.entriesArray(), null, 2) + '\n')
if (saveRaw && rawOutputs.length) {
  await mkdir(rawDirectory, { recursive: true })
  await Promise.all(
    rawOutputs.map(({ input, output }) =>
      writeFile(
        resolve(
          rawDirectory,
          `${basename(input.cardName).replace(/[^a-z0-9]+/gi, '-')}.json`,
        ),
        output + '\n',
      ),
    ),
  )
}

console.log('\nMagicJarvis Ability Compilation\n')
console.log(`Cards analyzed: ${report.cardsAnalyzed}`)
console.log(`COMPILED: ${report.counts.COMPILED}`)
console.log(`PARTIAL: ${report.counts.PARTIAL}`)
console.log(`MANUAL: ${report.counts.MANUAL}`)
console.log(`FAILED: ${report.counts.FAILED}`)
console.log(`Provider calls: ${report.providerCalls}`)
console.log(`Cache hits: ${report.cacheHits}`)
console.log(`Model: ${report.model}`)
console.log('\nCapability gaps')
if (!Object.keys(report.capabilityGaps).length) console.log('None')
Object.entries(report.capabilityGaps).forEach(([category, count]) =>
  console.log(
    `${category} ${'.'.repeat(Math.max(1, 22 - category.length))} ${count}`,
  ),
)
report.results.forEach(
  ({ result, durationMs, semanticAnalysis, semanticValidationErrors }) => {
    console.log(
      `\n${result.cardName}\nStatus: ${result.status}\nDuration: ${(durationMs / 1000).toFixed(1)}s`,
    )
    console.log('Abilities:')
    console.log(
      result.abilities.length
        ? JSON.stringify(result.abilities, null, 2)
        : 'None',
    )
    console.log('Capability gaps:')
    console.log(
      result.capabilityGaps?.length
        ? result.capabilityGaps
            .map((gap) => `- ${gap.category}: ${gap.description}`)
            .join('\n')
        : 'None',
    )
    if (result.warnings?.length)
      console.log(`Warnings: ${result.warnings.join('; ')}`)
    if (semanticAnalysis)
      console.log(
        `Semantic analysis:\n${JSON.stringify(semanticAnalysis, null, 2)}`,
      )
    if (semanticValidationErrors?.length)
      console.log(`Semantic validation: ${semanticValidationErrors.join('; ')}`)
  },
)
