import type { DeckEntry } from '../../types/deck'
import type { CardDefinition, CardFace, ManaColor } from '../../types/card'
import type {
  ScryfallCard,
  ScryfallCardFace,
  ScryfallCollectionResponse,
  ScryfallError,
} from '../../types/scryfall'

const SCRYFALL_API = 'https://api.scryfall.com'
const collectionChunkSize = 75
const manaColors: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C']
const scryfallHeaders = (json = false): HeadersInit => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(typeof window === 'undefined'
    ? { 'User-Agent': 'MagicJarvis/0.1 (deck ability analysis)' }
    : {}),
})

export class ScryfallServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ScryfallServiceError'
  }
}

type ScryfallIdentifier = {
  name?: string
  set?: string
  collector_number?: string
}
type IdentifierRequest = {
  key: string
  label: string
  identifier: ScryfallIdentifier
}
type ResolvedIdentifiers = {
  definitions: Map<string, CardDefinition>
  notFound: string[]
}

const toManaColors = (values?: string[]): ManaColor[] =>
  (values ?? []).filter((value): value is ManaColor =>
    manaColors.includes(value as ManaColor),
  )

const toFace = (face: ScryfallCardFace): CardFace => ({
  name: face.name,
  manaCost: face.mana_cost,
  typeLine: face.type_line,
  oracleText: face.oracle_text,
  image: face.image_uris?.normal ?? face.image_uris?.large,
  power: face.power,
  toughness: face.toughness,
  loyalty: face.loyalty,
  ...(face.colors ? { colors: toManaColors(face.colors) } : {}),
  ...(face.color_indicator
    ? { colorIndicator: toManaColors(face.color_indicator) }
    : {}),
})

export const toCardDefinition = (card: ScryfallCard): CardDefinition => {
  const defaultFace =
    card.layout === 'transform' || card.layout === 'modal_dfc'
      ? card.card_faces?.[0]
      : undefined
  return {
    scryfallId: card.id,
    layout: card.layout,
    oracleId: card.oracle_id,
    name: defaultFace?.name ?? card.name,
    manaCost: card.mana_cost ?? defaultFace?.mana_cost,
    cmc: card.cmc,
    typeLine: defaultFace?.type_line ?? card.type_line,
    oracleText: card.oracle_text ?? defaultFace?.oracle_text,
    colors: toManaColors(card.colors ?? defaultFace?.colors),
    colorIdentity: toManaColors(card.color_identity),
    power: card.power ?? defaultFace?.power,
    toughness: card.toughness ?? defaultFace?.toughness,
    loyalty: card.loyalty ?? defaultFace?.loyalty,
    image:
      card.image_uris?.normal ??
      card.image_uris?.large ??
      defaultFace?.image_uris?.normal ??
      defaultFace?.image_uris?.large,
    cardFaces: card.card_faces?.map(toFace),
    ...(card.printed_name && card.printed_name !== (defaultFace?.name ?? card.name)
      ? { localizedAliases: [card.printed_name] }
      : {}),
  }
}


const getCard = async (path: string): Promise<CardDefinition> => {
  let response: Response
  try {
    response = await fetch(`${SCRYFALL_API}${path}`, {
      headers: scryfallHeaders(),
    })
  } catch {
    throw new ScryfallServiceError('No se pudo conectar con Scryfall.')
  }
  const body = (await response.json()) as ScryfallCard | ScryfallError
  if (!response.ok)
    throw new ScryfallServiceError(
      'details' in body ? body.details : 'Respuesta inválida de Scryfall.',
      response.status,
    )
  return toCardDefinition(body as ScryfallCard)
}

export const searchCardByName = (name: string): Promise<CardDefinition> =>
  getCard(`/cards/named?exact=${encodeURIComponent(name)}`)
export const getCardByScryfallId = (id: string): Promise<CardDefinition> =>
  getCard(`/cards/${encodeURIComponent(id)}`)

export type ResolvedCardList = { cards: CardDefinition[]; notFound: string[] }

export const deckEntryKey = (entry: DeckEntry): string =>
  entry.setCode && entry.collectorNumber
    ? `printing:${entry.setCode.toLocaleLowerCase()}:${entry.collectorNumber.toLocaleLowerCase()}`
    : `name:${entry.name.toLocaleLowerCase()}`

const requestForEntry = (entry: DeckEntry): IdentifierRequest =>
  entry.setCode && entry.collectorNumber
    ? {
        key: deckEntryKey(entry),
        label: entry.name,
        identifier: {
          set: entry.setCode.toLocaleLowerCase(),
          collector_number: entry.collectorNumber,
        },
      }
    : {
        key: deckEntryKey(entry),
        label: entry.name,
        identifier: { name: entry.name },
      }

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )

const matchesRequest = (
  card: ScryfallCard,
  request: IdentifierRequest,
): boolean =>
  request.identifier.name
    ? card.name.toLocaleLowerCase() ===
      request.identifier.name.toLocaleLowerCase()
    : card.set?.toLocaleLowerCase() === request.identifier.set &&
      card.collector_number?.toLocaleLowerCase() ===
        request.identifier.collector_number?.toLocaleLowerCase()

const resolveCollectionChunk = async (
  requests: IdentifierRequest[],
): Promise<ResolvedIdentifiers> => {
  let response: Response
  try {
    response = await fetch(`${SCRYFALL_API}/cards/collection`, {
      method: 'POST',
      headers: scryfallHeaders(true),
      body: JSON.stringify({
        identifiers: requests.map((request) => request.identifier),
      }),
    })
  } catch {
    throw new ScryfallServiceError('No se pudo conectar con Scryfall.')
  }

  const body = (await response.json()) as
    ScryfallCollectionResponse | ScryfallError
  if (!response.ok)
    throw new ScryfallServiceError(
      'details' in body ? body.details : 'Respuesta inválida de Scryfall.',
      response.status,
    )
  const data = (body as ScryfallCollectionResponse).data
  const definitions = new Map<string, CardDefinition>()
  const notFound: string[] = []
  requests.forEach((request) => {
    const card = data.find((candidate) => matchesRequest(candidate, request))
    if (card) definitions.set(request.key, toCardDefinition(card))
    else notFound.push(request.label)
  })
  return { definitions, notFound }
}

const resolveRequests = async (
  requests: IdentifierRequest[],
): Promise<ResolvedIdentifiers> => {
  const unique = [
    ...new Map(requests.map((request) => [request.key, request])).values(),
  ]
  const results = await Promise.all(
    chunks(unique, collectionChunkSize).map(resolveCollectionChunk),
  )
  return results.reduce<ResolvedIdentifiers>(
    (resolved, result) => ({
      definitions: new Map([...resolved.definitions, ...result.definitions]),
      notFound: [...resolved.notFound, ...result.notFound],
    }),
    { definitions: new Map(), notFound: [] },
  )
}

/** Resolves unique names in collection batches; quantities never create extra requests. */
export const resolveCardNames = async (
  names: string[],
): Promise<ResolvedCardList> => {
  const result = await resolveRequests(
    names.map((name) => requestForEntry({ quantity: 1, name })),
  )
  return { cards: [...result.definitions.values()], notFound: result.notFound }
}

/** Resolves exact printings when a deck export provides set and collector number. */
export const resolveDeckEntries = async (
  entries: DeckEntry[],
): Promise<ResolvedIdentifiers> => resolveRequests(entries.map(requestForEntry))
