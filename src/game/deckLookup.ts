import type { CardDefinition } from '../types/card'
import { getResolvedDeckCommanders } from '../types/deck'
import type { DeckDefinition } from '../types/deck'
import type { GameState } from '../types/game'
import type { PlayerId } from '../types/player'

/** Finds a resolved definition for a later materialization action. */
export const findDeckCardDefinition = (
  deck: DeckDefinition,
  name: string,
): CardDefinition | undefined =>
  [...getResolvedDeckCommanders(deck), ...deck.mainboard].find(
    (entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  )?.card

/** Returns the identity/vocabulary deck for a player, with the legacy local fallback. */
export const deckDefinitionForPlayer = (
  state: Pick<GameState, 'deckDefinition' | 'deckDefinitionsByPlayer' | 'localPlayerId'>,
  playerId: PlayerId,
): DeckDefinition | undefined =>
  state.deckDefinitionsByPlayer?.[playerId] ??
  (playerId === (state.localPlayerId ?? 'player-1') ? state.deckDefinition : undefined)

export const activeDeckDefinition = (
  state: Pick<GameState, 'activePlayerId' | 'deckDefinition' | 'deckDefinitionsByPlayer' | 'localPlayerId'>,
): DeckDefinition | undefined =>
  deckDefinitionForPlayer(state, state.activePlayerId ?? state.localPlayerId ?? 'player-1')
