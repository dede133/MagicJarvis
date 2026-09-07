import type { CardInstance } from '../../types/card'

export type CombatKeyword =
  | 'HASTE'
  | 'VIGILANCE'
  | 'FLYING'
  | 'REACH'
  | 'MENACE'
  | 'TRAMPLE'
  | 'DEATHTOUCH'
  | 'LIFELINK'
  | 'FIRST_STRIKE'
  | 'DOUBLE_STRIKE'
  | 'INDESTRUCTIBLE'
  | 'DEFENDER'

const oraclePhrases: Record<CombatKeyword, string> = {
  HASTE: 'haste',
  VIGILANCE: 'vigilance',
  FLYING: 'flying',
  REACH: 'reach',
  MENACE: 'menace',
  TRAMPLE: 'trample',
  DEATHTOUCH: 'deathtouch',
  LIFELINK: 'lifelink',
  FIRST_STRIKE: 'first strike',
  DOUBLE_STRIKE: 'double strike',
  INDESTRUCTIBLE: 'indestructible',
  DEFENDER: 'defender',
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Detects a keyword ability printed on the object itself. Oracle text may mention a
 * keyword because another object gains it or because a conditional static ability
 * grants it; those cases belong to the static-effects runtime instead.
 */
export const hasPrintedKeywordAbility = (
  card: CardInstance,
  keyword: string,
): boolean => {
  const phrase = escapeRegExp(keyword.replaceAll('_', ' ').toLocaleLowerCase())
  const abilityToken = new RegExp(
    `(?:^|,\\s*)${phrase}(?=\\s*(?:,|$|\\())`,
    'i',
  )
  return (card.card.oracleText ?? '')
    .split(/\r?\n/)
    .some((line) => abilityToken.test(line.trim()))
}

export const hasCombatKeyword = (
  card: CardInstance,
  keyword: CombatKeyword,
): boolean => {
  const normalized = keyword.toLocaleUpperCase()
  return (
    (card.keywords as string[] | undefined)?.some(
      (item) => item.toLocaleUpperCase() === normalized,
    ) === true || hasPrintedKeywordAbility(card, oraclePhrases[keyword])
  )
}

export const isCreature = (card: CardInstance): boolean =>
  /\bcreature\b/i.test(card.card.typeLine)
