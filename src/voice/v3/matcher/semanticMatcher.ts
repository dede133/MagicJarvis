import {
  isExactIntent,
  stripEntityFillers,
} from '../../../commands/parser/intents'
import { normalizeCommandText } from '../../../commands/parser/normalizeText'
import { canBlock } from '../../../rules/combat/combatRules'
import { usesTabletopImplicitResolution } from '../../../rules/implicitResolution/implicitResolution'
import type { GameState } from '../../../types/game'
import {
  matchVoiceUiAction,
  type VoiceUiActionDescriptor,
} from '../../voiceUiActions'
import { buildVoiceActionCatalog } from '../catalog/buildVoiceActionCatalog'
import {
  voiceActorPlayerId,
  voiceStackObjectControlledByPlayer,
} from '../context/voiceActorContext'
import {
  fuzzyLeadingVerbRemainder,
  leadingVerbRemainder,
  stripCommandFraming,
} from '../grammar/macros'
import { matchesNextTurnPhrase } from '../grammar/templates'
import { evaluateSemanticSafety } from '../safety/semanticSafety'
import {
  canonicalizeVoiceLanguageInput,
  DEFAULT_VOICE_LANGUAGE_PACK,
  SPANISH_VOICE_LANGUAGE_PACK,
  type VoiceLanguagePack,
} from '../../languages'
import type {
  PendingDecisionSlots,
  SemanticCommand,
  SemanticCommandSlotsFor,
  SemanticIntent,
  SemanticMatchResult,
  SemanticTraceEvent,
} from '../semanticCommand'
import { resolveVoiceSlot } from '../slots/resolveSlot'
import type { VoiceSlotOption } from '../slots/slotTypes'
import {
  ENTITY_ACTION_SPECS,
  type EntityActionSpec,
} from '../grammar/actionSpecs'
import { SEMANTIC_SCORE } from './semanticScoring'

const pendingSlots = (
  action: VoiceUiActionDescriptor,
): PendingDecisionSlots => ({
  uiActionId: action.id,
  uiActionKind: action.kind,
  ...(action.decisionId ? { decisionId: action.decisionId } : {}),
  ...(action.pendingAbilityId
    ? { pendingAbilityId: action.pendingAbilityId }
    : {}),
  ...(action.selection !== undefined ? { selection: action.selection } : {}),
  uiDescription: action.description,
  uiParsed: action.parsed,
  ...(action.entity ? { uiEntity: action.entity } : {}),
})

const command = <I extends SemanticIntent>(
  intent: I,
  normalizedText: string,
  slots: SemanticCommandSlotsFor<I>,
  score: number,
  ...evidence: string[]
): SemanticCommand<I> =>
  ({ intent, normalizedText, slots, score, evidence }) as SemanticCommand<I>

const withTrace = <I extends SemanticIntent>(
  candidate: SemanticCommand<I>,
  ...trace: SemanticTraceEvent[]
): SemanticCommand<I> => ({
  ...candidate,
  trace: [...(candidate.trace ?? []), ...trace],
})

const optionClarification = (
  prompt: string,
  options: readonly VoiceSlotOption[],
  commands: readonly SemanticCommand[],
) => ({
  kind: 'ENTITY' as const,
  prompt,
  choices: options.map((option, index) => ({
    id: option.instanceId ?? option.id,
    label: option.aliases[0] ?? option.canonical,
    aliases: [option.canonical, ...option.aliases],
    command: commands[index],
  })),
})

const commandClarificationLabel = (candidate: SemanticCommand): string => {
  const slots = candidate.slots as Record<string, unknown>
  const cards = Array.isArray(slots.cards)
    ? slots.cards.filter((value): value is string => typeof value === 'string')
    : []
  if (candidate.intent === 'DECLARE_BLOCKERS' && cards.length)
    return `${typeof slots.attacker === 'string' ? `${slots.attacker} con ` : ''}${cards.join(' y ')}`
  if (candidate.intent === 'DECLARE_ATTACKERS' && cards.length)
    return `${cards.join(' y ')}${typeof slots.defender === 'string' ? ` a ${slots.defender}` : ''}`
  const direct = [
    slots.card,
    slots.attacker,
    slots.defender,
    slots.uiEntity,
  ].find(
    (value): value is string => typeof value === 'string' && Boolean(value),
  )
  if (direct) return direct
  if (cards.length) return cards.join(' y ')
  return candidate.intent
}

const interpretationClarification = (
  prompt: string,
  commands: readonly SemanticCommand[],
) => ({
  kind: 'INTERPRETATION' as const,
  prompt,
  choices: commands.map((candidate, index) => ({
    id: `${candidate.intent}:${index}`,
    label: commandClarificationLabel(candidate),
    aliases: [commandClarificationLabel(candidate), candidate.intent],
    command: candidate,
  })),
})

const stripCardArticle = (value: string): string =>
  stripEntityFillers(value)
    .replace(/^(?:mi|mis)\s+/, '')
    .trim()

const countedEntity = (value: string): { amount?: number; query: string } => {
  const cleaned = stripCardArticle(value)
  const matched = /^(\d+)\s+(.+)$/.exec(cleaned)
  return matched
    ? { amount: Number(matched[1]), query: matched[2].trim() }
    : { query: cleaned }
}

const stripAbilityFraming = (value: string): string =>
  stripCardArticle(value)
    .replace(/^la habilidad de\s+/, '')
    .replace(/^habilidad de\s+/, '')
    .trim()

const mechanicRemainder = (
  input: string,
  verbs: readonly string[],
  mechanic: 'channel' | 'waterbend',
  languagePack: VoiceLanguagePack,
): string | undefined => {
  const core = stripCommandFraming(input, languagePack)
  const direct = leadingVerbRemainder(core, verbs, languagePack)
  if (direct !== undefined) return direct.replace(/^de\s+/, '').trim()
  const framed = new RegExp(
    `^(?:hago|uso)\\s+${mechanic}(?:\\s+(?:de|con))?\\s+(.+)$`,
  ).exec(core)
  return framed?.[1]?.trim()
}

const moveRemainder = (
  input: string,
  languagePack: VoiceLanguagePack,
): { query: string; destination: string } | undefined => {
  const grammar = languagePack.v3
  const directExile = leadingVerbRemainder(
    input,
    grammar.verbs.exile,
    languagePack,
  )
  if (directExile)
    return {
      query: stripCardArticle(directExile),
      destination: 'exilio',
    }

  const remainder =
    leadingVerbRemainder(input, grammar.verbs.move, languagePack) ??
    leadingVerbRemainder(input, grammar.verbs.return, languagePack)
  const core = stripCommandFraming(input, languagePack)
  const shorthand = /^(.+?)\s+(?:va|vuelve)\s+(?:a|al)\s+(?:la\s+)?(.+)$/.exec(
    core,
  )
  const direct = /^(.+?)\s+(?:a|al)\s+(?:la\s+)?(.+)$/.exec(core)
  const matched = remainder
    ? /^(.+?)\s+(?:a|al)\s+(?:la\s+)?(.+)$/.exec(remainder)
    : (shorthand ?? direct)
  if (!matched) return undefined
  const destination = matched[2].trim()
  if (!(destination in grammar.moveZonePhrases)) return undefined
  return {
    query: stripCardArticle(matched[1]),
    destination,
  }
}

