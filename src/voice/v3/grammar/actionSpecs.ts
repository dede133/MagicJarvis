import type { ActivatedAbilityHint } from '../../../commands/types/commandTypes'
import type { VoiceActionCatalog } from '../catalog/buildVoiceActionCatalog'
import type { SemanticIntent } from '../semanticCommand'
import type { VoiceLanguageV3Grammar } from '../../languages/types'

type VerbFamily = keyof VoiceLanguageV3Grammar['verbs']
type CatalogFamily = keyof VoiceActionCatalog

/**
 * Declarative metadata for the simple entity-action families. Complex syntax
 * (combat assignments, moves, counters, responses) can keep a specialized
 * parser while sharing the same intent/slot catalog and clarification layer.
 */
export type EntityActionSpec = {
  id: string
  intent: Extract<
    SemanticIntent,
    | 'PLAY_CARD'
    | 'TAP_CARD'
    | 'UNTAP_CARD'
    | 'DISCARD_CARD'
    | 'ACTIVATE_ABILITY'
  >
  verbFamily: VerbFamily
  catalogFamily: Extract<
    CatalogFamily,
    | 'playableCards'
    | 'tappableCards'
    | 'untappableCards'
    | 'discardableCards'
    | 'activatableCards'
    | 'equipSources'
  >
  allowFuzzyVerb: boolean
  counted?: boolean
  stripAbilityFraming?: boolean
  abilityHint?: ActivatedAbilityHint
  rejectRemainder?: RegExp
  missingSlot?: 'card' | 'attacker' | 'blocker' | 'target' | 'amount'
  missingDescription: string
}

export const ENTITY_ACTION_SPECS: readonly EntityActionSpec[] = [
  {
    id: 'discard-card',
    intent: 'DISCARD_CARD',
    verbFamily: 'discard',
    catalogFamily: 'discardableCards',
    allowFuzzyVerb: false,
    counted: true,
    missingDescription: 'Falta la carta a descartar.',
  },
  {
    id: 'equip',
    intent: 'ACTIVATE_ABILITY',
    verbFamily: 'equip',
    catalogFamily: 'equipSources',
    allowFuzzyVerb: true,
    abilityHint: 'EQUIP',
    rejectRemainder: /\s+a\s+/,
    missingDescription: 'Falta el equipo.',
  },
  {
    id: 'activate-ability',
    intent: 'ACTIVATE_ABILITY',
    verbFamily: 'activate',
    catalogFamily: 'activatableCards',
    allowFuzzyVerb: true,
    stripAbilityFraming: true,
    rejectRemainder: /\s+para(?:\s+mana)?(?:\s+.+)?$/,
    missingDescription: 'Falta la fuente de la habilidad.',
  },
  {
    id: 'play-card',
    intent: 'PLAY_CARD',
    verbFamily: 'play',
    catalogFamily: 'playableCards',
    allowFuzzyVerb: false,
    missingDescription: 'Falta la carta a jugar.',
  },
  {
    id: 'tap-card',
    intent: 'TAP_CARD',
    verbFamily: 'tap',
    catalogFamily: 'tappableCards',
    allowFuzzyVerb: true,
    counted: true,
    rejectRemainder: /\s+para(?:\s+mana)?(?:\s+.+)?$/,
    missingDescription: 'Falta el permanente a girar.',
  },
  {
    id: 'untap-card',
    intent: 'UNTAP_CARD',
    verbFamily: 'untap',
    catalogFamily: 'untappableCards',
    allowFuzzyVerb: true,
    counted: true,
    rejectRemainder: /^(?:todo|todos)\b/,
    missingDescription: 'Falta el permanente a enderezar.',
  },
]


export type IncompleteActionSpec = {
  id: string
  intent: SemanticIntent
  verbFamily: VerbFamily
  missingSlot: 'card' | 'attacker' | 'blocker' | 'target' | 'amount'
  description: string
}

/**
 * Single registry for follow-up completion. Adding a new entity action no
 * longer requires a second switch inside the matcher; specialized families
 * only add one declarative entry here.
 */
export const INCOMPLETE_ACTION_SPECS: readonly IncompleteActionSpec[] = [
  ...ENTITY_ACTION_SPECS.map((spec) => ({
    id: spec.id,
    intent: spec.intent,
    verbFamily: spec.verbFamily,
    missingSlot: spec.missingSlot ?? ('card' as const),
    description: spec.missingDescription,
  })),
  {
    id: 'channel',
    intent: 'ACTIVATE_ABILITY',
    verbFamily: 'channel',
    missingSlot: 'card',
    description: 'Falta la carta con channel.',
  },
  {
    id: 'waterbend',
    intent: 'ACTIVATE_ABILITY',
    verbFamily: 'waterbend',
    missingSlot: 'card',
    description: 'Falta la fuente de waterbend.',
  },
  {
    id: 'attack',
    intent: 'DECLARE_ATTACKERS',
    verbFamily: 'attack',
    missingSlot: 'card',
    description: 'Faltan los atacantes.',
  },
  {
    id: 'block',
    intent: 'DECLARE_BLOCKERS',
    verbFamily: 'block',
    missingSlot: 'blocker',
    description: 'Faltan los bloqueadores.',
  },
]
