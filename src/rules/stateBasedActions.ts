import { isPresentPermanent } from './phasing/phasingRules'
import type { GameAction } from '../actions/gameActions'
import {
  modifiedPowerToughness,
  hasEffectiveKeyword,
  effectiveCardName,
  effectiveTypeLine,
} from '../abilities/engine/staticEffects'
import { deriveActiveStaticEffects } from '../abilities/engine/staticEffects'
import type { PendingDecision } from '../abilities/types/abilityTypes'
import type { GameState } from '../types/game'
import { commanderInstanceIds } from './commander/commanderRules'
import { localPlayerIdOf, opponentPlayerIds, playerStateFor } from './players/playerState'
import {
  attachmentTargetIsLegal,
  isAura,
  isEquipment,
} from './attachments/attachmentRules'
import {
  isPlaneswalkerPermanent,
  loyaltyOf,
} from './planeswalker/planeswalkerRules'

export type StateBasedActionResult = {
  actions: GameAction[]
  decision?: PendingDecision
}

const isLegendary = (typeLine: string): boolean =>
  /\blegendary\b/i.test(typeLine)

/** Returns the next simultaneous, objective SBA batch; callers repeat until stable. */
export const checkStateBasedActions = (
  state: GameState,
): StateBasedActionResult => {
  const localPlayerId = localPlayerIdOf(state)
  const playerIds = state.players?.length
    ? state.players.map((player) => player.id)
    : [localPlayerId, ...opponentPlayerIds(state, localPlayerId)]
  const cannotWinOrLose = (playerId: string) =>
    (state.playerRuleEffects ?? []).some(
      (effect) => effect.playerId === playerId && effect.cannotWinOrLose,
    )
  const hasLost = (playerId: string) => {
    if (cannotWinOrLose(playerId)) return undefined
    const player = playerStateFor(state, playerId)
    const life = player?.life ?? (playerId === localPlayerId ? state.life : state.opponentLife)
    const failedDraw =
      state.failedDrawFromEmptyLibraryByPlayer?.[playerId] === true ||
      (playerId === localPlayerId && state.failedDrawFromEmptyLibrary)
    const damageBucket = playerId === localPlayerId ? 'local' : 'opponent'
    const commanderDamage = Object.values(
      state.commanderDamageByPlayer[damageBucket],
    ).some((damage) => damage >= 21)
    if (life <= 0) return 'LIFE' as const
    if (failedDraw) return 'EMPTY_LIBRARY' as const
    if (commanderDamage) return 'COMMANDER_DAMAGE' as const
    return undefined
  }
  if (state.gameStatus === 'IN_PROGRESS') {
    const localReason = hasLost(localPlayerId)
    if (localReason)
      return { actions: [{ type: 'SET_GAME_STATUS', status: 'LOST', reason: localReason }] }
    const opponentReason = playerIds
      .filter((playerId) => playerId !== localPlayerId)
      .map((playerId) => hasLost(playerId))
      .find((reason): reason is NonNullable<typeof reason> => Boolean(reason))
    if (opponentReason)
      return { actions: [{ type: 'SET_GAME_STATUS', status: 'WON', reason: opponentReason }] }
  }

  const staticEffects = deriveActiveStaticEffects(state)
  const moveToGraveyard = new Set<string>()
  const removeInstanceIds: string[] = []
  const detachInstanceIds: string[] = []
  const counterRemovals: Array<{
    instanceId: string
    counter: string
    amount: number
  }> = []

  for (const card of state.cards) {
    if (card.isToken && card.zone !== 'battlefield') {
      removeInstanceIds.push(card.instanceId)
      continue
    }
    if (!isPresentPermanent(card)) continue

    if (isAura(card)) {
      const attachedTo = card.attachedToInstanceId
        ? state.cards.find(
            (candidate) => candidate.instanceId === card.attachedToInstanceId,
          )
        : undefined
      if (!attachedTo || !attachmentTargetIsLegal(state, card, attachedTo))
        moveToGraveyard.add(card.instanceId)
    } else if (isEquipment(card) && card.attachedToInstanceId) {
      const attachedTo = state.cards.find(
        (candidate) => candidate.instanceId === card.attachedToInstanceId,
      )
      if (!attachedTo || !attachmentTargetIsLegal(state, card, attachedTo))
        detachInstanceIds.push(card.instanceId)
    }

    if (isPlaneswalkerPermanent(state, card) && loyaltyOf(card) <= 0)
      moveToGraveyard.add(card.instanceId)

    if (/\bcreature\b/i.test(effectiveTypeLine(state, card))) {
      const values = modifiedPowerToughness(card, staticEffects)
      if (values?.toughness !== undefined && values.toughness <= 0)
        moveToGraveyard.add(card.instanceId)
      else if (
        values &&
        !hasEffectiveKeyword(state, card, 'INDESTRUCTIBLE') &&
        ((card.damageMarked ?? 0) >= values.toughness ||
          card.deathtouchDamageMarked === true)
      )
        moveToGraveyard.add(card.instanceId)
    }

    const plus = card.counters['+1/+1'] ?? 0
    const minus = card.counters['-1/-1'] ?? 0
    const pairs = Math.min(plus, minus)
    if (pairs > 0) {
      counterRemovals.push(
        {
          instanceId: card.instanceId,
          counter: '+1/+1',
          amount: pairs,
        },
        {
          instanceId: card.instanceId,
          counter: '-1/-1',
          amount: pairs,
        },
      )
    }
  }

  if (
    moveToGraveyard.size ||
    removeInstanceIds.length ||
    detachInstanceIds.length ||
    counterRemovals.length
  )
    return {
      actions: [
        {
          type: 'APPLY_STATE_BASED_ACTIONS',
          moves: [...moveToGraveyard].map((instanceId) => ({
            instanceId,
            toZone: 'graveyard' as const,
          })),
          removeInstanceIds,
          detachInstanceIds,
          counterRemovals,
        },
      ],
    }

  const legends = new Map<string, typeof state.cards>()
  state.cards
    .filter(
      (card) =>
        isPresentPermanent(card) &&
        isLegendary(effectiveTypeLine(state, card)),
    )
    .forEach((card) => {
      const key = `${card.controller ?? 'YOU'}:${effectiveCardName(state, card)}`
      legends.set(key, [...(legends.get(key) ?? []), card])
    })
  const duplicateLegends = [...legends.values()].find(
    (cards) => cards.length > 1,
  )
  if (duplicateLegends) {
    const decisionId = `legend-${duplicateLegends.map((card) => card.instanceId).join('-')}`
    if (!state.pendingDecisions.some((decision) => decision.id === decisionId))
      return {
        actions: [],
        decision: {
          id: decisionId,
          sourceAbilityId: 'legend-rule',
          sourceInstanceId: duplicateLegends[0].instanceId,
          type: 'LEGEND_RULE_SELECTION',
          prompt: `Choose one ${effectiveCardName(state, duplicateLegends[0])} to keep.`,
          options: duplicateLegends.map((card) => ({
            instanceId: card.instanceId,
            label: card.card.name,
          })),
          continuation: {
            effectsToExecute: [],
            resumeEffectIndex: 0,
            legendRule: {
              keepOptions: duplicateLegends.map((card) => card.instanceId),
              moveToGraveyard: duplicateLegends.map((card) => card.instanceId),
            },
          },
          decisionPlayerId: duplicateLegends[0].controllerId ?? localPlayerId,
        },
      }
  }

  const commander = commanderInstanceIds(state)
    .map((instanceId) => state.cards.find((card) => card.instanceId === instanceId))
    .find(
      (card) =>
        card &&
        (card.zone === 'graveyard' || card.zone === 'exile') &&
        !state.commanderZoneChoiceAcknowledged.some(
          (entry) => entry.instanceId === card.instanceId && entry.zone === card.zone,
        ),
    )
  if (
    commander &&
    (commander.zone === 'graveyard' || commander.zone === 'exile') &&
    !state.commanderZoneChoiceAcknowledged.some(
      (entry) =>
        entry.instanceId === commander.instanceId &&
        entry.zone === commander.zone,
    )
  ) {
    const decisionId = `commander-zone-${commander.instanceId}-${commander.zone}`
    if (!state.pendingDecisions.some((decision) => decision.id === decisionId))
      return {
        actions: [],
        decision: {
          id: decisionId,
          sourceAbilityId: 'commander-zone-choice',
          sourceInstanceId: commander.instanceId,
          type: 'COMMANDER_ZONE_CHOICE',
          prompt: `Move commander to command zone instead of keeping it in ${commander.zone}?`,
          options: [
            {
              instanceId: 'KEEP_IN_CURRENT_ZONE',
              label: 'Keep in current zone',
            },
            {
              instanceId: 'MOVE_TO_COMMAND_ZONE',
              label: 'Move to command zone',
            },
          ],
          continuation: {
            effectsToExecute: [],
            resumeEffectIndex: 0,
            commanderZone: {
              instanceId: commander.instanceId,
              currentZone: commander.zone,
            },
          },
          decisionPlayerId:
            commander.ownerId ?? commander.controllerId ?? localPlayerId,
        },
      }
  }
  return { actions: [] }
}
