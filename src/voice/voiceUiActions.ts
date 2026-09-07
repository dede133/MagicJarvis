import type {
  PendingAbility,
  PendingDecision,
  ResolvedEffect,
} from '../abilities/types/abilityTypes'
import { normalizeCommandText } from '../commands/parser/normalizeText'
import {
  canonicalizeVoiceLanguageInput,
  DEFAULT_VOICE_LANGUAGE_PACK,
  type VoiceLanguagePack,
} from './languages'
import type { GameState } from '../types/game'
import type { TabletopCommandContext } from '../observability/matchTrace'
import { effectiveAbilitiesForCard } from '../abilities/engine/staticEffects'
import { activatedAbilityMatchesHint } from '../commands/resolver/activatedAbilityHints'
import { resolveVoiceSlot } from './v3/slots/resolveSlot'
import type { VoiceSlotOption } from './v3/slots/slotTypes'
import { stripCommandFraming, stripDiscourse } from './v3/grammar/macros'

export type VoiceUiActionDescriptor = {
  id: string
  kind:
    | 'PENDING_DECISION'
    | 'PENDING_ABILITY_PAYMENT'
    | 'PENDING_ABILITY_RESOLVE'
    | 'PENDING_ABILITY_IGNORE'
  parsed: string
  label: string
  description: string
  entity?: string
  aliases: readonly string[]
  decisionId?: string
  pendingAbilityId?: string
  selection?: string
}

export type VoiceUiActionMatch =
  | { status: 'NO_MATCH' }
  | {
      status: 'MATCHED'
      action: VoiceUiActionDescriptor
      normalizedTranscript: string
    }
  | {
      status: 'AMBIGUOUS'
      actions: readonly VoiceUiActionDescriptor[]
      normalizedTranscript: string
      description: string
    }

export type VoiceUiActionTarget = GameState & {
  resolvePendingAbility: (
    pendingId: string,
    context?: TabletopCommandContext,
  ) => void
  resolvePendingAbilityPayment: (
    pendingId: string,
    selection: 'PAID' | 'NOT_PAID',
    context?: TabletopCommandContext,
  ) => void
  ignorePendingAbility: (
    pendingId: string,
    context?: TabletopCommandContext,
  ) => void
  resolvePendingDecision: (
    decisionId: string,
    selection: string,
    context?: TabletopCommandContext,
  ) => void
}

export type VoiceUiActionHandlingResult =
  | { status: 'NO_MATCH' }
  | {
      status: 'AMBIGUOUS'
      parsed: 'UI_ACTION'
      description: string
      normalizedTranscript: string
    }
  | {
      status: 'HANDLED'
      parsed: string
      description: string
      normalizedTranscript: string
      entity?: string
      executed: boolean
    }

const unique = (values: readonly string[]): string[] => [
  ...new Set(
    values.map((value) => normalizeCommandText(value)).filter(Boolean),
  ),
]

const directPaymentEffect = (
  effects: readonly ResolvedEffect[],
): Extract<ResolvedEffect, { type: 'PAYMENT_BRANCH' }> | undefined => {
  const firstDecision = effects.find(
    (effect) =>
      effect.type === 'PAYMENT_BRANCH' ||
      effect.type === 'OPTIONAL_EFFECT' ||
      effect.type === 'TARGET_SELECTION' ||
      effect.type === 'CARD_SELECTION' ||
      effect.type === 'CHOOSE_MODE' ||
      effect.type === 'CHOOSE_VALUE' ||
      effect.type === 'SEARCH_LIBRARY_CARD' ||
      effect.type === 'PHYSICAL_CONFIRMATION' ||
      effect.type === 'PLAYER_SELECTION' ||
      effect.type === 'ADD_MANA_CHOICE' ||
      effect.type === 'ADD_MANA_FROM_LINKED_COLORS',
  )
  return firstDecision?.type === 'PAYMENT_BRANCH' ? firstDecision : undefined
}

