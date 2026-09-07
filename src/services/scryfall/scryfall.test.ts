import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveCardNames, resolveDeckEntries } from './scryfall'

const scryfallCard = (name: string, id = name.toLocaleLowerCase()): object => ({
  id,
  name,
  cmc: 0,
  type_line: 'Land',
  colors: [],
  color_identity: [],
})

const collectionResponse = (names: string[]) =>
  new Response(
    JSON.stringify({
      object: 'list',
      data: names.map((name) => scryfallCard(name)),
    }),
    { status: 200 },
  )

afterEach(() => vi.unstubAllGlobals())

describe('resolveCardNames', () => {
  it('resolves a repeated card name only once', async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => collectionResponse(['Island']))
    vi.stubGlobal('fetch', fetchMock)
    await resolveCardNames(Array.from({ length: 34 }, () => 'Island'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      identifiers: [{ name: 'Island' }],
    })
  })

  it('chunks more than 75 unique names', async () => {
    const names = Array.from({ length: 76 }, (_, index) => `Card ${index + 1}`)
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        identifiers: Array<{ name: string }>
      }
      return collectionResponse(
        body.identifiers.map((identifier) => identifier.name),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await resolveCardNames(names)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).identifiers,
    ).toHaveLength(75)
    expect(
      JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).identifiers,
    ).toHaveLength(1)
    expect(result.cards).toHaveLength(76)
  })

  it('uses set and collector number when a deck entry provides an exact printing', async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            object: 'list',
            data: [
              {
                ...scryfallCard('Island', 'exact-island'),
                set: 'eoe',
                collector_number: '269',
              },
            ],
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await resolveDeckEntries([
      {
        quantity: 30,
        name: 'Island',
        setCode: 'EOE',
        collectorNumber: '269',
      },
    ])
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      identifiers: [{ set: 'eoe', collector_number: '269' }],
    })
    expect(result.definitions.get('printing:eoe:269')?.scryfallId).toBe(
      'exact-island',
    )
  })

  it('keeps name resolution as a fallback when no printing data exists', async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => collectionResponse(['Counterspell']))
    vi.stubGlobal('fetch', fetchMock)
    await resolveDeckEntries([{ quantity: 1, name: 'Counterspell' }])
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      identifiers: [{ name: 'Counterspell' }],
    })
  })

  it('preserves double-faced card data for later transform support', async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            object: 'list',
            data: [
              {
                ...scryfallCard('Front // Back', 'double-faced'),
                type_line: 'Legendary Creature // Legendary Creature',
                card_faces: [
                  {
                    name: 'Front',
                    mana_cost: '{1}{U}',
                    type_line: 'Legendary Creature',
                    oracle_text: 'Transform Front.',
                    power: '2',
                    toughness: '2',
                  },
                  {
                    name: 'Back',
                    type_line: 'Legendary Creature',
                    oracle_text: 'Flying',
                    power: '4',
                    toughness: '4',
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await resolveCardNames(['Front // Back'])
    expect(result.cards[0].cardFaces).toEqual([
      expect.objectContaining({
        name: 'Front',
        oracleText: 'Transform Front.',
      }),
      expect.objectContaining({ name: 'Back', oracleText: 'Flying' }),
    ])
  })

  it('keeps a localized printed name as prepared alias metadata', async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            object: 'list',
            data: [
              { ...scryfallCard('Sol Ring'), printed_name: 'Anillo solar' },
            ],
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await resolveCardNames(['Sol Ring'])
    expect(result.cards[0].localizedAliases).toEqual(['Anillo solar'])
  })
})
