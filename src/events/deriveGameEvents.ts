import type { GameAction } from '../actions/gameActions'
import { countBlueManaSymbols } from '../abilities/engine/manaSymbols'
import type { GameState } from '../types/game'
import type { GameEvent } from './gameEvents'
import { effectiveCardDefinition } from '../rules/copy/copyCharacteristics'
import { isCommanderInstance } from '../rules/commander/commanderRules'

const cardTypes = new Set([
  'artifact',
  'battle',
  'creature',
  'enchantment',
  'instant',
  'kindred',
  'land',
  'planeswalker',
  'sorcery',
  'legendary',
  'basic',
])

const typeDetails = (
  typeLine: string,
): { cardTypes: string[]; subtypes: string[] } => {
  const [beforeSubtype, afterSubtype = ''] = typeLine.split(/\s+[—-]\s+/)
  return {
    cardTypes: beforeSubtype
      .split(/\s+/)
      .filter((word) => cardTypes.has(word.toLocaleLowerCase())),
    subtypes: afterSubtype.split(/\s+/).filter(Boolean),
  }
}

/** Derives deterministic domain events from an already-applied action. */
export const deriveGameEvents = (
  previousState: GameState,
  action: GameAction,
  nextState: GameState,
): GameEvent[] => {
  const events: GameEvent[] = []
  if (action.type === 'NEXT_TURN' || action.type === 'START_TURN') {
    const activePlayerId = nextState.activePlayerId ?? nextState.localPlayerId
    events.push({
      type: 'TURN_STARTED',
      turn: nextState.turn,
      phase: nextState.turnState.phase,
      step: nextState.turnState.step,
      activePlayerId,
    })
  }
  if (action.type === 'ADVANCE_STEP') {
    const { turnState } = nextState
    events.push({
      type: 'STEP_STARTED',
      turn: nextState.turn,
      phase: turnState.phase,
      step: turnState.step,
      activePlayerId: nextState.activePlayerId ?? nextState.localPlayerId,
    })
    const eventType =
      turnState.step === 'UPKEEP'
        ? 'UPKEEP_STARTED'
        : turnState.step === 'DRAW'
          ? 'DRAW_STEP_STARTED'
          : turnState.step === 'MAIN_1' || turnState.step === 'MAIN_2'
            ? 'MAIN_PHASE_STARTED'
            : turnState.step === 'END_STEP'
              ? 'END_STEP_STARTED'
              : turnState.step === 'CLEANUP'
                ? 'TURN_ENDED'
                : undefined
    if (eventType)
      events.push({
        type: eventType,
        turn: nextState.turn,
        phase: turnState.phase,
        step: turnState.step,
        activePlayerId: nextState.activePlayerId ?? nextState.localPlayerId,
      })
    if (turnState.step === 'BEGIN_COMBAT')
      events.push({
        type: 'COMBAT_STARTED',
        combatId: nextState.combatState.combatId,
        activePlayerId: nextState.activePlayerId ?? nextState.localPlayerId,
      })
  }
  if (action.type === 'TRANSFORM_CARD') {
    const before = previousState.cards.find(
      (card) => card.instanceId === action.instanceId,
    )
    const after = nextState.cards.find(
      (card) => card.instanceId === action.instanceId,
    )
    if (before && after && before.currentFaceIndex !== after.currentFaceIndex)
      events.push({
        type: 'PERMANENT_TRANSFORMED',
        cardInstanceId: after.instanceId,
        fromFaceName: effectiveCardDefinition(previousState, before).name,
        toFaceName: effectiveCardDefinition(nextState, after).name,
        playerId: after.controllerId ?? nextState.localPlayerId,
      })
  }
  const drawPlayerIds = new Set([
    ...Object.keys(previousState.cardsDrawnThisTurnByPlayer ?? {}),
    ...Object.keys(nextState.cardsDrawnThisTurnByPlayer ?? {}),
  ])
  for (const playerId of drawPlayerIds) {
    const before = previousState.cardsDrawnThisTurnByPlayer?.[playerId] ?? 0
    const after = nextState.cardsDrawnThisTurnByPlayer?.[playerId] ?? 0
    for (let draw = before; draw < after; draw += 1)
      events.push({
        type: 'CARD_DRAWN',
        knownIdentity: false,
        playerId,
        controller:
          playerId !== nextState.localPlayerId ? 'OPPONENT' : 'YOU',
      })
  }
  if (action.type === 'BEGIN_COMBAT')
    events.push({
      type: 'COMBAT_STARTED',
      combatId: nextState.combatState.combatId,
      activePlayerId: nextState.activePlayerId ?? nextState.localPlayerId,
    })
  if (action.type === 'DECLARE_ATTACKERS') {
    const attackerInstanceIds = action.attackers.map(
      (attacker) => attacker.attackerInstanceId,
    )
    const attackingPlayerId =
      nextState.combatState.attackingPlayerStableId ??
      action.attackers
        .map((attacker) =>
          nextState.cards.find(
            (card) => card.instanceId === attacker.attackerInstanceId,
          ),
        )
        .find(Boolean)?.controllerId
    events.push({
      type: 'ATTACKERS_DECLARED',
      attackerInstanceIds,
      eventGroupId: action.eventGroupId,
      ...(attackingPlayerId ? { playerId: attackingPlayerId } : {}),
    })
    events.push({
      type: 'CREATURES_ATTACKED',
      attackerInstanceIds,
      eventGroupId: action.eventGroupId,
      ...(attackingPlayerId ? { playerId: attackingPlayerId } : {}),
    })
    action.attackers.forEach((attacker) => {
      const known = nextState.cards.find(
        (card) => card.instanceId === attacker.attackerInstanceId,
      )
      if (!known) return
      const effectiveKnown = effectiveCardDefinition(nextState, known)
      const attackDetails = typeDetails(effectiveKnown.typeLine)
      events.push({
        type: 'CREATURE_ATTACKED',
        cardInstanceId: known.instanceId,
        cardName: effectiveKnown.name,
        eventGroupId: action.eventGroupId,
        controller: known.controller ?? 'YOU',
        playerId: known.controllerId ?? nextState.localPlayerId,
        cardTypes: attackDetails.cardTypes,
        subtypes: attackDetails.subtypes,
        isToken: known.isToken === true,
      })
      const before = previousState.cards.find(
        (card) => card.instanceId === known.instanceId,
      )
      if (before && !before.tapped && known.tapped) {
        const details = typeDetails(effectiveKnown.typeLine)
        events.push({
          type: 'PERMANENT_BECAME_TAPPED',
          cardInstanceId: known.instanceId,
          cardName: effectiveKnown.name,
          controller: known.controller ?? 'YOU',
          playerId: known.controllerId ?? nextState.localPlayerId,
          cardTypes: details.cardTypes,
          subtypes: details.subtypes,
          isToken: known.isToken === true,
          sourceAction: 'TAP_CARD',
          eventGroupId: action.eventGroupId,
        })
      }
    })
  }
  if (action.type === 'DECLARE_BLOCKERS') {
    const blockingPlayerId = action.blockers
      .map((blocker) => nextState.cards.find((card) => card.instanceId === blocker.blockerInstanceId))
      .find(Boolean)?.controllerId
    const eventGroupId = nextState.combatState.combatId || `combat-${nextState.turn}`
    events.push({
      type: 'BLOCKERS_DECLARED',
      blockerInstanceIds: action.blockers.map((blocker) => blocker.blockerInstanceId),
      attackerInstanceIds: [...new Set(action.blockers.flatMap((blocker) => blocker.blocking))],
      eventGroupId,
      ...(blockingPlayerId ? { playerId: blockingPlayerId } : {}),
    })
    nextState.combatState.attackers.forEach((attacker) => {
      if (attacker.blockedBy.length) {
        const known = nextState.cards.find((card) => card.instanceId === attacker.attackerInstanceId)
        if (known) {
          const effectiveKnown = effectiveCardDefinition(nextState, known)
          const details = typeDetails(effectiveKnown.typeLine)
          events.push({
            type: 'CREATURE_BECAME_BLOCKED',
            cardInstanceId: known.instanceId,
            blockerInstanceIds: [...attacker.blockedBy],
            eventGroupId,
            controller: known.controller ?? 'YOU',
            playerId: known.controllerId ?? nextState.localPlayerId,
            cardTypes: details.cardTypes,
            subtypes: details.subtypes,
            isToken: known.isToken === true,
          })
        }
      }
    })
    action.blockers.forEach((blocker) => {
      const known = nextState.cards.find((card) => card.instanceId === blocker.blockerInstanceId)
      if (!known) return
      const effectiveKnown = effectiveCardDefinition(nextState, known)
      const details = typeDetails(effectiveKnown.typeLine)
      blocker.blocking.forEach((attackerInstanceId) =>
        events.push({
          type: 'CREATURE_BLOCKED',
          cardInstanceId: known.instanceId,
          attackerInstanceId,
          eventGroupId,
          controller: known.controller ?? 'YOU',
          playerId: known.controllerId ?? nextState.localPlayerId,
          cardTypes: details.cardTypes,
          subtypes: details.subtypes,
          isToken: known.isToken === true,
        }),
      )
    })
    nextState.combatState.attackers.forEach((attacker) => {
      if (attacker.blockedBy.length || attacker.externalBlockedBy.length) return
      const known = nextState.cards.find(
        (card) => card.instanceId === attacker.attackerInstanceId,
      )
      if (!known) return
      const effectiveKnown = effectiveCardDefinition(nextState, known)
      const details = typeDetails(effectiveKnown.typeLine)
      events.push({
        type: 'CREATURE_ATTACKED_UNBLOCKED',
        cardInstanceId: known.instanceId,
        cardName: effectiveKnown.name,
        eventGroupId:
          nextState.combatState.combatId || `combat-${nextState.turn}`,
        controller: known.controller ?? 'YOU',
        playerId: known.controllerId ?? nextState.localPlayerId,
        cardTypes: details.cardTypes,
        subtypes: details.subtypes,
        isToken: known.isToken === true,
      })
    })
  }
  if (action.type === 'DEAL_DAMAGE_BATCH' || action.type === 'DEAL_DAMAGE') {
    const damages = nextState.damageRecords.slice(previousState.damageRecords.length)
    damages.forEach((damage) => {
      const sourceCard = damage.sourceInstanceId
        ? previousState.cards.find(
            (card) => card.instanceId === damage.sourceInstanceId,
          )
        : undefined
      const sourcePlayerId =
        sourceCard?.controllerId ??
        (sourceCard?.controller === 'OPPONENT'
          ? previousState.turnOrder.find(
              (id) => id !== previousState.localPlayerId,
            )
          : previousState.localPlayerId)
      const targetPlayerId =
        damage.target.kind === 'PLAYER'
          ? (damage.target.playerId ??
            (damage.target.player === 'local'
              ? previousState.localPlayerId
              : previousState.turnOrder.find(
                  (id) => id !== previousState.localPlayerId,
                )))
          : undefined
      const targetPermanentInstanceId =
        damage.target.kind === 'CREATURE' ||
        damage.target.kind === 'PLANESWALKER' ||
        damage.target.kind === 'BATTLE'
          ? damage.target.instanceId
          : undefined
      events.push({
        type: 'DAMAGE_DEALT',
        sourceInstanceId: damage.sourceInstanceId,
        amount: damage.amount,
        damageKind: damage.damageKind,
        sourcePlayerId,
        targetPlayerId,
        targetPermanentInstanceId,
      })
      if (damage.damageKind === 'COMBAT')
        events.push({
          type: 'COMBAT_DAMAGE_DEALT',
          sourceInstanceId: damage.sourceInstanceId,
          amount: damage.amount,
          damageKind: damage.damageKind,
          sourcePlayerId,
          targetPlayerId,
        })
      if (damage.target.kind !== 'BATTLE')
        events.push({
          type:
            damage.target.kind === 'PLAYER'
              ? 'PLAYER_DEALT_DAMAGE'
              : damage.target.kind === 'PLANESWALKER'
                ? 'PLANESWALKER_DEALT_DAMAGE'
                : 'CREATURE_DEALT_DAMAGE',
          sourceInstanceId: damage.sourceInstanceId,
          amount: damage.amount,
          damageKind: damage.damageKind,
          sourcePlayerId,
          targetPlayerId,
          targetPermanentInstanceId,
        })
      const source = damage.sourceInstanceId
        ? previousState.cards.find(
            (card) => card.instanceId === damage.sourceInstanceId,
          )
        : undefined
      if (
        isCommanderInstance(previousState, source?.instanceId) &&
        damage.damageKind === 'COMBAT' &&
        damage.target.kind === 'PLAYER'
      )
        events.push({
          type: 'COMMANDER_COMBAT_DAMAGE_DEALT',
          sourceInstanceId: source?.instanceId,
          amount: damage.amount,
          damageKind: damage.damageKind,
        })
    })
  }
  if (action.type === 'CAST_SPELL') {
    const instance = nextState.cards.find(
      (instance) => instance.instanceId === action.instanceId,
    )
    const card = instance?.card
    if (card && instance) {
      const details = typeDetails(card.typeLine)
      events.push({
        type: 'SPELL_CAST',
        cardInstanceId: action.instanceId,
        stackObjectId: instance.stackObjectId,
        cardName: card.name,
        isCreature: card.typeLine.toLocaleLowerCase().includes('creature'),
        manaCost: card.manaCost,
        blueManaSymbols: countBlueManaSymbols(card.manaCost),
        controller: instance.controller ?? 'YOU',
        playerId: instance.controllerId ?? nextState.localPlayerId,
        castNumberThisTurn:
          nextState.spellsCastThisTurnByPlayer?.[
            instance.controllerId ?? nextState.localPlayerId ?? 'player-1'
          ] ?? nextState.spellsCastThisTurn,
        manaSpent:
          typeof action.variables?.MANA_SPENT_TO_CAST === 'number'
            ? action.variables.MANA_SPENT_TO_CAST
            : undefined,
        cardTypes: details.cardTypes,
        subtypes: details.subtypes,
        isToken: false,
      })
    }
  }
  if (action.type === 'DECLARE_PLAYER_SHUFFLED')
    events.push({
      type: 'PLAYER_SHUFFLED',
      player: action.player,
      controller: action.player === 'local' ? 'YOU' : 'OPPONENT',
      playerId:
        action.playerId ??
        (action.player === 'local'
          ? nextState.localPlayerId
          : nextState.turnOrder.find((id) => id !== nextState.localPlayerId)),
    })
  if (action.type === 'TAP_CARD') {
    const previousCard = previousState.cards.find(
      (card) => card.instanceId === action.instanceId,
    )
    const nextCard = nextState.cards.find(
      (card) => card.instanceId === action.instanceId,
    )
    if (previousCard && nextCard && !previousCard.tapped && nextCard.tapped) {
      const effectiveNextCard = effectiveCardDefinition(nextState, nextCard)
      const details = typeDetails(effectiveNextCard.typeLine)
      events.push({
        type: 'PERMANENT_BECAME_TAPPED',
        cardInstanceId: nextCard.instanceId,
        cardName: effectiveNextCard.name,
        controller: nextCard.controller ?? 'YOU',
        playerId: nextCard.controllerId ?? nextState.localPlayerId,
        cardTypes: details.cardTypes,
        subtypes: details.subtypes,
        isToken: nextCard.isToken === true,
        sourceAction: 'TAP_CARD',
        ...(action.eventGroupId ? { eventGroupId: action.eventGroupId } : {}),
      })
    }
  }

  nextState.cards.forEach((nextCard) => {
    if (nextCard.zone !== 'battlefield') return
    const previousCard = previousState.cards.find(
      (card) => card.instanceId === nextCard.instanceId,
    )
    if (previousCard?.zone === 'battlefield') return
    const previousZone =
      previousCard?.zone ??
      (action.type === 'MATERIALIZE_CARD' ? action.fromZone : 'created')
    const effectiveNextCard = effectiveCardDefinition(nextState, nextCard)
    const details = typeDetails(effectiveNextCard.typeLine)
    events.push({
      type: 'CARD_ENTERED_BATTLEFIELD',
      cardInstanceId: nextCard.instanceId,
      cardName: effectiveNextCard.name,
      controller: nextCard.controller ?? 'YOU',
      playerId: nextCard.controllerId ?? nextState.localPlayerId,
      cardTypes: details.cardTypes,
      subtypes: details.subtypes,
      isToken: nextCard.isToken === true,
      previousZone,
    })
  })
  previousState.cards.forEach((previousCard) => {
    const nextCard = nextState.cards.find(
      (card) => card.instanceId === previousCard.instanceId,
    )
    if (
      previousCard.zone === 'battlefield' &&
      nextCard?.zone !== 'battlefield'
    ) {
      const effectivePreviousCard = effectiveCardDefinition(
        previousState,
        previousCard,
      )
      const details = typeDetails(effectivePreviousCard.typeLine)
      events.push({
        type: 'CARD_LEFT_BATTLEFIELD',
        cardInstanceId: previousCard.instanceId,
        cardName: effectivePreviousCard.name,
        previousZone: 'battlefield',
        nextZone: nextCard?.zone ?? 'exile',
        controller: previousCard.controller ?? 'YOU',
        playerId: previousCard.controllerId ?? previousState.localPlayerId,
        cardTypes: details.cardTypes,
        subtypes: details.subtypes,
        isToken: previousCard.isToken === true,
        counters: { ...previousCard.counters },
      })
    }
    if (
      previousCard.zone === 'battlefield' &&
      nextCard?.zone === 'graveyard' &&
      /\bcreature\b/i.test(
        effectiveCardDefinition(previousState, previousCard).typeLine,
      )
    ) {
      const effectivePreviousCard = effectiveCardDefinition(
        previousState,
        previousCard,
      )
      const details = typeDetails(effectivePreviousCard.typeLine)
      events.push({
        type: 'CARD_DIED',
        cardInstanceId: previousCard.instanceId,
        cardName: effectivePreviousCard.name,
        controller: previousCard.controller ?? 'YOU',
        playerId: previousCard.controllerId ?? previousState.localPlayerId,
        cardTypes: details.cardTypes,
        subtypes: details.subtypes,
        isToken: previousCard.isToken === true,
        counters: { ...previousCard.counters },
      })
    }
  })

  nextState.players.forEach((nextPlayer) => {
    const previousPlayer = previousState.players.find(
      (player) => player.id === nextPlayer.id,
    )
    if (!previousPlayer || nextPlayer.life <= previousPlayer.life) return
    events.push({
      type: 'PLAYER_GAINED_LIFE',
      playerId: nextPlayer.id,
      controller:
        nextPlayer.id === nextState.localPlayerId ? 'YOU' : 'OPPONENT',
      amount: nextPlayer.life - previousPlayer.life,
    })
  })
  return events
}