const pendingAbilityIsActionable = (
  state: GameState,
  ability: PendingAbility,
): boolean => {
  const stackObject = state.stack.find(
    (object) => object.pendingAbilityId === ability.id,
  )
  return (
    !stackObject ||
    state.stack.at(-1)?.stackObjectId === stackObject.stackObjectId
  )
}

const ordinalAliases = (index: number, includeNumeric = true): string[] => {
  const number = String(index + 1)
  const names = [
    ['primero', 'primera'],
    ['segundo', 'segunda'],
    ['tercero', 'tercera'],
    ['cuarto', 'cuarta'],
    ['quinto', 'quinta'],
    ['sexto', 'sexta'],
  ][index]
  return [
    ...(includeNumeric
      ? [
          number,
          `opcion ${number}`,
          `la opcion ${number}`,
          `el ${number}`,
          `la ${number}`,
        ]
      : []),
    ...(names ?? []),
    ...(names
      ? [
          `el ${names[0]}`,
          `la ${names[1]}`,
          `opcion ${names[0]}`,
          `opcion ${names[1]}`,
        ]
      : []),
  ]
}

const decisionUsesNumericValues = (decision: PendingDecision): boolean => {
  const options = synthesizedDecisionOptions(decision)
  return (
    options.length > 0 &&
    options.every((option) => /^-?\d+$/.test(option.instanceId.trim()))
  )
}

const labelAliases = (label: string): string[] => {
  const normalized = normalizeCommandText(label)
  const aliases = [normalized]
  const withoutLeadingAction = normalized.replace(
    /^(?:crear|create|lanzar|cast|poner|put|mover|move|mantener|keep|elegir|choose|seleccionar|select|descartar|discard|girar|tap|enderezar|untap)\s+(?:(?:un|una|el|la|a|the)\s+)?/,
    '',
  )
  if (withoutLeadingAction && withoutLeadingAction !== normalized)
    aliases.push(withoutLeadingAction)
  const firstMeaningfulWord = withoutLeadingAction.split(' ')[0]
  if (
    firstMeaningfulWord &&
    firstMeaningfulWord.length >= 4 &&
    !['this', 'that', 'current', 'original', 'target', 'token'].includes(
      firstMeaningfulWord,
    )
  )
    aliases.push(firstMeaningfulWord)
  return aliases
}

const manaColorSpeechAliases: Record<string, string[]> = {
  W: ['blanco', 'mana blanco', 'white', 'white mana'],
  U: ['azul', 'mana azul', 'blue', 'blue mana'],
  B: ['negro', 'mana negro', 'black', 'black mana'],
  R: ['rojo', 'mana rojo', 'red', 'red mana'],
  G: ['verde', 'mana verde', 'green', 'green mana'],
  C: ['incoloro', 'mana incoloro', 'colorless', 'colorless mana'],
}

const pendingCostAliases = (
  decision: PendingDecision,
  option: { instanceId: string; label: string },
): string[] => {
  const label = normalizeCommandText(option.label)
  const aliases: string[] = []
  if (decision.type === 'CLEANUP_DISCARD_SELECTION')
    aliases.push(`descarto ${label}`, `descartar ${label}`, `tiro ${label}`)
  if (decision.type === 'CAST_COST_CARD_SELECTION')
    aliases.push(
      `exilio ${label}`,
      `exilio ${label} como coste`,
      `pago exiliando ${label}`,
      `uso ${label} para pagar`,
    )
  if (decision.type === 'ACTIVATION_COST_PERMANENT_SELECTION')
    aliases.push(
      `sacrifico ${label}`,
      `sacrificar ${label}`,
      `sac ${label}`,
      `pago sacrificando ${label}`,
    )
  if (decision.type === 'ACTIVATION_WATERBEND_SELECTION')
    aliases.push(
      `giro ${label}`,
      `tap ${label}`,
      `tapeo ${label}`,
      `pago con ${label}`,
      `uso ${label} para waterbend`,
    )
  if (decision.type === 'CAST_GENERIC_CONTRIBUTION_SELECTION') {
    const contribution = decision.continuation.castContribution
    if (contribution?.contributionType === 'TAP_PERMANENTS')
      aliases.push(
        `giro ${label}`,
        `tap ${label}`,
        `pago con ${label}`,
        `uso ${label} para pagar`,
      )
    if (contribution?.contributionType === 'EXILE_CARDS_FROM_GRAVEYARD')
      aliases.push(
        `exilio ${label}`,
        `pago exiliando ${label}`,
        `uso ${label} para delve`,
        `delve ${label}`,
      )
  }
  if (
    decision.type === 'MANA_SOURCE_SELECTION' ||
    decision.type === 'MANA_PAYMENT_SELECTION'
  )
    aliases.push(`pago con ${label}`, `uso ${label} para pagar`)
  return aliases
}

