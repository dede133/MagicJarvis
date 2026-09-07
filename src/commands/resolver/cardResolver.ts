import { normalizeCommandText } from '../parser/normalizeText'
import type { CardMatch } from '../types/commandTypes'
import { getResolvedDeckCommanders } from '../../types/deck'
import type { DeckDefinition } from '../../types/deck'
import { localizedCardAliases } from '../../data/cardAliases'

export const cardNameAliases: Record<string, string> = {
  isla: 'island',
  islas: 'island',
  llanura: 'plains',
  llanuras: 'plains',
  pantano: 'swamp',
  pantanos: 'swamp',
  montana: 'mountain',
  montanas: 'mountain',
  bosque: 'forest',
  bosques: 'forest',
}

const distance = (left: string, right: string): number => {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index)
  for (let column = 1; column <= right.length; column += 1) {
    let previous = rows[0]
    rows[0] = column
    for (let row = 1; row <= left.length; row += 1) {
      const value = Math.min(
        rows[row] + 1,
        rows[row - 1] + 1,
        previous + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
      previous = rows[row]
      rows[row] = value
    }
  }
  return rows[left.length]
}

const activeNames = (deck: DeckDefinition): string[] => [
  ...getResolvedDeckCommanders(deck).map((entry) => entry.name),
  ...deck.mainboard.map((entry) => entry.name),
]

const aliasesFor = (
  deck: DeckDefinition,
): Array<{ alias: string; name: string }> =>
  [...getResolvedDeckCommanders(deck), ...deck.mainboard].flatMap((entry) =>
    [
      ...(localizedCardAliases[entry.name] ?? []),
      ...(entry.card.localizedAliases ?? []),
      ...(entry.card.cardFaces ?? []).map((face) => face.name),
    ].map((alias) => ({
      alias: normalizeCommandText(alias),
      name: entry.name,
    })),
  )

const sortedWords = (value: string): string =>
  normalizeCommandText(value).split(' ').sort().join(' ')

/** Resolves only a clear deck-card match; uncertainty is deliberately returned to the player. */
export const resolveCardQuery = (
  deck: DeckDefinition,
  query: string,
): CardMatch => {
  const rawNormalized = normalizeCommandText(query)
  if (['commander', 'comandante', 'el comandante'].includes(rawNormalized)) {
    const commanders = getResolvedDeckCommanders(deck).map(
      (entry) => entry.name,
    )
    if (commanders.length === 1)
      return { status: 'resolved', name: commanders[0] }
    if (commanders.length > 1) return { status: 'ambiguous', names: commanders }
  }
  const normalized = cardNameAliases[rawNormalized] ?? rawNormalized
  const names = activeNames(deck)
  const exact = names.filter(
    (name) => normalizeCommandText(name) === normalized,
  )
  if (exact.length === 1) return { status: 'resolved', name: exact[0] }
  if (exact.length > 1) return { status: 'ambiguous', names: exact }

  const aliases = aliasesFor(deck)
  const aliasExact = aliases.filter(
    (candidate) => candidate.alias === normalized,
  )
  const aliasNames = [...new Set(aliasExact.map((candidate) => candidate.name))]
  if (aliasNames.length === 1)
    return { status: 'resolved', name: aliasNames[0] }
  if (aliasNames.length > 1) return { status: 'ambiguous', names: aliasNames }

  // A significant, unique word fragment is natural in spoken tabletop play.
  if (normalized.length >= 3) {
    const partialNames = [
      ...new Set(
        [...names, ...aliases.map((alias) => alias.name)].filter((name) => {
          const official = normalizeCommandText(name)
          return (
            official.includes(normalized) ||
            aliases.some(
              (alias) =>
                alias.name === name && alias.alias.includes(normalized),
            )
          )
        }),
      ),
    ]
    if (partialNames.length === 1)
      return { status: 'resolved', name: partialNames[0] }
    if (partialNames.length > 1)
      return { status: 'ambiguous', names: partialNames }
  }

  const candidates = [...names, ...aliases.map((alias) => alias.name)]
    .map((name) => ({
      name,
      distance: Math.min(
        distance(normalized, normalizeCommandText(name)),
        distance(sortedWords(normalized), sortedWords(name)),
      ),
    }))
    .filter(
      (candidate, index, candidates) =>
        candidates.findIndex((other) => other.name === candidate.name) ===
        index,
    )
    .sort((left, right) => left.distance - right.distance)
  const best = candidates[0]
  const second = candidates[1]
  const threshold = Math.max(1, Math.floor(normalized.length * 0.2))
  if (
    best &&
    best.distance <= threshold &&
    (!second || best.distance < second.distance)
  )
    return { status: 'resolved', name: best.name }
  return { status: 'not_found' }
}
