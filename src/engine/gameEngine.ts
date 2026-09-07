import type { GameAction } from '../actions/gameActions'
import type { CardInstance, Zone } from '../types/card'
import type {
  GameActionSource,
  GameHistoryEntry,
  GameState,
  ManaPool,
} from '../types/game'
import { createTokenInstances } from '../tokens/createTokens'
import { nextStep, turnStateFor } from '../types/turn'
import { emptyCombatState } from '../types/combat'
import type { PlayerState } from '../types/player'
import {
  activePlayerIdOf,
  controllerLabelForPlayer,
  localPlayerIdOf,
  nextTurnPlayerId,
  opponentPlayerIds,
  playerManaPool,
  updatePlayer,
} from '../rules/players/playerState'
import {
  attackTaxForDeclaration,
  blockTaxForDeclaration,
  castRestrictionViolation,
  drawLimitForPlayer,
  hasEffectiveKeyword,
  isProtectedFromSource,
  preventedDamageAmountForPermanent,
  effectiveTypeLine,
  untapsDuringOtherPlayersUntap,
} from '../abilities/engine/staticEffects'
import {
  attachmentTargetIsLegal,
  isAura,
} from '../rules/attachments/attachmentRules'
import {
  validateAttackDeclaration,
  validateAttackRequirements,
  validateBlockDeclaration,
} from '../rules/combat/combatRules'
import { isCommanderInstance } from '../rules/commander/commanderRules'
import {
  attemptUntap,
  cannotUntapDuringControllersUntapStep,
} from '../rules/untap/untapRules'
import {
  isPresentPermanent,
  phaseInForUntapStep,
  phaseInPermanent,
  phaseOutPermanent,
  removePhasedObjectsFromCombat,
} from '../rules/phasing/phasingRules'
import { getResolvedDeckCommanders } from '../types/deck'
import {
  canTransform,
  transformedFaceIndex,
} from '../rules/transform/transformRules'
import { effectiveCardDefinition } from '../rules/copy/copyCharacteristics'
import {
  initialLoyaltyCounters,
  LOYALTY_COUNTER,
} from '../rules/planeswalker/planeswalkerRules'

export type ActionMetadata = {
  actionId: string
  timestamp: number
  transactionId?: string
  source?: GameActionSource
}

export const emptyManaPool = (): ManaPool => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
  C: 0,
})

const playerRuleActive = (
  state: GameState,
  playerId: string,
  rule: keyof NonNullable<GameState['playerRuleEffects']>[number],
): boolean =>
  (state.playerRuleEffects ?? []).some(
    (effect) => effect.playerId === playerId && effect[rule] === true,
  )

const restrictedManaAmount = (
  state: GameState,
  playerId: string,
  color: keyof ManaPool,
): number =>
  (state.restrictedMana ?? [])
    .filter((entry) => entry.playerId === playerId && entry.color === color)
    .reduce((sum, entry) => sum + entry.amount, 0)

export const createInitialGameState = (
  cards: CardInstance[] = [],
  deckDefinition?: GameState['deckDefinition'],
): GameState => {
  const localPlayer: PlayerState = {
    id: 'player-1',
    name: 'Local player',
    isLocal: true,
    life: 40,
    manaPool: emptyManaPool(),
    hiddenZoneTracking: 'UNTRACKED',
    libraryCount: 0,
    handCount: 0,
    landPlaysUsedThisTurn: 0,
    landPlayLimit: 1,
    commanderCastsFromCommandZone: {},
  }
  const opponent: PlayerState = {
    id: 'player-2',
    name: 'Opponent',
    life: 40,
    manaPool: emptyManaPool(),
    hiddenZoneTracking: 'UNTRACKED',
    libraryCount: 0,
    handCount: 0,
    landPlaysUsedThisTurn: 0,
    landPlayLimit: 1,
    commanderCastsFromCommandZone: {},
  }
  return {
    localPlayerId: localPlayer.id,
    playerState: localPlayer,
    players: [localPlayer, opponent],
    activePlayerId: localPlayer.id,
    turnOrder: [localPlayer.id],
    life: 40,
    turn: 1,
    activePlayer: 'local',
    turnState: turnStateFor('UNTAP'),
    gameStatus: 'IN_PROGRESS',
    manaPool: emptyManaPool(),
    autoManaMode: 'SMART',
    stackResolutionMode: 'TABLETOP_IMPLICIT',
    hiddenZoneTracking: 'UNTRACKED',
    libraryCount: 0,
    handCount: 0,
    landPlaysUsedThisTurn: 0,
    landPlayLimit: 1,
    failedDrawFromEmptyLibrary: false,
    failedDrawFromEmptyLibraryByPlayer: {},
    commanderCastsFromCommandZone: {},
    commanderDamageReceivedBySource: {},
    commanderDamageByPlayer: { local: {}, opponent: {} },
    opponentLife: 40,
    combatState: emptyCombatState(),
    damageRecords: [],
    commanderZoneChoiceAcknowledged: [],
    commanderReplacementChoiceAcknowledged: [],
    cards,
    stack: [],
    deckDefinition,
    pendingAbilities: [],
    pendingResolutions: [],
    pendingDecisions: [],
    delayedEffects: [],
    linkedObjectGroups: [],
    temporaryContinuousEffects: [],
    untapRestrictions: [],
    typeContinuousEffects: [],
    playerControlEffects: [],
    attachmentControlEffects: [],
    copyContinuousEffects: [],
    replacementEffects: [],
    perTurnEventMarkers: {},
    extraTurnsQueued: 0,
    extraTurnQueue: [],
    spellsCastThisTurn: 0,
    spellsCastThisTurnByPlayer: {},
    spellCastHistoryThisTurn: [],
    cardsDrawnThisTurnByPlayer: {},
    permanentsEnteredThisTurn: [],
    creaturesAttackedThisTurnByPlayer: {},
    triggeredAbilityTurnMarkers: {},
    temporaryBlockingRestrictions: [],
    attackRequirements: [],
    blockRequirements: [],
    history: [],
  }
}

const describe = (action: GameAction, card?: CardInstance): string => {
  const name = card?.card.name ?? 'Carta'
  switch (action.type) {
    case 'SET_PLAYERS':
      return `Configurar ${action.players.length} jugadores`
    case 'SET_ACTIVE_PLAYER':
      return `Jugador activo: ${action.playerId}`
    case 'GAIN_PLAYER_LIFE':
      return `${action.playerId}: +${action.amount} vidas`
    case 'ADD_RESTRICTED_MANA':
      return `${action.playerId}: +${action.amount} maná ${action.color} restringido`
    case 'SPEND_RESTRICTED_MANA':
      return `${action.playerId}: -${action.amount} maná ${action.color} restringido`
    case 'LOSE_PLAYER_LIFE':
      return `${action.playerId}: -${action.amount} vidas`
    case 'ADD_PLAYER_MANA':
      return `${action.playerId}: +${action.amount} maná ${action.color}`
    case 'SPEND_PLAYER_MANA':
      return `${action.playerId}: -${action.amount} maná ${action.color}`
    case 'SET_PLAYER_MAX_HAND_SIZE':
      return `${action.playerId}: tamaño máximo de mano ${action.value ?? 'normal'}`
    case 'SET_PLAYER_HAND_COUNT':
      return `${action.playerId}: mano ${action.count}`
    case 'SET_PLAYER_LIBRARY_COUNT':
      return `${action.playerId}: biblioteca ${action.count}`
    case 'MILL_PLAYER':
      return `${action.playerId}: mill ${action.count}`
    case 'SHUFFLE_PLAYER_ZONES_INTO_LIBRARY':
      return `${action.playerId}: barajar ${action.zones.join(' + ')} en biblioteca`
    case 'ADD_PLAYER_CONTROL_EFFECT':
      return `Control temporal de ${action.targetPlayerId}`
    case 'REMOVE_PLAYER_CONTROL_EFFECT':
      return `Control temporal completado para ${action.targetPlayerId}`
    case 'ADD_COPY_CONTINUOUS_EFFECT':
      return 'Copiar características mientras dure la fuente'
    case 'SET_PER_TURN_EVENT_MARKER':
      return `Registrar evento por turno: ${action.key}`
    case 'RECORD_PERMANENT_ENTERED_THIS_TURN':
      return `Registrar permanente que entró este turno: ${action.instanceId}`
    case 'RECORD_CREATURE_ATTACKED_THIS_TURN':
      return `Registrar criatura atacante este turno: ${action.instanceId}`
    case 'SET_TRIGGERED_ABILITY_TURN_MARKER':
      return `Registrar trigger por turno: ${action.key}`
    case 'DECLARE_EXTERNAL_CARD':
      return `${action.card.name} declarada (${action.zone})`
    case 'DECLARE_EXTERNAL_ATTACKER':
      return `${name}: atacante rival declarado`
    case 'ADD_REPLACEMENT_EFFECT':
      return 'Añadir efecto de reemplazo'
    case 'REMOVE_REPLACEMENT_EFFECT':
      return 'Retirar efecto de reemplazo'
    case 'MOVE_CARD':
      return `${name} → ${action.toZone}`
    case 'APPLY_STATE_BASED_ACTIONS':
      return 'Aplicar acciones basadas en estado'
    case 'TRANSFORM_CARD':
      return `Transformar ${name}`
    case 'PHASE_OUT_CARD':
      return `${name}: phase out`
    case 'PHASE_IN_CARD':
      return `${name}: phase in`
    case 'TAP_CARD':
      return `${name} girada`
    case 'UNTAP_CARD':
      return `${name} enderezada`
    case 'ADD_TEMPORARY_BLOCKING_RESTRICTION':
      return `${name}: no puede ser bloqueada este turno`
    case 'SET_CARD_TAPPED_STATE':
      return `${name}: ${action.tapped ? 'girada' : 'enderezada'}`
    case 'SET_CARD_RUNTIME_VALUE':
      return `${name}: ${action.key} = ${String(action.value)}`
    case 'SET_CARD_CONTROLLER':
      return `${name}: nuevo controlador ${action.controllerId}`
    case 'ADD_ATTACHMENT_CONTROL_EFFECT':
      return `${name}: control continuo del objeto anexado`
    case 'ADD_ATTACKING_CREATURE_TO_COMBAT':
      return `${name}: entra atacando`
    case 'ATTACH_CARD':
      return 'Adjuntar permanente'
    case 'DETACH_CARD':
      return 'Desadjuntar permanente'
    case 'CREATE_TOKEN_COPY':
      return `Crear ${action.amount} copia(s) token`
    case 'COPY_STACK_SPELL':
      return 'Copiar hechizo en el stack'
    case 'CLEAR_STACK_TARGETS':
      return 'Elegir nuevos objetivos del hechizo'
    case 'SET_STACK_TARGETS':
      return 'Actualizar objetivos del objeto en pila'
    case 'LINK_CARD':
      return 'Vincular objeto exiliado'
    case 'CLEAR_LINKED_CARDS':
      return 'Limpiar objetos vinculados'
    case 'ADD_TEMPORARY_CHARACTERISTIC_EFFECT':
      return `${name}: cambio temporal de características`
    case 'ADD_TEMPORARY_PROTECTION_EFFECT':
      return `${name}: protección temporal`
    case 'SKIP_NEXT_COMBAT_PHASES':
      return `${action.playerId}: se salta el próximo combate`
    case 'ADD_DAMAGE_PREVENTION_EFFECT':
      return `${name}: prevención de daño`
    case 'ADD_PLAYER_RULE_EFFECT':
      return `${action.playerId}: regla temporal de jugador`
    case 'ADD_AIRBEND_PERMISSION':
      return `${name}: permiso de airbend`
    case 'ADD_TEMPORARY_CONTINUOUS_EFFECT':
      return `${name}: modificador temporal`
    case 'ADD_TEMPORARY_GRANTED_TRIGGERED_ABILITY':
      return `${name}: habilidad disparada temporal`
    case 'ADD_UNTAP_RESTRICTION':
      return `${name}: no se endereza mientras dure la fuente`
    case 'ADD_TYPE_CONTINUOUS_EFFECT':
      return `${name}: cambio de tipo de tierra`
    case 'QUEUE_EXTRA_TURN':
      return 'Añadir un turno extra'
    case 'END_TURN':
      return 'Terminar el turno'
    case 'MATERIALIZE_CARD':
      return `${action.card.name} conocida en ${action.toZone}`
    case 'CAST_SPELL':
      return `${action.card.name} lanzada`
    case 'RESOLVE_STACK_OBJECT':
      return 'Resolver objeto superior del stack'
    case 'ADVANCE_STEP':
      return 'Avanzar paso'
    case 'START_TURN':
      return 'Comenzar turno'
    case 'ADD_STACK_OBJECT':
      return `Añadir ${action.stackObject.kind} al stack`
    case 'REMOVE_STACK_OBJECT':
      return 'Retirar objeto del stack'
    case 'SET_GAME_STATUS':
      return `Estado de partida: ${action.status}`
    case 'CONCEDE':
      return 'Conceder la partida'
    case 'BEGIN_COMBAT':
      return 'Comenzar combate'
    case 'DECLARE_ATTACKERS':
      return `Declarar ${action.attackers.length} atacante(s)`
    case 'ADD_BLOCK_REQUIREMENT':
      return `Exigir bloqueo de ${action.blockerInstanceId}`
    case 'DECLARE_BLOCKERS':
      return `Declarar ${action.blockers.length} bloqueador(es)`
    case 'DECLARE_ASSISTED_BLOCKER':
      return 'Registrar bloqueador asistido'
    case 'CLEAR_COMBAT':
      return 'Finalizar combate'
    case 'SET_COMBAT_DAMAGE_STEP':
      return `Paso de daño: ${action.step}`
    case 'DEAL_DAMAGE':
      return `${action.damage.amount} daño`
    case 'DEAL_DAMAGE_BATCH':
      return `${action.damages.length} asignación(es) de daño`
    case 'REMOVE_CARD_INSTANCE':
      return `${name} deja de existir`
    case 'PLAY_LAND':
      return `${action.card.name} jugada como tierra`
    case 'RESOLVE_SPELL':
      return `${name} resuelta`
    case 'CREATE_TOKEN':
      return `Crear ${action.amount} ${action.token.name}`
    case 'ACTIVATE_ABILITY':
      return `${name}: activar habilidad ${action.abilityId ?? 'pendiente'}`
    case 'DECLARE_PLAYER_SHUFFLED':
      return `${action.player === 'opponent' ? 'Oponente' : 'Jugador local'} baraja`
    case 'ADD_PENDING_ABILITIES':
      return `${action.pending.length} habilidad(es) pendiente(s)`
    case 'UPDATE_PENDING_ABILITY':
      return 'Habilidad pendiente actualizada'
    case 'REMOVE_PENDING_ABILITY':
      return 'Habilidad pendiente retirada'
    case 'ADD_PENDING_RESOLUTION':
      return 'Resolución de habilidad en pausa'
    case 'UPDATE_PENDING_RESOLUTION':
      return 'Resolución de habilidad actualizada'
    case 'REMOVE_PENDING_RESOLUTION':
      return 'Resolución de habilidad finalizada'
    case 'ADD_PENDING_DECISION':
      return 'Decisión de habilidad pendiente'
    case 'REMOVE_PENDING_DECISION':
      return 'Decisión de habilidad resuelta'
    case 'ADD_DELAYED_EFFECT':
      return 'Efecto retrasado registrado'
    case 'REMOVE_DELAYED_EFFECT':
      return 'Efecto retrasado consumido'
    case 'ADD_MANA':
      return `+${action.amount} maná ${action.color}`
    case 'SPEND_MANA':
      return `-${action.amount} maná ${action.color}`
    case 'GAIN_LIFE':
      return `+${action.amount} vidas`
    case 'LOSE_LIFE':
      return `-${action.amount} vidas`
    case 'SET_LIFE':
      return `Vidas: ${action.amount}`
    case 'SET_HAND_COUNT':
      return `Mano: ${action.count}`
    case 'SET_LIBRARY_COUNT':
      return `Biblioteca: ${action.count}`
    case 'SET_HIDDEN_ZONE_TRACKING':
      return `Zonas ocultas: ${action.tracking === 'UNTRACKED' ? 'sin seguimiento' : 'solo conteos'}`
    case 'MOVE_UNKNOWN_HIDDEN_CARDS':
      return `Mover ${action.count} carta(s) desconocida(s): ${action.fromZone} → ${action.toZone}`
    case 'SET_KNOWN_LIBRARY_TOP':
      return action.instanceId
        ? 'Registrar carta pública en la parte superior de la biblioteca'
        : 'Limpiar carta superior conocida'
    case 'SET_MAX_HAND_SIZE_OVERRIDE':
      return `Tamaño máximo de mano: ${action.value ?? 'normal'}`
    case 'ADD_COUNTER':
      return `+${action.amount} contador ${action.counter} a ${name}`
    case 'REMOVE_COUNTER':
      return `-${action.amount} contador ${action.counter} de ${name}`
    case 'MOVE_COUNTERS':
      return 'Mover contadores entre permanentes'
    case 'DISTRIBUTE_COUNTERS':
      return `Distribuir contador ${action.counter}`
    case 'DRAW_CARD':
      return 'Robar una carta desconocida'
    case 'NEXT_TURN':
      return 'Siguiente turno'
    case 'UNTAP_ALL':
      return 'Enderezar todo'
  }
}