const numericDecisionAliases = (
  decision: PendingDecision,
  option: { instanceId: string; label: string },
): string[] => {
  if (!/^-?\d+$/.test(option.instanceId.trim())) return []
  const value = option.instanceId.trim()
  const aliases = [value, `valor ${value}`, `elijo ${value}`]
  if (decision.type === 'ACTIVATION_VARIABLE_SELECTION')
    aliases.push(`x ${value}`, `x igual a ${value}`)
  if (decision.type === 'ACTIVATION_WATERBEND_COUNT')
    aliases.push(
      `waterbend ${value}`,
      `giro ${value}`,
      `giro ${value} permanentes`,
      `pago ${value} con waterbend`,
    )
  if (decision.type === 'CAST_GENERIC_CONTRIBUTION_COUNT') {
    const contribution = decision.continuation.castContribution
    if (contribution?.contributionType === 'TAP_PERMANENTS')
      aliases.push(`giro ${value}`, `giro ${value} permanentes`)
    if (contribution?.contributionType === 'EXILE_CARDS_FROM_GRAVEYARD')
      aliases.push(
        `exilio ${value}`,
        `exilio ${value} cartas`,
        `delve ${value}`,
      )
  }
  return aliases
}

const abilitySelectionAliases = (
  state: GameState,
  decision: PendingDecision,
  option: { instanceId: string; label: string },
): string[] => {
  if (decision.type !== 'ABILITY_SELECTION') return []
  const source = state.cards.find(
    (card) =>
      card.instanceId === decision.continuation.activationSourceInstanceId,
  )
  const ability = source
    ? effectiveAbilitiesForCard(state, source).find(
        (candidate) =>
          candidate.kind === 'ACTIVATED' && candidate.id === option.instanceId,
      )
    : undefined
  const id = normalizeCommandText(option.instanceId)
  const sourceName = source?.card.name
  const aliases: string[] = []

  if (ability?.kind === 'ACTIVATED') {
    if (ability.isManaAbility)
      aliases.push(
        'mana',
        'habilidad de mana',
        ...(sourceName
          ? [`mana de ${sourceName}`, `giro ${sourceName} para mana`]
          : []),
      )
    if (ability.costs.some((cost) => cost.type === 'WATERBEND'))
      aliases.push(
        'waterbend',
        'hago waterbend',
        ...(sourceName ? [`waterbend de ${sourceName}`] : []),
      )
    if (
      ability.activeZones?.includes('hand') &&
      ability.costs.some((cost) => cost.type === 'DISCARD_SOURCE')
    )
      aliases.push(
        'channel',
        'canalizo',
        ...(sourceName
          ? [`channel de ${sourceName}`, `canalizo ${sourceName}`]
          : []),
      )
    if (activatedAbilityMatchesHint(ability, 'EQUIP')) {
      const commander = /commander/.test(id)
      const legendary = /legendary/.test(id)
      aliases.push(
        commander ? 'equip commander' : legendary ? 'equip legendary' : 'equip',
        commander
          ? 'equipo comandante'
          : legendary
            ? 'equipo legendaria'
            : 'equipo',
      )
    }
  }

  // Runtime-generated IDs still carry useful mechanic names even when the
  // ability definition is unavailable in an isolated/legacy state.
  if (/channel/.test(id)) aliases.push('channel', 'canalizo')
  if (/waterbend/.test(id)) aliases.push('waterbend', 'hago waterbend')
  if (/equip/.test(id)) {
    if (/commander/.test(id))
      aliases.push('equip commander', 'equipo comandante')
    else if (/legendary/.test(id))
      aliases.push('equip legendary', 'equipo legendaria')
    else aliases.push('equip', 'equipo')
  }
  if (/mana/.test(id)) aliases.push('mana', 'habilidad de mana')

  return aliases
}