type CardListResolution =
  | { status: 'NO_MATCH' }
  | {
      status: 'AMBIGUOUS'
      query: string
      options: readonly VoiceSlotOption[]
    }
  | { status: 'MATCHED'; cards: string[]; instanceIds: string[] }

const resolveCardList = (
  rawList: string,
  options: readonly VoiceSlotOption[],
): CardListResolution => {
  const queries = rawList
    .split(/\s+y\s+|\s*,\s*/)
    .map((value) => stripCardArticle(value))
    .filter(Boolean)
  if (!queries.length) return { status: 'NO_MATCH' }

  const cards: string[] = []
  const instanceIds: string[] = []
  for (const query of queries) {
    const resolved = resolveVoiceSlot(query, options)
    if (resolved.status === 'NO_MATCH') return { status: 'NO_MATCH' }
    if (resolved.status === 'AMBIGUOUS')
      return { status: 'AMBIGUOUS', query, options: resolved.options }
    cards.push(resolved.option.canonical)
    if (resolved.option.instanceId) instanceIds.push(resolved.option.instanceId)
  }

  return { status: 'MATCHED', cards, instanceIds }
}

type SlotVerbRemainder = {
  remainder: string
  fuzzyEvidence?: string
  minimumSlotScore?: number
}

const slotVerbRemainder = (
  input: string,
  verbs: readonly string[],
  allowFuzzy = false,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): SlotVerbRemainder | undefined => {
  const exact = leadingVerbRemainder(input, verbs, languagePack)
  if (exact !== undefined) return { remainder: exact }
  if (!allowFuzzy) return undefined
  const fuzzy = fuzzyLeadingVerbRemainder(input, verbs, languagePack)
  if (!fuzzy) return undefined
  return {
    remainder: fuzzy.remainder,
    fuzzyEvidence: `verbo ASR ${fuzzy.heardVerb} → ${fuzzy.matchedVerb} (${fuzzy.score})`,
    // A damaged action word is only authorized when GameState resolves the
    // entity very strongly. This prevents fuzzy verbs from turning ordinary
    // conversation into commands.
    minimumSlotScore: 90,
  }
}

const attackRemainder = (
  input: string,
  languagePack: VoiceLanguagePack,
): string | undefined => {
  const core = stripCommandFraming(input, languagePack)
  const direct = languagePack.v3.syntax.attackWith.exec(core)
  if (direct) return direct[1].trim()
  const voy = languagePack.v3.syntax.attackVoyWith.exec(core)
  if (voy) return voy[1].trim()
  const remainder = leadingVerbRemainder(
    input,
    languagePack.v3.verbs.attack,
    languagePack,
  )
  return remainder?.replace(/^con\s+/, '').trim()
}

const targetedAttackRemainder = (
  input: string,
  languagePack: VoiceLanguagePack,
): { defender: string; attackers: string } | undefined => {
  const core = stripCommandFraming(input, languagePack)
  const matched = /^(?:ataco|pego)\s+(?:a|al)\s+(.+?)\s+con\s+(.+)$/.exec(core)
  return matched
    ? {
        defender: stripCardArticle(matched[1]),
        attackers: matched[2].trim(),
      }
    : undefined
}

const blockRemainder = (
  input: string,
  languagePack: VoiceLanguagePack,
): { attacker?: string; blockers: string } | undefined => {
  const core = stripCommandFraming(input, languagePack)
  const targeted =
    /^(?:bloqueo|bloquear)\s+(?:(?:a|al|a la)\s+)?(.+?)\s+con\s+(.+)$/.exec(
      core,
    )
  if (targeted)
    return {
      attacker: stripCardArticle(targeted[1]),
      blockers: targeted[2].trim(),
    }
  const generic = leadingVerbRemainder(
    input,
    languagePack.v3.verbs.block,
    languagePack,
  )
  if (generic?.startsWith('con '))
    return { blockers: generic.slice('con '.length).trim() }
  return undefined
}

type AttackSlotsResolution =
  | { status: 'NO_MATCH' }
  | { status: 'AMBIGUOUS'; query: string; options: readonly VoiceSlotOption[] }
  | {
      status: 'MATCHED'
      slots: SemanticCommandSlotsFor<'DECLARE_ATTACKERS'>
      evidence: string
    }

const resolveAttackSlots = (
  rawAttackers: string,
  options: readonly VoiceSlotOption[],
): AttackSlotsResolution => {
  const all =
    /^(?:todo|todos|todas)(?:\s+mis)?(?:\s+(?:los|las))?(?:\s+(.+))?$/.exec(
      stripCardArticle(rawAttackers),
    )
  if (all)
    return {
      status: 'MATCHED',
      slots: { all: true, ...(all[1] ? { subtype: all[1].trim() } : {}) },
      evidence: 'template attack all',
    }

  const resolved = resolveCardList(rawAttackers, options)
  if (resolved.status !== 'MATCHED') return resolved
  return {
    status: 'MATCHED',
    slots: {
      cards: resolved.cards,
      cardInstanceIds: resolved.instanceIds,
    },
    evidence: `atacantes: ${resolved.cards.join(', ')}`,
  }
}

const blockerOptionsForAttacker = (
  state: GameState,
  options: readonly VoiceSlotOption[],
  attackerInstanceId: string,
): VoiceSlotOption[] => {
  const attacker = state.combatState.attackers.find(
    (candidate) => candidate.attackerInstanceId === attackerInstanceId,
  )
  if (!attacker) return []
  return options.filter((option) => {
    if (!option.instanceId) return false
    const blocker = state.cards.find(
      (candidate) => candidate.instanceId === option.instanceId,
    )
    return Boolean(blocker && canBlock(state, attacker, blocker).legal)
  })
}

