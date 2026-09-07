import type { CardInstance } from '../types/card'

/** Returns a context-dependent human label; it is never an identity for the card. */
export const getVisualCardLabel = (
  instance: CardInstance,
  visibleCards: CardInstance[],
): string => {
  const sameName = visibleCards.filter(
    (card) => card.card.name === instance.card.name,
  )
  if (sameName.length < 2) return instance.card.name
  return `${instance.card.name} ${sameName.findIndex((card) => card.instanceId === instance.instanceId) + 1}`
}
