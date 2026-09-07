import { parseCommand } from '../commands/parser/parseCommand'
import { intentAliases, type CommandIntent } from '../commands/parser/intents'
import {
  canonicalizeVoiceLanguageInput,
  DEFAULT_VOICE_LANGUAGE_PACK,
  type VoiceLanguagePack,
} from './languages'
import { normalizeSpokenCommand } from './spokenCommandNormalizer'

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const parserCommandStarters = [
  ...Object.values(intentAliases).flat(),
  'ataco',
  'no ataco',
  'sin atacantes',
  'no declaro atacantes',
  'bloqueo',
  'defiendo',
  'defender',
  'sin bloqueos',
  'sin bloqueo',
  'sin bloquear',
  'no bloqueo',
  'no hay bloqueos',
  'nadie bloquea',
  'no bloquea',
  'me hacen',
  'me entran',
  'me llevo',
  'me quitan',
  'me pongo',
  'me quedo',
  'pierdo',
  'me quito',
  'me hago',
  'me bajo',
  'recibo',
  'me como',
  'gano',
  'me curo',
  'me subo',
  'estoy a',
  'ponme a',
  'tengo',
  'concedo',
  'me rindo',
  'siguiente fase',
  'siguiente paso',
  'empiezo turno',
  'upkeep',
  'mantenimiento',
  'robo del turno',
  'voy a primera principal',
  'voy a combate',
  'segunda principal',
  'final de turno',
  'paso a final',
  'en respuesta',
  'respondo con',
  'oponente baraja',
  'baraja oponente',
  // V3 zone/state families. These are boundaries only; authority still lives
  // in the semantic matcher/resolver for each resulting clause.
  'muevo',
  'mando',
  'devuelvo',
  'regreso',
  'exilio',
  'barajo',
  'resuelvo dano',
  'resuelvo dano de combate',
  'dano',
  'vamos a dano',
  // Natural future declarations that the spoken normalizer understands. They
  // are useful boundaries even before normalization runs on each clause.
  'voy a jugar',
  'voy a bajar',
  'voy a poner',
  'voy a lanzar',
  'voy a castear',
  'voy a tirar',
  'lo voy a jugar',
  'lo voy a bajar',
  'lo voy a poner',
  'lo voy a lanzar',
  'lo voy a castear',
  'lo voy a tirar',
  'la voy a jugar',
  'la voy a bajar',
  'la voy a poner',
  'la voy a lanzar',
  'la voy a castear',
  'la voy a tirar',
  // Deliberately accepted only as a segment starter. A standalone "paso"
  // remains unchanged outside a multi-command utterance.
  'paso',
] as const

// Prefixes that the Command Gate/NLP can reject. They are command boundaries
// too: "bajo isla y creo que lanzo X" must not be kept as one parser input.
const conversationalSegmentStarters = [
  'igual',
  'quiza',
  'quizas',
  'a lo mejor',
  'tal vez',
  'puede que',
  'creo que',
  'me parece que',
  'supongo que',
  'estoy pensando en',
  'estaba pensando en',
  'puedo',
  'podria',
  'debo',
  'deberia',
  'no voy a',
  'no quiero',
  'no pienso',
] as const

const commandStartPattern = [
  ...parserCommandStarters,
  ...conversationalSegmentStarters,
]
  .sort((left, right) => right.length - left.length)
  .map(escapeRegExp)
  .join('|')

const weakSeparatorPattern = new RegExp(
  `\\s*(?:,|\\by\\b)\\s+(?=(?:${commandStartPattern})(?:\\s|$))`,
  'g',
)

// These connectors explicitly advance discourse. Unlike plain "y", they may
// start an ellipsis where the player omits the repeated verb:
// "juego isla y luego anillo solar" => "juego isla" + "juego anillo solar".
const strongSequencePattern =
  /\s*(?:,\s*)?(?:(?:y\s+)?(?:luego|despues|entonces))\s+/g

const startsLikeKnownClause = (value: string): boolean =>
  new RegExp(`^(?:${commandStartPattern})(?:\\s|$)`).test(value)

export const voiceCommandStarterOffsets = (
  input: string,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): number[] => {
  const normalized = canonicalizeVoiceLanguageInput(input, languagePack)
  if (!normalized) return []
  const expression = new RegExp(
    `(?:^|\\s)(${commandStartPattern})(?=\\s|$)`,
    'g',
  )
  const offsets = new Set<number>()
  for (const match of normalized.matchAll(expression)) {
    const starter = match[1]
    const index = (match.index ?? 0) + match[0].length - starter.length
    offsets.add(index)
  }
  return [...offsets].sort((left, right) => left - right)
}