const withHistory = (
  state: GameState,
  action: GameAction,
  card?: CardInstance,
  metadata: ActionMetadata = {
    actionId: `${state.turn}-${state.history.length}-${action.type}`,
    timestamp: 0,
  },
): GameState => {
  const entry: GameHistoryEntry = {
    actionId: metadata.actionId,
    timestamp: metadata.timestamp,
    transactionId: metadata.transactionId,
    source: metadata.source,
    action,
    description: describe(action, card),
    turn: state.turn,
  }
  return { ...state, history: [entry, ...state.history].slice(0, 250) }
}

const updateCard = (
  state: GameState,
  instanceId: string,
  update: (card: CardInstance) => CardInstance,
): GameState => ({
  ...state,
  cards: state.cards.map((card) =>
    card.instanceId === instanceId ? update(card) : card,
  ),
})

const adjustHiddenCounts = (
  state: GameState,
  fromZone: Zone,
  toZone: Zone,
): Pick<GameState, 'libraryCount' | 'handCount'> =>
  state.hiddenZoneTracking === 'UNTRACKED'
    ? { libraryCount: state.libraryCount, handCount: state.handCount }
    : {
        libraryCount: Math.max(
          0,
          state.libraryCount +
            (fromZone === 'library' && toZone !== 'library' ? -1 : 0) +
            (fromZone !== 'library' && toZone === 'library' ? 1 : 0),
        ),
        handCount: Math.max(
          0,
          state.handCount +
            (fromZone === 'hand' && toZone !== 'hand' ? -1 : 0) +
            (fromZone !== 'hand' && toZone === 'hand' ? 1 : 0),
        ),
      }

/** Keeps the canonical local PlayerState in lock-step with the legacy hidden-zone mirrors. */
const syncLocalHiddenCounts = (state: GameState): GameState =>
  updatePlayer(state, localPlayerIdOf(state), (player) => ({
    ...player,
    hiddenZoneTracking: state.hiddenZoneTracking,
    libraryCount: state.libraryCount,
    handCount: state.handCount,
  }))

const withRecordedDraw = (state: GameState, playerId: string): GameState => ({
  ...state,
  cardsDrawnThisTurnByPlayer: {
    ...(state.cardsDrawnThisTurnByPlayer ?? {}),
    [playerId]: (state.cardsDrawnThisTurnByPlayer?.[playerId] ?? 0) + 1,
  },
})

const drawOneUnknownCard = (state: GameState, playerId: string): GameState => {
  const limit = drawLimitForPlayer(state, playerId)
  if (
    limit !== undefined &&
    (state.cardsDrawnThisTurnByPlayer?.[playerId] ?? 0) >= limit
  )
    return state

  const localId = localPlayerIdOf(state)
  if (playerId !== localId) {
    const player = state.players.find((candidate) => candidate.id === playerId)
    if (!player) return state
    if (
      player.hiddenZoneTracking === 'COUNTS_ONLY' &&
      (player.libraryCount ?? 0) <= 0
    )
      return {
        ...state,
        failedDrawFromEmptyLibraryByPlayer: {
          ...(state.failedDrawFromEmptyLibraryByPlayer ?? {}),
          [playerId]: true,
        },
      }
    const next =
      player.hiddenZoneTracking === 'COUNTS_ONLY'
        ? updatePlayer(state, playerId, (current) => ({
            ...current,
            libraryCount: Math.max(0, (current.libraryCount ?? 0) - 1),
            handCount: (current.handCount ?? 0) + 1,
          }))
        : state
    return withRecordedDraw(next, playerId)
  }

  const knownTop = state.knownLibraryTopInstanceId
    ? state.cards.find(
        (card) =>
          card.instanceId === state.knownLibraryTopInstanceId &&
          card.zone === 'library',
      )
    : undefined
  if (knownTop)
    return withRecordedDraw(
      {
        ...moveKnownCard(state, knownTop.instanceId, 'hand'),
        knownLibraryTopInstanceId: undefined,
      },
      playerId,
    )
  if (state.hiddenZoneTracking === 'UNTRACKED')
    return withRecordedDraw(state, playerId)
  if (state.libraryCount <= 0)
    return {
      ...state,
      failedDrawFromEmptyLibrary: true,
      failedDrawFromEmptyLibraryByPlayer: {
        ...(state.failedDrawFromEmptyLibraryByPlayer ?? {}),
        [playerId]: true,
      },
    }
  return withRecordedDraw(
    syncLocalHiddenCounts({
      ...state,
      libraryCount: state.libraryCount - 1,
      handCount: state.handCount + 1,
    }),
    playerId,
  )
}

const moveKnownCard = (
  state: GameState,
  instanceId: string,
  toZone: CardInstance['zone'],
  preserveRuntimeValues = false,
  controllerId?: string,
): GameState => {
  const source = state.cards.find((card) => card.instanceId === instanceId)
  if (!source) return state
  const zoneChanged = source.zone !== toZone
  const nextCards = state.cards.map((card) => {
    if (card.instanceId === instanceId)
      return {
        ...card,
        zone: toZone,
        tapped: toZone === 'battlefield' ? card.tapped : false,
        ...(toZone === 'stack' && !card.stackObjectId
          ? { stackObjectId: `stack-${card.instanceId}` }
          : {}),
        ...(toZone !== 'stack'
          ? { declaredTargetStackObjectId: undefined }
          : {}),
        ...(toZone === 'battlefield' && source.zone !== 'battlefield'
          ? { controlledSinceTurn: state.turn }
          : {}),
        runtimeValues:
          source.zone === toZone || preserveRuntimeValues
            ? card.runtimeValues
            : undefined,
        ...(zoneChanged
          ? {
              lastAttachedToInstanceId:
                source.zone === 'battlefield'
                  ? card.attachedToInstanceId
                  : undefined,
              attachedToInstanceId: undefined,
              counters:
                toZone === 'battlefield'
                  ? initialLoyaltyCounters(effectiveCardDefinition(state, card))
                  : {},
              damageMarked: 0,
              deathtouchDamageMarked: false,
              currentFaceIndex: 0 as const,
              phasedOut: false,
              phasedOutUnderPlayerId: undefined,
              phasedOutIndirectlyWith: undefined,
            }
          : {}),
        ...(controllerId
          ? {
              controllerId,
              controller:
                controllerId === state.localPlayerId
                  ? ('YOU' as const)
                  : ('OPPONENT' as const),
            }
          : {}),
      }
    if (
      zoneChanged &&
      toZone !== 'battlefield' &&
      card.attachedToInstanceId === instanceId
    )
      return { ...card, attachedToInstanceId: undefined }
    return card
  })
  const movedState: GameState = {
    ...state,
    cards: nextCards,
    ...((source.ownerId ?? localPlayerIdOf(state)) === localPlayerIdOf(state)
      ? adjustHiddenCounts(state, source.zone, toZone)
      : {}),
    ...(source.zone === 'stack' && toZone !== 'stack'
      ? {
          stack: state.stack.filter(
            (object) => object.spellInstanceId !== instanceId,
          ),
        }
      : {}),
    ...(zoneChanged && source.zone === 'battlefield' && toZone !== 'battlefield'
      ? {
          combatState: {
            ...state.combatState,
            attackers: state.combatState.attackers
              .filter((attacker) => attacker.attackerInstanceId !== instanceId)
              .map((attacker) => ({
                ...attacker,
                blockedBy: attacker.blockedBy.filter(
                  (blockerId) => blockerId !== instanceId,
                ),
              })),
            blockers: state.combatState.blockers.filter(
              (blocker) => blocker.blockerInstanceId !== instanceId,
            ),
          },
        }
      : {}),
    ...(state.knownLibraryTopInstanceId === instanceId && toZone !== 'library'
      ? { knownLibraryTopInstanceId: undefined }
      : {}),
    ...(zoneChanged
      ? {
          typeContinuousEffects: (state.typeContinuousEffects ?? []).filter(
            (effect) => effect.targetInstanceId !== instanceId,
          ),
          temporaryCharacteristicEffects: (
            state.temporaryCharacteristicEffects ?? []
          ).filter((effect) => effect.targetInstanceId !== instanceId),
          temporaryGrantedTriggeredAbilities: (
            state.temporaryGrantedTriggeredAbilities ?? []
          ).filter((effect) => effect.targetInstanceId !== instanceId),
          copyContinuousEffects: (state.copyContinuousEffects ?? []).filter(
            (effect) =>
              effect.targetInstanceId !== instanceId &&
              !(
                effect.sourceInstanceId === instanceId &&
                source.zone === 'battlefield'
              ),
          ),
        }
      : {}),
    ...(isCommanderInstance(state, source.instanceId) && source.zone !== toZone
      ? {
          commanderZoneChoiceAcknowledged:
            state.commanderZoneChoiceAcknowledged.filter(
              (entry) => entry.instanceId !== source.instanceId,
            ),
          commanderReplacementChoiceAcknowledged:
            state.commanderReplacementChoiceAcknowledged.filter(
              (entry) => entry.instanceId !== source.instanceId,
            ),
        }
      : {}),
  }
  const permissionAdjusted =
    source.zone === 'exile' && toZone !== 'exile'
      ? {
          ...movedState,
          airbendPermissions: (movedState.airbendPermissions ?? []).filter(
            (permission) => permission.cardInstanceId !== instanceId,
          ),
        }
      : movedState
  let finalState =
    (source.ownerId ?? localPlayerIdOf(state)) === localPlayerIdOf(state)
      ? syncLocalHiddenCounts(permissionAdjusted)
      : permissionAdjusted

  if (zoneChanged && source.zone === 'battlefield') {
    const returnGroups = (state.linkedObjectGroups ?? []).filter(
      (group) =>
        group.sourceInstanceId === source.instanceId &&
        group.returnOnSourceLeaves !== undefined,
    )
    for (const group of returnGroups) {
      const rule = group.returnOnSourceLeaves!
      for (const linkedInstanceId of group.linkedInstanceIds) {
        const linked = finalState.cards.find(
          (card) => card.instanceId === linkedInstanceId,
        )
        if (!linked || linked.zone !== rule.fromZone) continue
        finalState = moveKnownCard(
          finalState,
          linkedInstanceId,
          rule.destination,
          false,
          rule.controller === 'OWNER' ? linked.ownerId : undefined,
        )
      }
    }
    if (returnGroups.length) {
      const returnedKeys = new Set(returnGroups.map((group) => group.key))
      finalState = {
        ...finalState,
        linkedObjectGroups: (finalState.linkedObjectGroups ?? []).filter(
          (group) =>
            group.sourceInstanceId !== source.instanceId ||
            !returnedKeys.has(group.key),
        ),
      }
    }
  }

  return finalState
}

const reconcileAttachmentControlEffects = (state: GameState): GameState => {
  const existing = state.attachmentControlEffects ?? []
  if (!existing.length) return state
  const previousTargetIds = existing.flatMap((effect) =>
    effect.targetInstanceId ? [effect.targetInstanceId] : [],
  )
  const normalized = existing.flatMap((effect) => {
    const source = state.cards.find(
      (card) => card.instanceId === effect.sourceInstanceId,
    )
    if (source?.zone !== 'battlefield') return []
    const attached = source.attachedToInstanceId
      ? state.cards.find(
          (card) =>
            card.instanceId === source.attachedToInstanceId &&
            card.zone === 'battlefield',
        )
      : undefined
    if (!attached)
      return [
        {
          ...effect,
          targetInstanceId: undefined,
          baselineControllerId: undefined,
        },
      ]
    if (
      effect.targetInstanceId === attached.instanceId &&
      effect.baselineControllerId
    )
      return [effect]
    const inheritedBaseline = existing
      .filter(
        (candidate) =>
          candidate.targetInstanceId === attached.instanceId &&
          candidate.baselineControllerId,
      )
      .sort((a, b) => a.sequence - b.sequence)[0]?.baselineControllerId
    return [
      {
        ...effect,
        targetInstanceId: attached.instanceId,
        baselineControllerId:
          inheritedBaseline ??
          attached.controllerId ??
          attached.ownerId ??
          localPlayerIdOf(state),
      },
    ]
  })
  const affectedTargetIds = new Set([
    ...previousTargetIds,
    ...normalized.flatMap((effect) =>
      effect.targetInstanceId ? [effect.targetInstanceId] : [],
    ),
  ])
  let cards = state.cards
  for (const targetInstanceId of affectedTargetIds) {
    const target = cards.find((card) => card.instanceId === targetInstanceId)
    if (!target || target.zone !== 'battlefield') continue
    const previousForTarget = existing
      .filter(
        (effect) =>
          effect.targetInstanceId === targetInstanceId &&
          effect.baselineControllerId,
      )
      .sort((a, b) => a.sequence - b.sequence)
    const activeForTarget = normalized
      .filter((effect) => effect.targetInstanceId === targetInstanceId)
      .sort((a, b) => a.sequence - b.sequence)
    const desiredControllerId =
      activeForTarget.at(-1)?.controllerId ??
      previousForTarget[0]?.baselineControllerId
    if (!desiredControllerId || target.controllerId === desiredControllerId)
      continue
    const controller =
      desiredControllerId === state.localPlayerId
        ? ('YOU' as const)
        : ('OPPONENT' as const)
    cards = cards.map((card) =>
      card.instanceId === targetInstanceId
        ? {
            ...card,
            controllerId: desiredControllerId,
            controller,
            controlledSinceTurn: state.turn,
          }
        : card,
    )
  }
  return { ...state, cards, attachmentControlEffects: normalized }
}

