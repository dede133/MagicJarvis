import type { VoiceLanguageV3Syntax } from './types'

/**
 * Canonical semantic surface after language-pack canonicalization. Today that
 * surface is Spanish-compatible, but keeping it here prevents the semantic
 * matcher from embedding language-specific regexes throughout its logic.
 */
export const CANONICAL_V3_SYNTAX: VoiceLanguageV3Syntax = {
  response: /^(?:en respuesta|respondo con)\s+(.+)$/,
  attackWith: /^(?:te\s+)?(?:ataco|pego)(?:\s+con)\s+(.+)$/,
  attackVoyWith: /^voy\s+con\s+(.+)$/,
  targetedAttack: /^(?:ataco|pego)\s+(?:a|al)\s+(.+?)\s+con\s+(.+)$/,
  targetedBlock:
    /^(?:bloqueo|bloquear)\s+(?:(?:a|al|a la)\s+)?(.+?)\s+con\s+(.+)$/,
  lifeDelta: /^(gano|me curo|pierdo|recibo|me quito)\s+(\d+)(?:\s+vidas?)?$/,
  lifeSet:
    /^(?:estoy a|me pongo a|me quedo en|tengo)\s+(\d+)(?:\s+vidas?)?$/,
  hiddenZoneNatural:
    /^(?:tengo|me quedan)?\s*(\d+)\s+(?:cartas?\s+)?(?:en\s+)?(?:la\s+)?(mano|biblioteca|mazo)$/,
  hiddenZoneCompact:
    /^(mano|biblioteca|mazo|cartas en mano|cartas en (?:la )?(?:biblioteca|mazo))\s+(\d+)$/,
  counterAdd:
    /^(?:le\s+)?(?:pongo|poner|anado|añado)\s+(\d+)\s+(?:contadores?\s+)?(.+?)\s+(?:a|en|sobre)\s+(.+)$/,
  counterRemove:
    /^(?:le\s+)?(?:quito|quitar|retiro|retirar)\s+(\d+)\s+(?:contadores?\s+)?(.+?)\s+(?:de|a)\s+(.+)$/,
  resolveNamed: /^(?:resuelvo|resuelve|resolver|que resuelva)\s+(.+)$/,
  manaActivation:
    /^(?:giro|girar|tap|tapeo|tapear|activo|activar|uso|usar)(?:\s+la habilidad de)?\s+(.+?)\s+para(?:\s+mana)?(?:\s+(.+))?$/,
}
