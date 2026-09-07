import {
  effectiveAbilitiesForCard,
  effectiveTypeLine,
} from '../../../abilities/engine/staticEffects'
import type { ActivatedAbilityDefinition } from '../../../abilities/types/abilityTypes'
import { activatedAbilityMatchesHint } from '../../../commands/resolver/activatedAbilityHints'
import { basicLandManaColor } from '../../../rules/legality/basicLands'
import { canAttack, canBlock } from '../../../rules/combat/combatRules'
import {
  localPlayerIdOf,
  opponentPlayerIds,
} from '../../../rules/players/playerState'
import type { GameState } from '../../../types/game'
import { getResolvedDeckCommanders } from '../../../types/deck'
import { getVisualCardLabel } from '../../../utils/cardLabels'
import {
  getVoiceUiActions,
  type VoiceUiActionDescriptor,
} from '../../voiceUiActions'
import type {
  VoiceSlotAliasEvidence,
  VoiceSlotEvidenceKind,
  VoiceSlotOption,
} from '../slots/slotTypes'
import { buildVoiceReferenceEvidence } from './voiceReferenceAliases'
import {
  voiceActorControlsCard,
  voiceActorDeckDefinition,
  voiceActorOwnsCard,
  voiceActorPlayerId,
  voiceBlockingPlayerId,
} from '../context/voiceActorContext'

export type VoiceActionCatalog = {
  pendingActions: readonly VoiceUiActionDescriptor[]
  playableCards: readonly VoiceSlotOption[]
  tappableCards: readonly VoiceSlotOption[]
  untappableCards: readonly VoiceSlotOption[]
  discardableCards: readonly VoiceSlotOption[]
  counterTargets: readonly VoiceSlotOption[]
  activatableCards: readonly VoiceSlotOption[]
  manaSources: readonly VoiceSlotOption[]
  channelSources: readonly VoiceSlotOption[]
  equipSources: readonly VoiceSlotOption[]
  waterbendSources: readonly VoiceSlotOption[]
  movableCards: readonly VoiceSlotOption[]
  attackableCards: readonly VoiceSlotOption[]
  defendingTargets: readonly VoiceSlotOption[]
  blockingAttackers: readonly VoiceSlotOption[]
  blockerCards: readonly VoiceSlotOption[]
  stackSpells: readonly VoiceSlotOption[]
}

const unique = (values: readonly string[]): string[] => [...new Set(values)]

const aliasEvidence = (
  values: readonly string[],
  kind: VoiceSlotEvidenceKind,
  fuzzy = true,
): VoiceSlotAliasEvidence[] => values.map((value) => ({ value, kind, fuzzy }))

const mergeAliasEvidence = (
  ...groups: readonly (readonly VoiceSlotAliasEvidence[])[]
): VoiceSlotAliasEvidence[] => {
  const byKey = new Map<string, VoiceSlotAliasEvidence>()
  for (const entry of groups.flat()) {
    const key = `${entry.kind}:${entry.value}`
    const previous = byKey.get(key)
    byKey.set(key, {
      ...entry,
      fuzzy: previous?.fuzzy === true || entry.fuzzy === true,
    })
  }
  return [...byKey.values()]
}

const aliasesFromEvidence = (
  evidence: readonly VoiceSlotAliasEvidence[],
): string[] => unique(evidence.map((entry) => entry.value))

const optionsForKnownInstances = (
  state: GameState,
  cards: GameState['cards'],
  prefix: string,
  roles: { attacker?: boolean; blocker?: boolean } = {},
): VoiceSlotOption[] =>
  cards.map((card) => {
    const sameName = cards.filter(
      (candidate) => candidate.card.name === card.card.name,
    )
    const index =
      sameName.findIndex(
        (candidate) => candidate.instanceId === card.instanceId,
      ) + 1
    const baseEvidence = mergeAliasEvidence(
      aliasEvidence(card.card.localizedAliases ?? [], 'LOCALIZED_NAME'),
      buildVoiceReferenceEvidence(card.card, {
        typeLine: effectiveTypeLine(state, card),
        token: card.isToken,
        ...roles,
      }),
    )
    const baseAliases = aliasesFromEvidence(baseEvidence)
    const evidence = mergeAliasEvidence(
      aliasEvidence([getVisualCardLabel(card, cards)], 'VISUAL_LABEL'),
      baseEvidence,
      sameName.length > 1
        ? aliasEvidence(
            baseAliases.map((alias) => `${alias} ${index}`),
            'ORDINAL_REFERENCE',
            false,
          )
        : [],
    )
    return {
      id: `${prefix}:${card.instanceId}`,
      canonical: card.card.name,
      instanceId: card.instanceId,
      aliases: aliasesFromEvidence(evidence),
      aliasEvidence: evidence,
    }
  })

