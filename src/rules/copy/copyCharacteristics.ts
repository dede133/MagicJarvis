import type { CardDefinition, CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import { currentFaceDefinition } from '../transform/transformRules'

type CopyEffect = NonNullable<GameState['copyContinuousEffects']>[number]

const activeCopyEffectFor = (
  cards: CardInstance[],
  effects: CopyEffect[],
  card: CardInstance,
): CopyEffect | undefined =>
  effects.find((effect) => {
    if (effect.targetInstanceId !== card.instanceId) return false
    if (effect.duration !== 'WHILE_SOURCE_ON_BATTLEFIELD') return true
    return cards.some(
      (candidate) =>
        candidate.instanceId === effect.sourceInstanceId &&
        candidate.zone === 'battlefield',
    )
  })

/**
 * Returns the copiable values of an object after copy effects, but before
 * counters, attachments and non-copy continuous effects are applied.
 */
export const copiableCardDefinitionFromParts = (
  cards: CardInstance[],
  effects: CopyEffect[],
  card: CardInstance,
  visited = new Set<string>(),
): CardDefinition => {
  if (visited.has(card.instanceId)) return currentFaceDefinition(card)
  const effect = activeCopyEffectFor(cards, effects, card)
  if (!effect) return currentFaceDefinition(card)
  if (effect.copiedCard) return effect.copiedCard

  const copiedFrom = cards.find(
    (candidate) => candidate.instanceId === effect.copiedFromInstanceId,
  )
  if (!copiedFrom) return currentFaceDefinition(card)

  const nextVisited = new Set(visited)
  nextVisited.add(card.instanceId)
  return copiableCardDefinitionFromParts(
    cards,
    effects,
    copiedFrom,
    nextVisited,
  )
}

export const copiableKeywordsFromParts = (
  cards: CardInstance[],
  effects: CopyEffect[],
  card: CardInstance,
  visited = new Set<string>(),
): NonNullable<CardInstance['keywords']> => {
  if (visited.has(card.instanceId)) return card.keywords ?? []
  const effect = activeCopyEffectFor(cards, effects, card)
  if (!effect) return card.keywords ?? []
  if (effect.copiedKeywords) return effect.copiedKeywords
  const copiedFrom = cards.find(
    (candidate) => candidate.instanceId === effect.copiedFromInstanceId,
  )
  if (!copiedFrom) return []
  const nextVisited = new Set(visited)
  nextVisited.add(card.instanceId)
  return copiableKeywordsFromParts(cards, effects, copiedFrom, nextVisited)
}

export const effectiveCopiableKeywords = (
  state: GameState,
  card: CardInstance,
): NonNullable<CardInstance['keywords']> =>
  copiableKeywordsFromParts(
    state.cards,
    state.copyContinuousEffects ?? [],
    card,
  )

export const effectiveCardDefinition = (
  state: GameState,
  card: CardInstance,
): CardDefinition => {
  const copied = copiableCardDefinitionFromParts(
    state.cards,
    state.copyContinuousEffects ?? [],
    card,
  )
  const colorSetter = [...(state.temporaryCharacteristicEffects ?? [])]
    .reverse()
    .find(
      (effect) =>
        effect.targetInstanceId === card.instanceId && effect.setColors,
    )
  return colorSetter?.setColors
    ? { ...copied, colors: [...colorSetter.setColors] }
    : copied
}

/** A rules-only view. Physical/object state remains on the original instance. */
export const effectiveCardInstance = (
  state: GameState,
  card: CardInstance,
): CardInstance => ({
  ...card,
  card: effectiveCardDefinition(state, card),
  keywords: effectiveCopiableKeywords(state, card),
})
