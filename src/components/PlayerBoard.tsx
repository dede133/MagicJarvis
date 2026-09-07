import type { ReactNode } from 'react'
import type { GameAction } from '../actions/gameActions'
import { deckDefinitionForPlayer } from '../game/deckLookup'
import { findAvailableManaAbilities } from '../rules/manaPlanner/manaPlanner'
import { playerManaPool, playerStateFor } from '../rules/players/playerState'
import type { GameState } from '../types/game'
import type { PlayerId } from '../types/player'
import { Battlefield } from './Battlefield'
import { CommanderZone } from './CommanderZone'
import { ZonePanel } from './ZonePanel'

const manaColors = ['W', 'U', 'B', 'R', 'G', 'C'] as const

type Props = {
  game: GameState
  playerId: PlayerId
  isActive: boolean
  onDispatch: (action: GameAction) => void
  onDispatchMany: (actions: GameAction[]) => void
}

type ZonePileProps = {
  label: string
  count: number
  children: ReactNode
  align?: 'left' | 'right'
}

function ZonePile({ label, count, children, align = 'right' }: ZonePileProps) {
  return (
    <details className={`zone-pile zone-pile-${align}`}>
      <summary>
        <span>{label}</span>
        <strong>{count}</strong>
      </summary>
      <div className="zone-pile-popover">{children}</div>
    </details>
  )
}

export function PlayerBoard({
  game,
  playerId,
  isActive,
  onDispatch,
  onDispatchMany,
}: Props) {
  const player = playerStateFor(game, playerId)
  const deck = deckDefinitionForPlayer(game, playerId)
  const manaPool = playerManaPool(game, playerId)
  const manaSources = findAvailableManaAbilities(game, playerId)
  const ownedCards = game.cards.filter(
    (card) => (card.ownerId ?? game.localPlayerId) === playerId,
  )
  const commandCount = ownedCards.filter((card) => card.zone === 'command').length
  const graveyardCount = ownedCards.filter((card) => card.zone === 'graveyard').length
  const exileCount = ownedCards.filter((card) => card.zone === 'exile').length
  const knownHandCount = ownedCards.filter((card) => card.zone === 'hand').length
  const manaTotal = manaColors.reduce((sum, color) => sum + manaPool[color], 0)
  const isLocal = playerId === game.localPlayerId

  return (
    <section
      className={`player-board tabletop-player-board${isActive ? ' active-player-board' : ''}${isLocal ? ' is-local-board' : ' is-opponent-board'}`}
      data-player-id={playerId}
    >
      <header className="player-board-header tabletop-player-header">
        <div className="player-board-identity">
          <span className={`turn-indicator${isActive ? ' active' : ''}`} />
          <div>
            <p className="eyebrow">{isLocal ? 'Jugador 1' : 'Jugador 2'}</p>
            <h2>{deck?.name ?? player?.name ?? playerId}</h2>
          </div>
        </div>

        <div className="player-board-stats tabletop-player-stats">
          <div className="player-stat life-stat emphasis-stat">
            <span>Vidas</span>
            <strong>{player?.life ?? (isLocal ? game.life : game.opponentLife)}</strong>
            <div className="inline-controls">
              <button
                onClick={() =>
                  onDispatch({ type: 'LOSE_PLAYER_LIFE', playerId, amount: 1 })
                }
              >
                −1
              </button>
              <button
                onClick={() =>
                  onDispatch({ type: 'GAIN_PLAYER_LIFE', playerId, amount: 1 })
                }
              >
                +1
              </button>
            </div>
          </div>
          <div className="player-stat compact-stat">
            <span>Deck</span>
            <strong>
              {player?.hiddenZoneTracking === 'COUNTS_ONLY'
                ? (player.libraryCount ?? '—')
                : '—'}
            </strong>
          </div>
          <div className="player-stat compact-stat">
            <span>Hand</span>
            <strong>
              {player?.hiddenZoneTracking === 'COUNTS_ONLY'
                ? (player.handCount ?? '—')
                : '—'}
            </strong>
          </div>
          <div className="player-stat mana-summary compact-stat">
            <span>Maná</span>
            <strong>{manaTotal}</strong>
            <small>
              {manaColors
                .filter((color) => manaPool[color] > 0)
                .map((color) => `${color}:${manaPool[color]}`)
                .join(' · ') || 'vacío'}
            </small>
          </div>
        </div>

        <div className="zone-pile-rail">
          <ZonePile label="CMD" count={commandCount} align={isLocal ? 'right' : 'left'}>
            <CommanderZone playerId={playerId} />
          </ZonePile>
          <ZonePile label="GY" count={graveyardCount} align={isLocal ? 'right' : 'left'}>
            <ZonePanel
              title="Cementerio"
              zone="graveyard"
              cards={ownedCards}
              onDispatch={onDispatch}
              compact
            />
          </ZonePile>
          <ZonePile label="EX" count={exileCount} align={isLocal ? 'right' : 'left'}>
            <ZonePanel
              title="Exilio"
              zone="exile"
              cards={ownedCards}
              onDispatch={onDispatch}
              compact
            />
          </ZonePile>
          <ZonePile label="KNOWN" count={knownHandCount} align={isLocal ? 'right' : 'left'}>
            <ZonePanel
              title="Mano conocida"
              zone="hand"
              cards={ownedCards}
              onDispatch={onDispatch}
              compact
            />
          </ZonePile>
        </div>
      </header>

      {isActive ? (
        <div className="active-turn-banner tabletop-turn-banner">
          <strong>● Turno activo</strong>
        </div>
      ) : null}

      <Battlefield
        cards={game.cards}
        playerId={playerId}
        onDispatch={onDispatch}
        onDispatchMany={onDispatchMany}
        manaSources={manaSources}
      />
    </section>
  )
}