const semanticAliases = (
  state: GameState,
  decision: PendingDecision,
  option: { instanceId: string; label: string },
): string[] => {
  const id = option.instanceId.toUpperCase()
  const label = normalizeCommandText(option.label)
  const aliases: string[] = []

  if (id === 'YES' || label === 'yes')
    aliases.push('si', 'vale', 'ok', 'okay', 'de acuerdo', 'hazlo', 'adelante')
  if (id === 'NO' || label === 'no')
    aliases.push('no', 'paso', 'no quiero', 'dejalo', 'no lo hagas')

  if (id === 'CONFIRM' || /^(?:hecho|done|confirm)$/.test(label))
    aliases.push('hecho', 'listo', 'ya esta', 'confirmo', 'confirmar')

  if (id === 'NOT_PAID' || label === 'not paid')
    aliases.push('no pago', 'no pagar', 'no lo pago', 'sin pagar', 'paso', 'no')
  if (id === 'PAID' || id.startsWith('PAID-') || label === 'paid')
    aliases.push('pago', 'pagar', 'paga', 'lo pago', 'si pago', 'quiero pagar')

  if (id === 'CAST')
    aliases.push('lanzo', 'lo lanzo', 'lanzalo', 'lanzar', 'si lo lanzo')
  if (id === 'DECLINE')
    aliases.push('no lanzo', 'no lo lanzo', 'no lanzar', 'paso', 'no')

  if (id === 'COMMAND_ZONE' || id === 'MOVE_TO_COMMAND_ZONE')
    aliases.push(
      'command zone',
      'zona de mando',
      'a la zona de mando',
      'al command',
      'mando',
    )
  if (id === 'KEEP_IN_CURRENT_ZONE' || id === 'ORIGINAL_DESTINATION') {
    aliases.push('se queda', 'dejalo ahi', 'mantener', 'destino original')
    const prompt = normalizeCommandText(decision.prompt)
    if (prompt.includes('graveyard'))
      aliases.push('cementerio', 'al cementerio')
    if (prompt.includes('exile')) aliases.push('exilio', 'al exilio')
    if (prompt.includes('hand')) aliases.push('mano', 'a la mano')
    if (prompt.includes('library'))
      aliases.push('biblioteca', 'a la biblioteca')
  }

  if (id === '__KEEP_TARGET__')
    aliases.push(
      'mantener objetivo',
      'mismo objetivo',
      'deja el objetivo',
      'no cambio objetivo',
    )
  if (id === 'NO_TARGET') aliases.push('sin objetivo', 'ninguno', 'nadie')

  if (id === 'UNKNOWN_CARD') {
    aliases.push('carta desconocida', 'una carta desconocida')
    if (decision.type === 'CLEANUP_DISCARD_SELECTION')
      aliases.push(
        'descarto carta desconocida',
        'descarto una carta desconocida',
        'descarto una sin registrar',
      )
  }

  if (id === 'PROMISE_GIFT')
    aliases.push('gift', 'con gift', 'prometo gift', 'prometer gift', 'si gift')
  if (id === 'NO_GIFT')
    aliases.push('sin gift', 'no gift', 'no prometo gift', 'sin prometer gift')

  if (label === 'opponent') aliases.push('oponente', 'rival', 'al rival')
  if (label === 'you') aliases.push('yo', 'a mi', 'para mi')

  aliases.push(...(manaColorSpeechAliases[id] ?? []))
  aliases.push(...pendingCostAliases(decision, option))
  aliases.push(...numericDecisionAliases(decision, option))
  aliases.push(...abilitySelectionAliases(state, decision, option))

  return aliases
}

