import { normalizeCommandText } from '../../../commands/parser/normalizeText'
import type { CardDefinition } from '../../../types/card'
import type {
  VoiceSlotAliasEvidence,
  VoiceSlotEvidenceKind,
} from '../slots/slotTypes'

const uniqueEvidence = (values: readonly VoiceSlotAliasEvidence[]) => {
  const byKey = new Map<string, VoiceSlotAliasEvidence>()
  for (const entry of values) {
    const value = normalizeCommandText(entry.value)
    if (value) byKey.set(`${entry.kind}:${value}`, { ...entry, value })
  }
  return [...byKey.values()]
}

const evidence = (
  value: string,
  kind: VoiceSlotEvidenceKind,
  fuzzy = false,
): VoiceSlotAliasEvidence => ({ value, kind, fuzzy })

const splitTypeLine = (
  typeLine: string,
): { left: string[]; subtypes: string[] } => {
  const [rawLeft = '', rawSubtypes = ''] = typeLine.split(/\s+[—-]\s+/, 2)
  return {
    left: normalizeCommandText(rawLeft).split(/\s+/).filter(Boolean),
    subtypes: normalizeCommandText(rawSubtypes).split(/\s+/).filter(Boolean),
  }
}

const localizedTypeWord: Record<string, string> = {
  legendary: 'legendaria',
  basic: 'basica',
  land: 'tierra',
  creature: 'criatura',
  enchantment: 'encantamiento',
  artifact: 'artefacto',
  planeswalker: 'planeswalker',
  instant: 'instantaneo',
  sorcery: 'conjuro',
  equipment: 'equipo',
  aura: 'aura',
  island: 'isla',
  plains: 'llanura',
  swamp: 'pantano',
  mountain: 'montana',
  forest: 'bosque',
}

const localizedBasicLandIdentity = (
  card: CardDefinition,
  left: readonly string[],
  subtypes: readonly string[],
): VoiceSlotAliasEvidence[] => {
  if (!left.includes('basic') || !left.includes('land')) return []
  const canonical = normalizeCommandText(card.name)
  if (!subtypes.includes(canonical)) return []
  const localized = localizedTypeWord[canonical]
  return localized && localized !== canonical
    ? [evidence(localized, 'LOCALIZED_NAME', true)]
    : []
}

/**
 * Generates references from public card characteristics instead of card-by-card
 * aliases. The same rules therefore work for every deck: "mi comandante",
 * "tierra legendaria", "encantamiento", "tierra basica de isla", etc.
 * Ambiguity is intentionally preserved when several legal options share a role.
 */
export type VoiceReferenceContext = {
  commander?: boolean
  typeLine?: string
  token?: boolean
  attacker?: boolean
  blocker?: boolean
}

export const buildVoiceReferenceEvidence = (
  card: CardDefinition,
  options: VoiceReferenceContext = {},
): VoiceSlotAliasEvidence[] => {
  const { left, subtypes } = splitTypeLine(options.typeLine ?? card.typeLine)
  const translatedLeft = left.map((word) => localizedTypeWord[word] ?? word)
  const translatedSubtypes = subtypes.map(
    (word) => localizedTypeWord[word] ?? word,
  )
  const aliases: VoiceSlotAliasEvidence[] = []

  if (options.commander)
    aliases.push(
      evidence('comandante', 'ROLE'),
      evidence('mi comandante', 'ROLE'),
    )
  if (options.token)
    aliases.push(
      evidence('ficha', 'ROLE'),
      evidence('token', 'ROLE'),
      evidence('mi ficha', 'ROLE'),
    )
  if (options.attacker)
    aliases.push(
      evidence('atacante', 'ROLE'),
      evidence('atacante actual', 'ROLE'),
    )
  if (options.blocker)
    aliases.push(
      evidence('bloqueador', 'ROLE'),
      evidence('mi bloqueador', 'ROLE'),
    )

  if (translatedLeft.length) {
    aliases.push(evidence(translatedLeft.join(' '), 'TYPE'))
    for (const word of translatedLeft) aliases.push(evidence(word, 'TYPE'))
  }

  const hasLand = left.includes('land')
  const isBasic = left.includes('basic')
  const isLegendary = left.includes('legendary')
  if (hasLand) {
    aliases.push(evidence('tierra', 'TYPE'))
    if (isLegendary)
      aliases.push(
        evidence('tierra legendaria', 'TYPE'),
        evidence('legendaria', 'TYPE'),
      )
    if (isBasic)
      aliases.push(
        evidence('tierra basica', 'TYPE'),
        evidence('basica', 'TYPE'),
      )
    for (const subtype of translatedSubtypes) {
      aliases.push(
        evidence(subtype, 'SUBTYPE'),
        evidence(`tierra ${subtype}`, 'SUBTYPE'),
      )
      if (isBasic)
        aliases.push(
          evidence(`tierra basica ${subtype}`, 'SUBTYPE'),
          evidence(`tierra basica de ${subtype}`, 'SUBTYPE'),
        )
      if (isLegendary)
        aliases.push(evidence(`tierra legendaria ${subtype}`, 'SUBTYPE'))
    }
  } else {
    for (const subtype of translatedSubtypes)
      aliases.push(evidence(subtype, 'SUBTYPE'))
  }

  if (options.token) {
    for (const type of translatedLeft)
      aliases.push(
        evidence(`ficha ${type}`, 'TYPE'),
        evidence(`token ${type}`, 'TYPE'),
      )
    for (const subtype of translatedSubtypes)
      aliases.push(
        evidence(`ficha ${subtype}`, 'SUBTYPE'),
        evidence(`token ${subtype}`, 'SUBTYPE'),
      )
  }

  const normalizedName = normalizeCommandText(card.name)
  const localizedIdentity = localizedBasicLandIdentity(card, left, subtypes)
  const descriptive = uniqueEvidence(aliases)
  // Players often say the public role/class before a damaged name (for example
  // "encantamiento resourceful defense"). Generate that composition from
  // characteristics instead of teaching the recognizer per-card phrases.
  return uniqueEvidence([
    ...localizedIdentity,
    ...descriptive,
    ...descriptive.map((reference) =>
      evidence(
        `${reference.value} ${normalizedName}`,
        'COMPOSITE_REFERENCE',
        true,
      ),
    ),
  ])
}

export const buildVoiceReferenceAliases = (
  card: CardDefinition,
  options: VoiceReferenceContext = {},
): string[] =>
  buildVoiceReferenceEvidence(card, options).map((entry) => entry.value)
