import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { analyzeDeckAbilities } from '../src/abilities/compiler/analyzeDeckAbilities'
import {
  analyzeSemanticCoverage,
  semanticCoverageCacheKey,
  SemanticCoverageCache,
  type SemanticCoverageCard,
} from '../src/abilities/compiler/semantic/semanticCoverage'
import {
  evaluateGeminiSanity,
  passesGeminiSanityGate,
} from '../src/abilities/compiler/semantic/semanticSanity'
import {
  DEFAULT_GEMINI_ABILITY_MODEL,
  GeminiSemanticAbilityProvider,
} from '../src/abilities/compiler/providers/geminiSemanticAbilityProvider'
import { parseDeckList } from '../src/data/deckParser'
import { resolveDeckEntries } from '../src/services/scryfall/scryfall'
import { loadDevEnvironment } from './load-dev-environment'

const cachePath = '.magicjarvis/gemini-semantic-cache.json'
const args = process.argv.slice(2)
const readFlag = (flag: string): string | undefined => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}
const force = args.includes('--force')
const cardName = readFlag('--card')
const debug = args.includes('--debug')
const cacheOnly = args.includes('--cache-only')
const requestedModel = readFlag('--model')
const flashModel = 'gemini-3.5-flash'
const sanityNames = ['Chrome Mox', "Cosi's Trickster", 'Deeproot Pilgrimage']

const loadCache = async (): Promise<SemanticCoverageCache> => {
  const cache = new SemanticCoverageCache()
  try {
    const raw = JSON.parse(await readFile(cachePath, 'utf8')) as {
      version?: unknown
      entries?: unknown
    }
    if (raw.version === 1 && Array.isArray(raw.entries))
      cache.restore(
        raw.entries as ReturnType<SemanticCoverageCache['entriesArray']>,
      )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn('Ignoring unreadable Gemini semantic cache.')
  }
  return cache
}

const saveCache = async (cache: SemanticCoverageCache): Promise<void> => {
  await mkdir('.magicjarvis', { recursive: true })
  await writeFile(
    cachePath,
    JSON.stringify({ version: 1, entries: cache.entriesArray() }, null, 2),
    'utf8',
  )
}

const printCard = (entry: SemanticCoverageCard): void => {
  console.log(`\n${entry.card.name}`)
  if (!entry.semanticAnalysis) {
    console.log(`Semantic: failed — ${entry.result.warnings?.join('; ') ?? ''}`)
    return
  }
  const abilities = entry.semanticAnalysis.abilities
  console.log(
    `Semantic: ${abilities.map((ability) => ability.abilityKind).join(', ')}`,
  )
  abilities.forEach((ability) => {
    if (ability.triggerDescription)
      console.log(`  Trigger: ${ability.triggerDescription}`)
    if (ability.effects.length)
      console.log(`  Effects: ${ability.effects.join('; ')}`)
    if (ability.choices.length)
      console.log(`  Choices: ${ability.choices.join('; ')}`)
    if (ability.targets.length)
      console.log(`  Targets: ${ability.targets.join('; ')}`)
  })
  console.log(
    `Required: ${entry.requiredCapabilities.join(', ') || 'None'}\nRuntime: ${entry.runtime}`,
  )
  if (debug) console.log(JSON.stringify(entry.semanticAnalysis, null, 2))
}

const printSanityComparison = (
  cards: SemanticCoverageCard[],
  cache: SemanticCoverageCache,
): boolean => {
  console.log('\nFlash vs Flash-Lite sanity\n')
  let passed = true
  cards.forEach((lite) => {
    const flash = cache.get(
      semanticCoverageCacheKey(lite.card, {
        providerId: 'gemini-semantic-analysis',
        model: flashModel,
        analyze: async () => undefined,
      }),
    )
    const flashEntry = flash
      ? ({
          ...lite,
          result: flash.result,
          semanticAnalysis: flash.semanticAnalysis,
          durationMs: flash.durationMs,
        } as SemanticCoverageCard)
      : undefined
    const flashSanity = evaluateGeminiSanity(flashEntry)
    const liteSanity = evaluateGeminiSanity(lite)
    passed &&= liteSanity.passed
    console.log(
      `${lite.card.name} | Flash: ${flashEntry ? 'cached' : 'unavailable'} (${flashSanity.passed ? 'pass' : 'n/a'}) | Flash-Lite: ${(lite.durationMs / 1000).toFixed(1)}s (${liteSanity.passed ? 'pass' : 'fail'})`,
    )
  })
  return passed && passesGeminiSanityGate(cards)
}