const responseSemanticMatch = (
  core: string,
  normalizedText: string,
  state: GameState,
  languagePack: VoiceLanguagePack,
): SemanticMatchResult | undefined => {
  const matched = languagePack.v3.syntax.response.exec(core)
  if (!matched) return undefined

  const responseText = matched[1].trim()
  const explicitlyActioned =
    leadingVerbRemainder(
      responseText,
      languagePack.v3.verbs.play,
      languagePack,
    ) !== undefined ||
    leadingVerbRemainder(
      responseText,
      languagePack.v3.verbs.activate,
      languagePack,
    ) !== undefined
  const nested = matchSemanticVoiceCommand(
    explicitlyActioned ? responseText : `lanzo ${responseText}`,
    state,
    languagePack,
  )

  const decorate = (candidate: SemanticCommand): SemanticCommand | undefined =>
    candidate.intent === 'PLAY_CARD' || candidate.intent === 'ACTIVATE_ABILITY'
      ? {
          ...candidate,
          normalizedText,
          slots: { ...candidate.slots, inResponse: true },
          evidence: [...candidate.evidence, 'explicit response'],
        }
      : undefined

  if (nested.status === 'MATCHED') {
    const decorated = decorate(nested.command)
    return decorated
      ? { status: 'MATCHED', command: decorated }
      : {
          status: 'REJECTED_CONTEXT',
          normalizedText,
          description:
            'En respuesta solo se admite lanzar un hechizo o activar una habilidad compatible.',
        }
  }
  if (nested.status === 'AMBIGUOUS') {
    const commands = nested.commands
      .map(decorate)
      .filter((candidate): candidate is SemanticCommand => Boolean(candidate))
    return commands.length
      ? { ...nested, normalizedText, commands }
      : {
          status: 'REJECTED_CONTEXT',
          normalizedText,
          description:
            'No hay una respuesta de stack compatible con la frase indicada.',
        }
  }
  if (nested.status === 'UNSAFE') return nested
  return {
    status: 'REJECTED_CONTEXT',
    normalizedText,
    description:
      'No hay una respuesta de stack compatible con la frase indicada.',
  }
}

type EntitySlotIntent = Extract<
  SemanticIntent,
  | 'PLAY_CARD'
  | 'TAP_CARD'
  | 'UNTAP_CARD'
  | 'DISCARD_CARD'
  | 'ADD_COUNTER'
  | 'REMOVE_COUNTER'
  | 'ACTIVATE_ABILITY'
  | 'ACTIVATE_MANA'
  | 'MOVE_ZONE'
  | 'RESOLVE_SPELL'
>

const slotCommands = <I extends EntitySlotIntent>(
  intent: I,
  normalizedText: string,
  query: string,
  options: readonly VoiceSlotOption[],
  extraSlots: Partial<SemanticCommandSlotsFor<I>> = {},
  requirements: { minimumScore?: number; evidence?: string } = {},
): SemanticMatchResult | SemanticCommand<I> => {
  const resolved = resolveVoiceSlot(query, options)
  if (resolved.status === 'NO_MATCH') {
    // A fuzzy action anchor is only a hypothesis. If its entity does not
    // resolve strongly, let the other intent families try instead of turning
    // an uncertain verb into a hard context rejection.
    if (typeof requirements.minimumScore === 'number')
      return { status: 'NO_MATCH', normalizedText }
    return {
      status: 'REJECTED_CONTEXT',
      normalizedText,
      intent,
      description: `No hay ninguna entidad compatible con ${intent} para “${query}” en el estado actual.`,
      trace: [
        {
          kind: 'CONTEXT_CANDIDATES',
          intent,
          query,
          candidateCount: options.length,
          candidates: [
            ...new Set(options.map((option) => option.canonical)),
          ].slice(0, 16),
        },
      ],
    }
  }
  if (resolved.status === 'AMBIGUOUS') {
    const requestedCount = (extraSlots as Record<string, unknown>).amount
    const canonicalNames = [
      ...new Set(resolved.options.map((option) => option.canonical)),
    ]
    if (
      typeof requestedCount === 'number' &&
      requestedCount > 1 &&
      canonicalNames.length === 1 &&
      resolved.options.length >= requestedCount
    )
      return command(
        intent,
        normalizedText,
        {
          ...extraSlots,
          card: canonicalNames[0],
        } as SemanticCommandSlotsFor<I>,
        SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
        `slot agrupado: ${requestedCount} × ${canonicalNames[0]}`,
      )

    const commands = resolved.options.map((option) =>
      withTrace(
        command(
          intent,
          normalizedText,
          {
            ...extraSlots,
            card: option.canonical,
            ...(option.instanceId ? { cardInstanceId: option.instanceId } : {}),
          } as SemanticCommandSlotsFor<I>,
          SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
          `slot ambiguo: ${query}`,
        ),
        {
          kind: 'ENTITY_RESOLUTION',
          query,
          canonical: option.canonical,
          method: resolved.method ?? 'UNKNOWN',
          evidenceKind: resolved.evidenceKind,
          score: SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
          candidateCount: resolved.trace?.candidateCount,
          marginToSecond: resolved.marginToSecond,
        },
      ),
    )
    const description = `“${query}” coincide con varias entidades válidas en el estado actual.`
    return {
      status: 'AMBIGUOUS',
      normalizedText,
      commands,
      description,
      clarification: optionClarification(
        description,
        resolved.options,
        commands,
      ),
      ambiguitySource: 'ENTITY',
    }
  }
  if (
    typeof requirements.minimumScore === 'number' &&
    resolved.score < requirements.minimumScore
  )
    return { status: 'NO_MATCH', normalizedText }

  const candidate = command(
    intent,
    normalizedText,
    {
      ...extraSlots,
      card: resolved.option.canonical,
      ...(resolved.option.instanceId
        ? { cardInstanceId: resolved.option.instanceId }
        : {}),
    } as SemanticCommandSlotsFor<I>,
    Math.min(SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT, resolved.score),
    resolved.ignoredRemainder
      ? `slot ${resolved.consumedText ?? query} → ${resolved.option.canonical}; cola no entidad: ${resolved.ignoredRemainder}`
      : `slot ${query} → ${resolved.option.canonical}`,
    `entity ${resolved.method}/${resolved.evidenceKind ?? 'UNKNOWN'} score=${resolved.score}${
      typeof resolved.marginToSecond === 'number'
        ? ` margin=${resolved.marginToSecond.toFixed(3)}`
        : ''
    }`,
    ...(requirements.evidence ? [requirements.evidence] : []),
  )
  return withTrace(candidate, {
    kind: 'ENTITY_RESOLUTION',
    query,
    canonical: resolved.option.canonical,
    method: resolved.method,
    evidenceKind: resolved.evidenceKind,
    score: resolved.score,
    candidateCount: resolved.trace?.candidateCount,
    marginToSecond: resolved.marginToSecond,
  })
}

