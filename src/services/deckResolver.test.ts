import { afterEach, describe, expect, it, vi } from 'vitest'
import cuteDeckText from '../data/decks/cute.txt?raw'
import { parseDeckList } from '../data/deckParser'
import { getDeckCommanders } from '../types/deck'
import { resolveDeckList } from './deckResolver'

afterEach(() => vi.unstubAllGlobals())

describe('resolveDeckList', () => {
  it('resolves every active Cute card and preserves both commanders', async () => {
    const list = parseDeckList(cuteDeckText)
    const activeEntries = [...getDeckCommanders(list), ...list.mainboard]
    const printingNames = new Map(
      activeEntries.map((entry) => [
        `${entry.setCode?.toLocaleLowerCase()}:${entry.collectorNumber?.toLocaleLowerCase()}`,
        entry.name,
      ]),
    )
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        identifiers: Array<{
          set?: string
          collector_number?: string
          name?: string
        }>
      }
      return new Response(
        JSON.stringify({
          object: 'list',
          data: body.identifiers.map((identifier, index) => {
            const printingKey =
              `${identifier.set?.toLocaleLowerCase()}:` +
              `${identifier.collector_number?.toLocaleLowerCase()}`
            const name = identifier.name ?? printingNames.get(printingKey)
            if (!name)
              throw new Error(`Missing mock card for ${printingKey}`)
            return {
              id: `mock-${index}-${name}`,
              name,
              cmc: 0,
              type_line: 'Legendary Creature',
              colors: [],
              color_identity: [],
              set: identifier.set,
              collector_number: identifier.collector_number,
            }
          }),
        }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolution = await resolveDeckList('Cute', list)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(resolution.notFound).toEqual([])
    expect(resolution.resolvedUniqueCards).toBe(89)
    expect(resolution.deck?.commanders?.map((entry) => entry.name)).toEqual([
      'Ishai, Ojutai Dragonspeaker',
      'Yoshimaru, Ever Faithful',
    ])
    expect(resolution.deck?.commander.name).toBe('Ishai, Ojutai Dragonspeaker')
    expect(resolution.deck?.mainboard).toHaveLength(87)
  })
})
