import { parseCommand } from '../commands/parser/parseCommand'
import type { ParsedCommand } from '../commands/types/commandTypes'
import type { GameState } from '../types/game'
import { normalizeSpokenCommand } from './spokenCommandNormalizer'
import { VOICE_ACTION_ANCHORS } from './actionAnchors'
import { buildPlayableCardVoiceOptions } from './v3/catalog/buildVoiceActionCatalog'
import { voiceActorDeckDefinition } from './v3/context/voiceActorContext'
import { resolveVoiceSlot } from './v3/slots/resolveSlot'
import {
  segmentVoiceCommands,
  voiceCommandStarterOffsets,
} from './voiceCommandSegmentation'
import {
  DEFAULT_VOICE_LANGUAGE_PACK,
  type VoiceLanguagePack,
} from './languages'
import { matchSemanticVoiceCommand } from './v3/matcher/semanticMatcher'
import type { SemanticMatchResult } from './v3/semanticCommand'

type VoiceDeckContext = Pick<
  GameState,
  | 'activePlayerId'
  | 'deckDefinition'
  | 'deckDefinitionsByPlayer'
  | 'localPlayerId'
>

type CardDeclaration = {
  prefix: 'juego' | 'lanzo'
  command: Extract<
    ParsedCommand,
    { type: 'PLAY_CARD' | 'DECLARE_CARD' | 'CAST_SPELL' }
  >
}

const cardDeclaration = (
  input: string,
  languagePack: VoiceLanguagePack,
): CardDeclaration | undefined => {
  const parsed = parseCommand(normalizeSpokenCommand(input, languagePack))
  if (parsed.status !== 'parsed') return undefined

  switch (parsed.command.type) {
    case 'PLAY_CARD':
    case 'DECLARE_CARD':
      return { prefix: 'juego', command: parsed.command }
    case 'CAST_SPELL':
      return { prefix: 'lanzo', command: parsed.command }
    default:
      return undefined
  }
}

const resolvesDeckCard = (
  game: VoiceDeckContext,
  command: CardDeclaration['command'],
): boolean => {
  const resolved = resolveVoiceSlot(
    command.cardQuery.replace(/^(?:1|una|un)\s+/i, ''),
    buildPlayableCardVoiceOptions(game),
  )
  return resolved.status === 'MATCHED' && !resolved.ignoredRemainder
}

/**
 * Handles a common spoken ellipsis that is unsafe to solve with a generic
 * `split(' y ')`:
 *
 *   "juego una isla y una remora"
 *     -> "juego una isla" + "juego una remora"
 *
 * We only split when the whole card query does NOT resolve in the active deck,
 * but every inherited sub-command DOES resolve to a real deck card. This keeps
 * ordinary lists such as "ataco con Namor y Wolverine" untouched and avoids
 * inventing cards from arbitrary conversation.
 */
const expandResolvableCardEllipsis = (
  segment: string,
  game: VoiceDeckContext,
  languagePack: VoiceLanguagePack,
): string[] => {
  if (!voiceActorDeckDefinition(game) || !/\s+y\s+/.test(segment))
    return [segment]

  const whole = cardDeclaration(segment, languagePack)
  if (!whole) return [segment]

  const parts = segment
    .split(/\s+y\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    const inherited = parts.map((part, index) =>
      index === 0 ? part : `${whole.prefix} ${part}`,
    )
    const declarations = inherited.map((value) =>
      cardDeclaration(value, languagePack),
    )
    if (
      declarations.length === inherited.length &&
      declarations.every(
        (declaration) =>
          declaration !== undefined &&
          resolvesDeckCard(game, declaration.command),
      )
    )
      return inherited
  }

  // If the original query already names a real card, "y" may belong to the
  // card/alias itself and must not be treated as a command boundary.
  if (resolvesDeckCard(game, whole.command)) return [segment]

  if (parts.length < 2) return [segment]

  const inherited = parts.map((part, index) =>
    index === 0 ? part : `${whole.prefix} ${part}`,
  )
  const declarations = inherited.map((value) =>
    cardDeclaration(value, languagePack),
  )
  if (
    declarations.some(
      (declaration) =>
        !declaration || !resolvesDeckCard(game, declaration.command),
    )
  )
    return [segment]

  return inherited
}

const isSemanticCommandContinuation = (match: SemanticMatchResult): boolean =>
  ['MATCHED', 'AMBIGUOUS', 'REJECTED_CONTEXT', 'INCOMPLETE'].includes(
    match.status,
  )

const oneEditApart = (left: string, right: string): boolean => {
  if (left === right || Math.abs(left.length - right.length) > 1) return false
  let leftIndex = 0
  let rightIndex = 0
  let edits = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1
      rightIndex += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (left.length > right.length) leftIndex += 1
    else if (right.length > left.length) rightIndex += 1
    else {
      leftIndex += 1
      rightIndex += 1
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) edits += 1
  return edits === 1
}