const optionAliases = (
  state: GameState,
  decision: PendingDecision,
  option: { instanceId: string; label: string },
  index: number,
): string[] =>
  unique([
    ...labelAliases(option.label),
    ...semanticAliases(state, decision, option),
    ...ordinalAliases(index, !decisionUsesNumericValues(decision)),
  ])

const synthesizedDecisionOptions = (
  decision: PendingDecision,
): Array<{ instanceId: string; label: string }> =>
  decision.type === 'OPTIONAL_EFFECT'
    ? [
        { instanceId: 'YES', label: 'Yes' },
        { instanceId: 'NO', label: 'No' },
      ]
    : [...(decision.options ?? [])]

const decisionActions = (
  state: GameState,
  decision: PendingDecision,
): VoiceUiActionDescriptor[] =>
  synthesizedDecisionOptions(decision).map((option, index) => ({
    id: `decision:${decision.id}:${option.instanceId}`,
    kind: 'PENDING_DECISION',
    parsed: `UI_${decision.type}`,
    label: option.label,
    description: `${decision.prompt} → ${option.label}`,
    entity: option.label,
    aliases: optionAliases(state, decision, option, index),
    decisionId: decision.id,
    selection: option.instanceId,
  }))

const paymentAbilityActions = (
  ability: PendingAbility,
  payment: Extract<ResolvedEffect, { type: 'PAYMENT_BRANCH' }>,
): VoiceUiActionDescriptor[] => [
  {
    id: `ability:${ability.id}:PAID`,
    kind: 'PENDING_ABILITY_PAYMENT',
    parsed: 'UI_PAYMENT_CHOICE',
    label: 'Pagar',
    description: `${payment.prompt ?? '¿Pagar el coste de la habilidad?'} → Pagar`,
    entity: ability.sourceCardName,
    aliases: unique([
      'pago',
      'pagar',
      'paga',
      'lo pago',
      'si pago',
      'quiero pagar',
      `pago ${ability.sourceCardName}`,
      `pagar ${ability.sourceCardName}`,
    ]),
    pendingAbilityId: ability.id,
    selection: 'PAID',
  },
  {
    id: `ability:${ability.id}:NOT_PAID`,
    kind: 'PENDING_ABILITY_PAYMENT',
    parsed: 'UI_PAYMENT_CHOICE',
    label: 'No pagar',
    description: `${payment.prompt ?? '¿Pagar el coste de la habilidad?'} → No pagar`,
    entity: ability.sourceCardName,
    aliases: unique([
      'no pago',
      'no pagar',
      'no lo pago',
      'sin pagar',
      'paso',
      'no',
      `no pago ${ability.sourceCardName}`,
      `no pagar ${ability.sourceCardName}`,
    ]),
    pendingAbilityId: ability.id,
    selection: 'NOT_PAID',
  },
]

const regularAbilityActions = (
  ability: PendingAbility,
): VoiceUiActionDescriptor[] => [
  {
    id: `ability:${ability.id}:resolve`,
    kind: 'PENDING_ABILITY_RESOLVE',
    parsed: 'UI_RESOLVE_ABILITY',
    label: 'Resolve',
    description: `Resolver habilidad de ${ability.sourceCardName}`,
    entity: ability.sourceCardName,
    aliases: unique([
      'resuelve',
      'resolver',
      'resuelvela',
      'resuelve la habilidad',
      `resuelve ${ability.sourceCardName}`,
      `resolver ${ability.sourceCardName}`,
    ]),
    pendingAbilityId: ability.id,
  },
  {
    id: `ability:${ability.id}:ignore`,
    kind: 'PENDING_ABILITY_IGNORE',
    parsed: 'UI_IGNORE_ABILITY',
    label: 'Ignore',
    description: `Ignorar habilidad de ${ability.sourceCardName}`,
    entity: ability.sourceCardName,
    aliases: unique([
      'ignora',
      'ignorar',
      'ignorala',
      'ignora la habilidad',
      `ignora ${ability.sourceCardName}`,
      `ignorar ${ability.sourceCardName}`,
    ]),
    pendingAbilityId: ability.id,
  },
]

