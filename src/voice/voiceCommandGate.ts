import { isExactIntent } from '../commands/parser/intents'
import { normalizeCommandText } from '../commands/parser/normalizeText'
import { normalizeSpokenCommand } from './spokenCommandNormalizer'
import { DEFAULT_VOICE_LANGUAGE_PACK, type VoiceLanguagePack } from './languages'
import { stripDiscourse } from './v3/grammar/macros'
import {
  ACTIVATE_VERBS,
  ATTACK_VERBS,
  DISCARD_VERBS,
  DRAW_VERBS,
  EQUIP_VERBS,
  EXILE_VERBS,
  MOVE_VERBS,
  PLAY_VERBS,
  RETURN_VERBS,
  TAP_VERBS,
  UNTAP_VERBS,
} from './v3/grammar/macros'

export type VoiceCommandGateReason =
  | 'QUESTION'
  | 'UNCERTAINTY'
  | 'NEGATED_ACTION'
  | 'PAST_REFERENCE'
  | 'NO_COMMAND_CANDIDATE'

export type VoiceCommandGateResult =
  | { decision: 'CONTINUE' }
  | { decision: 'IGNORE'; reason: VoiceCommandGateReason }

const questionStart =
  /^(?:puedo|podria|debo|deberia|puedes|podrias|vas a|vais a|tienes|teneis|que|como|cuando|donde|cual|cuales|cuanto|cuanta|cuantos|cuantas|por que)\b/

const uncertaintyStart =
  /^(?:igual|quizas?|a lo mejor|tal vez|puede que|creo que|me parece que|supongo que|estoy pensando en|estaba pensando en)\b/

const negatedAction =
  /^no\s+(?:(?:voy a|quiero|pienso|puedo|debo|deberia)\s+)?(?:jugar|juego|bajar|bajo|poner|pongo|lanzar|lanzo|castear|casteo|tirar|tiro|atacar|ataco|girar|giro|enderezar|enderezo|robar|robo|descartar|descarto|activar|activo|sacrificar|sacrifico|pasar|paso)\b/

const explicitPastContext =
  /^(?:ayer|antes|el turno pasado|en el turno anterior)\b/

const completedPastAction =
  /^(?:he|has|ha|hemos|habeis|han)\s+(?:jugado|bajado|puesto|lanzado|casteado|tirado|atacado|girado|enderezado|robado|descartado|activado|sacrificado|bloqueado|pasado)\b/

const recentPastAction =
  /^(?:acabo|acabas|acaba)\s+de\s+(?:jugar|bajar|poner|lanzar|castear|tirar|atacar|girar|enderezar|robar|descartar|activar|sacrificar|bloquear|pasar)\b/

const commandCandidateStarts = [
  ...PLAY_VERBS,
  ...TAP_VERBS,
  ...UNTAP_VERBS,
  ...DRAW_VERBS,
  ...DISCARD_VERBS,
  ...ACTIVATE_VERBS,
  ...ATTACK_VERBS,
  ...EQUIP_VERBS,
  ...MOVE_VERBS,
  ...RETURN_VERBS,
  ...EXILE_VERBS,
  'barajo',
  'barajar',
  'paso',
  'pasar',
  'turno',
  'combate',
  'mantenimiento',
  'upkeep',
  'dano',
  'pago',
  'pagar',
  'mantengo',
  'mantener',
  'acepto',
  'rechazo',
  'bloqueo',
  'bloquear',
  'resuelvo',
  'resolver',
  'sacrifico',
  'sacrificar',
  'mulligan',
  'concedo',
  'conceder',
] as const

export const hasVoiceCommandCandidateAnchor = (
  input: string,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): boolean => {
  const normalized = normalizeSpokenCommand(input, languagePack)
  if (!normalized) return false
  return commandCandidateStarts.some(
    (candidate) =>
      normalized === candidate || normalized.startsWith(`${candidate} `),
  )
}


/**
 * Small, conservative pre-parser filter for continuous-listening experiments.
 * It only rejects wording that is clearly conversational. Everything else is
 * left to the existing deterministic parser/resolver.
 */
export const evaluateVoiceCommandGate = (
  input: string,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): VoiceCommandGateResult => {
  const containsQuestionPunctuation = /[¿?]/.test(input)
  const normalized = normalizeSpokenCommand(input, languagePack)
  if (!normalized)
    return { decision: 'IGNORE', reason: 'NO_COMMAND_CANDIDATE' }

  // Negative combat declarations are real game actions, not conversational
  // negations. Keep them explicit before applying generic negation rules.
  if (
    DEFAULT_VOICE_LANGUAGE_PACK.v3.noBlockersPhrases.includes(normalized) ||
    DEFAULT_VOICE_LANGUAGE_PACK.v3.noAttackersPhrases.includes(normalized)
  )
    return { decision: 'CONTINUE' }

  // Strong correction commands from block 3 remain first-class commands.
  if (isExactIntent(normalized, 'UNDO')) return { decision: 'CONTINUE' }

  // Inspect the selected surface language before relying on the canonical
  // Spanish safety expressions below. This preserves Catalan doubt/questions
  // even when the rest of the sentence never needs to be translated.
  const surfaceCore = stripDiscourse(normalizeCommandText(input), languagePack)
  const surfaceSafety = languagePack.v3.safety
  if (
    containsQuestionPunctuation ||
    (surfaceCore && surfaceSafety.questionStart.test(surfaceCore))
  )
    return { decision: 'IGNORE', reason: 'QUESTION' }
  if (surfaceCore && surfaceSafety.uncertaintyStart.test(surfaceCore))
    return { decision: 'IGNORE', reason: 'UNCERTAINTY' }
  if (surfaceCore && surfaceSafety.negatedAction.test(surfaceCore))
    return { decision: 'IGNORE', reason: 'NEGATED_ACTION' }
  if (
    surfaceCore &&
    (surfaceSafety.explicitPastContext.test(surfaceCore) ||
      surfaceSafety.completedPastAction.test(surfaceCore) ||
      surfaceSafety.recentPastAction.test(surfaceCore))
  )
    return { decision: 'IGNORE', reason: 'PAST_REFERENCE' }

  if (containsQuestionPunctuation || questionStart.test(normalized))
    return { decision: 'IGNORE', reason: 'QUESTION' }

  if (uncertaintyStart.test(normalized))
    return { decision: 'IGNORE', reason: 'UNCERTAINTY' }

  if (negatedAction.test(normalized))
    return { decision: 'IGNORE', reason: 'NEGATED_ACTION' }

  if (
    explicitPastContext.test(normalized) ||
    completedPastAction.test(normalized) ||
    recentPastAction.test(normalized)
  )
    return { decision: 'IGNORE', reason: 'PAST_REFERENCE' }

  if (!hasVoiceCommandCandidateAnchor(normalized, languagePack))
    return { decision: 'IGNORE', reason: 'NO_COMMAND_CANDIDATE' }

  return { decision: 'CONTINUE' }
}