const singleWordActionAnchors = [
  ...new Set(Object.values(VOICE_ACTION_ANCHORS).flat()),
].filter((anchor) => !anchor.includes(' '))

const fuzzyStarterBoundaries = (
  segment: string,
): { offset: number; correctedRight: string }[] => {
  const matches: { offset: number; correctedRight: string }[] = []
  for (const token of segment.matchAll(/\b[\p{L}]+\b/gu)) {
    const offset = token.index ?? 0
    if (offset <= 0) continue
    const spoken = token[0]
    const candidates = singleWordActionAnchors.filter((anchor) =>
      oneEditApart(spoken, anchor),
    )
    if (candidates.length !== 1) continue
    matches.push({
      offset,
      correctedRight: `${candidates[0]}${segment.slice(offset + spoken.length)}`,
    })
  }
  return matches
}

/**
 * ASR sometimes drops conjunctions and returns adjacent complete declarations:
 *   "robo bajo isla" -> "robo" + "bajo isla".
 *
 * We only create such a boundary when the left side is already a complete V3
 * command and the right side independently looks like a semantic command. This
 * prevents command-like words inside card names from becoming boundaries: the
 * leading fragment (for example just "juego") would be INCOMPLETE, not MATCHED.
 */
const splitAdjacentSemanticCommands = (
  segment: string,
  game: VoiceDeckContext,
  languagePack: VoiceLanguagePack,
): string[] => {
  const semanticGame = {
    ...game,
    cards: [],
    stack: [],
    combatState: {
      attackers: [],
      blockers: [],
      attackersDeclared: false,
      blockersDeclared: false,
      damageStep: 'NOT_STARTED',
    },
    turnState: {
      phase: 'PRECOMBAT_MAIN',
      step: 'MAIN_1',
      priority: 'WINDOW_OPEN',
    },
    pendingDecisions: [],
    pendingAbilities: [],
    pendingResolutions: [],
  } as unknown as GameState
  const whole = matchSemanticVoiceCommand(segment, semanticGame, languagePack)
  if (whole.status === 'MATCHED' || whole.status === 'AMBIGUOUS')
    return [segment]

  const offsets = voiceCommandStarterOffsets(segment, languagePack).filter(
    (offset) => offset > 0,
  )
  for (const offset of offsets) {
    const left = segment.slice(0, offset).trim()
    const right = segment.slice(offset).trim()
    if (!left || !right) continue
    const leftMatch = matchSemanticVoiceCommand(
      left,
      semanticGame,
      languagePack,
    )
    if (leftMatch.status !== 'MATCHED') continue
    const rightMatch = matchSemanticVoiceCommand(
      right,
      semanticGame,
      languagePack,
    )
    if (!isSemanticCommandContinuation(rightMatch)) continue
    return [left, ...splitAdjacentSemanticCommands(right, game, languagePack)]
  }

  // ASR occasionally adds/drops one character on the repeated action verb
  // (for example "juego isla juegos sol ring"). Treat that token as a
  // boundary only when the left clause is already complete and the corrected
  // right clause independently validates. We deliberately do not normalize
  // such words globally, so ordinary conversation containing "juegos" does
  // not become a command candidate.
  for (const boundary of fuzzyStarterBoundaries(segment)) {
    const left = segment.slice(0, boundary.offset).trim()
    if (!left) continue
    const leftMatch = matchSemanticVoiceCommand(
      left,
      semanticGame,
      languagePack,
    )
    if (leftMatch.status !== 'MATCHED') continue
    const right = boundary.correctedRight.trim()
    const rightMatch = matchSemanticVoiceCommand(
      right,
      semanticGame,
      languagePack,
    )
    if (!isSemanticCommandContinuation(rightMatch)) continue
    return [left, ...splitAdjacentSemanticCommands(right, game, languagePack)]
  }

  return [segment]
}

/**
 * Game-aware second pass over the conservative text segmenter. Text-only
 * segmentation intentionally does not guess at plain "y" ellipsis. Once the
 * active deck is available, we can safely split only when both sides resolve
 * to actual deck cards. A final semantic-anchor pass also recovers conjunctions
 * omitted by ASR without splitting entity names speculatively.
 */
export const segmentVoiceCommandsForGame = (
  input: string,
  game: VoiceDeckContext,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): string[] =>
  segmentVoiceCommands(input, languagePack)
    .flatMap((segment) =>
      splitAdjacentSemanticCommands(segment, game, languagePack),
    )
    .flatMap((segment) =>
      expandResolvableCardEllipsis(segment, game, languagePack),
    )
    .map((segment) =>
      languagePack.id === 'es' ? segment.replace(/\b1\b/g, 'una') : segment,
    )
