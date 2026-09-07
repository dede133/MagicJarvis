import { VOICE_ACTION_ANCHORS } from '../../voice/actionAnchors'

/** Central, deliberately small vocabulary for natural tabletop declarations. */
export const intentAliases = {
  PLAY_CARD: VOICE_ACTION_ANCHORS.play,
  TAP_CARD: VOICE_ACTION_ANCHORS.tap,
  UNTAP_CARD: VOICE_ACTION_ANCHORS.untap,
  CAST_SPELL: VOICE_ACTION_ANCHORS.cast,
  ACTIVATE_ABILITY: VOICE_ACTION_ANCHORS.activate,
  DRAW: VOICE_ACTION_ANCHORS.draw,
  DISCARD_CARD: VOICE_ACTION_ANCHORS.discard,
  ADD_MANA: ['anado', 'anade', 'agrego', 'agrega', 'genero', 'meto'],
  SPEND_MANA: ['gasto', 'pago', 'uso'],
  NEXT_TURN: ['pasar turno', 'paso turno', 'siguiente turno', 'next turn'],
  RESOLVE_SPELL: ['resuelve', 'resolver'],
  UNDO: [
    'deshacer',
    'deshaz',
    'deshaz eso',
    'deshazlo',
    'undo',
    'atras',
    'cancelar',
    'cancela',
    'cancela eso',
    'cancelalo',
    'anular',
    'anula',
    'anula eso',
    'anulalo',
    'revertir',
    'revierte',
    'revierte eso',
  ],
} as const

export type CommandIntent = keyof typeof intentAliases

export const leadingIntent = (
  input: string,
  intent: CommandIntent,
): string | undefined => {
  const alias = intentAliases[intent].find(
    (value) => input === value || input.startsWith(`${value} `),
  )
  return alias === undefined ? undefined : input.slice(alias.length).trim()
}

export const isExactIntent = (input: string, intent: CommandIntent): boolean =>
  intentAliases[intent].includes(input as never)

/** Fillers are removed only at the start of an already identified entity. */
export const stripEntityFillers = (value: string): string =>
  value
    // normalizeCommandText intentionally turns “una” into 1. At the start of
    // an entity that 1 is the article, not a card quantity or identity.
    .replace(/^1\s+/, '')
    .replace(/^(?:un|una|el|la|los|las|otro|otra)\s+/, '')
    .replace(/^carta\s+/, '')
    .trim()