/**
 * Returns only actions that are already exposed by the current game UI.
 * Nothing is inferred from hidden hand identities or hypothetical future play.
 */
export const getVoiceUiActions = (
  state: GameState,
): VoiceUiActionDescriptor[] => [
  ...state.pendingDecisions.flatMap((decision) =>
    decisionActions(state, decision),
  ),
  ...state.pendingAbilities.flatMap((ability) => {
    if (!pendingAbilityIsActionable(state, ability)) return []
    const payment = directPaymentEffect(ability.resolvedEffects)
    return payment
      ? paymentAbilityActions(ability, payment)
      : regularAbilityActions(ability)
  }),
]

const transcriptVariants = (
  input: string,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): string[] => {
  const normalized = canonicalizeVoiceLanguageInput(input, languagePack)
  if (!normalized) return []
  const variants = new Set([normalized])
  const discourseStripped = stripDiscourse(normalized)
  if (discourseStripped) variants.add(discourseStripped)
  const prefixes = [
    /^(?:vale|bueno|pues|ok|okay|venga)\s+/,
    /^(?:elijo|escojo|selecciono|elige|escoge|selecciona|quiero)\s+/,
    /^(?:la\s+)?opcion\s+/,
    /^(?:el|la)\s+de\s+/,
    /^(?:objetivo|modo|color|valor|carta)\s+/,
    /^me quedo con\s+/,
    /^(?:a|con)\s+/,
  ]

  let changed = true
  while (changed) {
    changed = false
    for (const current of [...variants]) {
      for (const prefix of prefixes) {
        const stripped = current.replace(prefix, '').trim()
        if (stripped && !variants.has(stripped)) {
          variants.add(stripped)
          changed = true
        }
      }
    }
  }
  return [...variants]
}

const localVoiceTextDecision = (
  state: GameState,
  decision: PendingDecision,
): boolean => {
  if (!decision.acceptsTextValue) return false
  const localPlayerId = state.localPlayerId ?? 'player-1'
  if (decision.decisionPlayerId && decision.decisionPlayerId !== localPlayerId)
    return false
  if (decision.type === 'PUBLIC_ZONE_CARD_SELECTION') return false
  if (decision.type === 'HIDDEN_ZONE_CARD_SELECTION') {
    const searchedPlayerId = decision.continuation.librarySearch?.playerId
    if (searchedPlayerId && searchedPlayerId !== localPlayerId) return false
    const hidden = decision.continuation.hiddenZoneSelection
    if (hidden && hidden.player !== 'SOURCE_CONTROLLER') return false
  }
  return (
    decision.type === 'CHOOSE_VALUE' ||
    decision.type === 'HIDDEN_ZONE_CARD_SELECTION' ||
    decision.type === 'CAST_COST_CARD_SELECTION'
  )
}

const commandLikeText =
  /^(?:juego|jugar|bajo|bajar|pongo|poner|lanzo|lanzar|casteo|castear|tiro|tirar|activo|activar|canalizo|canalizar|channel|equipo|equipar|waterbend|giro|girar|tap|tapeo|tapear|enderezo|enderezar|untap|robo|robar|descarto|descartar|sacrifico|sacrificar|exilio|exiliar|muevo|mover|devuelvo|devolver|barajo|barajar|ataco|atacar|bloqueo|bloquear|defiendo|defender|paso|pasar|termino|terminar|resuelvo|resuelve|resolver|ignoro|ignora|ignorar|pago|pagar|creo|millo|mileo|transformo|transformar|faseo|quito|quitar|gano|ganar|pierdo|perder|estoy|mano|biblioteca|mazo)\b/

