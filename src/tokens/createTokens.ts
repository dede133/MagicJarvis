import type { CardInstance } from '../types/card'
import type { TokenDefinition } from './tokenTypes'

const asCardDefinition = (token: TokenDefinition) => ({
  scryfallId: `token-${token.id}`,
  name: token.name,
  cmc: 0,
  typeLine: token.typeLine,
  colors: token.colors,
  colorIdentity: token.colors,
  ...(token.power !== undefined ? { power: token.power } : {}),
  ...(token.toughness !== undefined ? { toughness: token.toughness } : {}),
})

export const createTokenInstances = (
  token: TokenDefinition,
  amount: number,
  existingCards: CardInstance[],
  options: {
    controllerId?: string
    ownerId?: string
    localPlayerId?: string
    tapped?: boolean
  } = {},
): CardInstance[] => {
  const start = existingCards.filter(
    (card) => card.tokenDefinitionId === token.id,
  ).length
  return Array.from({ length: amount }, (_, index) => ({
    instanceId: `token-${token.id}-${start + index + 1}`,
    card: asCardDefinition(token),
    zone: 'battlefield' as const,
    tapped: options.tapped ?? false,
    counters: {},
    ownerId: options.ownerId ?? options.controllerId ?? 'player-1',
    controllerId: options.controllerId ?? 'player-1',
    controller:
      (options.controllerId ?? 'player-1') ===
      (options.localPlayerId ?? 'player-1')
        ? 'YOU'
        : 'OPPONENT',
    isToken: true,
    tokenDefinitionId: token.id,
    keywords: token.keywords ?? [],
  }))
}
