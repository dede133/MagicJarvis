import type { CardDefinition } from '../../types/card'
import type { GameState } from '../../types/game'
import { isLandCard } from './basicLands'
import { activePlayerIdOf, playerStateFor } from '../players/playerState'

export type DeclarationLegality =
  | { status: 'LEGAL' }
  | { status: 'ILLEGAL'; code: 'LAND_PLAY_LIMIT_REACHED'; message: string }

/**
 * Rules validation deliberately sits before GameActions. Manual correction
 * actions bypass this layer because the physical table remains authoritative.
 */
export const validateDeclaredCardAction = (
  state: GameState,
  card: CardDefinition,
  playerId = activePlayerIdOf(state),
): DeclarationLegality => {
  const player = playerStateFor(state, playerId)
  const landPlaysUsed = player?.landPlaysUsedThisTurn ?? state.landPlaysUsedThisTurn
  const landPlayLimit = player?.landPlayLimit ?? state.landPlayLimit
  if (
    isLandCard(card.typeLine) &&
    landPlaysUsed >= landPlayLimit
  )
    return {
      status: 'ILLEGAL',
      code: 'LAND_PLAY_LIMIT_REACHED',
      message: `Ya has usado ${landPlaysUsed}/${landPlayLimit} jugadas de tierra este turno.`,
    }
  return { status: 'LEGAL' }
}
