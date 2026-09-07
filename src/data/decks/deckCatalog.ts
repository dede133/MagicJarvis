import cuteDeckText from './cute.txt?raw'
import tritonesDeckText from './tritones.txt?raw'

export type AvailableDeckRecipe = {
  id: string
  name: string
  subtitle: string
  text: string
}

/** Decks intentionally exposed in the tabletop match selector. */
export const availableDeckRecipes: AvailableDeckRecipe[] = [
  {
    id: 'namor',
    name: 'Namor',
    subtitle: 'Mono-Blue Merfolk · Commander',
    text: tritonesDeckText,
  },
  {
    id: 'cute',
    name: 'Cute',
    subtitle: 'Azorius legends · Partner Commander',
    text: cuteDeckText,
  },
]