const matchEntityActionSpec = (
  spec: EntityActionSpec,
  input: string,
  normalizedText: string,
  state: GameState,
  catalog: ReturnType<typeof buildVoiceActionCatalog>,
  languagePack: VoiceLanguagePack,
): SemanticMatchResult | SemanticCommand | undefined => {
  const verbs = languagePack.v3.verbs[spec.verbFamily]
  const verb = slotVerbRemainder(
    input,
    verbs,
    spec.allowFuzzyVerb,
    languagePack,
  )
  if (!verb?.remainder || spec.rejectRemainder?.test(verb.remainder))
    return undefined

  const counted = spec.counted
    ? countedEntity(verb.remainder)
    : { query: stripCardArticle(verb.remainder) }
  const query = spec.stripAbilityFraming
    ? stripAbilityFraming(counted.query)
    : counted.query
  if (!query) return undefined

  if (spec.intent === 'DISCARD_CARD' && (counted.amount ?? 1) > 1)
    return {
      status: 'REJECTED_CONTEXT',
      normalizedText,
      intent: 'DISCARD_CARD',
      description:
        'El motor actual necesita identificar y descartar las cartas una a una.',
    }

  const extraSlots: Record<string, unknown> = {}
  if (spec.intent === 'DISCARD_CARD') extraSlots.amount = counted.amount ?? 1
  else if (counted.amount) extraSlots.amount = counted.amount
  if (spec.abilityHint) extraSlots.abilityHint = spec.abilityHint

  let matched = slotCommands(
    spec.intent,
    normalizedText,
    query,
    catalog[spec.catalogFamily] as readonly VoiceSlotOption[],
    extraSlots as never,
    { minimumScore: verb.minimumSlotScore, evidence: verb.fuzzyEvidence },
  )

  // In TABLETOP_IMPLICIT mode a just-cast permanent can be named by the next
  // non-response command before it has physically left the stack. Let entity
  // recognition identify only the top spell here; the existing command engine
  // remains authoritative and will resolve the top object, rebuild state and
  // retry the parsed action. This avoids duplicating stack rules in V3.
  if (
    'status' in matched &&
    (matched.status === 'NO_MATCH' || matched.status === 'REJECTED_CONTEXT') &&
    ['TAP_CARD', 'UNTAP_CARD', 'ACTIVATE_ABILITY'].includes(spec.intent) &&
    usesTabletopImplicitResolution(state)
  ) {
    const topStackObject = state.stack.at(-1)
    const topSpellInstanceId =
      topStackObject?.kind === 'SPELL'
        ? (topStackObject.spellInstanceId ?? topStackObject.sourceInstanceId)
        : undefined
    const actorPlayerId = voiceActorPlayerId(state)
    const topSpellCard = topSpellInstanceId
      ? state.cards.find(
          (card) =>
            card.instanceId === topSpellInstanceId ||
            card.instanceId === topStackObject?.sourceInstanceId,
        )
      : undefined
    const topSpellBelongsToActor = Boolean(
      topStackObject &&
      topSpellInstanceId &&
      voiceStackObjectControlledByPlayer(state, topStackObject, actorPlayerId),
    )
    const topSpellCanBecomePermanent = Boolean(
      topSpellCard &&
      !/\b(?:instant|sorcery)\b/i.test(topSpellCard.card.typeLine),
    )
    // stackSpells is built from the actual top stack object. Do not reuse
    // movableCards here: that catalog intentionally applies ownership/zone
    // filters for MOVE_CARD and can exclude a freshly cast spell before it
    // becomes a permanent.
    const deferredOptions =
      topSpellBelongsToActor && topSpellCanBecomePermanent
        ? catalog.stackSpells.filter(
            (option) => option.instanceId === topSpellInstanceId,
          )
        : []
    if (deferredOptions.length)
      matched = slotCommands(
        spec.intent,
        normalizedText,
        query,
        deferredOptions,
        extraSlots as never,
        { minimumScore: verb.minimumSlotScore, evidence: verb.fuzzyEvidence },
      )
  }
  if ('status' in matched) {
    if (matched.status === 'MATCHED')
      return {
        ...matched,
        command: withTrace(matched.command, {
          kind: 'ACTION_SPEC',
          specId: spec.id,
          intent: spec.intent,
          verbFamily: spec.verbFamily,
        }),
      }
    if (matched.status === 'AMBIGUOUS')
      return {
        ...matched,
        commands: matched.commands.map((candidate) =>
          withTrace(candidate, {
            kind: 'ACTION_SPEC',
            specId: spec.id,
            intent: spec.intent,
            verbFamily: spec.verbFamily,
          }),
        ),
      }
    return matched
  }
  return withTrace(matched, {
    kind: 'ACTION_SPEC',
    specId: spec.id,
    intent: spec.intent,
    verbFamily: spec.verbFamily,
  })
}

const parseLife = (
  core: string,
  normalizedText: string,
  languagePack: VoiceLanguagePack,
): SemanticCommand | undefined => {
  const delta = languagePack.v3.syntax.lifeDelta.exec(core)
  if (delta)
    return command(
      ['gano', 'me curo'].includes(delta[1]) ? 'GAIN_LIFE' : 'LOSE_LIFE',
      normalizedText,
      { amount: Number(delta[2]) },
      SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
      'template life delta',
    )
  const set = languagePack.v3.syntax.lifeSet.exec(core)
  return set
    ? command(
        'SET_LIFE',
        normalizedText,
        { amount: Number(set[1]) },
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template life set',
      )
    : undefined
}

const parseHiddenZoneCount = (
  core: string,
  normalizedText: string,
  languagePack: VoiceLanguagePack,
): SemanticCommand | undefined => {
  const natural = languagePack.v3.syntax.hiddenZoneNatural.exec(core)
  const compact = languagePack.v3.syntax.hiddenZoneCompact.exec(core)
  const zone = natural?.[2] ?? compact?.[1]
  const amount = Number(natural?.[1] ?? compact?.[2])
  if (!zone || !Number.isSafeInteger(amount) || amount < 0) return undefined
  const hand = zone.includes('mano')
  return command(
    hand ? 'SET_HAND_COUNT' : 'SET_LIBRARY_COUNT',
    normalizedText,
    { amount },
    SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
    `hidden-zone count ${hand ? 'hand' : 'library'}`,
  )
}

const parseCounter = (
  core: string,
  normalizedText: string,
  state: GameState,
  languagePack: VoiceLanguagePack,
): SemanticMatchResult | SemanticCommand | undefined => {
  const add = languagePack.v3.syntax.counterAdd.exec(core)
  const remove = languagePack.v3.syntax.counterRemove.exec(core)
  const matched = add ?? remove
  if (!matched) return undefined
  const counter = matched[2]
    .replace(/^de\s+/, '')
    .replace(/^tipo\s+/, '')
    .trim()
  if (!counter || counter.length > 40) return undefined
  const catalog = buildVoiceActionCatalog(state)
  return slotCommands(
    add ? 'ADD_COUNTER' : 'REMOVE_COUNTER',
    normalizedText,
    matched[3],
    catalog.counterTargets,
    { amount: Number(matched[1]), counter },
  )
}

