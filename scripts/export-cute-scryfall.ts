import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseDeckList } from '../src/data/deckParser'
import { resolveDeckList } from '../src/services/deckResolver'
import { getDeckCommanders } from '../src/types/deck'

const projectRoot = resolve(new URL('..', import.meta.url).pathname)
const deckPath = resolve(projectRoot, 'src/data/decks/cute.txt')
const outputPath = resolve(projectRoot, 'tmp/cute-scryfall.json')

const deckText = await readFile(deckPath, 'utf8')
const deck = parseDeckList(deckText)
const resolution = await resolveDeckList('Cute', deck)

if (resolution.notFound.length) {
  throw new Error(
    `No se pudieron resolver estas cartas en Scryfall: ${resolution.notFound.join(', ')}`,
  )
}

if (!resolution.deck) throw new Error('Scryfall no devolvió un mazo resuelto.')

const commanders = resolution.deck.commanders ?? [resolution.deck.commander]
const cards = [
  ...commanders.map((entry) => ({ section: 'commander' as const, ...entry })),
  ...resolution.deck.mainboard.map((entry) => ({
    section: 'mainboard' as const,
    ...entry,
  })),
]

await mkdir(resolve(projectRoot, 'tmp'), { recursive: true })
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      deck: resolution.deck.name,
      cards,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`Exportadas ${cards.length} entradas activas a ${outputPath}`)