const textSelectionForDecision = (
  variants: readonly string[],
  decision: PendingDecision,
): string | undefined => {
  for (const variant of variants) {
    const explicit = /^(?:declaro|nombro|nombre|digo)\s+(.+)$/.exec(variant)
    if (explicit?.[1]) return explicit[1].trim()

    if (decision.type === 'CAST_COST_CARD_SELECTION') {
      const exile = /^(?:exilio|exiliar)\s+(.+?)(?:\s+como coste)?$/.exec(
        variant,
      )
      if (exile?.[1]) return exile[1].trim()
      const paying = /^pago exiliando\s+(.+)$/.exec(variant)
      if (paying?.[1]) return paying[1].trim()
      const useToPay = /^uso\s+(.+?)\s+para pagar$/.exec(variant)
      if (useToPay?.[1]) return useToPay[1].trim()
    }

    if (decision.type === 'HIDDEN_ZONE_CARD_SELECTION') {
      const search = /^(?:busco|buscar|declaro)\s+(.+)$/.exec(variant)
      if (search?.[1]) return search[1].trim()
    }
  }

  const candidates = variants
    .map((variant) => variant.trim())
    .filter(Boolean)
    .filter((variant) => !commandLikeText.test(stripCommandFraming(variant)))
    .filter((variant) => !/^(?:busco|buscar)\b/.test(variant))
    .filter((variant) => variant.split(' ').length <= 8)
    .sort((left, right) => left.split(' ').length - right.split(' ').length)
  return candidates[0]
}

const textDecisionAction = (
  decision: PendingDecision,
  selection: string,
): VoiceUiActionDescriptor => ({
  id: `decision:${decision.id}:TEXT:${selection}`,
  kind: 'PENDING_DECISION',
  parsed: `UI_${decision.type}_TEXT`,
  label: selection,
  description: `${decision.prompt} → ${selection}`,
  entity: selection,
  aliases: [selection],
  decisionId: decision.id,
  selection,
})

const visibleActionSlotMatches = (
  variants: readonly string[],
  actions: readonly VoiceUiActionDescriptor[],
): VoiceUiActionDescriptor[] => {
  const byId = new Map(actions.map((action) => [action.id, action]))
  const options: VoiceSlotOption[] = actions.map((action) => ({
    id: action.id,
    canonical: action.label,
    aliases: action.aliases,
    aliasEvidence: action.aliases.map((value) => ({
      value,
      kind: 'PENDING_CHOICE' as const,
      fuzzy: true,
    })),
  }))
  const candidateIds = new Set<string>()

  for (const variant of variants) {
    const normalizedVariant = normalizeCommandText(variant)
    const commandShaped = commandLikeText.test(stripCommandFraming(variant))
    // Pending choices have priority only when speech plausibly answers the
    // visible decision. A normal game command ("ataco con ...", "robo",
    // "giro ...") must not be fuzzily swallowed by a short choice such as W.
    // Command-shaped answers are still allowed when they exactly match one of
    // the decision aliases generated for that action ("no pagar",
    // "pago con X", "resolver", etc.).
    const eligibleOptions = commandShaped
      ? options.filter((option) =>
          [option.canonical, ...option.aliases].some(
            (alias) => normalizeCommandText(alias) === normalizedVariant,
          ),
        )
      : options
    if (!eligibleOptions.length) continue

    const resolved = resolveVoiceSlot(variant, eligibleOptions)
    if (resolved.status === 'MATCHED') candidateIds.add(resolved.option.id)
    if (resolved.status === 'AMBIGUOUS')
      for (const option of resolved.options) candidateIds.add(option.id)
  }

  return [...candidateIds]
    .map((id) => byId.get(id))
    .filter((action): action is VoiceUiActionDescriptor => Boolean(action))
}

