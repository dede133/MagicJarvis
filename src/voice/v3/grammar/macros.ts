import { normalizeCommandText } from '../../../commands/parser/normalizeText'
import { DEFAULT_VOICE_LANGUAGE_PACK, type VoiceLanguagePack } from '../../languages'

const grammar = DEFAULT_VOICE_LANGUAGE_PACK.v3

export const DISCOURSE_PREFIXES = grammar.discoursePrefixes
export const DECLARATION_PREFIXES = grammar.declarationPrefixes

const stripOnePrefix = (input: string, prefixes: readonly string[]): string => {
  for (const prefix of prefixes) {
    if (input === prefix) return ''
    if (input.startsWith(`${prefix} `)) return input.slice(prefix.length).trim()
  }
  return input
}

export const stripDiscourse = (
  input: string,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): string => {
  let current = normalizeCommandText(input)
  let previous = ''
  while (current && current !== previous) {
    previous = current
    current = stripOnePrefix(current, languagePack.v3.discoursePrefixes)
  }
  return current
}

export const stripCommandFraming = (
  input: string,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): string => {
  let current = stripDiscourse(input, languagePack)
  let previous = ''
  while (current && current !== previous) {
    previous = current
    current = stripOnePrefix(current, languagePack.v3.declarationPrefixes)
    current = stripDiscourse(current, languagePack)
  }
  return current
}

export const PLAY_VERBS = grammar.verbs.play
export const TAP_VERBS = grammar.verbs.tap
export const UNTAP_VERBS = grammar.verbs.untap
export const DRAW_VERBS = grammar.verbs.draw
export const DISCARD_VERBS = grammar.verbs.discard
export const ACTIVATE_VERBS = grammar.verbs.activate
export const CHANNEL_VERBS = grammar.verbs.channel
export const WATERBEND_VERBS = grammar.verbs.waterbend
export const EQUIP_VERBS = grammar.verbs.equip
export const MOVE_VERBS = grammar.verbs.move
export const RETURN_VERBS = grammar.verbs.return
export const EXILE_VERBS = grammar.verbs.exile
export const ATTACK_VERBS = grammar.verbs.attack
export const BLOCK_VERBS = grammar.verbs.block

export const leadingVerbRemainder = (
  input: string,
  verbs: readonly string[],
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): string | undefined => {
  const normalized = stripCommandFraming(input, languagePack)
  const verb = verbs.find(
    (candidate) =>
      normalized === candidate || normalized.startsWith(`${candidate} `),
  )
  if (!verb) return undefined
  return normalized.slice(verb.length).trim()
}

const verbEditDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]
    previous[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]
      previous[rightIndex] = Math.min(
        above + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return previous[right.length]
}

export type FuzzyVerbRemainder = {
  remainder: string
  heardVerb: string
  matchedVerb: string
  score: number
}

/**
 * ASR may damage the action anchor just as it damages card names. Fuzzy verb
 * recovery is exposed separately so callers can require strong contextual slot
 * evidence before authorizing anything; it must never be used for structural
 * commands such as passing the turn.
 */
export const fuzzyLeadingVerbRemainder = (
  input: string,
  verbs: readonly string[],
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): FuzzyVerbRemainder | undefined => {
  const normalized = stripCommandFraming(input, languagePack)
  const [heardVerb = '', ...rest] = normalized.split(/\s+/)
  if (heardVerb.length < 4 || !rest.length) return undefined

  const ranked = verbs
    .filter((verb) => verb.length >= 4)
    .map((verb) => {
      const distance = verbEditDistance(heardVerb, verb)
      const ratio = distance / Math.max(heardVerb.length, verb.length)
      return { verb, distance, ratio }
    })
    .filter(({ distance, ratio }) => distance <= 2 && ratio <= 0.5)
    .sort((left, right) => left.ratio - right.ratio || left.distance - right.distance)

  const best = ranked[0]
  if (!best) return undefined
  const next = ranked[1]
  if (next && Math.abs(next.ratio - best.ratio) < 0.01) return undefined
  return {
    remainder: rest.join(' '),
    heardVerb,
    matchedVerb: best.verb,
    score: Math.round((1 - best.ratio) * 100),
  }
}
