import type { CardDefinition, CardInstance } from '../types/card'

export const demoCardNames = [
  'Sol Ring',
  'Island',
  'Forest',
  'Llanowar Elves',
  'Arcane Signet',
]

const fallbackCard = (name: string, typeLine: string): CardDefinition => ({
  scryfallId: `demo-${name.toLowerCase().replaceAll(' ', '-')}`,
  name,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})

export const fallbackDemoCards: CardDefinition[] = [
  fallbackCard('Sol Ring', 'Artifact'),
  fallbackCard('Island', 'Basic Land — Island'),
  fallbackCard('Forest', 'Basic Land — Forest'),
  fallbackCard('Llanowar Elves', 'Creature — Elf Druid'),
  fallbackCard('Arcane Signet', 'Artifact'),
]

export const createDemoInstances = (
  definitions: CardDefinition[] = fallbackDemoCards,
): CardInstance[] =>
  definitions.map((card, index) => ({
    instanceId: `demo-${index + 1}`,
    card,
    zone: index === 0 ? 'battlefield' : index === 1 ? 'hand' : 'library',
    tapped: false,
    counters: {},
  }))