type PlayableCardVoiceState = Pick<
  GameState,
  | 'activePlayerId'
  | 'deckDefinition'
  | 'deckDefinitionsByPlayer'
  | 'localPlayerId'
  | 'commanderIdsByPlayer'
  | 'commanderId'
  | 'commanderIds'
>

const actorCommanderIds = (state: PlayableCardVoiceState): string[] => {
  const actorPlayerId =
    state.activePlayerId ?? state.localPlayerId ?? 'player-1'
  const explicit = state.commanderIdsByPlayer?.[actorPlayerId]
  if (explicit) return explicit
  if (!state.localPlayerId || actorPlayerId === state.localPlayerId)
    return state.commanderIds ?? (state.commanderId ? [state.commanderId] : [])
  return []
}

export const buildPlayableCardVoiceOptions = (
  state: PlayableCardVoiceState,
): VoiceSlotOption[] => {
  const deck = voiceActorDeckDefinition(state)
  if (!deck) return []
  const commanders = getResolvedDeckCommanders(deck)
  const commanderNames = new Set(commanders.map((entry) => entry.name))
  const entries = [...commanders, ...deck.mainboard]
  const byName = new Map<string, VoiceSlotOption>()
  for (const entry of entries) {
    if (byName.has(entry.name)) continue
    const evidence = mergeAliasEvidence(
      aliasEvidence(entry.card.localizedAliases ?? [], 'LOCALIZED_NAME'),
      aliasEvidence(
        (entry.card.cardFaces ?? []).map((face) => face.name),
        'CARD_FACE',
      ),
      buildVoiceReferenceEvidence(entry.card, {
        commander: commanderNames.has(entry.name),
      }),
    )
    byName.set(entry.name, {
      id: `deck:${entry.card.scryfallId}`,
      canonical: entry.name,
      aliases: aliasesFromEvidence(evidence),
      aliasEvidence: evidence,
    })
  }
  return [...byName.values()]
}

const isActorPermanent = (state: GameState, card: GameState['cards'][number]) =>
  card.zone === 'battlefield' &&
  !card.phasedOut &&
  voiceActorControlsCard(state, card)

const isActorCard = (
  state: GameState,
  card: GameState['cards'][number],
): boolean =>
  card.zone === 'battlefield'
    ? voiceActorControlsCard(state, card)
    : voiceActorOwnsCard(state, card)

const activatedAbilitiesFromCurrentZone = (
  state: GameState,
  card: GameState['cards'][number],
): ActivatedAbilityDefinition[] =>
  effectiveAbilitiesForCard(state, card).filter(
    (ability): ability is ActivatedAbilityDefinition =>
      ability.kind === 'ACTIVATED' &&
      (ability.activeZones?.length
        ? ability.activeZones.includes(card.zone)
        : card.zone === 'battlefield'),
  )

const activatedSourceOptions = (
  state: GameState,
  predicate: (
    card: GameState['cards'][number],
    abilities: ActivatedAbilityDefinition[],
  ) => boolean,
): VoiceSlotOption[] => {
  const sources = state.cards.filter((card) => {
    if (!isActorCard(state, card) || card.phasedOut) return false
    return predicate(card, activatedAbilitiesFromCurrentZone(state, card))
  })
  return sources.map((card) => {
    const sameName = sources.filter(
      (candidate) => candidate.card.name === card.card.name,
    )
    const index =
      sameName.findIndex(
        (candidate) => candidate.instanceId === card.instanceId,
      ) + 1
    const baseEvidence = mergeAliasEvidence(
      aliasEvidence(card.card.localizedAliases ?? [], 'LOCALIZED_NAME'),
      buildVoiceReferenceEvidence(card.card, {
        commander: actorCommanderIds(state).includes(card.instanceId),
        typeLine: effectiveTypeLine(state, card),
        token: card.isToken,
      }),
    )
    const baseAliases = aliasesFromEvidence(baseEvidence)
    const evidence = mergeAliasEvidence(
      aliasEvidence([getVisualCardLabel(card, sources)], 'VISUAL_LABEL'),
      baseEvidence,
      sameName.length > 1
        ? aliasEvidence(
            baseAliases.map((alias) => `${alias} ${index}`),
            'ORDINAL_REFERENCE',
            false,
          )
        : [],
    )
    return {
      id: `ability-source:${card.instanceId}`,
      canonical: card.card.name,
      instanceId: card.instanceId,
      aliases: aliasesFromEvidence(evidence),
      aliasEvidence: evidence,
    }
  })
}

