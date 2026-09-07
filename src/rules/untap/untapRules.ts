import type { CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import { hasStaticUntapRestriction } from '../../abilities/engine/staticEffects'

export const STUN_COUNTER = 'stun'

const activeUntapRestriction = (
  state: GameState,
  targetInstanceId: string,
): boolean =>
  (state.untapRestrictions ?? []).some((entry) => {
    if (entry.targetInstanceId !== targetInstanceId) return false
    const source = state.cards.find(
      (card) => card.instanceId === entry.sourceInstanceId,
    )
    return source?.zone === 'battlefield' && !source.phasedOut
  })

/** Restrictions worded "doesn't untap during its controller's untap step". */
export const cannotUntapDuringControllersUntapStep = (
  state: GameState,
  card: CardInstance,
): boolean =>
  activeUntapRestriction(state, card.instanceId) ||
  hasStaticUntapRestriction(state, card)

/**
 * Applies one actual attempt to untap a known permanent.
 *
 * Step-specific restrictions are checked by the untap-step caller. A stun
 * counter, however, replaces any untap attempt, including one caused by a
 * spell or ability: remove exactly one stun counter and leave it tapped.
 */
export const attemptUntap = (
  state: GameState,
  card: CardInstance,
): CardInstance => {
  if (card.zone !== 'battlefield' || card.phasedOut || !card.tapped) return card

  const stunCounters = card.counters[STUN_COUNTER] ?? 0
  if (stunCounters > 0)
    return {
      ...card,
      counters: {
        ...card.counters,
        [STUN_COUNTER]: stunCounters - 1,
      },
    }

  return { ...card, tapped: false }
}