const inheritancePrefixFor = (segment: string): string | undefined => {
  const normalized = normalizeSpokenCommand(segment)
  const parsed = parseCommand(normalized)
  if (parsed.status !== 'parsed') return undefined

  switch (parsed.command.type) {
    case 'DECLARE_CARD':
    case 'PLAY_CARD':
      return 'juego'
    case 'CAST_SPELL':
      return 'lanzo'
    case 'ACTIVATE_ABILITY':
      return 'activo'
    case 'TAP_CARD':
    case 'ACTIVATE_MANA':
      return 'giro'
    case 'UNTAP_CARD':
      return 'enderezo'
    case 'DRAW':
      return 'robo'
    case 'DISCARD_CARD':
      return 'descarto'
    case 'GAIN_LIFE':
      return 'gano'
    case 'LOSE_LIFE':
      return 'pierdo'
    case 'DECLARE_ATTACKERS':
      return 'ataco con'
    default:
      return undefined
  }
}

type IntentOccurrence = {
  intent: CommandIntent
  index: number
  length: number
}

const intentOccurrences = (
  value: string,
  fromIndex: number,
): IntentOccurrence[] => {
  const occurrences: IntentOccurrence[] = []

  for (const [intent, aliases] of Object.entries(intentAliases) as [
    CommandIntent,
    readonly string[],
  ][]) {
    for (const alias of aliases) {
      const expression = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'g')
      for (const match of value.matchAll(expression)) {
        const index = match.index ?? -1
        if (index >= fromIndex)
          occurrences.push({ intent, index, length: match[0].length })
      }
    }
  }

  return occurrences.sort(
    (left, right) => left.index - right.index || right.length - left.length,
  )
}

/**
 * Speech often contains a self-correction inside one ASR final result:
 * "creo que voy a bajar esa bajo isla". We must not strip "creo que" and
 * execute the hypothetical first declaration, but a repeated verb from the
 * same intent family is a useful signal that the player restarted explicitly.
 *
 * We therefore split only at the SECOND occurrence of the SAME action family
 * after an uncertainty marker. A single hypothetical command remains intact:
 * "creo que voy a bajar isla" => one NOT_ACTION clause.
 */
const splitRepeatedDeclarationAfterUncertainty = (value: string): string[] => {
  const uncertaintyPattern = new RegExp(
    `\\b(?:${conversationalSegmentStarters.map(escapeRegExp).join('|')})\\b`,
  )
  const uncertainty = uncertaintyPattern.exec(value)
  if (!uncertainty) return [value]

  const occurrences = intentOccurrences(
    value,
    uncertainty.index + uncertainty[0].length,
  )
  for (let firstIndex = 0; firstIndex < occurrences.length; firstIndex += 1) {
    const first = occurrences[firstIndex]
    const second = occurrences
      .slice(firstIndex + 1)
      .find(
        (candidate) =>
          candidate.intent === first.intent && candidate.index > first.index,
      )
    if (!second) continue

    const before = value.slice(0, second.index).trim()
    const after = value.slice(second.index).trim()
    if (before && after) return [before, after]
  }

  return [value]
}

type StrongClause = {
  text: string
  strongBoundaryBefore: boolean
}

const splitStrongClauses = (value: string): StrongClause[] => {
  const chunks: StrongClause[] = []
  let cursor = 0
  let hasBoundary = false

  for (const match of value.matchAll(strongSequencePattern)) {
    const index = match.index ?? 0
    const text = value.slice(cursor, index).trim()
    if (text) chunks.push({ text, strongBoundaryBefore: hasBoundary })
    cursor = index + match[0].length
    hasBoundary = true
  }

  const tail = value.slice(cursor).trim()
  if (tail) chunks.push({ text: tail, strongBoundaryBefore: hasBoundary })
  return chunks
}

/**
 * Splits one final speech utterance into clause-sized commands.
 *
 * Rules are intentionally conservative:
 * - plain "y" / comma split only if another known command/conversation starter follows;
 * - strong sequence words ("luego", "despues", "entonces") always create a boundary;
 * - after a strong boundary, a bare entity may inherit the previous deterministic
 *   action family ("juego isla y luego anillo solar");
 * - entity lists remain together ("Namor y Wolverine");
 * - an uncertainty clause can be separated from a later explicit self-restart
 *   only when the same command family is repeated.
 */
export const segmentVoiceCommands = (
  input: string,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): string[] => {
  const normalized = canonicalizeVoiceLanguageInput(input, languagePack)
  if (!normalized) return []

  const result: string[] = []
  let inheritedPrefix: string | undefined

  for (const chunk of splitStrongClauses(normalized)) {
    let chunkText = chunk.text
    if (
      chunk.strongBoundaryBefore &&
      inheritedPrefix &&
      !startsLikeKnownClause(chunkText)
    )
      chunkText = `${inheritedPrefix} ${chunkText}`

    const weakSegments = chunkText
      .split(weakSeparatorPattern)
      .map((segment) => segment.trim())
      .filter(Boolean)

    for (const weakSegment of weakSegments) {
      const refined = splitRepeatedDeclarationAfterUncertainty(weakSegment)
      for (const segment of refined) {
        result.push(segment)
        inheritedPrefix = inheritancePrefixFor(segment) ?? inheritedPrefix
      }
    }
  }

  return result
}