const battlefieldOptions = (
  state: GameState,
  predicate: (card: GameState['cards'][number]) => boolean,
): VoiceSlotOption[] => {
  const visible = state.cards.filter((card) => isActorPermanent(state, card))
  return visible.filter(predicate).map((card) => {
    const sameName = visible.filter(
      (candidate) => candidate.card.name === card.card.name,
    )
    const index =
      sameName.findIndex(
        (candidate) => candidate.instanceId === card.instanceId,
      ) + 1
    const baseEvidence = mergeAliasEvidence(
      aliasEvidence(card.card.localizedAliases ?? [], 'LOCALIZED_NAME'),
      buildVoiceReferenceEvidence(card.card, {
        commander: actorCommanderIds(state).includes(card.instanceId),
        typeLine: effectiveTypeLine(state, card),
        token: card.isToken,
      }),
    )
    const baseAliases = aliasesFromEvidence(baseEvidence)
    const evidence = mergeAliasEvidence(
      aliasEvidence([getVisualCardLabel(card, visible)], 'VISUAL_LABEL'),
      baseEvidence,
      sameName.length > 1
        ? aliasEvidence(
            baseAliases.map((alias) => `${alias} ${index}`),
            'ORDINAL_REFERENCE',
            false,
          )
        : [],
    )
    return {
      id: `instance:${card.instanceId}`,
      canonical: card.card.name,
      instanceId: card.instanceId,
      aliases: aliasesFromEvidence(evidence),
      aliasEvidence: evidence,
    }
  })
}

const knownActorCardOptions = (state: GameState): VoiceSlotOption[] => {
  const known = state.cards.filter(
    (card) => isActorCard(state, card) && !card.phasedOut,
  )
  return known.map((card) => {
    const sameName = known.filter(
      (candidate) => candidate.card.name === card.card.name,
    )
    const index =
      sameName.findIndex(
        (candidate) => candidate.instanceId === card.instanceId,
      ) + 1
    const baseEvidence = mergeAliasEvidence(
      aliasEvidence(card.card.localizedAliases ?? [], 'LOCALIZED_NAME'),
      buildVoiceReferenceEvidence(card.card, {
        commander: actorCommanderIds(state).includes(card.instanceId),
        typeLine: effectiveTypeLine(state, card),
        token: card.isToken,
      }),
    )
    const baseAliases = aliasesFromEvidence(baseEvidence)
    const evidence = mergeAliasEvidence(
      aliasEvidence([getVisualCardLabel(card, known)], 'VISUAL_LABEL'),
      baseEvidence,
      sameName.length > 1
        ? aliasEvidence(
            baseAliases.map((alias) => `${alias} ${index}`),
            'ORDINAL_REFERENCE',
            false,
          )
        : [],
    )
    return {
      id: `known:${card.instanceId}`,
      canonical: card.card.name,
      instanceId: card.instanceId,
      aliases: aliasesFromEvidence(evidence),
      aliasEvidence: evidence,
    }
  })
}

const defendingTargetOptions = (state: GameState): VoiceSlotOption[] => {
  const defendingPlayerId = opponentPlayerIds(
    state,
    voiceActorPlayerId(state),
  )[0]
  if (!defendingPlayerId) return []
  const localPlayerId = localPlayerIdOf(state)
  const planeswalkers = state.cards.filter((card) => {
    if (card.zone !== 'battlefield' || card.phasedOut) return false
    const controllerId =
      card.controllerId ??
      (card.controller === 'OPPONENT'
        ? opponentPlayerIds(state, localPlayerId)[0]
        : localPlayerId)
    return (
      controllerId === defendingPlayerId &&
      /\bplaneswalker\b/i.test(effectiveTypeLine(state, card))
    )
  })
  return optionsForKnownInstances(state, planeswalkers, 'defender')
}

const combatAttackerOptions = (state: GameState): VoiceSlotOption[] => {
  const ids = new Set(
    state.combatState.attackers.map((attacker) => attacker.attackerInstanceId),
  )
  return optionsForKnownInstances(
    state,
    state.cards.filter(
      (card) =>
        ids.has(card.instanceId) &&
        card.zone === 'battlefield' &&
        !card.phasedOut,
    ),
    'combat-attacker',
    { attacker: true },
  )
}