const isCommanderCastFromCommand = (
  state: GameState,
  action: GameAction,
): boolean =>
  action.type === 'CAST_SPELL' &&
  action.fromZone === 'command' &&
  isCommanderInstance(state, action.instanceId)

const withSpellStackObject = (
  state: GameState,
  instanceId: string,
  controller: 'YOU' | 'OPPONENT' = 'YOU',
  variables?: Record<string, string | number | boolean>,
  declaredTargets?: import('../abilities/types/abilityTypes').DeclaredTarget[],
): GameState => {
  const card = state.cards.find(
    (candidate) => candidate.instanceId === instanceId,
  )
  if (
    !card?.stackObjectId ||
    state.stack.some((item) => item.stackObjectId === card.stackObjectId)
  )
    return state
  return {
    ...state,
    stack: [
      ...state.stack,
      {
        stackObjectId: card.stackObjectId,
        kind: 'SPELL',
        controller,
        controllerId:
          card.controllerId ??
          (controller === 'YOU'
            ? state.localPlayerId
            : state.turnOrder.find((id) => id !== state.localPlayerId)),
        sourceInstanceId: instanceId,
        spellInstanceId: instanceId,
        targets: declaredTargets?.length
          ? declaredTargets.map((target) => target.targetId)
          : card.declaredTargetStackObjectId
            ? [card.declaredTargetStackObjectId]
            : [],
        ...(declaredTargets?.length
          ? {
              declaredTargets: declaredTargets.map((target) => ({ ...target })),
            }
          : {}),
        ...(variables ? { variables: { ...variables } } : {}),
        order: state.stack.length + 1,
      },
    ],
  }
}

/** DeckDefinition is the finite inventory for identities that are still unlocated. */
const hasDeckCopyAvailable = (
  state: GameState,
  card: CardInstance['card'],
  playerId = activePlayerIdOf(state),
): boolean => {
  const deck =
    state.deckDefinitionsByPlayer?.[playerId] ??
    (playerId === localPlayerIdOf(state) ? state.deckDefinition : undefined)
  if (!deck) return true
  const entry = [...getResolvedDeckCommanders(deck), ...deck.mainboard].find(
    (candidate) => candidate.card.scryfallId === card.scryfallId,
  )
  if (!entry) return false
  return (
    state.cards.filter(
      (instance) =>
        instance.card.scryfallId === card.scryfallId &&
        (instance.ownerId ?? localPlayerIdOf(state)) === playerId,
    ).length < entry.quantity
  )
}

/**
 * Applies a single intent to the digital parallel state. Unknown cards remain counts;
 * a card receives an identity only through MATERIALIZE_CARD or a known-game action.
 */
