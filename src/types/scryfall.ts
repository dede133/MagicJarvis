export type ScryfallCardFace = {
  name: string
  /** Available on localized Scryfall printings. */
  printed_name?: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  image_uris?: { normal?: string; large?: string }
  power?: string
  toughness?: string
  loyalty?: string
  colors?: string[]
  color_indicator?: string[]
}

/** A deliberately partial Scryfall API response. */
export type ScryfallCard = {
  id: string
  layout?: string
  set?: string
  collector_number?: string
  oracle_id?: string
  name: string
  /** Available on localized Scryfall printings. */
  printed_name?: string
  mana_cost?: string
  cmc: number
  type_line: string
  oracle_text?: string
  colors?: string[]
  color_identity?: string[]
  power?: string
  toughness?: string
  loyalty?: string
  image_uris?: { normal?: string; large?: string }
  card_faces?: ScryfallCardFace[]
}

export type ScryfallError = {
  object: 'error'
  status: number
  code: string
  details: string
}

export type ScryfallCollectionResponse = {
  object: 'list'
  data: ScryfallCard[]
  not_found?: Array<{ name?: string }>
}