const incompleteSlotCommand = (
  core: string,
  normalizedText: string,
  languagePack: VoiceLanguagePack,
): SemanticMatchResult | undefined => {
  const verbs = languagePack.v3.verbs
  const groups: Array<{
    verbs: readonly string[]
    intent: SemanticIntent
    description: string
  }> = [
    {
      verbs: verbs.play,
      intent: 'PLAY_CARD',
      description: 'Falta la carta a jugar.',
    },
    {
      verbs: verbs.tap,
      intent: 'TAP_CARD',
      description: 'Falta el permanente a girar.',
    },
    {
      verbs: verbs.untap,
      intent: 'UNTAP_CARD',
      description: 'Falta el permanente a enderezar.',
    },
    {
      verbs: verbs.discard,
      intent: 'DISCARD_CARD',
      description: 'Falta la carta a descartar.',
    },
    {
      verbs: verbs.activate,
      intent: 'ACTIVATE_ABILITY',
      description: 'Falta la fuente de la habilidad.',
    },
    {
      verbs: verbs.equip,
      intent: 'ACTIVATE_ABILITY',
      description: 'Falta el equipo.',
    },
    {
      verbs: verbs.channel,
      intent: 'ACTIVATE_ABILITY',
      description: 'Falta la carta con channel.',
    },
    {
      verbs: verbs.waterbend,
      intent: 'ACTIVATE_ABILITY',
      description: 'Falta la fuente de waterbend.',
    },
    {
      verbs: verbs.attack,
      intent: 'DECLARE_ATTACKERS',
      description: 'Faltan los atacantes.',
    },
  ]
  const matched = groups.find(({ verbs }) => verbs.includes(core as never))
  if (!matched) return undefined
  return {
    status: 'INCOMPLETE',
    normalizedText,
    intent: matched.intent,
    resumePrefix: core,
    description: matched.description,
  }
}

const commandEdgeSpans = (input: string): string[] => {
  const normalized = normalizeCommandText(input)
  const tokens = normalized.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return []
  const spans = new Set<string>()

  // A command spoken first may be followed by table conversation in the same
  // Web Speech final result. Only trim from the right; never search arbitrary
  // middle substrings.
  for (let end = tokens.length - 1; end >= 1; end -= 1)
    spans.add(tokens.slice(0, end).join(' '))

  // A trailing declaration is allowed only after a discourse boundary. This
  // recovers "... ya esta, bajo isla" without executing quoted phrases such as
  // "cuando digo paso turno no registra".
  const trailingBoundary =
    /(?:^|\s)(?:ya esta|vale|pues|entonces|ahora|bueno|asi|venga|ok|okay|y luego|y despues)\s+(.+)$/
  const matched = trailingBoundary.exec(normalized)
  if (matched?.[1]) spans.add(matched[1].trim())

  spans.delete(normalized)
  return [...spans].filter(Boolean)
}

/**
 * V3 semantic matcher. It recognizes command families from reusable grammar
 * pieces and resolves entity slots against the current game catalog. No
 * statistical classifier can authorize execution here.
 */
