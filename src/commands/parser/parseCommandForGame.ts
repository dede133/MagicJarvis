import { localizedCardAliases } from '../../data/cardAliases'
import { deckDefinitionForPlayer } from '../../game/deckLookup'
import { activePlayerIdOf, opponentPlayerIds } from '../../rules/players/playerState'
import type { CardInstance } from '../../types/card'
import type { GameState } from '../../types/game'
import type { ParseResult } from '../types/commandTypes'
import { resolveCardQuery } from '../resolver/cardResolver'
import { normalizeCommandText } from './normalizeText'
import { parseCommand } from './parseCommand'

const matchesVisibleCardName = (card: CardInstance, query: string): boolean => {
  const names = [
    card.card.name,
    ...(localizedCardAliases[card.card.name] ?? []),
    ...(card.card.localizedAliases ?? []),
    ...(card.card.cardFaces ?? []).map((face) => face.name),
  ].map(normalizeCommandText)
  return names.some(
    (name) => name === query || (query.length >= 3 && name.includes(query)),
  )
}

const bareBlockerCommand = (
  input: string,
  state: GameState,
): ParseResult | undefined => {
  if (
    !state.combatState.active ||
    !state.combatState.attackersDeclared ||
    state.combatState.blockersDeclared ||
    !(
      state.turnState.step === 'DECLARE_ATTACKERS' ||
      state.turnState.step === 'DECLARE_BLOCKERS'
    ) ||
    state.combatState.attackers.length !== 1
  )
    return undefined

  const normalized = normalizeCommandText(input)
  if (!normalized || normalized.split(' ').length > 8) return undefined

  const attackingPlayerId =
    state.combatState.attackingPlayerStableId ?? activePlayerIdOf(state)
  const defendingPlayerId = opponentPlayerIds(state, attackingPlayerId)[0]
  if (!defendingPlayerId) return undefined

  const visibleCreatures = state.cards.filter(
    (card) =>
      card.zone === 'battlefield' &&
      card.controllerId === defendingPlayerId &&
      /\bCreature\b/i.test(card.card.typeLine),
  )
  let visibleMatches = visibleCreatures.filter((card) =>
    matchesVisibleCardName(card, normalized),
  )

  // Preserve the existing deck-level fuzzy/card-alias recovery when available,
  // but still require exactly one matching public battlefield permanent.
  if (visibleMatches.length === 0) {
    const deck = deckDefinitionForPlayer(state, defendingPlayerId)
    const match = deck ? resolveCardQuery(deck, normalized) : undefined
    if (match?.status === 'resolved')
      visibleMatches = visibleCreatures.filter(
        (card) => card.card.name === match.name,
      )
  }

  if (visibleMatches.length !== 1) return undefined

  return {
    status: 'parsed',
    normalized,
    command: {
      type: 'DECLARE_BLOCKERS',
      blockerQueries: [visibleMatches[0].card.name],
    },
  }
}

/**
 * Game-aware parser fallback for declarations whose meaning is only safe in a
 * concrete public context. A bare card name is interpreted as a blocker only
 * while exactly one attacker is awaiting blockers; elsewhere the normal parser
 * remains authoritative and the same text is not turned into a command.
 */
export const parseCommandForGame = (
  input: string,
  state: GameState,
): ParseResult => {
  const parsed = parseCommand(input)
  if (parsed.status === 'parsed' || parsed.error.code !== 'UNKNOWN_COMMAND')
    return parsed
  return bareBlockerCommand(input, state) ?? parsed
}
