import type { CardDefinition } from '../types/card'

/** Token data can preserve a keyword before the full rules enforcement exists. */
export type KeywordAbility =
  | 'HEXPROOF'
  | 'INDESTRUCTIBLE'
  | 'HASTE'
  | 'FLYING'
  | 'WARD_1'
  | 'WARD_2'
  | 'WARD_3'

export type TokenDefinition = {
  id: string
  name: string
  colors: CardDefinition['colors']
  typeLine: string
  power?: string
  toughness?: string
  keywords?: KeywordAbility[]
}