const matchSemanticVoiceCommandInternal = (
  input: string,
  state: GameState,
  allowEdgeExtraction: boolean,
  languagePack: VoiceLanguagePack,
): SemanticMatchResult => {
  const grammar = languagePack.v3
  const normalizedText = normalizeCommandText(input)
  if (!normalizedText) return { status: 'NO_MATCH', normalizedText }

  // Contextual UI choices are the strongest possible evidence. They also own
  // valid negative utterances such as “no pago”, so match them before safety.
  const ui = matchVoiceUiAction(input, state)
  if (ui.status === 'AMBIGUOUS') {
    if (ui.actions.every((action) => action.parsed.endsWith('_TEXT'))) {
      const textSafety = evaluateSemanticSafety(input, languagePack)
      if (!textSafety.safe && 'reason' in textSafety)
        return {
          status: 'UNSAFE',
          normalizedText: ui.normalizedTranscript,
          reason: textSafety.reason,
        }
    }
    return {
      status: 'AMBIGUOUS',
      normalizedText: ui.normalizedTranscript,
      commands: ui.actions.map((action) =>
        command(
          'PENDING_DECISION',
          ui.normalizedTranscript,
          pendingSlots(action),
          SEMANTIC_SCORE.PENDING_EXACT,
          action.description,
        ),
      ),
      description: ui.description,
      ambiguitySource: 'CONTEXT',
    }
  }
  if (ui.status === 'MATCHED') {
    if (ui.action.parsed.endsWith('_TEXT')) {
      const textSafety = evaluateSemanticSafety(input, languagePack)
      if (!textSafety.safe && 'reason' in textSafety)
        return {
          status: 'UNSAFE',
          normalizedText: ui.normalizedTranscript,
          reason: textSafety.reason,
        }
    }
    return {
      status: 'MATCHED',
      command: withTrace(
        command(
          'PENDING_DECISION',
          ui.normalizedTranscript,
          pendingSlots(ui.action),
          SEMANTIC_SCORE.PENDING_EXACT,
          ui.action.description,
        ),
        {
          kind: 'PENDING_CONTEXT',
          uiActionId: ui.action.id,
          ...(ui.action.decisionId ? { decisionId: ui.action.decisionId } : {}),
        },
      ),
    }
  }

  const core = stripCommandFraming(input, languagePack)
  const isStructuralNegativeCombat =
    grammar.noAttackersPhrases.includes(core) ||
    grammar.noBlockersPhrases.includes(core)
  if (!isStructuralNegativeCombat) {
    const safety = evaluateSemanticSafety(input, languagePack)
    if (!safety.safe && 'reason' in safety)
      return { status: 'UNSAFE', normalizedText, reason: safety.reason }
  }

  const response = responseSemanticMatch(
    core,
    normalizedText,
    state,
    languagePack,
  )
  if (response) return response

  const catalog = buildVoiceActionCatalog(state)
  const candidates: SemanticCommand[] = []

  if (isExactIntent(core, 'UNDO'))
    candidates.push(
      command(
        'UNDO',
        normalizedText,
        {},
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template undo',
      ),
    )

  if (grammar.concedePhrases.includes(core))
    candidates.push(
      command(
        'CONCEDE',
        normalizedText,
        {},
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template concede',
      ),
    )

  if (grammar.noAttackersPhrases.includes(core)) {
    if (
      state.turnState.step !== 'DECLARE_ATTACKERS' ||
      !state.combatState.active
    )
      return {
        status: 'REJECTED_CONTEXT',
        normalizedText,
        description: 'No estás declarando atacantes.',
      }
    candidates.push(
      command(
        'DECLARE_ATTACKERS',
        normalizedText,
        { none: true },
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template no attackers',
      ),
    )
  }

  if (grammar.noBlockersPhrases.includes(core)) {
    const canEnterBlockers =
      state.turnState.step === 'DECLARE_BLOCKERS' ||
      (state.turnState.step === 'DECLARE_ATTACKERS' &&
        state.combatState.attackersDeclared)
    if (!canEnterBlockers || !state.combatState.active)
      return {
        status: 'REJECTED_CONTEXT',
        normalizedText,
        description: 'No estás declarando bloqueadores.',
      }
    candidates.push(
      command(
        'DECLARE_BLOCKERS',
        normalizedText,
        { none: true },
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template no blockers',
      ),
    )
  }

  if (grammar.resolveTopPhrases.includes(core))
    candidates.push(
      command(
        'RESOLVE_SPELL',
        normalizedText,
        {},
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template resolve top spell',
      ),
    )

  if (grammar.untapAllPhrases.includes(core))
    candidates.push(
      command(
        'UNTAP_ALL',
        normalizedText,
        {},
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template untap all',
      ),
    )

  if (matchesNextTurnPhrase(core, languagePack))
    candidates.push(
      command(
        'NEXT_TURN',
        normalizedText,
        {},
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template next turn',
      ),
    )
  if (grammar.advanceStepPhrases.includes(core))
    candidates.push(
      command(
        'ADVANCE_STEP',
        normalizedText,
        {},
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template next step',
      ),
    )
  if (grammar.turnStepPhrases[core])
    candidates.push(
      command(
        'ADVANCE_STEP',
        normalizedText,
        { targetStep: grammar.turnStepPhrases[core] },
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        `turn step ${grammar.turnStepPhrases[core]}`,
      ),
    )

  if (grammar.shuffleLibraryPhrases.includes(core))
    candidates.push(
      command(
        'SHUFFLE_LIBRARY',
        normalizedText,
        {},
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template shuffle local library',
      ),
    )

  if (
    state.turnState.step === 'COMBAT_DAMAGE' &&
    state.combatState.active &&
    grammar.combatDamagePhrases.includes(core)
  )
    candidates.push(
      command(
        'RESOLVE_COMBAT_DAMAGE',
        normalizedText,
        {},
        SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
        'template combat damage',
      ),
    )

  const moving = moveRemainder(input, languagePack)
  if (moving) {
    const matched = slotCommands(
      'MOVE_ZONE',
      normalizedText,
      moving.query,
      catalog.movableCards,
      { destination: grammar.moveZonePhrases[moving.destination] },
    )
    if ('status' in matched) {
      if (matched.status !== 'NO_MATCH') return matched
    } else candidates.push(matched)
  }

  const targetedAttack = targetedAttackRemainder(input, languagePack)
  if (targetedAttack) {
    const attackers = resolveAttackSlots(
      targetedAttack.attackers,
      catalog.attackableCards,
    )
    if (attackers.status === 'AMBIGUOUS') {
      const commands = attackers.options.map((option) =>
        command(
          'DECLARE_ATTACKERS',
          normalizedText,
          {
            cards: [option.canonical],
            ...(option.instanceId
              ? { cardInstanceIds: [option.instanceId] }
              : {}),
          },
          SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
          `atacante ambiguo: ${attackers.query}`,
        ),
      )
      const description = `“${attackers.query}” coincide con varios atacantes válidos en el estado actual.`
      return {
        status: 'AMBIGUOUS',
        normalizedText,
        commands,
        description,
        ambiguitySource: 'ENTITY',
        clarification: optionClarification(
          description,
          attackers.options,
          commands,
        ),
      }
    }
    if (attackers.status === 'NO_MATCH')
      return {
        status: 'REJECTED_CONTEXT',
        normalizedText,
        description: `No hay atacantes propios compatibles con “${targetedAttack.attackers}” en el estado actual.`,
      }

    const defender = resolveVoiceSlot(
      targetedAttack.defender,
      catalog.defendingTargets,
    )
    if (defender.status === 'NO_MATCH')
      return {
        status: 'REJECTED_CONTEXT',
        normalizedText,
        description: `No hay un defensor compatible con “${targetedAttack.defender}” en el estado actual.`,
      }
    if (defender.status === 'AMBIGUOUS') {
      const commands = defender.options.map((option) =>
        command(
          'DECLARE_ATTACKERS',
          normalizedText,
          {
            ...attackers.slots,
            defender: option.canonical,
            ...(option.instanceId
              ? { defenderInstanceId: option.instanceId }
              : {}),
          },
          SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
          `defensor ambiguo: ${targetedAttack.defender}`,
        ),
      )
      const description = `“${targetedAttack.defender}” coincide con varios defensores válidos en el estado actual.`
      return {
        status: 'AMBIGUOUS',
        normalizedText,
        commands,
        description,
        ambiguitySource: 'ENTITY',
        clarification: optionClarification(
          description,
          defender.options,
          commands,
        ),
      }
    }

    candidates.push(
      command(
        'DECLARE_ATTACKERS',
        normalizedText,
        {
          ...attackers.slots,
          defender: defender.option.canonical,
          ...(defender.option.instanceId
            ? { defenderInstanceId: defender.option.instanceId }
            : {}),
        },
        SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
        `${attackers.evidence}; defensor: ${defender.option.canonical}`,
      ),
    )
  } else {
    const attacking = attackRemainder(input, languagePack)
    if (attacking) {
      const resolved = resolveAttackSlots(attacking, catalog.attackableCards)
      if (resolved.status === 'AMBIGUOUS')
        return {
          status: 'AMBIGUOUS',
          normalizedText,
          commands: resolved.options.map((option) =>
            command(
              'DECLARE_ATTACKERS',
              normalizedText,
              {
                cards: [option.canonical],
                ...(option.instanceId
                  ? { cardInstanceIds: [option.instanceId] }
                  : {}),
              },
              SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
              `atacante ambiguo: ${resolved.query}`,
            ),
          ),
          description: `“${resolved.query}” coincide con varios atacantes válidos en el estado actual.`,
          ambiguitySource: 'ENTITY',
        }
      if (resolved.status === 'NO_MATCH')
        return {
          status: 'REJECTED_CONTEXT',
          normalizedText,
          description: `No hay un atacante propio compatible con “${attacking}” en el estado actual.`,
        }
      candidates.push(
        command(
          'DECLARE_ATTACKERS',
          normalizedText,
          resolved.slots,
          SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
          resolved.evidence,
        ),
      )
    }
  }

  const blocking = blockRemainder(input, languagePack)
  if (blocking) {
    let attackerSlot:
      { attacker: string; attackerInstanceId?: string } | undefined
    let blockerOptions = catalog.blockerCards

    if (blocking.attacker) {
      const attacker = resolveVoiceSlot(
        blocking.attacker,
        catalog.blockingAttackers,
      )
      if (attacker.status === 'NO_MATCH')
        return {
          status: 'REJECTED_CONTEXT',
          normalizedText,
          intent: 'DECLARE_BLOCKERS',
          description: `No hay un atacante compatible con “${blocking.attacker}” en el combate actual.`,
        }
      if (attacker.status === 'AMBIGUOUS') {
        const commands: SemanticCommand<'DECLARE_BLOCKERS'>[] = []
        for (const option of attacker.options) {
          if (!option.instanceId) continue
          const legalBlockers = blockerOptionsForAttacker(
            state,
            catalog.blockerCards,
            option.instanceId,
          )
          const blockersForAttacker = resolveCardList(
            blocking.blockers,
            legalBlockers,
          )
          if (blockersForAttacker.status === 'MATCHED')
            commands.push(
              command(
                'DECLARE_BLOCKERS',
                normalizedText,
                {
                  attacker: option.canonical,
                  attackerInstanceId: option.instanceId,
                  cards: blockersForAttacker.cards,
                  cardInstanceIds: blockersForAttacker.instanceIds,
                },
                SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
                `bloqueo contextual: ${option.canonical}`,
              ),
            )
          else if (blockersForAttacker.status === 'AMBIGUOUS')
            for (const blocker of blockersForAttacker.options)
              commands.push(
                command(
                  'DECLARE_BLOCKERS',
                  normalizedText,
                  {
                    attacker: option.canonical,
                    attackerInstanceId: option.instanceId,
                    cards: [blocker.canonical],
                    ...(blocker.instanceId
                      ? { cardInstanceIds: [blocker.instanceId] }
                      : {}),
                  },
                  SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
                  `bloqueo contextual ambiguo: ${option.canonical}`,
                ),
              )
        }
        const uniqueCommands = [
          ...new Map(
            commands.map((candidate) => [
              `${candidate.intent}:${JSON.stringify(candidate.slots)}`,
              candidate,
            ]),
          ).values(),
        ]
        if (!uniqueCommands.length)
          return {
            status: 'REJECTED_CONTEXT',
            normalizedText,
            intent: 'DECLARE_BLOCKERS',
            description: `Ninguna interpretación de “${blocking.attacker}” permite ese bloqueo.`,
          }
        if (uniqueCommands.length === 1)
          return { status: 'MATCHED', command: uniqueCommands[0] }
        const description = `“${blocking.attacker}” sigue siendo ambiguo después de validar bloqueadores.`
        return {
          status: 'AMBIGUOUS',
          normalizedText,
          commands: uniqueCommands,
          description,
          ambiguitySource: 'CONTEXT',
          clarification: interpretationClarification(
            description,
            uniqueCommands,
          ),
        }
      }
      attackerSlot = {
        attacker: attacker.option.canonical,
        ...(attacker.option.instanceId
          ? { attackerInstanceId: attacker.option.instanceId }
          : {}),
      }
      if (attacker.option.instanceId)
        blockerOptions = blockerOptionsForAttacker(
          state,
          catalog.blockerCards,
          attacker.option.instanceId,
        )
    }

    const blockers = resolveCardList(blocking.blockers, blockerOptions)
    if (blockers.status === 'AMBIGUOUS') {
      const commands = blockers.options.map((option) =>
        command(
          'DECLARE_BLOCKERS',
          normalizedText,
          {
            ...attackerSlot,
            cards: [option.canonical],
            ...(option.instanceId
              ? { cardInstanceIds: [option.instanceId] }
              : {}),
          },
          SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
          `bloqueador ambiguo: ${blockers.query}`,
        ),
      )
      const description = `“${blockers.query}” coincide con varios bloqueadores válidos en el estado actual.`
      return {
        status: 'AMBIGUOUS',
        normalizedText,
        commands,
        description,
        ambiguitySource: 'ENTITY',
        clarification: optionClarification(
          description,
          blockers.options,
          commands,
        ),
      }
    }
    if (blockers.status === 'NO_MATCH')
      return {
        status: 'REJECTED_CONTEXT',
        normalizedText,
        intent: 'DECLARE_BLOCKERS',
        description: blocking.attacker
          ? `No hay bloqueadores compatibles con “${blocking.blockers}” para ese atacante.`
          : `No hay bloqueadores propios compatibles con “${blocking.blockers}” en el estado actual.`,
      }

    candidates.push(
      command(
        'DECLARE_BLOCKERS',
        normalizedText,
        {
          ...attackerSlot,
          cards: blockers.cards,
          cardInstanceIds: blockers.instanceIds,
        },
        SEMANTIC_SCORE.TEMPLATE_EXACT_SLOT,
        attackerSlot
          ? `bloquear ${attackerSlot.attacker} con ${blockers.cards.join(', ')}`
          : `bloqueadores: ${blockers.cards.join(', ')}`,
      ),
    )
  }

  const resolveNamed =
    /^(?:resuelvo|resuelve|resolver|que resuelva)\s+(.+)$/.exec(core)
  if (resolveNamed && !grammar.resolveTopPhrases.includes(core)) {
    const matched = slotCommands(
      'RESOLVE_SPELL',
      normalizedText,
      stripCardArticle(resolveNamed[1]),
      catalog.stackSpells,
    )
    if ('status' in matched) {
      if (matched.status === 'NO_MATCH')
        return {
          status: 'REJECTED_CONTEXT',
          normalizedText,
          intent: 'RESOLVE_SPELL',
          description: `No se puede resolver “${resolveNamed[1]}” porque no es el hechizo superior del stack.`,
        }
      return matched.status === 'REJECTED_CONTEXT'
        ? { ...matched, intent: 'RESOLVE_SPELL' }
        : matched
    }
    candidates.push(matched)
  }

  const life = parseLife(core, normalizedText, languagePack)
  if (life) candidates.push(life)

  const hiddenZoneCount = parseHiddenZoneCount(
    core,
    normalizedText,
    languagePack,
  )
  if (hiddenZoneCount) candidates.push(hiddenZoneCount)

  const draw = leadingVerbRemainder(input, grammar.verbs.draw, languagePack)
  if (draw !== undefined) {
    const amount = /^(?:(\d+)(?:\s+cartas?)?|(?:1\s+)?carta)?$/.exec(draw)
    if (amount)
      candidates.push(
        command(
          'DRAW',
          normalizedText,
          { amount: amount[1] ? Number(amount[1]) : 1 },
          SEMANTIC_SCORE.STRUCTURAL_NO_SLOT,
          'template draw',
        ),
      )
  }

  const manaActivation = grammar.syntax.manaActivation.exec(core)
  if (manaActivation) {
    const matched = slotCommands(
      'ACTIVATE_MANA',
      normalizedText,
      stripCardArticle(manaActivation[1]),
      catalog.manaSources,
      {
        ...(manaActivation[2]
          ? { color: stripCardArticle(manaActivation[2]) }
          : {}),
      },
    )
    if ('status' in matched) {
      if (matched.status !== 'NO_MATCH') return matched
    } else candidates.push(matched)
  }

  const channel = mechanicRemainder(
    input,
    grammar.verbs.channel,
    'channel',
    languagePack,
  )
  if (channel) {
    const matched = slotCommands(
      'ACTIVATE_ABILITY',
      normalizedText,
      stripCardArticle(channel),
      catalog.channelSources,
      { abilityHint: 'CHANNEL' },
    )
    if ('status' in matched) {
      if (matched.status !== 'NO_MATCH') return matched
    } else candidates.push(matched)
  }

  const waterbend = mechanicRemainder(
    input,
    grammar.verbs.waterbend,
    'waterbend',
    languagePack,
  )
  if (waterbend) {
    const matched = slotCommands(
      'ACTIVATE_ABILITY',
      normalizedText,
      stripCardArticle(waterbend),
      catalog.waterbendSources,
      { abilityHint: 'WATERBEND' },
    )
    if ('status' in matched) {
      if (matched.status !== 'NO_MATCH') return matched
    } else candidates.push(matched)
  }

  for (const spec of ENTITY_ACTION_SPECS) {
    const matched = matchEntityActionSpec(
      spec,
      input,
      normalizedText,
      state,
      catalog,
      languagePack,
    )
    if (!matched) continue
    if ('status' in matched) {
      if (matched.status !== 'NO_MATCH') return matched
    } else candidates.push(matched)
  }

  const equipVerb = slotVerbRemainder(
    input,
    grammar.verbs.equip,
    true,
    languagePack,
  )
  if (equipVerb?.remainder && !/\s+a\s+/.test(equipVerb.remainder)) {
    const matched = slotCommands(
      'ACTIVATE_ABILITY',
      normalizedText,
      stripCardArticle(equipVerb.remainder),
      catalog.equipSources,
      { abilityHint: 'EQUIP' },
      {
        minimumScore: equipVerb.minimumSlotScore,
        evidence: equipVerb.fuzzyEvidence,
      },
    )
    if ('status' in matched) {
      if (matched.status !== 'NO_MATCH') return matched
    } else candidates.push(matched)
  }

  const activateVerb = slotVerbRemainder(
    input,
    grammar.verbs.activate,
    true,
    languagePack,
  )
  if (
    activateVerb?.remainder &&
    !/\s+para(?:\s+mana)?(?:\s+.+)?$/.test(activateVerb.remainder)
  ) {
    const target = stripAbilityFraming(activateVerb.remainder)
    if (target) {
      const matched = slotCommands(
        'ACTIVATE_ABILITY',
        normalizedText,
        target,
        catalog.activatableCards,
        {},
        {
          minimumScore: activateVerb.minimumSlotScore,
          evidence: activateVerb.fuzzyEvidence,
        },
      )
      if ('status' in matched) {
        if (matched.status !== 'NO_MATCH') return matched
      } else candidates.push(matched)
    }
  }

  const playVerb = slotVerbRemainder(
    input,
    grammar.verbs.play,
    false,
    languagePack,
  )
  if (playVerb?.remainder) {
    const matched = slotCommands(
      'PLAY_CARD',
      normalizedText,
      stripCardArticle(playVerb.remainder),
      catalog.playableCards,
      {},
      {
        minimumScore: playVerb.minimumSlotScore,
        evidence: playVerb.fuzzyEvidence,
      },
    )
    if ('status' in matched) {
      if (matched.status !== 'NO_MATCH') return matched
    } else candidates.push(matched)
  }

  const tapVerb = slotVerbRemainder(
    input,
    grammar.verbs.tap,
    true,
    languagePack,
  )
  if (tapVerb?.remainder) {
    const counted = countedEntity(tapVerb.remainder)
    const matched = slotCommands(
      'TAP_CARD',
      normalizedText,
      counted.query,
      catalog.tappableCards,
      { ...(counted.amount ? { amount: counted.amount } : {}) },
      {
        minimumScore: tapVerb.minimumSlotScore,
        evidence: tapVerb.fuzzyEvidence,
      },
    )
    if ('status' in matched) {
      if (matched.status !== 'NO_MATCH') return matched
    } else candidates.push(matched)
  }

  const untapVerb = slotVerbRemainder(
    input,
    grammar.verbs.untap,
    true,
    languagePack,
  )
  if (untapVerb?.remainder && !/^(?:todo|todos)\b/.test(untapVerb.remainder)) {
    const counted = countedEntity(untapVerb.remainder)
    const matched = slotCommands(
      'UNTAP_CARD',
      normalizedText,
      counted.query,
      catalog.untappableCards,
      { ...(counted.amount ? { amount: counted.amount } : {}) },
      {
        minimumScore: untapVerb.minimumSlotScore,
        evidence: untapVerb.fuzzyEvidence,
      },
    )
    if ('status' in matched) {
      if (matched.status !== 'NO_MATCH') return matched
    } else candidates.push(matched)
  }

  const counter = parseCounter(core, normalizedText, state, languagePack)
  if (counter) {
    if ('status' in counter) {
      if (counter.status !== 'NO_MATCH') return counter
    } else candidates.push(counter)
  }

  const unique = [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.intent}:${JSON.stringify(candidate.slots)}`,
        candidate,
      ]),
    ).values(),
  ]
  if (!unique.length) {
    const incomplete = incompleteSlotCommand(core, normalizedText, languagePack)
    if (incomplete) return incomplete

    if (allowEdgeExtraction) {
      const recovered = commandEdgeSpans(input)
        .map((span) => ({
          span,
          match: matchSemanticVoiceCommandInternal(
            span,
            state,
            false,
            languagePack,
          ),
        }))
        .filter(
          ({ match }) =>
            match.status === 'MATCHED' || match.status === 'AMBIGUOUS',
        )

      if (recovered.length) {
        const first = recovered[0]
        if (first.match.status === 'MATCHED')
          return {
            status: 'MATCHED',
            command: {
              ...first.match.command,
              normalizedText,
              evidence: [
                ...first.match.command.evidence,
                `span de comando: ${first.span}`,
              ],
            },
          }
        if (first.match.status === 'AMBIGUOUS')
          return {
            ...first.match,
            normalizedText,
            description: `${first.match.description} (span: “${first.span}”)`,
          }
      }
    }

    return { status: 'NO_MATCH', normalizedText }
  }
  if (unique.length > 1) {
    const description = `La frase tiene ${unique.length} interpretaciones semánticas válidas.`
    return {
      status: 'AMBIGUOUS',
      normalizedText,
      commands: unique,
      description,
      ambiguitySource: 'CONTEXT',
      clarification: interpretationClarification(description, unique),
    }
  }
  return { status: 'MATCHED', command: unique[0] }
}

export const matchSemanticVoiceCommand = (
  input: string,
  state: GameState,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): SemanticMatchResult => {
  const canonicalInput = canonicalizeVoiceLanguageInput(input, languagePack)
  return matchSemanticVoiceCommandInternal(
    canonicalInput,
    state,
    true,
    SPANISH_VOICE_LANGUAGE_PACK,
  )
}
