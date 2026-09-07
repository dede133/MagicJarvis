import { readFile } from 'node:fs/promises'
import {
  buildCapabilityReport,
  type SemanticCoverageEntry,
} from '../src/abilities/compiler/semantic/semanticCoverage'
import { getCapabilityCoverage } from '../src/abilities/compiler/semantic/capabilityCoverage'
import { deriveCapabilitiesForSemanticAnalysis } from '../src/abilities/compiler/semantic/deriveCapabilities'
import { mapSemanticAnalysisToRuntime } from '../src/abilities/compiler/semantic/mapSemanticAnalysisToRuntime'

const cachePath = '.magicjarvis/gemini-semantic-cache.json'
const model = process.env.GEMINI_ABILITY_MODEL ?? 'gemini-3.5-flash-lite'

type CacheFile = { version?: unknown; entries?: unknown }

const raw = JSON.parse(await readFile(cachePath, 'utf8')) as CacheFile
if (raw.version !== 1 || !Array.isArray(raw.entries))
  throw new Error('No readable semantic cache is available.')

const entries = raw.entries as Array<[string, SemanticCoverageEntry]>
const analyses = entries
  .filter(([key]) => key.includes(`model:${model}`))
  .map(([, entry]) => entry.semanticAnalysis)
const uniqueByCard = new Map(
  analyses.map((analysis) => [analysis.cardName, analysis]),
)
const cards = [...uniqueByCard.values()].map((analysis) => {
  const requiredCapabilities = deriveCapabilitiesForSemanticAnalysis(analysis)
  const coverage = getCapabilityCoverage(requiredCapabilities)
  const mapped = mapSemanticAnalysisToRuntime(
    {
      cardName: analysis.cardName,
      typeLine: '',
      oracleText: analysis.oracleText,
    },
    analysis,
  )
  return {
    card: { name: analysis.cardName },
    result: mapped,
    semanticAnalysis: analysis,
    durationMs: 0,
    providerCall: false,
    cacheHit: true,
    understanding: 'FULLY_UNDERSTOOD' as const,
    runtime:
      mapped.status === 'COMPILED'
        ? ('READY' as const)
        : coverage.missing.length
          ? ('PARTIAL' as const)
          : ('UNSUPPORTED' as const),
    requiredCapabilities,
    missingCapabilities: coverage.missing,
  }
})

const capabilities = buildCapabilityReport(cards)
console.log('MagicJarvis Runtime Coverage (semantic cache only)\n')
console.log(`Model cache: ${model}`)
console.log(`Semantic cached cards: ${cards.length}`)
console.log(`READY: ${cards.filter((card) => card.runtime === 'READY').length}`)
console.log(
  `PARTIAL: ${cards.filter((card) => card.runtime === 'PARTIAL').length}`,
)
console.log(
  `Capability-covered but awaiting a deterministic mapper: ${cards.filter((card) => card.missingCapabilities.length === 0 && card.runtime !== 'READY').length}`,
)
console.log('\nNewly supported runtime capabilities')
console.log(
  'ENTER_BATTLEFIELD, DRAW_CARD, MOVE_ZONE, UNTAP_PERMANENT, PLAYER_CHOICE, TARGET_SELECTION',
)
console.log(
  'ADD_COUNTER, PLAYER_SHUFFLED, PERMANENT_BECAME_TAPPED, basic event filters',
)
console.log('TOKEN_KEYWORD_ABILITY data + HEXPROOF target legality')
console.log(
  'ACTIVATED_ABILITY, TAP_SOURCE, MANA_PRODUCTION and simple derived STATIC_ABILITY data',
)
console.log('\nRemaining gaps')
capabilities
  .filter((item) => getCapabilityCoverage([item.capability]).missing.length > 0)
  .slice(0, 15)
  .forEach((item) =>
    console.log(`${item.capability} — ${item.count}: ${item.cards.join(', ')}`),
  )
console.log('\nCards currently READY')
const ready = cards.filter((card) => card.runtime === 'READY')
console.log(
  ready.length ? ready.map((card) => card.card.name).join(', ') : 'None',
)

console.log('\nFocused partial cards')
for (const name of ['Mana Drain', 'Kiora, the Rising Tide']) {
  const card = cards.find((candidate) => candidate.card.name === name)
  if (!card) continue
  const fragments = card.result.unsupportedFragments?.filter(Boolean) ?? []
  console.log(`${name}: ${card.runtime}`)
  console.log(
    `  Gaps: ${card.missingCapabilities.length ? card.missingCapabilities.join(', ') : 'deterministic mapper / unsupported semantic fragment'}`,
  )
  if (fragments.length) console.log(`  Unsupported: ${fragments.join(' | ')}`)
  const oracle = card.semanticAnalysis.oracleText?.toLocaleLowerCase() ?? ''
  const limitations = [
    ...(oracle.includes('beginning of your next main phase')
      ? ['delayed next-main-phase effect and referenced mana value']
      : []),
    ...(oracle.includes('discard two') ? ['multi-card discard selection'] : []),
    ...(oracle.includes('attacks')
      ? ['attack trigger / threshold condition']
      : []),
  ]
  if (limitations.length) console.log(`  Detail: ${limitations.join('; ')}`)
}
