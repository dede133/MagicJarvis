import type { CardDefinition, CardFace, CardInstance, ManaColor } from '../../types/card'

const faceColors = (face: CardFace, fallback: ManaColor[]): ManaColor[] =>
  face.colors !== undefined
    ? face.colors
    : face.colorIndicator !== undefined
      ? face.colorIndicator
      : fallback

/** A transforming DFC can transform only while represented by its physical two-faced card. */
export const isTransformingDoubleFacedCard = (
  card: CardDefinition,
): boolean =>
  card.cardFaces?.length === 2 &&
  (card.layout === 'transform' ||
    // Legacy/test definitions may predate layout being stored.
    card.cardFaces.some((face) => /\btransform\b/i.test(face.oracleText ?? '')))

export const definitionForFace = (
  card: CardDefinition,
  faceIndex: 0 | 1,
): CardDefinition => {
  const face = card.cardFaces?.[faceIndex]
  if (!face) return card
  return {
    ...card,
    name: face.name,
    manaCost: face.manaCost,
    typeLine: face.typeLine ?? card.typeLine,
    oracleText: face.oracleText,
    colors: faceColors(face, card.colors),
    power: face.power,
    toughness: face.toughness,
    loyalty: face.loyalty,
    image: face.image ?? card.image,
  }
}

/** Current copiable face. Transforming does not create a new object. */
export const currentFaceDefinition = (instance: CardInstance): CardDefinition =>
  isTransformingDoubleFacedCard(instance.card)
    ? definitionForFace(instance.card, instance.currentFaceIndex ?? 0)
    : instance.card

export const canTransform = (instance: CardInstance): boolean =>
  instance.zone === 'battlefield' &&
  !instance.isToken &&
  isTransformingDoubleFacedCard(instance.card)

export const transformedFaceIndex = (instance: CardInstance): 0 | 1 =>
  (instance.currentFaceIndex ?? 0) === 0 ? 1 : 0
