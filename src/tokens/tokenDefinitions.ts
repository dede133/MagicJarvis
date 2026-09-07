import type { TokenDefinition } from './tokenTypes'

export const BLUE_MERFOLK_1_1: TokenDefinition = {
  id: 'BLUE_MERFOLK_1_1',
  name: 'Merfolk Token',
  colors: ['U'],
  typeLine: 'Token Creature — Merfolk',
  power: '1',
  toughness: '1',
}

export const BLUE_MERFOLK_1_1_HEXPROOF: TokenDefinition = {
  ...BLUE_MERFOLK_1_1,
  id: 'BLUE_MERFOLK_1_1_HEXPROOF',
  keywords: ['HEXPROOF'],
}

export const SCION_OF_THE_DEEP_8_8: TokenDefinition = {
  id: 'SCION_OF_THE_DEEP_8_8',
  name: 'Scion of the Deep',
  colors: ['U'],
  typeLine: 'Legendary Token Creature — Octopus',
  power: '8',
  toughness: '8',
}

export const FOOD_TOKEN: TokenDefinition = {
  id: 'FOOD_TOKEN',
  name: 'Food Token',
  colors: [],
  typeLine: 'Token Artifact — Food',
}

export const BLUE_FISH_1_1: TokenDefinition = {
  id: 'BLUE_FISH_1_1',
  name: 'Fish Token',
  colors: ['U'],
  typeLine: 'Token Creature — Fish',
  power: '1',
  toughness: '1',
}


export const TREASURE_TOKEN: TokenDefinition = {
  id: 'TREASURE_TOKEN',
  name: 'Treasure Token',
  colors: [],
  typeLine: 'Token Artifact — Treasure',
}

export const MUTAGEN_TOKEN: TokenDefinition = {
  id: 'MUTAGEN_TOKEN',
  name: 'Mutagen Token',
  colors: [],
  typeLine: 'Token Artifact — Mutagen',
}

export const WHITE_ALLY_1_1: TokenDefinition = {
  id: 'WHITE_ALLY_1_1',
  name: 'Ally Token',
  colors: ['W'],
  typeLine: 'Token Creature — Ally',
  power: '1',
  toughness: '1',
}

export const tokenDefinitions: Record<string, TokenDefinition> = {
  [BLUE_MERFOLK_1_1.id]: BLUE_MERFOLK_1_1,
  [BLUE_MERFOLK_1_1_HEXPROOF.id]: BLUE_MERFOLK_1_1_HEXPROOF,
  [SCION_OF_THE_DEEP_8_8.id]: SCION_OF_THE_DEEP_8_8,
  [FOOD_TOKEN.id]: FOOD_TOKEN,
  [BLUE_FISH_1_1.id]: BLUE_FISH_1_1,
  [WHITE_ALLY_1_1.id]: WHITE_ALLY_1_1,
  [TREASURE_TOKEN.id]: TREASURE_TOKEN,
  [MUTAGEN_TOKEN.id]: MUTAGEN_TOKEN,
}