export const matchVoiceUiAction = (
  input: string,
  state: GameState,
  languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
): VoiceUiActionMatch => {
  const variants = transcriptVariants(input, languagePack)
  if (!variants.length) return { status: 'NO_MATCH' }
  const actions = getVoiceUiActions(state)

  // Pending UI choices use exactly the same slot resolver as V3 entities.
  // Exact labels, aliases, fuzzy damage and ambiguity therefore share one
  // confidence policy instead of a second mini entity resolver.
  const slotMatches = visibleActionSlotMatches(variants, actions)
  if (slotMatches.length > 1)
    return {
      status: 'AMBIGUOUS',
      actions: slotMatches,
      normalizedTranscript: variants[0],
      description: `La frase coincide con varias acciones visibles: ${slotMatches
        .map((action) => action.label)
        .join(', ')}.`,
    }
  if (slotMatches.length === 1)
    return {
      status: 'MATCHED',
      action: slotMatches[0],
      normalizedTranscript: variants[0],
    }

  // Some already-programmed decisions intentionally accept a free-form local
  // declaration (creature type, a hidden-zone card name, a casting-cost card).
  // Only treat speech as that value when there is exactly one such local
  // decision. This keeps ordinary commands from being swallowed by text input.
  const textActions = state.pendingDecisions
    .filter((decision) => localVoiceTextDecision(state, decision))
    .flatMap((decision) => {
      const selection = textSelectionForDecision(variants, decision)
      return selection ? [textDecisionAction(decision, selection)] : []
    })
  if (!textActions.length) return { status: 'NO_MATCH' }
  if (textActions.length > 1)
    return {
      status: 'AMBIGUOUS',
      actions: textActions,
      normalizedTranscript: variants[0],
      description: `Hay varias decisiones esperando una respuesta de texto para «${textActions[0].selection}».`,
    }
  return {
    status: 'MATCHED',
    action: textActions[0],
    normalizedTranscript: variants[0],
  }
}

const executeUiAction = (
  action: VoiceUiActionDescriptor,
  game: VoiceUiActionTarget,
  context?: TabletopCommandContext,
): void => {
  if (action.kind === 'PENDING_DECISION') {
    if (action.decisionId && action.selection !== undefined)
      game.resolvePendingDecision(action.decisionId, action.selection, context)
    return
  }
  if (!action.pendingAbilityId) return
  if (action.kind === 'PENDING_ABILITY_PAYMENT') {
    if (action.selection === 'PAID' || action.selection === 'NOT_PAID')
      game.resolvePendingAbilityPayment(
        action.pendingAbilityId,
        action.selection,
        context,
      )
    return
  }
  if (action.kind === 'PENDING_ABILITY_RESOLVE') {
    game.resolvePendingAbility(action.pendingAbilityId, context)
    return
  }
  game.ignorePendingAbility(action.pendingAbilityId, context)
}

/** Resolves a currently visible UI choice before the generic command pipeline. */
export const tryHandleVoiceUiAction = (
  input: string,
  game: VoiceUiActionTarget,
  options: {
    execute?: boolean
    languagePack?: VoiceLanguagePack
    executionContext?: TabletopCommandContext
  } = {},
): VoiceUiActionHandlingResult => {
  const matched = matchVoiceUiAction(
    input,
    game,
    options.languagePack ?? DEFAULT_VOICE_LANGUAGE_PACK,
  )
  if (matched.status === 'NO_MATCH') return matched
  if (matched.status === 'AMBIGUOUS')
    return {
      status: 'AMBIGUOUS',
      parsed: 'UI_ACTION',
      description: matched.description,
      normalizedTranscript: matched.normalizedTranscript,
    }

  const execute = options.execute ?? true
  if (execute)
    executeUiAction(matched.action, game, {
      ...options.executionContext,
      normalizedInput: matched.normalizedTranscript,
    })
  return {
    status: 'HANDLED',
    parsed: matched.action.parsed,
    description: matched.action.description,
    normalizedTranscript: matched.normalizedTranscript,
    entity: matched.action.entity,
    executed: execute,
  }
}

/** High-priority STT hints sourced from the exact labels currently visible in UI. */
export const getVoiceUiActionPhraseHints = (state: GameState): string[] =>
  unique([
    ...getVoiceUiActions(state).flatMap((action) => [
      action.label,
      ...action.aliases.filter((alias) => alias.split(' ').length <= 5),
    ]),
    ...state.pendingDecisions
      .filter((decision) => localVoiceTextDecision(state, decision))
      .flatMap((decision) => [
        decision.textValueLabel ?? '',
        'elijo',
        'declaro',
        'nombro',
      ]),
  ])
