import type { CardInstance } from '../../types/card'
import type { CombatState } from '../../types/combat'
import type { GameState } from '../../types/game'
import type { PlayerId } from '../../types/player'

export const isPhasedOut = (card: CardInstance): boolean =>
  card.phasedOut === true

export const isPresentPermanent = (card: CardInstance): boolean =>
  card.zone === 'battlefield' && !isPhasedOut(card)

const controllerIdOf = (state: GameState, card: CardInstance): PlayerId =>
  card.controllerId ??
  (card.controller === 'OPPONENT'
    ? (state.turnOrder.find((id) => id !== state.localPlayerId) ?? 'player-2')
    : (state.localPlayerId ?? 'player-1'))

const attachedDescendants = (
  cards: CardInstance[],
  rootInstanceId: string,
): string[] => {
  const result: string[] = []
  const queue = [rootInstanceId]
  const seen = new Set(queue)
  while (queue.length) {
    const current = queue.shift()!
    cards
      .filter(
        (card) =>
          card.zone === 'battlefield' &&
          card.attachedToInstanceId === current &&
          !seen.has(card.instanceId),
      )
      .forEach((card) => {
        seen.add(card.instanceId)
        result.push(card.instanceId)
        queue.push(card.instanceId)
      })
  }
  return result
}

export const phaseOutPermanent = (
  state: GameState,
  instanceId: string,
): { cards: CardInstance[]; phasedInstanceIds: string[] } => {
  const target = state.cards.find((card) => card.instanceId === instanceId)
  if (!target || !isPresentPermanent(target))
    return { cards: state.cards, phasedInstanceIds: [] }

  const controllerId = controllerIdOf(state, target)
  const indirectIds = attachedDescendants(state.cards, instanceId)
  const phasedIds = new Set([instanceId, ...indirectIds])
  const cards = state.cards.map((card) => {
    if (!phasedIds.has(card.instanceId)) return card
    if (card.phasedOut) return card
    const indirect = card.instanceId !== instanceId
    return {
      ...card,
      phasedOut: true,
      phasedOutUnderPlayerId: controllerId,
      ...(indirect ? { phasedOutIndirectlyWith: instanceId } : {}),
    }
  })
  return { cards, phasedInstanceIds: [...phasedIds] }
}

const indirectChildren = (
  cards: CardInstance[],
  rootIds: Set<string>,
): Set<string> => {
  const result = new Set(rootIds)
  let changed = true
  while (changed) {
    changed = false
    for (const card of cards) {
      if (
        card.phasedOut &&
        card.phasedOutIndirectlyWith &&
        result.has(card.phasedOutIndirectlyWith) &&
        !result.has(card.instanceId)
      ) {
        result.add(card.instanceId)
        changed = true
      }
    }
  }
  return result
}

const phaseInIds = (
  cards: CardInstance[],
  rootIds: Set<string>,
): CardInstance[] => {
  const ids = indirectChildren(cards, rootIds)
  return cards.map((card) =>
    ids.has(card.instanceId)
      ? {
          ...card,
          phasedOut: false,
          phasedOutUnderPlayerId: undefined,
          phasedOutIndirectlyWith: undefined,
        }
      : card,
  )
}

export const phaseInPermanent = (
  state: GameState,
  instanceId: string,
): { cards: CardInstance[]; phasedInstanceIds: string[] } => {
  const target = state.cards.find((card) => card.instanceId === instanceId)
  if (!target?.phasedOut) return { cards: state.cards, phasedInstanceIds: [] }
  // An explicit phase-in effect affects the chosen permanent itself. Indirect
  // phasing only changes the normal untap-step timing; it does not make the
  // attached permanent impossible to phase in by an effect that names it.
  const rootIds = new Set([target.instanceId])
  const ids = indirectChildren(state.cards, rootIds)
  return { cards: phaseInIds(state.cards, rootIds), phasedInstanceIds: [...ids] }
}

/** Turn-based phasing action that happens before the active player's untap. */
export const phaseInForUntapStep = (
  state: GameState,
  activePlayerId: PlayerId,
): { cards: CardInstance[]; phasedInstanceIds: string[] } => {
  const roots = new Set(
    state.cards
      .filter(
        (card) =>
          card.phasedOut === true &&
          !card.phasedOutIndirectlyWith &&
          card.phasedOutUnderPlayerId === activePlayerId,
      )
      .map((card) => card.instanceId),
  )
  const ids = indirectChildren(state.cards, roots)
  return { cards: phaseInIds(state.cards, roots), phasedInstanceIds: [...ids] }
}

export const removePhasedObjectsFromCombat = (
  combat: CombatState,
  instanceIds: string[],
): CombatState => {
  if (!instanceIds.length) return combat
  const removed = new Set(instanceIds)
  return {
    ...combat,
    attackers: combat.attackers
      .filter((attacker) => !removed.has(attacker.attackerInstanceId))
      .map((attacker) => ({
        ...attacker,
        blockedBy: attacker.blockedBy.filter((id) => !removed.has(id)),
      })),
    blockers: combat.blockers
      .filter((blocker) => !removed.has(blocker.blockerInstanceId))
      .map((blocker) => ({
        ...blocker,
        blocking: blocker.blocking.filter((id) => !removed.has(id)),
      })),
  }
}