export const applyGameAction = (
  state: GameState,
  action: GameAction,
  metadata?: ActionMetadata,
): GameState => {
  const target =
    'instanceId' in action
      ? state.cards.find((card) => card.instanceId === action.instanceId)
      : undefined
  const record = (next: GameState, card?: CardInstance) =>
    withHistory(next, action, card, metadata)

  switch (action.type) {
    case 'SET_PLAYERS': {
      if (!action.players.length) return state
      const localId =
        (state.localPlayerId &&
        action.players.some((player) => player.id === state.localPlayerId)
          ? state.localPlayerId
          : undefined) ??
        action.players.find((player) => player.isLocal)?.id ??
        action.players[0].id
      const players = action.players.map((player) => ({
        ...player,
        isLocal: player.id === localId,
      }))
      const turnOrder = (
        action.turnOrder?.length
          ? action.turnOrder
          : players.map((player) => player.id)
      ).filter(
        (id, index, all) =>
          players.some((player) => player.id === id) &&
          all.indexOf(id) === index,
      )
      const activePlayerId = turnOrder.includes(state.activePlayerId)
        ? state.activePlayerId
        : (turnOrder[0] ?? localId)
      const local = players.find((player) => player.id === localId)
      const firstOpponent = players.find((player) => player.id !== localId)
      return record({
        ...state,
        localPlayerId: localId,
        players,
        turnOrder,
        activePlayerId,
        activePlayer: activePlayerId === localId ? 'local' : 'opponent',
        ...(local
          ? {
              playerState: local,
              life: local.life,
              manaPool: local.manaPool,
              hiddenZoneTracking:
                local.hiddenZoneTracking ?? state.hiddenZoneTracking,
              libraryCount: local.libraryCount ?? state.libraryCount,
              handCount: local.handCount ?? state.handCount,
              landPlaysUsedThisTurn:
                local.landPlaysUsedThisTurn ?? state.landPlaysUsedThisTurn,
              landPlayLimit: local.landPlayLimit ?? state.landPlayLimit,
              commanderCastsFromCommandZone:
                local.commanderCastsFromCommandZone ??
                state.commanderCastsFromCommandZone,
              maxHandSizeOverride:
                local.maxHandSizeOverride ?? state.maxHandSizeOverride,
            }
          : {}),
        ...(firstOpponent ? { opponentLife: firstOpponent.life } : {}),
      })
    }
    case 'SET_ACTIVE_PLAYER':
      return state.players.some((player) => player.id === action.playerId)
        ? record({
            ...state,
            activePlayerId: action.playerId,
            activePlayer:
              action.playerId === localPlayerIdOf(state) ? 'local' : 'opponent',
          })
        : state
    case 'ADD_RESTRICTED_MANA': {
      if (action.amount <= 0 || !Number.isSafeInteger(action.amount))
        return state
      const id = `restricted-${action.sourceInstanceId ?? 'mana'}-${action.playerId}-${action.color}-${state.turn}-${(state.restrictedMana ?? []).length + 1}`
      const next = updatePlayer(state, action.playerId, (player) => ({
        ...player,
        manaPool: {
          ...player.manaPool,
          [action.color]: player.manaPool[action.color] + action.amount,
        },
      }))
      return record({
        ...next,
        restrictedMana: [
          ...(next.restrictedMana ?? []),
          {
            id,
            playerId: action.playerId,
            color: action.color,
            amount: action.amount,
            restriction: action.restriction,
          },
        ],
      })
    }
    case 'SPEND_RESTRICTED_MANA': {
      if (action.amount <= 0 || !Number.isSafeInteger(action.amount))
        return state
      const available = (state.restrictedMana ?? [])
        .filter(
          (entry) =>
            entry.playerId === action.playerId &&
            entry.color === action.color &&
            entry.restriction === action.restriction,
        )
        .reduce((sum, entry) => sum + entry.amount, 0)
      if (available < action.amount) return state
      let remaining = action.amount
      const restrictedMana = (state.restrictedMana ?? []).flatMap((entry) => {
        if (
          remaining <= 0 ||
          entry.playerId !== action.playerId ||
          entry.color !== action.color ||
          entry.restriction !== action.restriction
        )
          return [entry]
        const spent = Math.min(entry.amount, remaining)
        remaining -= spent
        return entry.amount === spent
          ? []
          : [{ ...entry, amount: entry.amount - spent }]
      })
      const next = updatePlayer(state, action.playerId, (player) => ({
        ...player,
        manaPool: {
          ...player.manaPool,
          [action.color]: Math.max(
            0,
            player.manaPool[action.color] - action.amount,
          ),
        },
      }))
      return record({ ...next, restrictedMana })
    }
    case 'GAIN_PLAYER_LIFE':
      return action.amount > 0 &&
        !playerRuleActive(state, action.playerId, 'lifeTotalCannotChange')
        ? record(
            updatePlayer(state, action.playerId, (player) => ({
              ...player,
              life: player.life + action.amount,
            })),
          )
        : state
    case 'LOSE_PLAYER_LIFE':
      return action.amount > 0 &&
        !playerRuleActive(state, action.playerId, 'lifeTotalCannotChange') &&
        !playerRuleActive(state, action.playerId, 'cannotLoseLife')
        ? record(
            updatePlayer(state, action.playerId, (player) => ({
              ...player,
              life: player.life - action.amount,
            })),
          )
        : state
    case 'ADD_PLAYER_MANA':
      return action.amount > 0
        ? record(
            updatePlayer(state, action.playerId, (player) => ({
              ...player,
              manaPool: {
                ...player.manaPool,
                [action.color]: player.manaPool[action.color] + action.amount,
              },
            })),
          )
        : state
    case 'SPEND_PLAYER_MANA': {
      if (action.amount <= 0) return state
      const player = state.players.find(
        (candidate) => candidate.id === action.playerId,
      )
      const unrestricted = player
        ? player.manaPool[action.color] -
          restrictedManaAmount(state, action.playerId, action.color)
        : 0
      if (!player || unrestricted < action.amount) return state
      return record(
        updatePlayer(state, action.playerId, (current) => ({
          ...current,
          manaPool: {
            ...current.manaPool,
            [action.color]: current.manaPool[action.color] - action.amount,
          },
        })),
      )
    }
    case 'SET_PLAYER_MAX_HAND_SIZE':
      return record(
        updatePlayer(state, action.playerId, (player) => ({
          ...player,
          ...(action.value === undefined
            ? { maxHandSizeOverride: undefined }
            : { maxHandSizeOverride: action.value }),
        })),
      )
    case 'SET_PLAYER_HAND_COUNT':
      return action.count >= 0
        ? record(
            updatePlayer(state, action.playerId, (player) => ({
              ...player,
              handCount: action.count,
            })),
          )
        : state
    case 'SET_PLAYER_LIBRARY_COUNT':
      return action.count >= 0
        ? record(
            updatePlayer(state, action.playerId, (player) => ({
              ...player,
              libraryCount: action.count,
            })),
          )
        : state
    case 'MILL_PLAYER': {
      if (!Number.isSafeInteger(action.count) || action.count < 0) return state
      const player = state.players.find(
        (candidate) => candidate.id === action.playerId,
      )
      if (!player) return state
      if (player.hiddenZoneTracking !== 'COUNTS_ONLY') return record(state)
      const libraryCount = Math.max(
        0,
        (player.libraryCount ?? 0) - action.count,
      )
      return record(
        updatePlayer(state, action.playerId, (current) => ({
          ...current,
          libraryCount,
        })),
      )
    }
    case 'SHUFFLE_PLAYER_ZONES_INTO_LIBRARY': {
      const player = state.players.find(
        (candidate) => candidate.id === action.playerId,
      )
      if (!player) return state
      const movingKnown = state.cards.filter(
        (card) =>
          action.zones.includes(card.zone as 'hand' | 'graveyard') &&
          (card.ownerId ?? localPlayerIdOf(state)) === action.playerId,
      )
      let next: GameState = {
        ...state,
        cards: state.cards.map((card) =>
          movingKnown.some((moving) => moving.instanceId === card.instanceId)
            ? {
                ...card,
                zone: 'library' as const,
                tapped: false,
                attachedToInstanceId: undefined,
                runtimeValues: undefined,
                counters: {},
                stackObjectId: undefined,
              }
            : card,
        ),
      }
      if (player.hiddenZoneTracking === 'COUNTS_ONLY') {
        const handMoved = action.zones.includes('hand')
          ? (player.handCount ?? 0)
          : 0
        next = updatePlayer(next, action.playerId, (current) => ({
          ...current,
          handCount: action.zones.includes('hand') ? 0 : current.handCount,
          libraryCount:
            (current.libraryCount ?? 0) +
            movingKnown.filter((card) => card.zone === 'graveyard').length +
            handMoved,
        }))
      }
      return record(next)
    }
    case 'ADD_PLAYER_CONTROL_EFFECT':
      return record({
        ...state,
        playerControlEffects: [
          ...(state.playerControlEffects ?? []).filter(
            (effect) =>
              effect.targetPlayerId !== action.targetPlayerId ||
              effect.duration !== action.duration,
          ),
          {
            targetPlayerId: action.targetPlayerId,
            controllerPlayerId: action.controllerPlayerId,
            duration: action.duration,
            createdTurn: state.turn,
          },
        ],
      })
    case 'REMOVE_PLAYER_CONTROL_EFFECT':
      return record({
        ...state,
        playerControlEffects: (state.playerControlEffects ?? []).filter(
          (effect) =>
            effect.targetPlayerId !== action.targetPlayerId ||
            effect.duration !== action.duration,
        ),
      })
    case 'ADD_COPY_CONTINUOUS_EFFECT':
      return record({
        ...state,
        copyContinuousEffects: [
          ...(state.copyContinuousEffects ?? []).filter(
            (effect) =>
              effect.targetInstanceId !== action.targetInstanceId ||
              effect.sourceInstanceId !== action.sourceInstanceId,
          ),
          {
            sourceInstanceId: action.sourceInstanceId,
            targetInstanceId: action.targetInstanceId,
            copiedFromInstanceId: action.copiedFromInstanceId,
            ...(action.copiedCard ? { copiedCard: action.copiedCard } : {}),
            ...(action.copiedKeywords
              ? { copiedKeywords: action.copiedKeywords }
              : {}),
            duration: action.duration,
          },
        ],
      })
    case 'SET_PER_TURN_EVENT_MARKER':
      return record({
        ...state,
        perTurnEventMarkers: {
          ...(state.perTurnEventMarkers ?? {}),
          [action.key]: action.turn,
        },
      })
    case 'RECORD_PERMANENT_ENTERED_THIS_TURN':
      return record({
        ...state,
        permanentsEnteredThisTurn: [
          ...(state.permanentsEnteredThisTurn ?? []).filter(
            (entry) => entry.instanceId !== action.instanceId,
          ),
          {
            instanceId: action.instanceId,
            playerId: action.playerId,
            cardTypes: [...action.cardTypes],
            subtypes: [...action.subtypes],
          },
        ],
      })
    case 'RECORD_CREATURE_ATTACKED_THIS_TURN': {
      const current =
        state.creaturesAttackedThisTurnByPlayer?.[action.playerId] ?? []
      return current.includes(action.instanceId)
        ? state
        : record({
            ...state,
            creaturesAttackedThisTurnByPlayer: {
              ...(state.creaturesAttackedThisTurnByPlayer ?? {}),
              [action.playerId]: [...current, action.instanceId],
            },
          })
    }
    case 'SET_TRIGGERED_ABILITY_TURN_MARKER':
      return record({
        ...state,
        triggeredAbilityTurnMarkers: {
          ...(state.triggeredAbilityTurnMarkers ?? {}),
          [action.key]: action.turn,
        },
      })
    case 'DECLARE_EXTERNAL_CARD': {
      if (state.cards.some((card) => card.instanceId === action.instanceId))
        return state
      const localId = localPlayerIdOf(state)
      const externalPlayerId =
        action.controllerId ??
        opponentPlayerIds(state, localId)[0] ??
        'player-2'
      const controller = controllerLabelForPlayer(state, externalPlayerId)
      return record({
        ...state,
        cards: [
          ...state.cards,
          {
            instanceId: action.instanceId,
            card: action.card,
            zone: action.zone,
            tapped: false,
            counters:
              action.zone === 'battlefield'
                ? initialLoyaltyCounters(action.card)
                : {},
            knownBecause: action.knownBecause,
            ownerId: externalPlayerId,
            controllerId: externalPlayerId,
            controller,
            ...(action.zone === 'battlefield'
              ? { controlledSinceTurn: state.turn }
              : {}),
          },
        ],
      })
    }
    case 'DECLARE_EXTERNAL_ATTACKER': {
      const attacker = state.cards.find(
        (card) => card.instanceId === action.instanceId,
      )
      if (
        !attacker ||
        attacker.zone !== 'battlefield' ||
        !/\bcreature\b/i.test(attacker.card.typeLine)
      )
        return state
      const localId = localPlayerIdOf(state)
      const attackerPlayerId =
        attacker.controllerId ?? opponentPlayerIds(state, localId)[0]
      if (!attackerPlayerId || attackerPlayerId === localId) return state
      const defendingPlayerId = action.defendingPlayerId ?? localId
      const samePhysicalCombat =
        state.combatState.active &&
        state.combatState.attackingPlayerStableId === attackerPlayerId
      const baseCombat = samePhysicalCombat
        ? state.combatState
        : {
            ...emptyCombatState(),
            combatId: `external-combat-${state.turn}-${attackerPlayerId}`,
            active: true,
            attackingPlayerId: 'opponent' as const,
            attackingPlayerStableId: attackerPlayerId,
          }
      if (
        baseCombat.attackers.some(
          (item) => item.attackerInstanceId === attacker.instanceId,
        )
      )
        return state
      const stagedAttackers = [
        ...baseCombat.attackers,
        {
          attackerInstanceId: attacker.instanceId,
          defendingTarget: {
            kind: 'PLAYER' as const,
            id: defendingPlayerId,
            playerId: defendingPlayerId,
          },
        },
      ]
      const requiredTax = attackTaxForDeclaration(
        state,
        attackerPlayerId,
        stagedAttackers,
      )
      if ((action.genericTaxPaid ?? 0) !== requiredTax) return state
      return record({
        ...state,
        cards: state.cards.map((card) =>
          card.instanceId === attacker.instanceId &&
          !hasEffectiveKeyword(state, attacker, 'VIGILANCE')
            ? { ...card, tapped: true }
            : card,
        ),
        combatState: {
          ...baseCombat,
          attackers: [
            ...baseCombat.attackers,
            {
              attackerInstanceId: attacker.instanceId,
              defendingTarget: {
                kind: 'PLAYER' as const,
                id: defendingPlayerId,
                playerId: defendingPlayerId,
              },
              blockedBy: [],
              externalBlockedBy: [],
            },
          ],
        },
      })
    }
    case 'ADD_REPLACEMENT_EFFECT':
      return (state.replacementEffects ?? []).some(
        (effect) => effect.id === action.replacementEffect.id,
      )
        ? state
        : record({
            ...state,
            replacementEffects: [
              ...(state.replacementEffects ?? []),
              action.replacementEffect,
            ],
          })
    case 'REMOVE_REPLACEMENT_EFFECT':
      return (state.replacementEffects ?? []).some(
        (effect) => effect.id === action.replacementEffectId,
      )
        ? record({
            ...state,
            replacementEffects: (state.replacementEffects ?? []).filter(
              (effect) => effect.id !== action.replacementEffectId,
            ),
          })
        : state
    case 'MOVE_CARD': {
      if (!target) return state
      let moved = moveKnownCard(
        state,
        action.instanceId,
        action.toZone,
        false,
        action.controllerId,
      )
      if (target.zone === 'stack' && action.toZone !== 'stack')
        moved = {
          ...moved,
          replacementEffects: (moved.replacementEffects ?? []).filter(
            (effect) =>
              !(
                effect.duration === 'WHILE_SUBJECT_ON_STACK' &&
                effect.event.type === 'MOVE_CARD' &&
                effect.event.subjectInstanceId === action.instanceId
              ),
          ),
        }
      if (target.zone === 'battlefield' && action.toZone !== 'battlefield')
        moved = {
          ...moved,
          untapRestrictions: (moved.untapRestrictions ?? []).filter(
            (effect) =>
              effect.sourceInstanceId !== action.instanceId &&
              effect.targetInstanceId !== action.instanceId,
          ),
        }
      return record(reconcileAttachmentControlEffects(moved), target)
    }
    case 'APPLY_STATE_BASED_ACTIONS': {
      let next = state
      let changed = false
      for (const move of action.moves) {
        const moved = moveKnownCard(next, move.instanceId, move.toZone)
        if (moved === next) continue
        next = moved
        changed = true
      }
      for (const attachmentInstanceId of action.detachInstanceIds ?? []) {
        const attachment = next.cards.find(
          (card) => card.instanceId === attachmentInstanceId,
        )
        if (!attachment?.attachedToInstanceId) continue
        next = updateCard(next, attachmentInstanceId, (card) => ({
          ...card,
          attachedToInstanceId: undefined,
        }))
        changed = true
      }
      if (action.removeInstanceIds.length) {
        const removeIds = new Set(action.removeInstanceIds)
        const cards = next.cards.filter(
          (card) => !removeIds.has(card.instanceId),
        )
        if (cards.length !== next.cards.length) {
          next = { ...next, cards }
          changed = true
        }
      }
      for (const removal of action.counterRemovals) {
        if (removal.amount <= 0) continue
        const card = next.cards.find(
          (candidate) => candidate.instanceId === removal.instanceId,
        )
        if (!card || (card.counters[removal.counter] ?? 0) <= 0) continue
        next = updateCard(next, removal.instanceId, (candidate) => ({
          ...candidate,
          counters: {
            ...candidate.counters,
            [removal.counter]: Math.max(
              0,
              (candidate.counters[removal.counter] ?? 0) - removal.amount,
            ),
          },
        }))
        changed = true
      }
      return changed ? record(reconcileAttachmentControlEffects(next)) : state
    }
    case 'TRANSFORM_CARD':
      return target && canTransform(target)
        ? record(
            updateCard(state, action.instanceId, (card) => ({
              ...card,
              currentFaceIndex: transformedFaceIndex(card),
            })),
            target,
          )
        : state
    case 'PHASE_OUT_CARD': {
      if (!target) return state
      const phased = phaseOutPermanent(state, action.instanceId)
      if (!phased.phasedInstanceIds.length) return state
      return record(
        {
          ...state,
          cards: phased.cards,
          combatState: removePhasedObjectsFromCombat(
            state.combatState,
            phased.phasedInstanceIds,
          ),
        },
        target,
      )
    }
    case 'PHASE_IN_CARD': {
      if (!target) return state
      const phased = phaseInPermanent(state, action.instanceId)
      return phased.phasedInstanceIds.length
        ? record({ ...state, cards: phased.cards }, target)
        : state
    }
    case 'TAP_CARD':
      return !target || target.tapped
        ? state
        : record(
            updateCard(state, action.instanceId, (card) => ({
              ...card,
              tapped: true,
            })),
            target,
          )
    case 'UNTAP_CARD': {
      if (!target || !target.tapped) return state
      const untapped = attemptUntap(state, target)
      return untapped === target
        ? state
        : record(
            updateCard(state, action.instanceId, () => untapped),
            target,
          )
    }
    case 'SET_CARD_TAPPED_STATE':
      return target
        ? record(
            updateCard(state, action.instanceId, (card) => ({
              ...card,
              tapped: action.tapped,
            })),
            target,
          )
        : state
    case 'SET_CARD_RUNTIME_VALUE':
      return target
        ? record(
            updateCard(state, action.instanceId, (card) => ({
              ...card,
              runtimeValues: {
                ...(card.runtimeValues ?? {}),
                [action.key]: action.value,
              },
            })),
            target,
          )
        : state
    case 'SET_CARD_CONTROLLER': {
      if (!target) return state
      const controller =
        action.controllerId === state.localPlayerId
          ? ('YOU' as const)
          : ('OPPONENT' as const)
      const previousControllerId =
        target.controllerId ??
        (target.controller === 'OPPONENT' ? 'player-2' : state.localPlayerId)
      const controllerChanged = previousControllerId !== action.controllerId
      const cards = state.cards.map((card) =>
        card.instanceId === action.instanceId
          ? {
              ...card,
              controllerId: action.controllerId,
              controller,
              ...(card.zone === 'battlefield'
                ? { controlledSinceTurn: state.turn }
                : {}),
            }
          : card,
      )
      const stack = state.stack.map((object) =>
        object.spellInstanceId === action.instanceId
          ? { ...object, controllerId: action.controllerId, controller }
          : object,
      )
      return record(
        reconcileAttachmentControlEffects({
          ...state,
          cards,
          stack,
          untapRestrictions: controllerChanged
            ? (state.untapRestrictions ?? []).filter(
                (effect) => effect.sourceInstanceId !== action.instanceId,
              )
            : state.untapRestrictions,
        }),
        target,
      )
    }
    case 'ADD_ATTACHMENT_CONTROL_EFFECT': {
      const source = state.cards.find(
        (card) => card.instanceId === action.sourceInstanceId,
      )
      const controlled = state.cards.find(
        (card) => card.instanceId === action.targetInstanceId,
      )
      if (
        !source ||
        !controlled ||
        source.zone !== 'battlefield' ||
        controlled.zone !== 'battlefield' ||
        source.attachedToInstanceId !== controlled.instanceId
      )
        return state
      const existingForTarget = (state.attachmentControlEffects ?? [])
        .filter((effect) => effect.targetInstanceId === controlled.instanceId)
        .sort((a, b) => a.sequence - b.sequence)
      const baselineControllerId =
        existingForTarget[0]?.baselineControllerId ??
        controlled.controllerId ??
        controlled.ownerId ??
        localPlayerIdOf(state)
      const sequence =
        Math.max(
          0,
          ...(state.attachmentControlEffects ?? []).map(
            (effect) => effect.sequence,
          ),
        ) + 1
      const next = reconcileAttachmentControlEffects({
        ...state,
        attachmentControlEffects: [
          ...(state.attachmentControlEffects ?? []).filter(
            (effect) => effect.sourceInstanceId !== source.instanceId,
          ),
          {
            sourceInstanceId: source.instanceId,
            targetInstanceId: controlled.instanceId,
            controllerId: action.controllerId,
            baselineControllerId,
            sequence,
          },
        ],
      })
      return record(next, controlled)
    }
    case 'ADD_ATTACKING_CREATURE_TO_COMBAT': {
      const attacker = state.cards.find(
        (card) => card.instanceId === action.instanceId,
      )
      if (
        !attacker ||
        attacker.zone !== 'battlefield' ||
        !state.combatState.active ||
        state.combatState.attackers.some(
          (entry) => entry.attackerInstanceId === attacker.instanceId,
        )
      )
        return state
      const candidate = {
        attackerInstanceId: attacker.instanceId,
        defendingTarget: action.defendingTarget,
      }
      const requirements = validateAttackRequirements(state, [candidate])
      if (!requirements.legal) return state
      return record(
        {
          ...state,
          combatState: {
            ...state.combatState,
            attackers: [
              ...state.combatState.attackers,
              {
                ...candidate,
                blockedBy: [],
                externalBlockedBy: [],
              },
            ],
          },
        },
        attacker,
      )
    }
    case 'ATTACH_CARD': {
      const attachment = state.cards.find(
        (card) => card.instanceId === action.attachmentInstanceId,
      )
      const attachedTo = state.cards.find(
        (card) => card.instanceId === action.targetInstanceId,
      )
      if (
        !attachment ||
        !attachedTo ||
        attachment.zone !== 'battlefield' ||
        attachedTo.zone !== 'battlefield' ||
        attachment.instanceId === attachedTo.instanceId
      )
        return state
      return record(
        reconcileAttachmentControlEffects(
          updateCard(state, attachment.instanceId, (card) => ({
            ...card,
            attachedToInstanceId: attachedTo.instanceId,
          })),
        ),
        attachment,
      )
    }
    case 'DETACH_CARD': {
      const attachment = state.cards.find(
        (card) => card.instanceId === action.attachmentInstanceId,
      )
      if (!attachment?.attachedToInstanceId) return state
      return record(
        reconcileAttachmentControlEffects(
          updateCard(state, attachment.instanceId, (card) => ({
            ...card,
            attachedToInstanceId: undefined,
          })),
        ),
        attachment,
      )
    }
    case 'CREATE_TOKEN_COPY': {
      const source = state.cards.find(
        (card) => card.instanceId === action.sourceInstanceId,
      )
      if (!source || action.amount <= 0 || !Number.isSafeInteger(action.amount))
        return state
      const controllerId =
        action.controllerId ??
        source.controllerId ??
        state.localPlayerId ??
        'player-1'
      const controller =
        controllerId === state.localPlayerId
          ? ('YOU' as const)
          : ('OPPONENT' as const)
      const existing = state.cards.filter(
        (card) =>
          card.isToken && card.copiedFromInstanceId === source.instanceId,
      ).length
      const removeLegendary =
        action.removeLegendary || action.overrides?.removeLegendary
      let typeLine = removeLegendary
        ? source.card.typeLine.replace(/^Legendary\s+/i, '')
        : source.card.typeLine
      if (action.overrides?.addSubtypes?.length) {
        const [main, subtypes = ''] = typeLine.split(/\s+[—-]\s+/)
        const existingSubtypes = subtypes.split(/\s+/).filter(Boolean)
        const merged = Array.from(
          new Set([...existingSubtypes, ...action.overrides.addSubtypes]),
        )
        typeLine = `${main} — ${merged.join(' ')}`
      }
      const copiedCard = {
        ...source.card,
        typeLine,
        ...(action.overrides?.power !== undefined
          ? { power: action.overrides.power }
          : {}),
        ...(action.overrides?.toughness !== undefined
          ? { toughness: action.overrides.toughness }
          : {}),
        ...(action.overrides?.colors
          ? { colors: [...action.overrides.colors] }
          : {}),
      }
      if (action.instanceIds && action.instanceIds.length !== action.amount)
        return state
      if (
        action.attackPlayerIds &&
        action.attackPlayerIds.length !== action.amount
      )
        return state
      const explicitIds = action.instanceIds ?? []
      if (
        explicitIds.some(
          (id, index) =>
            !id ||
            explicitIds.indexOf(id) !== index ||
            state.cards.some((card) => card.instanceId === id),
        )
      )
        return state
      const copies = Array.from({ length: action.amount }, (_, index) => ({
        instanceId:
          explicitIds[index] ??
          `token-copy-${source.instanceId}-${existing + index + 1}`,
        card: copiedCard,
        zone: 'battlefield' as const,
        tapped: false,
        counters: initialLoyaltyCounters(copiedCard),
        ownerId: controllerId,
        controllerId,
        controller,
        controlledSinceTurn: state.turn,
        isToken: true,
        copiedFromInstanceId: source.instanceId,
        keywords:
          source.keywords?.length || action.grantKeywords?.length
            ? Array.from(
                new Set([
                  ...(source.keywords ?? []),
                  ...(action.grantKeywords ?? []),
                ]),
              )
            : undefined,
      }))
      const requirements = action.attackPlayerIds?.map((playerId, index) => ({
        attackerInstanceId: copies[index].instanceId,
        defendingPlayerId: playerId,
        turn: state.turn,
      }))
      return record(
        {
          ...state,
          cards: [...state.cards, ...copies],
          ...(requirements?.length
            ? {
                attackRequirements: [
                  ...(state.attackRequirements ?? []),
                  ...requirements,
                ],
              }
            : {}),
        },
        source,
      )
    }
    case 'COPY_STACK_SPELL': {
      const sourceStackObject = state.stack.find(
        (object) => object.stackObjectId === action.sourceStackObjectId,
      )
      const source = sourceStackObject?.spellInstanceId
        ? state.cards.find(
            (card) =>
              card.instanceId === sourceStackObject.spellInstanceId &&
              card.zone === 'stack',
          )
        : undefined
      if (!sourceStackObject || !source) return state
      const copyNumber =
        state.cards.filter(
          (card) =>
            card.isSpellCopy && card.copiedFromInstanceId === source.instanceId,
        ).length + 1
      const instanceId = `spell-copy-${source.instanceId}-${copyNumber}`
      const stackObjectId = `stack-${instanceId}`
      const controllerId =
        action.controllerId ??
        source.controllerId ??
        state.localPlayerId ??
        'player-1'
      const controller =
        controllerId === state.localPlayerId
          ? ('YOU' as const)
          : ('OPPONENT' as const)
      const typeLine = action.removeLegendary
        ? source.card.typeLine.replace(/^Legendary\s+/i, '')
        : source.card.typeLine
      const copy: CardInstance = {
        instanceId,
        card: { ...source.card, typeLine },
        zone: 'stack',
        tapped: false,
        counters: {},
        ownerId: controllerId,
        controllerId,
        controller,
        stackObjectId,
        isSpellCopy: true,
        copiedFromInstanceId: source.instanceId,
        ...(source.declaredTargetStackObjectId
          ? { declaredTargetStackObjectId: source.declaredTargetStackObjectId }
          : {}),
      }
      return record({
        ...state,
        cards: [...state.cards, copy],
        stack: [
          ...state.stack,
          {
            stackObjectId,
            kind: 'SPELL',
            controller,
            controllerId,
            sourceInstanceId: instanceId,
            spellInstanceId: instanceId,
            copiedFromStackObjectId: sourceStackObject.stackObjectId,
            targets: [...sourceStackObject.targets],
            ...(sourceStackObject.declaredTargets?.length
              ? {
                  declaredTargets: sourceStackObject.declaredTargets.map(
                    (target) => ({ ...target }),
                  ),
                }
              : {}),
            variables: sourceStackObject.variables
              ? { ...sourceStackObject.variables }
              : undefined,
            order: state.stack.length + 1,
          },
        ],
      })
    }
    case 'CLEAR_STACK_TARGETS': {
      const stackObject = state.stack.find(
        (object) => object.stackObjectId === action.stackObjectId,
      )
      if (!stackObject) return state
      return record({
        ...state,
        stack: state.stack.map((object) =>
          object.stackObjectId === action.stackObjectId
            ? { ...object, targets: [], declaredTargets: undefined }
            : object,
        ),
        cards: state.cards.map((card) =>
          card.stackObjectId === action.stackObjectId
            ? { ...card, declaredTargetStackObjectId: undefined }
            : card,
        ),
      })
    }
    case 'SET_STACK_TARGETS': {
      const stackObject = state.stack.find(
        (object) => object.stackObjectId === action.stackObjectId,
      )
      if (!stackObject) return state
      const firstStackTarget = action.declaredTargets.find(
        (target) =>
          target.constraints.stackKind === 'SPELL' ||
          target.constraints.zones?.includes('stack'),
      )
      return record({
        ...state,
        stack: state.stack.map((object) =>
          object.stackObjectId === action.stackObjectId
            ? {
                ...object,
                targets: action.declaredTargets.map(
                  (target) => target.targetId,
                ),
                declaredTargets: action.declaredTargets.map((target) => ({
                  ...target,
                })),
              }
            : object,
        ),
        cards: state.cards.map((card) =>
          card.stackObjectId === action.stackObjectId
            ? {
                ...card,
                declaredTargetStackObjectId: firstStackTarget?.targetId,
              }
            : card,
        ),
      })
    }
    case 'LINK_CARD': {
      const existing = state.linkedObjectGroups ?? []
      const group = existing.find(
        (entry) =>
          entry.sourceInstanceId === action.sourceInstanceId &&
          entry.key === action.key,
      )
      const linkedObjectGroups = group
        ? existing.map((entry) =>
            entry === group &&
            !entry.linkedInstanceIds.includes(action.linkedInstanceId)
              ? {
                  ...entry,
                  linkedInstanceIds: [
                    ...entry.linkedInstanceIds,
                    action.linkedInstanceId,
                  ],
                  ...(action.returnOnSourceLeaves
                    ? { returnOnSourceLeaves: action.returnOnSourceLeaves }
                    : {}),
                }
              : entry,
          )
        : [
            ...existing,
            {
              sourceInstanceId: action.sourceInstanceId,
              key: action.key,
              linkedInstanceIds: [action.linkedInstanceId],
              ...(action.returnOnSourceLeaves
                ? { returnOnSourceLeaves: action.returnOnSourceLeaves }
                : {}),
            },
          ]
      return record({ ...state, linkedObjectGroups })
    }
    case 'CLEAR_LINKED_CARDS':
      return record({
        ...state,
        linkedObjectGroups: (state.linkedObjectGroups ?? []).filter(
          (entry) =>
            entry.sourceInstanceId !== action.sourceInstanceId ||
            entry.key !== action.key,
        ),
      })
    case 'ADD_TEMPORARY_CHARACTERISTIC_EFFECT':
      return record({
        ...state,
        temporaryCharacteristicEffects: [
          ...(state.temporaryCharacteristicEffects ?? []),
          {
            sourceInstanceId: action.sourceInstanceId,
            targetInstanceId: action.targetInstanceId,
            ...(action.setBasePower !== undefined
              ? { setBasePower: action.setBasePower }
              : {}),
            ...(action.setBaseToughness !== undefined
              ? { setBaseToughness: action.setBaseToughness }
              : {}),
            ...(action.addCardTypes
              ? { addCardTypes: [...action.addCardTypes] }
              : {}),
            ...(action.removeCardTypes
              ? { removeCardTypes: [...action.removeCardTypes] }
              : {}),
            ...(action.setCreatureSubtypes
              ? { setCreatureSubtypes: [...action.setCreatureSubtypes] }
              : {}),
            ...(action.setName !== undefined
              ? { setName: action.setName }
              : {}),
            ...(action.setColors ? { setColors: [...action.setColors] } : {}),
            ...(action.loseAllAbilities ? { loseAllAbilities: true } : {}),
            duration: action.duration,
          },
        ],
      })
    case 'ADD_TEMPORARY_PROTECTION_EFFECT':
      return record({
        ...state,
        temporaryProtectionEffects: [
          ...(state.temporaryProtectionEffects ?? []),
          {
            sourceInstanceId: action.sourceInstanceId,
            targetInstanceId: action.targetInstanceId,
            ...(action.protectionFromEverything
              ? { protectionFromEverything: true }
              : {}),
            ...(action.cardTypes ? { cardTypes: [...action.cardTypes] } : {}),
            ...(action.colors ? { colors: [...action.colors] } : {}),
            duration: action.duration,
            ...(action.expiresAtPlayerId
              ? { expiresAtPlayerId: action.expiresAtPlayerId }
              : {}),
          },
        ],
      })
    case 'SKIP_NEXT_COMBAT_PHASES':
      return record({
        ...state,
        pendingCombatPhaseSkipsByPlayer: {
          ...(state.pendingCombatPhaseSkipsByPlayer ?? {}),
          [action.playerId]:
            (state.pendingCombatPhaseSkipsByPlayer?.[action.playerId] ?? 0) + 1,
        },
      })
    case 'ADD_DAMAGE_PREVENTION_EFFECT':
      return record({
        ...state,
        damagePreventionEffects: [
          ...(state.damagePreventionEffects ?? []).filter(
            (entry) => entry.id !== action.id,
          ),
          {
            id: action.id,
            sourceInstanceId: action.sourceInstanceId,
            targetInstanceId: action.targetInstanceId,
            ...(action.remainingAmount !== undefined
              ? { remainingAmount: action.remainingAmount }
              : {}),
            ...(action.preventAll ? { preventAll: true } : {}),
            duration: action.duration,
          },
        ],
      })
    case 'ADD_PLAYER_RULE_EFFECT':
      return record({
        ...state,
        playerRuleEffects: [
          ...(state.playerRuleEffects ?? []).filter(
            (entry) => entry.id !== action.id,
          ),
          {
            id: action.id,
            sourceInstanceId: action.sourceInstanceId,
            playerId: action.playerId,
            ...(action.hexproof ? { hexproof: true } : {}),
            ...(action.protectionFromEverything
              ? { protectionFromEverything: true }
              : {}),
            ...(action.lifeTotalCannotChange
              ? { lifeTotalCannotChange: true }
              : {}),
            ...(action.cannotLoseLife ? { cannotLoseLife: true } : {}),
            ...(action.cannotWinOrLose ? { cannotWinOrLose: true } : {}),
            duration: action.duration,
            createdTurn: state.turn,
          },
        ],
      })
    case 'ADD_AIRBEND_PERMISSION':
      return record({
        ...state,
        airbendPermissions: [
          ...(state.airbendPermissions ?? []).filter(
            (entry) => entry.cardInstanceId !== action.cardInstanceId,
          ),
          {
            cardInstanceId: action.cardInstanceId,
            ownerId: action.ownerId,
            alternativeManaCost: action.alternativeManaCost,
          },
        ],
      })
    case 'ADD_TEMPORARY_CONTINUOUS_EFFECT':
      return record({
        ...state,
        temporaryContinuousEffects: [
          ...(state.temporaryContinuousEffects ?? []),
          {
            sourceInstanceId: action.sourceInstanceId,
            targetInstanceId: action.targetInstanceId,
            ...(action.power !== undefined ? { power: action.power } : {}),
            ...(action.toughness !== undefined
              ? { toughness: action.toughness }
              : {}),
            ...(action.grantKeywords
              ? { grantKeywords: [...action.grantKeywords] }
              : {}),
            duration: action.duration,
          },
        ],
      })
    case 'ADD_TEMPORARY_GRANTED_TRIGGERED_ABILITY':
      return record({
        ...state,
        temporaryGrantedTriggeredAbilities: [
          ...(state.temporaryGrantedTriggeredAbilities ?? []).filter(
            (entry) => entry.id !== action.id,
          ),
          {
            id: action.id,
            sourceInstanceId: action.sourceInstanceId,
            targetInstanceId: action.targetInstanceId,
            ability: action.ability,
            duration: action.duration,
          },
        ],
      })
    case 'ADD_UNTAP_RESTRICTION':
      return record({
        ...state,
        untapRestrictions: [
          ...(state.untapRestrictions ?? []).filter(
            (entry) =>
              entry.targetInstanceId !== action.targetInstanceId ||
              entry.sourceInstanceId !== action.sourceInstanceId,
          ),
          {
            sourceInstanceId: action.sourceInstanceId,
            sourceControllerId: action.sourceControllerId,
            targetInstanceId: action.targetInstanceId,
            duration: action.duration,
          },
        ],
      })
    case 'ADD_TYPE_CONTINUOUS_EFFECT':
      return record({
        ...state,
        typeContinuousEffects: [
          ...(state.typeContinuousEffects ?? []).filter(
            (entry) =>
              entry.targetInstanceId !== action.targetInstanceId ||
              entry.sourceInstanceId !== action.sourceInstanceId ||
              entry.mode !== action.mode,
          ),
          {
            sourceInstanceId: action.sourceInstanceId,
            targetInstanceId: action.targetInstanceId,
            mode: action.mode,
            landSubtype: action.landSubtype,
            duration: action.duration,
            ...(action.counterType ? { counterType: action.counterType } : {}),
          },
        ],
      })
    case 'QUEUE_EXTRA_TURN': {
      const playerId = action.playerId ?? activePlayerIdOf(state)
      return record({
        ...state,
        extraTurnsQueued: (state.extraTurnsQueued ?? 0) + 1,
        extraTurnQueue: [...(state.extraTurnQueue ?? []), playerId],
      })
    }
    case 'END_TURN': {
      const stackIds = new Set(
        state.cards
          .filter((card) => card.zone === 'stack')
          .map((card) => card.instanceId),
      )
      const clearedPlayers = state.players.map((player) => ({
        ...player,
        manaPool: emptyManaPool(),
      }))
      const local = clearedPlayers.find(
        (player) => player.id === localPlayerIdOf(state),
      )
      return record({
        ...state,
        players: clearedPlayers,
        ...(local ? { playerState: local } : {}),
        cards: state.cards
          .filter(
            (card) => !(stackIds.has(card.instanceId) && card.isSpellCopy),
          )
          .map((card) =>
            stackIds.has(card.instanceId)
              ? { ...card, zone: 'exile' as const, stackObjectId: undefined }
              : card,
          )
          .map((card) => ({
            ...card,
            damageMarked: 0,
            deathtouchDamageMarked: false,
          })),
        stack: [],
        pendingAbilities: [],
        pendingResolutions: [],
        pendingDecisions: [],
        manaPool: emptyManaPool(),
        combatState: emptyCombatState(),
        damageRecords: [],
        temporaryBlockingRestrictions: [],
        temporaryContinuousEffects: [],
        temporaryGrantedTriggeredAbilities: [],
        temporaryCharacteristicEffects: [],
        temporaryProtectionEffects: (
          state.temporaryProtectionEffects ?? []
        ).filter((effect) => effect.duration !== 'UNTIL_END_OF_TURN'),
        damagePreventionEffects: [],
        playerRuleEffects: (state.playerRuleEffects ?? []).filter(
          (effect) => effect.duration !== 'UNTIL_END_OF_TURN',
        ),
        restrictedMana: [],
        attackRequirements: [],
        blockRequirements: [],
        typeContinuousEffects: (state.typeContinuousEffects ?? []).filter(
          (effect) => effect.duration !== 'UNTIL_END_OF_TURN',
        ),
        turnState: turnStateFor('CLEANUP'),
      })
    }
    case 'MATERIALIZE_CARD':
      if (state.cards.some((card) => card.instanceId === action.instanceId))
        return state
      if (!hasDeckCopyAvailable(state, action.card, action.actorPlayerId))
        return state
      return record(
        syncLocalHiddenCounts({
          ...state,
          ...adjustHiddenCounts(state, action.fromZone, action.toZone),
          cards: [
            ...state.cards,
            {
              instanceId: action.instanceId,
              card: action.card,
              zone: action.toZone,
              tapped: false,
              counters:
                action.toZone === 'battlefield'
                  ? initialLoyaltyCounters(action.card)
                  : {},
              ownerId: action.actorPlayerId ?? activePlayerIdOf(state),
              controllerId: action.actorPlayerId ?? activePlayerIdOf(state),
              ...(action.toZone === 'battlefield'
                ? { controlledSinceTurn: state.turn }
                : {}),
            },
          ],
        }),
      )
    case 'CONCEDE': {
      if (state.gameStatus !== 'IN_PROGRESS') return state
      const actorPlayerId = action.actorPlayerId ?? activePlayerIdOf(state)
      const localPlayerId = localPlayerIdOf(state)
      return record({
        ...state,
        gameStatus: actorPlayerId === localPlayerId ? 'LOST' : 'WON',
        gameLossReason: 'CONCEDED',
      })
    }
    case 'CAST_SPELL': {
      const localId = localPlayerIdOf(state)
      const existingControllerId = target?.controllerId
      const castControllerId =
        action.actorPlayerId ?? existingControllerId ?? localId
      if (castRestrictionViolation(state, action.card, castControllerId))
        return state
      const controller = controllerLabelForPlayer(state, castControllerId)
      const castNumber =
        (state.spellsCastThisTurnByPlayer?.[castControllerId] ?? 0) + 1
      const withCastCount = (next: GameState): GameState => ({
        ...next,
        spellsCastThisTurn:
          castControllerId === localId
            ? (state.spellsCastThisTurn ?? 0) + 1
            : (state.spellsCastThisTurn ?? 0),
        spellsCastThisTurnByPlayer: {
          ...(state.spellsCastThisTurnByPlayer ?? {}),
          [castControllerId]: castNumber,
        },
        spellCastHistoryThisTurn: [
          ...(state.spellCastHistoryThisTurn ?? []),
          { playerId: castControllerId, card: action.card },
        ],
      })
      const withSpellGraveyardReplacement = (next: GameState): GameState => {
        if (action.variables?.EXILE_IF_WOULD_ENTER_GRAVEYARD !== true)
          return next
        const id = `spell-graveyard-exile:${action.instanceId}`
        if ((next.replacementEffects ?? []).some((effect) => effect.id === id))
          return next
        return {
          ...next,
          replacementEffects: [
            ...(next.replacementEffects ?? []),
            {
              id,
              sourceInstanceId: action.instanceId,
              duration: 'WHILE_SUBJECT_ON_STACK',
              consumeOnApply: true,
              event: {
                type: 'MOVE_CARD',
                toZone: 'graveyard',
                subjectInstanceId: action.instanceId,
              },
              replacement: { type: 'MOVE_CARD', toZone: 'exile' },
            },
          ],
        }
      }
      if (target) {
        const moved = updateCard(
          moveKnownCard(
            state,
            action.instanceId,
            'stack',
            false,
            castControllerId,
          ),
          action.instanceId,
          (card) => ({
            ...card,
            controllerId: castControllerId,
            controller,
            declaredTargetStackObjectId: action.targetStackObjectId,
          }),
        )
        const counted = isCommanderCastFromCommand(state, action)
          ? updatePlayer(moved, castControllerId, (player) => ({
              ...player,
              commanderCastsFromCommandZone: {
                ...(player.commanderCastsFromCommandZone ?? {}),
                [action.instanceId]:
                  (player.commanderCastsFromCommandZone?.[action.instanceId] ??
                    0) + 1,
              },
            }))
          : moved
        return record(
          withSpellGraveyardReplacement(
            withSpellStackObject(
              withCastCount(counted),
              action.instanceId,
              controller,
              action.variables,
              action.declaredTargets,
            ),
          ),
          target,
        )
      }
      if (state.cards.some((card) => card.instanceId === action.instanceId))
        return state
      if (
        castControllerId === localId &&
        !hasDeckCopyAvailable(state, action.card)
      )
        return state
      const castBase: GameState = {
        ...state,
        ...(castControllerId === localId
          ? adjustHiddenCounts(state, action.fromZone, 'stack')
          : {}),
        cards: [
          ...state.cards,
          {
            instanceId: action.instanceId,
            card: action.card,
            zone: 'stack' as const,
            tapped: false,
            counters: {},
            ownerId: castControllerId,
            controllerId: castControllerId,
            ...(castControllerId !== localId
              ? { knownBecause: 'CAST' as const }
              : {}),
            stackObjectId: `stack-${action.instanceId}`,
            controller,
            declaredTargetStackObjectId: action.targetStackObjectId,
          },
        ],
      }
      const castState = withCastCount(
        castControllerId === localId
          ? syncLocalHiddenCounts(castBase)
          : castBase,
      )
      return record(
        withSpellGraveyardReplacement(
          withSpellStackObject(
            castState,
            action.instanceId,
            controller,
            action.variables,
            action.declaredTargets,
          ),
        ),
      )
    }
    case 'PLAY_LAND':
      if (target) {
        const moved = moveKnownCard(state, action.instanceId, 'battlefield')
        return record(
          updatePlayer(
            moved,
            action.actorPlayerId ?? target.ownerId ?? activePlayerIdOf(state),
            (player) => ({
              ...player,
              landPlaysUsedThisTurn:
                Math.max(
                  player.landPlaysUsedThisTurn ?? 0,
                  player.landPlaysUsedThisTurn ?? 0,
                ) + 1,
            }),
          ),
          target,
        )
      }
      if (state.cards.some((card) => card.instanceId === action.instanceId))
        return state
      if (!hasDeckCopyAvailable(state, action.card, action.actorPlayerId))
        return state
      return record(
        updatePlayer(
          syncLocalHiddenCounts({
            ...state,
            ...adjustHiddenCounts(state, action.fromZone, 'battlefield'),
            cards: [
              ...state.cards,
              {
                instanceId: action.instanceId,
                card: action.card,
                zone: 'battlefield',
                tapped: false,
                counters: {},
                ownerId: action.actorPlayerId ?? activePlayerIdOf(state),
                controllerId: action.actorPlayerId ?? activePlayerIdOf(state),
                controlledSinceTurn: state.turn,
              },
            ],
          }),
          action.actorPlayerId ?? activePlayerIdOf(state),
          (player) => ({
            ...player,
            landPlaysUsedThisTurn:
              Math.max(
                player.landPlaysUsedThisTurn ?? 0,
                player.landPlaysUsedThisTurn ?? 0,
              ) + 1,
          }),
        ),
      )
    case 'RESOLVE_SPELL': {
      if (!target) return state
      if (target.zone !== 'stack') {
        const stillOnStack = state.stack.some(
          (object) => object.spellInstanceId === action.instanceId,
        )
        return stillOnStack
          ? state
          : record(
              {
                ...state,
                turnState:
                  state.turnState.step === 'UNTAP'
                    ? state.turnState
                    : { ...state.turnState, priority: 'WINDOW_OPEN' },
              },
              target,
            )
      }
      if (
        state.stack.length > 0 &&
        state.stack.at(-1)?.spellInstanceId !== action.instanceId
      )
        return state
      const stackObject = state.stack.find(
        (object) => object.spellInstanceId === action.instanceId,
      )
      const isInstantOrSorcery = /instant|sorcery/i.test(target.card.typeLine)
      if (target.isSpellCopy && isInstantOrSorcery) {
        const withoutCopy: GameState = {
          ...state,
          cards: state.cards.filter(
            (card) => card.instanceId !== target.instanceId,
          ),
          stack: state.stack.filter(
            (object) => object.spellInstanceId !== target.instanceId,
          ),
          turnState:
            state.turnState.step === 'UNTAP'
              ? state.turnState
              : { ...state.turnState, priority: 'WINDOW_OPEN' },
        }
        return record(withoutCopy, target)
      }

      const castVariables = stackObject?.variables
      let destination: Zone = isInstantOrSorcery ? 'graveyard' : 'battlefield'
      let moved: GameState

      if (!isInstantOrSorcery && isAura(target)) {
        const enchantTargetId = stackObject?.declaredTargets?.[0]?.targetId
        const tentative = moveKnownCard(
          state,
          action.instanceId,
          'battlefield',
          action.preserveRuntimeValues === true,
        )
        const aura = tentative.cards.find(
          (card) => card.instanceId === action.instanceId,
        )
        const enchantTarget = enchantTargetId
          ? tentative.cards.find((card) => card.instanceId === enchantTargetId)
          : undefined
        if (
          aura &&
          enchantTarget &&
          attachmentTargetIsLegal(tentative, aura, enchantTarget)
        ) {
          moved = updateCard(tentative, aura.instanceId, (card) => ({
            ...card,
            attachedToInstanceId: enchantTarget.instanceId,
          }))
        } else {
          destination = 'graveyard'
          moved = moveKnownCard(
            state,
            action.instanceId,
            destination,
            action.preserveRuntimeValues === true,
          )
        }
      } else {
        moved = moveKnownCard(
          state,
          action.instanceId,
          destination,
          action.preserveRuntimeValues === true,
        )
      }

      const withCastMemory =
        destination === 'battlefield'
          ? updateCard(moved, action.instanceId, (card) => ({
              ...card,
              ...(target.isSpellCopy
                ? { isToken: true, isSpellCopy: false }
                : {}),
              ...(castVariables
                ? {
                    runtimeValues: {
                      ...(card.runtimeValues ?? {}),
                      ...castVariables,
                    },
                  }
                : {}),
            }))
          : moved
      return record(
        {
          ...withCastMemory,
          turnState:
            state.turnState.step === 'UNTAP'
              ? state.turnState
              : { ...state.turnState, priority: 'WINDOW_OPEN' },
        },
        target,
      )
    }
    case 'RESOLVE_STACK_OBJECT':
      return state.stack.at(-1)?.stackObjectId === action.stackObjectId
        ? record(state)
        : state
    case 'ADD_STACK_OBJECT':
      return state.stack.some(
        (object) => object.stackObjectId === action.stackObject.stackObjectId,
      )
        ? state
        : record({ ...state, stack: [...state.stack, action.stackObject] })
    case 'REMOVE_STACK_OBJECT':
      return state.stack.some(
        (object) => object.stackObjectId === action.stackObjectId,
      )
        ? record({
            ...state,
            stack: state.stack.filter(
              (object) => object.stackObjectId !== action.stackObjectId,
            ),
          })
        : state
    case 'BEGIN_COMBAT':
      return record({
        ...state,
        combatState: {
          ...emptyCombatState(),
          combatId: `combat-${state.turn}`,
          active: true,
        },
      })
    case 'DECLARE_ATTACKERS': {
      if (!state.combatState.active) return state
      const declaration = validateAttackDeclaration(state, action.attackers)
      if (!declaration.legal) return state
      const attackingPlayerId =
        action.actorPlayerId ??
        state.combatState.attackingPlayerStableId ??
        activePlayerIdOf(state)
      const requiredTax = attackTaxForDeclaration(
        state,
        attackingPlayerId,
        action.attackers,
      )
      if ((action.genericTaxPaid ?? 0) !== requiredTax) return state
      const ids = new Set(
        action.attackers.map((attacker) => attacker.attackerInstanceId),
      )
      if (ids.size !== action.attackers.length) return state
      return record({
        ...state,
        cards: state.cards.map((card) =>
          ids.has(card.instanceId) &&
          !hasEffectiveKeyword(state, card, 'VIGILANCE')
            ? { ...card, tapped: true }
            : card,
        ),
        combatState: {
          ...state.combatState,
          attackersDeclared: true,
          blockersDeclared: false,
          attackers: action.attackers.map((attacker) => ({
            ...attacker,
            blockedBy: [],
            externalBlockedBy: [],
          })),
        },
        attackRequirements: (state.attackRequirements ?? []).filter(
          (requirement) => requirement.turn !== state.turn,
        ),
      })
    }
    case 'ADD_BLOCK_REQUIREMENT':
      return record({
        ...state,
        blockRequirements: [
          ...(state.blockRequirements ?? []),
          {
            blockerInstanceId: action.blockerInstanceId,
            ...(action.attackerInstanceId
              ? { attackerInstanceId: action.attackerInstanceId }
              : {}),
            turn: action.turn ?? state.turn,
            ...((action.combatId ?? state.combatState.combatId)
              ? { combatId: action.combatId ?? state.combatState.combatId }
              : {}),
          },
        ],
      })
    case 'DECLARE_BLOCKERS': {
      if (!state.combatState.active) return state
      const declaration = validateBlockDeclaration(state, action.blockers)
      if (!declaration.legal) return state
      const blockingPlayerId =
        action.actorPlayerId ??
        action.blockers
          .map((blocker) =>
            state.cards.find(
              (card) => card.instanceId === blocker.blockerInstanceId,
            ),
          )
          .find(Boolean)?.controllerId ??
        opponentPlayerIds(state, activePlayerIdOf(state))[0]
      const requiredTax = blockTaxForDeclaration(
        state,
        blockingPlayerId,
        action.blockers,
      )
      if ((action.genericTaxPaid ?? 0) !== requiredTax) return state
      const blockedBy = new Map<string, string[]>()
      action.blockers.forEach((blocker) =>
        blocker.blocking.forEach((attackerId) =>
          blockedBy.set(attackerId, [
            ...(blockedBy.get(attackerId) ?? []),
            blocker.blockerInstanceId,
          ]),
        ),
      )
      return record({
        ...state,
        combatState: {
          ...state.combatState,
          blockersDeclared: true,
          blockers: action.blockers,
          attackers: state.combatState.attackers.map((attacker) => ({
            ...attacker,
            blockedBy: blockedBy.get(attacker.attackerInstanceId) ?? [],
          })),
        },
      })
    }
    case 'ADD_TEMPORARY_BLOCKING_RESTRICTION':
      return record({
        ...state,
        temporaryBlockingRestrictions: [
          ...(state.temporaryBlockingRestrictions ?? []),
          {
            restriction: action.restriction,
            targetInstanceId: action.targetInstanceId,
            sourceInstanceId: action.sourceInstanceId,
          },
        ],
      })
    case 'DECLARE_ASSISTED_BLOCKER':
      if (
        !state.combatState.attackers.some(
          (item) => item.attackerInstanceId === action.attackerInstanceId,
        )
      )
        return state
      return record({
        ...state,
        combatState: {
          ...state.combatState,
          externalParticipants: [
            ...state.combatState.externalParticipants,
            action.participant,
          ],
          attackers: state.combatState.attackers.map((attacker) =>
            attacker.attackerInstanceId === action.attackerInstanceId
              ? {
                  ...attacker,
                  externalBlockedBy: [
                    ...attacker.externalBlockedBy,
                    action.participant.temporaryId,
                  ],
                }
              : attacker,
          ),
        },
      })
    case 'CLEAR_COMBAT':
      return record({ ...state, combatState: emptyCombatState() })
    case 'SET_COMBAT_DAMAGE_STEP':
      return record({
        ...state,
        combatState: {
          ...state.combatState,
          damageStep: action.step,
          ...(action.firstStrikeParticipantIds
            ? { firstStrikeParticipantIds: action.firstStrikeParticipantIds }
            : {}),
        },
      })
    case 'DEAL_DAMAGE':
      return applyGameAction(
        state,
        { type: 'DEAL_DAMAGE_BATCH', damages: [action.damage] },
        metadata,
      )
    case 'DEAL_DAMAGE_BATCH': {
      if (!action.damages.length) return state
      const localId = localPlayerIdOf(state)
      const firstOpponentId = opponentPlayerIds(state, localId)[0]
      const targetPlayerId = (damage: (typeof action.damages)[number]) =>
        damage.target.kind === 'PLAYER'
          ? (damage.target.playerId ??
            (damage.target.player === 'local' ? localId : firstOpponentId))
          : undefined
      let preventionEffects = [...(state.damagePreventionEffects ?? [])]
      const effectiveDamages: typeof action.damages = []
      for (const damage of action.damages) {
        if (damage.amount <= 0) continue
        const playerId = targetPlayerId(damage)
        if (playerId) {
          if (playerRuleActive(state, playerId, 'protectionFromEverything'))
            continue
          effectiveDamages.push(damage)
          continue
        }
        if (
          damage.target.kind !== 'CREATURE' &&
          damage.target.kind !== 'PLANESWALKER'
        ) {
          effectiveDamages.push(damage)
          continue
        }
        const targetInstanceId = damage.target.instanceId
        const target = state.cards.find(
          (card) => card.instanceId === targetInstanceId,
        )
        if (!target || !isPresentPermanent(target)) continue
        if (
          damage.target.kind === 'PLANESWALKER' &&
          !/\bplaneswalker\b/i.test(effectiveTypeLine(state, target))
        )
          continue
        const source = damage.sourceInstanceId
          ? state.cards.find(
              (card) => card.instanceId === damage.sourceInstanceId,
            )
          : undefined
        if (isProtectedFromSource(state, target, source)) continue
        if (preventedDamageAmountForPermanent(state, target) === Infinity)
          continue
        let amount = damage.amount
        preventionEffects = preventionEffects.flatMap((effect) => {
          if (amount <= 0 || effect.targetInstanceId !== target.instanceId)
            return [effect]
          if (effect.preventAll) {
            amount = 0
            return [effect]
          }
          const available = effect.remainingAmount ?? 0
          if (available <= 0) return []
          const prevented = Math.min(available, amount)
          amount -= prevented
          const remainingAmount = available - prevented
          return remainingAmount > 0 ? [{ ...effect, remainingAmount }] : []
        })
        if (amount > 0) effectiveDamages.push({ ...damage, amount })
      }
      const cards = state.cards.map((card) => {
        const creatureDamages = effectiveDamages.filter(
          (damage) =>
            damage.target.kind === 'CREATURE' &&
            damage.target.instanceId === card.instanceId,
        )
        const planeswalkerDamage = effectiveDamages
          .filter(
            (damage) =>
              damage.target.kind === 'PLANESWALKER' &&
              damage.target.instanceId === card.instanceId,
          )
          .reduce((sum, damage) => sum + damage.amount, 0)
        const total = creatureDamages.reduce(
          (sum, damage) => sum + damage.amount,
          0,
        )
        const deathtouch = creatureDamages.some(
          (damage) => damage.hasDeathtouch && damage.amount > 0,
        )
        if (!total && !deathtouch && !planeswalkerDamage) return card
        return {
          ...card,
          ...(total || deathtouch
            ? {
                damageMarked: (card.damageMarked ?? 0) + total,
                deathtouchDamageMarked:
                  card.deathtouchDamageMarked || deathtouch,
              }
            : {}),
          ...(planeswalkerDamage
            ? {
                counters: {
                  ...card.counters,
                  [LOYALTY_COUNTER]: Math.max(
                    0,
                    (card.counters[LOYALTY_COUNTER] ?? 0) - planeswalkerDamage,
                  ),
                },
              }
            : {}),
        }
      })
      const damageByPlayer = new Map<string, number>()
      for (const damage of effectiveDamages) {
        const playerId = targetPlayerId(damage)
        if (!playerId) continue
        damageByPlayer.set(
          playerId,
          (damageByPlayer.get(playerId) ?? 0) + damage.amount,
        )
      }
      const lifelinkByPlayer = new Map<string, number>()
      for (const damage of effectiveDamages) {
        const source = damage.sourceInstanceId
          ? state.cards.find(
              (card) => card.instanceId === damage.sourceInstanceId,
            )
          : undefined
        if (!source || !hasEffectiveKeyword(state, source, 'LIFELINK')) continue
        const playerId =
          source.controllerId ??
          (source.controller === 'OPPONENT' ? firstOpponentId : localId)
        if (!playerId) continue
        lifelinkByPlayer.set(
          playerId,
          (lifelinkByPlayer.get(playerId) ?? 0) + damage.amount,
        )
      }
      let nextState: GameState = {
        ...state,
        cards,
        damagePreventionEffects: preventionEffects,
      }
      const affected = new Set([
        ...damageByPlayer.keys(),
        ...lifelinkByPlayer.keys(),
      ])
      for (const playerId of affected) {
        const rawLoss = damageByPlayer.get(playerId) ?? 0
        const rawGain = lifelinkByPlayer.get(playerId) ?? 0
        const frozen = playerRuleActive(
          state,
          playerId,
          'lifeTotalCannotChange',
        )
        const loss =
          frozen || playerRuleActive(state, playerId, 'cannotLoseLife')
            ? 0
            : rawLoss
        const gain = frozen ? 0 : rawGain
        nextState = updatePlayer(nextState, playerId, (player) => ({
          ...player,
          life: player.life - loss + gain,
        }))
      }
      const commanderDamageByPlayer = effectiveDamages.reduce(
        (current, damage) => {
          const source = damage.sourceInstanceId
            ? state.cards.find(
                (card) => card.instanceId === damage.sourceInstanceId,
              )
            : undefined
          if (
            !source ||
            !isCommanderInstance(state, source.instanceId) ||
            damage.damageKind !== 'COMBAT' ||
            damage.target.kind !== 'PLAYER'
          )
            return current
          return {
            ...current,
            [damage.target.player]: {
              ...current[damage.target.player],
              [source.instanceId]:
                (current[damage.target.player][source.instanceId] ?? 0) +
                damage.amount,
            },
          }
        },
        state.commanderDamageByPlayer,
      )
      const commanderDamage = effectiveDamages.reduce((current, damage) => {
        const source = damage.sourceInstanceId
          ? state.cards.find(
              (card) => card.instanceId === damage.sourceInstanceId,
            )
          : undefined
        if (
          !source ||
          !isCommanderInstance(state, source.instanceId) ||
          damage.damageKind !== 'COMBAT' ||
          damage.target.kind !== 'PLAYER' ||
          targetPlayerId(damage) !== localId
        )
          return current
        return {
          ...current,
          [source.instanceId]:
            (current[source.instanceId] ?? 0) + damage.amount,
        }
      }, state.commanderDamageReceivedBySource)
      return record({
        ...nextState,
        commanderDamageReceivedBySource: commanderDamage,
        commanderDamageByPlayer,
        damageRecords: [...state.damageRecords, ...effectiveDamages],
      })
    }
    case 'START_TURN':
    case 'NEXT_TURN': {
      const nextActivePlayerId =
        action.type === 'NEXT_TURN'
          ? nextTurnPlayerId(state)
          : activePlayerIdOf(state)
      const consumesExtra =
        action.type === 'NEXT_TURN' && (state.extraTurnQueue?.length ?? 0) > 0
      const phaseIn = phaseInForUntapStep(state, nextActivePlayerId)
      const stateAfterPhasing: GameState = {
        ...state,
        cards: phaseIn.cards,
      }
      const localId = localPlayerIdOf(stateAfterPhasing)
      const resetPlayers = stateAfterPhasing.players.map((player) => ({
        ...player,
        manaPool: emptyManaPool(),
        ...(player.id === nextActivePlayerId
          ? { landPlaysUsedThisTurn: 0 }
          : {}),
      }))
      const local = resetPlayers.find((player) => player.id === localId)
      const firstOpponent = resetPlayers.find((player) => player.id !== localId)
      const pendingCombatSkips = state.pendingCombatPhaseSkipsByPlayer ?? {}
      const combatSkipsForActive = pendingCombatSkips[nextActivePlayerId] ?? 0
      const nextPendingCombatSkips = { ...pendingCombatSkips }
      if (combatSkipsForActive > 1)
        nextPendingCombatSkips[nextActivePlayerId] = combatSkipsForActive - 1
      else delete nextPendingCombatSkips[nextActivePlayerId]
      return record({
        ...stateAfterPhasing,
        players: resetPlayers,
        playerState: local ?? state.playerState,
        activePlayerId: nextActivePlayerId,
        activePlayer: nextActivePlayerId === localId ? 'local' : 'opponent',
        turn: action.type === 'NEXT_TURN' ? state.turn + 1 : state.turn,
        restrictedMana: [],
        playerRuleEffects: (state.playerRuleEffects ?? []).filter(
          (effect) =>
            effect.duration !== 'UNTIL_PLAYER_NEXT_TURN' ||
            effect.playerId !== nextActivePlayerId ||
            effect.createdTurn >=
              (action.type === 'NEXT_TURN' ? state.turn + 1 : state.turn),
        ),
        extraTurnsQueued: consumesExtra
          ? Math.max(0, (state.extraTurnsQueued ?? 0) - 1)
          : (state.extraTurnsQueued ?? 0),
        extraTurnQueue: consumesExtra
          ? (state.extraTurnQueue ?? []).slice(1)
          : (state.extraTurnQueue ?? []),
        spellsCastThisTurn: 0,
        spellsCastThisTurnByPlayer: Object.fromEntries(
          resetPlayers.map((player) => [player.id, 0]),
        ),
        spellCastHistoryThisTurn: [],
        cardsDrawnThisTurnByPlayer: Object.fromEntries(
          resetPlayers.map((player) => [player.id, 0]),
        ),
        permanentsEnteredThisTurn: [],
        creaturesAttackedThisTurnByPlayer: {},
        triggeredAbilityTurnMarkers: {},
        turnState: turnStateFor('UNTAP'),
        manaPool: local?.manaPool ?? state.manaPool,
        landPlaysUsedThisTurn:
          local?.landPlaysUsedThisTurn ?? state.landPlaysUsedThisTurn,
        opponentLife: firstOpponent?.life ?? state.opponentLife,
        failedDrawFromEmptyLibrary: false,
        pendingCombatPhaseSkipsByPlayer: nextPendingCombatSkips,
        skipCombatPhasesThisTurnForPlayerId:
          combatSkipsForActive > 0 ? nextActivePlayerId : undefined,
        temporaryProtectionEffects: (
          state.temporaryProtectionEffects ?? []
        ).filter(
          (effect) =>
            effect.duration !== 'UNTIL_SOURCE_CONTROLLER_NEXT_TURN' ||
            effect.expiresAtPlayerId !== nextActivePlayerId,
        ),
        cards: stateAfterPhasing.cards.map((card) => {
          if (card.zone !== 'battlefield' || card.phasedOut) return card
          const cardControllerId =
            card.controllerId ??
            (card.controller === 'OPPONENT' ? 'player-2' : localId)
          const normalUntap = cardControllerId === nextActivePlayerId
          const extraUntap =
            cardControllerId !== nextActivePlayerId &&
            untapsDuringOtherPlayersUntap(stateAfterPhasing, card)
          if (!normalUntap && !extraUntap) return card
          if (
            normalUntap &&
            cannotUntapDuringControllersUntapStep(stateAfterPhasing, card)
          )
            return card
          return attemptUntap(stateAfterPhasing, card)
        }),
      })
    }
    case 'ADVANCE_STEP': {
      let next = nextStep(state.turnState.step)
      if (!next) return applyGameAction(state, { type: 'NEXT_TURN' }, metadata)
      if (
        next === 'BEGIN_COMBAT' &&
        state.skipCombatPhasesThisTurnForPlayerId === activePlayerIdOf(state)
      )
        next = 'MAIN_2'
      if (
        state.turnState.step === 'DECLARE_ATTACKERS' &&
        next === 'DECLARE_BLOCKERS' &&
        state.combatState.active &&
        state.combatState.attackers.length === 0
      )
        next = 'END_COMBAT'
      const nextTurnState = turnStateFor(next)
      const clearedPlayers = state.players.map((player) => ({
        ...player,
        manaPool: emptyManaPool(),
      }))
      const local = clearedPlayers.find(
        (player) => player.id === localPlayerIdOf(state),
      )
      const base: GameState = {
        ...state,
        players: clearedPlayers,
        ...(local ? { playerState: local } : {}),
        turnState: nextTurnState,
        manaPool: emptyManaPool(),
        restrictedMana: [],
      }
      if (next === 'BEGIN_COMBAT')
        return record({
          ...base,
          combatState: {
            ...emptyCombatState(),
            combatId: `combat-${state.turn}`,
            active: true,
            attackingPlayerId:
              activePlayerIdOf(base) === localPlayerIdOf(base)
                ? 'local'
                : 'opponent',
            attackingPlayerStableId: activePlayerIdOf(base),
          },
        })
      if (next === 'END_COMBAT')
        return record({ ...base, combatState: emptyCombatState() })
      if (next === 'CLEANUP')
        return record({
          ...base,
          combatState: emptyCombatState(),
          temporaryBlockingRestrictions: [],
          temporaryContinuousEffects: [],
          temporaryGrantedTriggeredAbilities: [],
          temporaryCharacteristicEffects: [],
          temporaryProtectionEffects: (
            base.temporaryProtectionEffects ?? []
          ).filter((effect) => effect.duration !== 'UNTIL_END_OF_TURN'),
          damagePreventionEffects: [],
          playerRuleEffects: (base.playerRuleEffects ?? []).filter(
            (effect) => effect.duration !== 'UNTIL_END_OF_TURN',
          ),
          attackRequirements: [],
          blockRequirements: [],
          typeContinuousEffects: (base.typeContinuousEffects ?? []).filter(
            (effect) => effect.duration !== 'UNTIL_END_OF_TURN',
          ),
          damageRecords: [],
          cards: base.cards.map((card) => ({
            ...card,
            damageMarked: 0,
            deathtouchDamageMarked: false,
          })),
        })
      if (next === 'DRAW')
        return record(drawOneUnknownCard(base, activePlayerIdOf(base)))
      return record(base)
    }
    case 'SET_GAME_STATUS':
      if (
        action.status !== 'IN_PROGRESS' &&
        playerRuleActive(state, localPlayerIdOf(state), 'cannotWinOrLose')
      )
        return state
      return record({
        ...state,
        gameStatus: action.status,
        ...(action.reason ? { gameLossReason: action.reason } : {}),
      })
    case 'REMOVE_CARD_INSTANCE':
      return target
        ? record(
            {
              ...state,
              cards: state.cards.filter(
                (card) => card.instanceId !== action.instanceId,
              ),
              temporaryGrantedTriggeredAbilities: (
                state.temporaryGrantedTriggeredAbilities ?? []
              ).filter(
                (effect) => effect.targetInstanceId !== action.instanceId,
              ),
            },
            target,
          )
        : state
    case 'CREATE_TOKEN':
      if (!Number.isSafeInteger(action.amount) || action.amount <= 0)
        return state
      return record({
        ...state,
        cards: [
          ...state.cards,
          ...createTokenInstances(action.token, action.amount, state.cards, {
            ...(action.controllerId
              ? { controllerId: action.controllerId }
              : {}),
            ...(action.ownerId ? { ownerId: action.ownerId } : {}),
            ...(action.tapped !== undefined ? { tapped: action.tapped } : {}),
            localPlayerId: state.localPlayerId ?? 'player-1',
          }).map((token) => ({ ...token, controlledSinceTurn: state.turn })),
        ],
      })
    case 'ACTIVATE_ABILITY':
      return target ? record(state, target) : state
    case 'DECLARE_PLAYER_SHUFFLED':
      return record(
        action.player === 'local'
          ? { ...state, knownLibraryTopInstanceId: undefined }
          : state,
      )
    case 'ADD_PENDING_ABILITIES':
      if (!action.pending.length) return state
      return record({
        ...state,
        pendingAbilities: [...state.pendingAbilities, ...action.pending],
      })
    case 'UPDATE_PENDING_ABILITY':
      if (
        !state.pendingAbilities.some(
          (pending) => pending.id === action.pending.id,
        )
      )
        return state
      return record({
        ...state,
        pendingAbilities: state.pendingAbilities.map((pending) =>
          pending.id === action.pending.id ? action.pending : pending,
        ),
      })
    case 'REMOVE_PENDING_ABILITY':
      if (
        !state.pendingAbilities.some(
          (pending) => pending.id === action.pendingId,
        )
      )
        return state
      return record({
        ...state,
        pendingAbilities: state.pendingAbilities.filter(
          (pending) => pending.id !== action.pendingId,
        ),
      })
    case 'ADD_PENDING_RESOLUTION':
      if (
        state.pendingResolutions.some(
          (resolution) => resolution.id === action.resolution.id,
        )
      )
        return state
      return record({
        ...state,
        pendingResolutions: [...state.pendingResolutions, action.resolution],
      })
    case 'UPDATE_PENDING_RESOLUTION':
      if (
        !state.pendingResolutions.some(
          (resolution) => resolution.id === action.resolution.id,
        )
      )
        return state
      return record({
        ...state,
        pendingResolutions: state.pendingResolutions.map((resolution) =>
          resolution.id === action.resolution.id
            ? action.resolution
            : resolution,
        ),
      })
    case 'REMOVE_PENDING_RESOLUTION':
      if (
        !state.pendingResolutions.some(
          (resolution) => resolution.id === action.resolutionId,
        )
      )
        return state
      return record({
        ...state,
        pendingResolutions: state.pendingResolutions.filter(
          (resolution) => resolution.id !== action.resolutionId,
        ),
      })
    case 'ADD_PENDING_DECISION':
      if (
        state.pendingDecisions.some(
          (decision) => decision.id === action.decision.id,
        )
      )
        return state
      return record({
        ...state,
        pendingDecisions: [...state.pendingDecisions, action.decision],
      })
    case 'REMOVE_PENDING_DECISION':
      if (
        !state.pendingDecisions.some(
          (decision) => decision.id === action.decisionId,
        )
      )
        return state
      return record({
        ...state,
        pendingDecisions: state.pendingDecisions.filter(
          (decision) => decision.id !== action.decisionId,
        ),
      })
    case 'ADD_DELAYED_EFFECT':
      if (
        (state.delayedEffects ?? []).some(
          (effect) => effect.id === action.delayedEffect.id,
        )
      )
        return state
      return record({
        ...state,
        delayedEffects: [...(state.delayedEffects ?? []), action.delayedEffect],
      })
    case 'REMOVE_DELAYED_EFFECT':
      if (
        !(state.delayedEffects ?? []).some(
          (effect) => effect.id === action.delayedEffectId,
        )
      )
        return state
      return record({
        ...state,
        delayedEffects: (state.delayedEffects ?? []).filter(
          (effect) => effect.id !== action.delayedEffectId,
        ),
      })
    case 'ADD_MANA':
      return action.amount > 0
        ? record(
            updatePlayer(
              state,
              action.actorPlayerId ?? activePlayerIdOf(state),
              (player) => ({
                ...player,
                manaPool: {
                  ...player.manaPool,
                  [action.color]: player.manaPool[action.color] + action.amount,
                },
              }),
            ),
          )
        : state
    case 'SPEND_MANA': {
      const actorPlayerId = action.actorPlayerId ?? activePlayerIdOf(state)
      const unrestricted =
        playerManaPool(state, actorPlayerId)[action.color] -
        restrictedManaAmount(state, actorPlayerId, action.color)
      return action.amount > 0 && unrestricted >= action.amount
        ? record(
            updatePlayer(state, actorPlayerId, (player) => ({
              ...player,
              manaPool: {
                ...player.manaPool,
                [action.color]: Math.max(
                  0,
                  player.manaPool[action.color] - action.amount,
                ),
              },
            })),
          )
        : state
    }
    case 'GAIN_LIFE':
      return action.amount > 0 &&
        !playerRuleActive(
          state,
          action.actorPlayerId ?? activePlayerIdOf(state),
          'lifeTotalCannotChange',
        )
        ? record(
            updatePlayer(
              state,
              action.actorPlayerId ?? activePlayerIdOf(state),
              (player) => ({
                ...player,
                life: player.life + action.amount,
              }),
            ),
          )
        : state
    case 'LOSE_LIFE':
      return action.amount > 0 &&
        !playerRuleActive(
          state,
          action.actorPlayerId ?? activePlayerIdOf(state),
          'lifeTotalCannotChange',
        ) &&
        !playerRuleActive(
          state,
          action.actorPlayerId ?? activePlayerIdOf(state),
          'cannotLoseLife',
        )
        ? record(
            updatePlayer(
              state,
              action.actorPlayerId ?? activePlayerIdOf(state),
              (player) => ({
                ...player,
                life: player.life - action.amount,
              }),
            ),
          )
        : state
    case 'SET_LIFE': {
      const playerId = action.actorPlayerId ?? activePlayerIdOf(state)
      if (playerRuleActive(state, playerId, 'lifeTotalCannotChange'))
        return state
      const next = updatePlayer(state, playerId, (player) => ({
        ...player,
        life: action.amount,
      }))
      return record({
        ...next,
        ...(action.amount > 0 &&
        state.gameLossReason === 'LIFE' &&
        ((playerId === localPlayerIdOf(state) && state.gameStatus === 'LOST') ||
          (playerId !== localPlayerIdOf(state) && state.gameStatus === 'WON'))
          ? { gameStatus: 'IN_PROGRESS' as const, gameLossReason: undefined }
          : {}),
      })
    }
    case 'SET_HAND_COUNT': {
      const playerId =
        action.playerId ?? action.actorPlayerId ?? activePlayerIdOf(state)
      return Number.isSafeInteger(action.count) && action.count >= 0
        ? record(
            updatePlayer(state, playerId, (player) => ({
              ...player,
              handCount: action.count,
              hiddenZoneTracking: 'COUNTS_ONLY',
            })),
          )
        : state
    }
    case 'SET_LIBRARY_COUNT': {
      if (!Number.isSafeInteger(action.count) || action.count < 0) return state
      const playerId = action.actorPlayerId ?? activePlayerIdOf(state)
      const next = updatePlayer(state, playerId, (player) => ({
        ...player,
        libraryCount: action.count,
        hiddenZoneTracking: 'COUNTS_ONLY',
      }))
      return record({
        ...next,
        ...(action.count > 0
          ? {
              failedDrawFromEmptyLibraryByPlayer: {
                ...(next.failedDrawFromEmptyLibraryByPlayer ?? {}),
                [playerId]: false,
              },
              ...(playerId === localPlayerIdOf(state)
                ? { failedDrawFromEmptyLibrary: false }
                : {}),
            }
          : {}),
        ...(action.count > 0 &&
        state.gameLossReason === 'EMPTY_LIBRARY' &&
        ((playerId === localPlayerIdOf(state) && state.gameStatus === 'LOST') ||
          (playerId !== localPlayerIdOf(state) && state.gameStatus === 'WON'))
          ? { gameStatus: 'IN_PROGRESS' as const, gameLossReason: undefined }
          : {}),
      })
    }
    case 'SET_HIDDEN_ZONE_TRACKING':
      return record(
        updatePlayer(
          { ...state, hiddenZoneTracking: action.tracking },
          localPlayerIdOf(state),
          (player) => ({ ...player, hiddenZoneTracking: action.tracking }),
        ),
      )
    case 'MOVE_UNKNOWN_HIDDEN_CARDS': {
      if (!Number.isSafeInteger(action.count) || action.count < 0) return state
      if (state.hiddenZoneTracking === 'UNTRACKED') return record(state)
      const fromAvailable =
        action.fromZone === 'library' ? state.libraryCount : state.handCount
      if (fromAvailable < action.count) return state
      const libraryDelta =
        (action.fromZone === 'library' ? -action.count : 0) +
        (action.toZone === 'library' ? action.count : 0)
      const handDelta =
        (action.fromZone === 'hand' ? -action.count : 0) +
        (action.toZone === 'hand' ? action.count : 0)
      return record(
        updatePlayer(
          {
            ...state,
            libraryCount: state.libraryCount + libraryDelta,
            handCount: state.handCount + handDelta,
          },
          localPlayerIdOf(state),
          (player) => ({
            ...player,
            libraryCount:
              (player.libraryCount ?? state.libraryCount) + libraryDelta,
            handCount: (player.handCount ?? state.handCount) + handDelta,
          }),
        ),
      )
    }
    case 'SET_KNOWN_LIBRARY_TOP':
      return action.instanceId === undefined ||
        state.cards.some(
          (card) =>
            card.instanceId === action.instanceId && card.zone === 'library',
        )
        ? record({ ...state, knownLibraryTopInstanceId: action.instanceId })
        : state
    case 'SET_MAX_HAND_SIZE_OVERRIDE':
      return action.value === undefined ||
        action.value === 'UNLIMITED' ||
        (Number.isSafeInteger(action.value) && action.value >= 0)
        ? record(
            updatePlayer(
              { ...state, maxHandSizeOverride: action.value },
              localPlayerIdOf(state),
              (player) => ({ ...player, maxHandSizeOverride: action.value }),
            ),
          )
        : state
    case 'ADD_COUNTER':
      return !target || action.amount <= 0
        ? state
        : record(
            updateCard(state, action.instanceId, (card) => ({
              ...card,
              counters: {
                ...card.counters,
                [action.counter]:
                  (card.counters[action.counter] ?? 0) + action.amount,
              },
            })),
            target,
          )
    case 'REMOVE_COUNTER':
      return !target || action.amount <= 0
        ? state
        : record(
            updateCard(state, action.instanceId, (card) => ({
              ...card,
              counters: {
                ...card.counters,
                [action.counter]: Math.max(
                  0,
                  (card.counters[action.counter] ?? 0) - action.amount,
                ),
              },
            })),
            target,
          )
    case 'MOVE_COUNTERS': {
      const from = state.cards.find(
        (card) => card.instanceId === action.fromInstanceId,
      )
      const to = state.cards.find(
        (card) => card.instanceId === action.toInstanceId,
      )
      if (
        !from ||
        !to ||
        from.instanceId === to.instanceId ||
        from.zone !== 'battlefield' ||
        to.zone !== 'battlefield'
      )
        return state
      if (
        action.moves.some(
          (move) =>
            move.amount <= 0 ||
            !Number.isSafeInteger(move.amount) ||
            (from.counters[move.counter] ?? 0) < move.amount,
        )
      )
        return state
      const fromCounters = { ...from.counters }
      const toCounters = { ...to.counters }
      for (const move of action.moves) {
        fromCounters[move.counter] =
          (fromCounters[move.counter] ?? 0) - move.amount
        toCounters[move.counter] = (toCounters[move.counter] ?? 0) + move.amount
      }
      return record({
        ...state,
        cards: state.cards.map((card) =>
          card.instanceId === from.instanceId
            ? { ...card, counters: fromCounters }
            : card.instanceId === to.instanceId
              ? { ...card, counters: toCounters }
              : card,
        ),
      })
    }
    case 'DISTRIBUTE_COUNTERS': {
      if (
        !action.counter ||
        !action.allocations.length ||
        action.allocations.some(
          (allocation) =>
            allocation.amount <= 0 || !Number.isSafeInteger(allocation.amount),
        )
      )
        return state
      const totals = new Map<string, number>()
      for (const allocation of action.allocations)
        totals.set(
          allocation.instanceId,
          (totals.get(allocation.instanceId) ?? 0) + allocation.amount,
        )
      if (
        [...totals.keys()].some(
          (instanceId) =>
            !state.cards.some(
              (card) =>
                card.instanceId === instanceId && card.zone === 'battlefield',
            ),
        )
      )
        return state
      return record({
        ...state,
        cards: state.cards.map((card) => {
          const amount = totals.get(card.instanceId)
          return amount
            ? {
                ...card,
                counters: {
                  ...card.counters,
                  [action.counter]:
                    (card.counters[action.counter] ?? 0) + amount,
                },
              }
            : card
        }),
      })
    }
    case 'DRAW_CARD': {
      const playerId =
        action.playerId ?? action.actorPlayerId ?? activePlayerIdOf(state)
      const next = drawOneUnknownCard(state, playerId)
      if (next === state) return state
      const knownDrawn =
        playerId === localPlayerIdOf(state) && state.knownLibraryTopInstanceId
          ? state.cards.find(
              (card) => card.instanceId === state.knownLibraryTopInstanceId,
            )
          : undefined
      return record(next, knownDrawn)
    }
    case 'UNTAP_ALL': {
      const actorPlayerId = action.actorPlayerId ?? activePlayerIdOf(state)
      return record({
        ...state,
        cards: state.cards.map((card) =>
          (card.controllerId ?? localPlayerIdOf(state)) === actorPlayerId
            ? attemptUntap(state, card)
            : card,
        ),
      })
    }
  }
}