const attackLegalityState = (state: GameState): GameState => {
  if (
    state.turnState.step !== 'MAIN_1' &&
    state.turnState.step !== 'BEGIN_COMBAT'
  )
    return state
  return {
    ...state,
    turnState: { ...state.turnState, step: 'DECLARE_ATTACKERS' },
    combatState: { ...state.combatState, active: true },
  }
}

const blockerLegalityState = (state: GameState): GameState => {
  // Tabletop execution can advance a completed attacker declaration directly
  // into DECLARE_BLOCKERS before resolving the blocker command. Build the V3
  // candidate catalog against that same projected public state, otherwise the
  // semantic layer rejects a legal blocker before the engine gets a chance to
  // perform its implicit combat progression.
  if (
    state.turnState.step === 'DECLARE_ATTACKERS' &&
    state.combatState.active &&
    state.combatState.attackersDeclared
  )
    return {
      ...state,
      turnState: { ...state.turnState, step: 'DECLARE_BLOCKERS' },
    }
  return state
}

const blockerOptions = (state: GameState): VoiceSlotOption[] => {
  const legalityState = blockerLegalityState(state)
  if (
    legalityState.turnState.step !== 'DECLARE_BLOCKERS' ||
    !legalityState.combatState.active
  )
    return []
  const blockingPlayerId = voiceBlockingPlayerId(legalityState)
  const candidates = legalityState.cards.filter(
    (card) =>
      card.zone === 'battlefield' &&
      !card.phasedOut &&
      voiceActorControlsCard(legalityState, card, blockingPlayerId) &&
      /\bcreature\b/i.test(effectiveTypeLine(legalityState, card)) &&
      legalityState.combatState.attackers.some(
        (attacker) => canBlock(legalityState, attacker, card).legal,
      ),
  )
  return optionsForKnownInstances(legalityState, candidates, 'blocker', {
    blocker: true,
  })
}

const stackSpellOptions = (state: GameState): VoiceSlotOption[] => {
  const top = state.stack.at(-1)
  if (!top || top.kind !== 'SPELL') return []
  // The stack object is authoritative. Some legacy casting paths can lag the
  // CardInstance zone or use sourceInstanceId while spellInstanceId is absent.
  // Voice only needs public identity here; the engine still owns legality and
  // actual implicit resolution.
  const topSpellInstanceId = top.spellInstanceId ?? top.sourceInstanceId
  const card = state.cards.find(
    (candidate) =>
      candidate.instanceId === topSpellInstanceId ||
      candidate.instanceId === top.sourceInstanceId,
  )
  return card ? optionsForKnownInstances(state, [card], 'stack-spell') : []
}

export const buildVoiceActionCatalog = (
  state: GameState,
): VoiceActionCatalog => {
  const deck = buildPlayableCardVoiceOptions(state)
  return {
    pendingActions: getVoiceUiActions(state),
    // Hand identity is deliberately never inferred. The deck recipe is merely
    // the vocabulary of cards the player may physically declare.
    playableCards: deck,
    discardableCards: deck,
    tappableCards: battlefieldOptions(state, (card) => !card.tapped),
    untappableCards: battlefieldOptions(state, (card) => card.tapped),
    counterTargets: battlefieldOptions(state, () => true),
    activatableCards: activatedSourceOptions(
      state,
      (_card, abilities) => abilities.length > 0,
    ),
    manaSources: activatedSourceOptions(
      state,
      (card, abilities) =>
        card.zone === 'battlefield' &&
        (abilities.some((ability) =>
          activatedAbilityMatchesHint(ability, 'MANA'),
        ) ||
          basicLandManaColor(effectiveTypeLine(state, card)) !== undefined),
    ),
    channelSources: activatedSourceOptions(state, (_card, abilities) =>
      abilities.some((ability) =>
        activatedAbilityMatchesHint(ability, 'CHANNEL'),
      ),
    ),
    equipSources: activatedSourceOptions(state, (_card, abilities) =>
      abilities.some((ability) =>
        activatedAbilityMatchesHint(ability, 'EQUIP'),
      ),
    ),
    waterbendSources: activatedSourceOptions(state, (_card, abilities) =>
      abilities.some((ability) =>
        activatedAbilityMatchesHint(ability, 'WATERBEND'),
      ),
    ),
    movableCards: knownActorCardOptions(state),
    attackableCards: battlefieldOptions(
      state,
      (card) => canAttack(attackLegalityState(state), card).legal,
    ),
    defendingTargets: defendingTargetOptions(state),
    blockingAttackers: combatAttackerOptions(state),
    blockerCards: blockerOptions(state),
    stackSpells: stackSpellOptions(state),
  }
}