await loadDevEnvironment()
const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('Set GEMINI_API_KEY in .env.local before running this command.')
  process.exitCode = 1
} else {
  const deckText = await readFile(
    new URL('../src/data/decks/tritones.txt', import.meta.url),
    'utf8',
  )
  const deck = parseDeckList(deckText)
  const activeEntries = [deck.commander, ...deck.mainboard]
  const { definitions, notFound } = await resolveDeckEntries(activeEntries)
  if (notFound.length)
    throw new Error(`Unresolved cards: ${notFound.join(', ')}`)

  const cards = [...definitions.values()]
  const deterministic = analyzeDeckAbilities(cards)
  const cache = await loadCache()
  const model =
    requestedModel ??
    process.env.GEMINI_ABILITY_MODEL ??
    DEFAULT_GEMINI_ABILITY_MODEL
  const provider = new GeminiSemanticAbilityProvider({
    apiKey,
    model,
  })
  const shouldRunSanity = !cardName && !cacheOnly
  if (shouldRunSanity) {
    const sanityCards = cards.filter((card) => sanityNames.includes(card.name))
    const sanityReport = await analyzeSemanticCoverage(sanityCards, provider, {
      cache,
      minRequestIntervalMs: 13_000,
      onProgress: ({ current, total, card, source }) =>
        console.log(
          `[sanity ${current}/${total}] ${card.name} — ${source === 'cache' ? 'cache' : `Gemini ${model}`}`,
        ),
      onCachedEntry: () => saveCache(cache),
    })
    await saveCache(cache)
    if (!printSanityComparison(sanityReport.cards, cache)) {
      console.error(
        'Flash-Lite sanity gate failed; deck analysis was not started.',
      )
      process.exitCode = 2
    }
  }
  if (process.exitCode) {
    // The valid sanity cache remains available for a later retry.
  } else {
    const report = await analyzeSemanticCoverage(cards, provider, {
      cache,
      force,
      cardName,
      cacheOnly,
      minRequestIntervalMs: 13_000,
      onProgress: ({ current, total, card, source }) =>
        console.log(`[${current}/${total}] ${card.name} — ${source}`),
      onCachedEntry: () => saveCache(cache),
    })
    await saveCache(cache)

    console.log('\nMagicJarvis Semantic Coverage\n')
    console.log(`Model: ${model}`)
    console.log(`Active unique cards: ${cards.length}`)
    console.log(
      `NO_RUNTIME_ABILITY: ${deterministic.counts.NO_RUNTIME_ABILITY}`,
    )
    console.log(`Semantic analyzed: ${report.semanticAnalyzed}`)
    console.log(`FULLY_UNDERSTOOD: ${report.fullyUnderstood}`)
    console.log(`PARTIAL: ${report.partial}`)
    console.log(`FAILED: ${report.failed}`)
    console.log(`FAILED_SEMANTIC: ${report.failedSemantic}`)
    console.log(`FAILED_PROVIDER: ${report.failedProvider}`)
    console.log(`QUOTA_EXHAUSTED: ${report.quotaExhausted}`)
    console.log(`Gemini calls: ${report.providerCalls}`)
    console.log(`Cache hits: ${report.cacheHits}`)
    console.log(
      `Average duration: ${(report.averageDurationMs / 1000).toFixed(1)}s`,
    )
    console.log(
      `Total duration: ${(report.totalDurationMs / 1000).toFixed(1)}s`,
    )
    if (report.stoppedForRateLimit)
      console.log(
        'Stopped: Gemini Free Tier rate limit reached; valid results remain cached.',
      )

    console.log('\nCapability report\n')
    report.capabilities.forEach((item) => {
      console.log(
        `${item.capability} (${item.complexity}) — ${item.count}: ${item.cards.join(', ')}`,
      )
      if (item.unlocksAlone.length)
        console.log(`  Alone unlocks: ${item.unlocksAlone.join(', ')}`)
      if (item.cooccursWith.length)
        console.log(
          `  Often with: ${item.cooccursWith
            .slice(0, 5)
            .map((other) => `${other.capability} (${other.count})`)
            .join(', ')}`,
        )
    })

    console.log('\nUseful capability combinations\n')
    report.unlockCombinations
      .slice(0, 15)
      .forEach((combination) =>
        console.log(
          `${combination.capabilities.join(' + ')} → ${combination.unlockedCards.length}: ${combination.unlockedCards.join(', ')}`,
        ),
      )

    console.log('\nPer-card semantic understanding vs runtime support')
    report.cards.forEach(printCard)
  }
}
