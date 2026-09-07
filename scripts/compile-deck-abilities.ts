import { readFile } from 'node:fs/promises'
import { analyzeDeckAbilities } from '../src/abilities/compiler/analyzeDeckAbilities'
import { parseDeckList } from '../src/data/deckParser'
import { resolveDeckEntries } from '../src/services/scryfall/scryfall'

const deckText = await readFile(
  new URL('../src/data/decks/tritones.txt', import.meta.url),
  'utf8',
)
const deck = parseDeckList(deckText)
const entries = [deck.commander, ...deck.mainboard]
const { definitions, notFound } = await resolveDeckEntries(entries)
const analysis = analyzeDeckAbilities([...definitions.values()])

console.log('MagicJarvis Ability Analysis\n')
console.log(`Active unique cards: ${entries.length}`)
console.log(`COMPILED: ${analysis.counts.COMPILED}`)
console.log(`PARTIAL: ${analysis.counts.PARTIAL}`)
console.log(`MANUAL: ${analysis.counts.MANUAL}`)
console.log(`NO_RUNTIME_ABILITY: ${analysis.counts.NO_RUNTIME_ABILITY}`)
console.log(`FAILED: ${analysis.counts.FAILED}`)
if (notFound.length) console.log(`Unresolved: ${notFound.join(', ')}`)
for (const result of analysis.results.filter(
  (item) => item.status !== 'NO_RUNTIME_ABILITY',
))
  console.log(
    `${result.cardName}\n${result.status === 'COMPILED' ? '✓ compiled' : '○ unsupported'}`,
  )
