/**
 * Canonical action anchors shared by V2 and Voice V3.
 *
 * Keep this file surface-language only: adding a synonym here must not add a
 * new game mechanic. V3 may compose multiple anchor families for one semantic
 * intent (for example PLAY_CARD accepts both play and cast declarations).
 */
export const VOICE_ACTION_ANCHORS = {
  play: [
    'bajar',
    'bajo',
    'baja',
    'jugar',
    'juego',
    'juega',
    'poner',
    'pongo',
    'pon',
    'sacar',
    'saco',
    'play',
  ],
  cast: [
    'lanzar',
    'lanzo',
    'lanza',
    'castear',
    'casteo',
    'cast',
    'tirar',
    'tiro',
  ],
  tap: ['girar', 'giro', 'gira', 'tap', 'tapear', 'tapeo'],
  untap: [
    'enderezar',
    'enderezo',
    'endereza',
    'untap',
    'destap',
    'destapo',
    'destapar',
  ],
  activate: ['activar', 'activo', 'activa', 'uso', 'usar'],
  draw: ['robar', 'robo', 'roba'],
  discard: ['descartar', 'descarto', 'descarta'],
  block: ['bloquear', 'bloqueo', 'defender', 'defiendo'],
} as const

export const V3_PLAY_ANCHORS = [
  ...VOICE_ACTION_ANCHORS.play,
  ...VOICE_ACTION_ANCHORS.cast,
] as const
