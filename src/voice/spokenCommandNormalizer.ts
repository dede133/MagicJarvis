import {
  canonicalizeVoiceLanguageInput,
  DEFAULT_VOICE_LANGUAGE_PACK,
  type VoiceLanguagePack,
} from './languages'

const canonicalFutureVerb: Record<string, string> = {
  jugar: 'juego',
  bajar: 'bajo',
  poner: 'pongo',
  lanzar: 'lanzo',
  castear: 'casteo',
  tirar: 'tiro',
  activar: 'activo',
  canalizar: 'canalizo',
  equipar: 'equipo',
}

const normalizeAttackTarget = (target: string): string =>
  /^(?:todo|todos|todas)$/.test(target) ? 'todos' : target

const harmlessLeadingFillers = [
  'vale',
  'bueno',
  'pues',
  'mmm',
  'mm',
  'eh',
  'em',
  'venga',
  'ok',
  'okay',
  'ahora',
  'entonces',
  'nada',
  'yo',
  // Discourse continuation markers are common in continuous tabletop speech:
  // "y tambien voy a bajar remora", "ademas robo", "y ahora giro...".
  // At utterance start they do not change the action semantics. Keep semantic
  // markers such as uncertainty/negation out of this list so the Gate still
  // sees them after these harmless prefixes are removed.
  'y',
  'tambien',
  'ademas',
  'luego',
  'despues',
] as const

const stripHarmlessLeadingFillers = (input: string): string => {
  let current = input.trim()
  let changed = true

  while (changed && current) {
    changed = false
    for (const filler of harmlessLeadingFillers) {
      if (current === filler) return ''
      if (current.startsWith(`${filler} `)) {
        current = current.slice(filler.length).trimStart()
        changed = true
        break
      }
    }
  }

  return current
}

const futureDeclarationStart =
  /^(?:(?:lo|la)\s+)?voy a\s+(?:jugar|bajar|poner|lanzar|castear|tirar|activar|canalizar|equipar)\s+/
const harmlessRestartFillers = /^(?:(?:eh|em|mmm|mm|bueno|pues|yo)\s+)*/

/**
 * Continuous ASR sometimes keeps an abandoned command start in the same final
 * utterance:
 *
 *   "voy a jugar voy a bajar una isla"
 *
 * The first declaration has no object at all, so it cannot represent a real
 * game action. Drop only these adjacent/incomplete future starts. We do NOT
 * remove semantic material or complete commands, which keeps this much safer
 * than a generic "take the last verb" heuristic.
 */
const collapseIncompleteFutureRestarts = (input: string): string => {
  let current = input.trim()

  while (current) {
    const first = futureDeclarationStart.exec(current)
    if (!first) return current

    const afterFirst = current.slice(first[0].length)
    const filler = harmlessRestartFillers.exec(afterFirst)?.[0] ?? ''
    const candidate = afterFirst.slice(filler.length)

    if (!futureDeclarationStart.test(candidate)) return current
    current = candidate
  }

  return current
}

/**
 * Converts common spoken-tabletop phrasing into the small deterministic command
 * language already understood by parseCommand. It deliberately handles only
 * clear declarations; doubt, questions and conversational filtering belong to
 * the later command-gate layer.
 */
export const normalizeSpokenCommand = (
  input: string,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): string => {
  const normalizedInput = canonicalizeVoiceLanguageInput(input, languagePack)
  if (!normalizedInput) return normalizedInput

  // Strip only harmless leading speech fillers. Semantic markers such as
  // "creo que", "igual", questions and negations are deliberately kept so
  // the Command Gate / NLP can still reject them using the original meaning.
  const withoutFillers = stripHarmlessLeadingFillers(normalizedInput)
  if (!withoutFillers) return withoutFillers
  const normalized = canonicalizeVoiceLanguageInput(
    collapseIncompleteFutureRestarts(withoutFillers),
    languagePack,
  )

  const attack = /^(?:te\s+)?(?:pego|voy)\s+con\s+(.+)$/.exec(normalized)
  if (attack) return `ataco con ${normalizeAttackTarget(attack[1])}`

  const addressedAction =
    /^(?:te|le)\s+(juego|bajo|pongo|lanzo|tiro|casteo)\s+(.+)$/.exec(normalized)
  if (addressedAction) return `${addressedAction[1]} ${addressedAction[2]}`

  const futureAction =
    /^(?:(?:lo|la)\s+)?voy a\s+(jugar|bajar|poner|lanzar|castear|tirar|activar|canalizar|equipar)\s+(.+)$/.exec(
      normalized,
    )
  if (futureAction)
    return `${canonicalFutureVerb[futureAction[1]]} ${futureAction[2]}`

  const incomingLife =
    /^me\s+(?:entran|llevo|quitan)\s+(\d+)(?:\s+vidas?)?$/.exec(normalized)
  if (incomingLife) return `pierdo ${incomingLife[1]}`

  const setLife = /^me\s+(?:pongo|quedo)\s+en\s+(\d+)(?:\s+vidas?)?$/.exec(
    normalized,
  )
  if (setLife) return `estoy a ${setLife[1]}`

  const creatureDamage = /^(.+?)\s+se come\s+(\d+)(?:\s+de dano)?$/.exec(
    normalized,
  )
  if (creatureDamage) return `${creatureDamage[1]} recibe ${creatureDamage[2]}`

  const dealtDamage = /^le hago\s+(\d+)\s+a\s+(.+)$/.exec(normalized)
  if (dealtDamage) return `${dealtDamage[2]} recibe ${dealtDamage[1]}`

  if (
    /^(?:sin bloqueos?|sin bloqueadores?|no bloqueo|no bloqueamos|no defiendo|no defendemos|no hay bloqueos?|no hay bloqueadores?|no hago bloqueos?|no bloqueo con nada|nadie bloquea|no bloquea nadie)$/.test(
      normalized,
    )
  )
    return 'sin bloqueos'

  const blockWith = /^(?:bloqueo|defiendo)\s+(?:a|al|a la)\s+(.+?)\s+con\s+(.+)$/.exec(
    normalized,
  )
  if (blockWith) return `bloqueo ${blockWith[1]} con ${blockWith[2]}`

  const defendWith = /^defiendo\s+con\s+(.+)$/.exec(normalized)
  if (defendWith) return `bloqueo con ${defendWith[1]}`

  const defendTarget = /^defiendo\s+(.+?)\s+con\s+(.+)$/.exec(normalized)
  if (defendTarget) return `bloqueo ${defendTarget[1]} con ${defendTarget[2]}`

  if (/^(?:te toca|tu turno|turno para ti)$/.test(normalized))
    return 'paso turno'

  return normalized
}
