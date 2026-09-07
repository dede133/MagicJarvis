import type { ManaColor } from '../../types/card'

const basicLandMana: Record<string, ManaColor> = {
  plains: 'W',
  island: 'U',
  swamp: 'B',
  mountain: 'R',
  forest: 'G',
}

/** Uses the land subtype, not a card name. */
export const basicLandManaColor = (typeLine: string): ManaColor | undefined =>
  Object.entries(basicLandMana).find(([subtype]) =>
    new RegExp(`\\b${subtype}\\b`, 'i').test(typeLine),
  )?.[1] as ManaColor | undefined

export const isLandCard = (typeLine: string): boolean =>
  /\bland\b/i.test(typeLine)
