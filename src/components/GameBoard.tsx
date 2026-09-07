import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import type { ManaColor } from '../types/card'
import type { PlayerId } from '../types/player'
import { CommandConsole } from './CommandConsole'
import { PendingAbilities } from './PendingAbilities'
import { PendingDecisions } from './PendingDecisions'
import { ExternalObjectsPanel } from './ExternalObjectsPanel'
import { PlayerControlReminder } from './PlayerControlReminder'
import { PlayerBoard } from './PlayerBoard'
import { ZonePanel } from './ZonePanel'
import { CombatLane } from './CombatLane'
import {
  activePlayerIdOf,
  opponentPlayerIds,
  playerManaPool,
  playerStateFor,
} from '../rules/players/playerState'
import { deckDefinitionForPlayer } from '../game/deckLookup'
import type { VoiceLanguageId } from '../voice/languages'

const manaColors: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C']

const phaseLabel = (phase: string, step: string): string => {
  if (phase === 'BEGINNING') return step
  if (phase === 'MAIN_1') return 'Primera principal'
  if (phase === 'COMBAT') return `Combate · ${step}`
  if (phase === 'MAIN_2') return 'Segunda principal'
  if (phase === 'ENDING') return step
  return `${phase} · ${step}`
}

function DebugPlayerState({ playerId }: { playerId: PlayerId }) {
  const game = useGameStore()
  const player = playerStateFor(game, playerId)
  const manaPool = playerManaPool(game, playerId)

  if (!player) return null

  return (
    <section className="debug-player-state">
      <h3>{player.name ?? playerId}</h3>
      <div className="debug-counter-row">
        <span>Biblioteca</span>
        <button
          onClick={() =>
            game.dispatch({
              type: 'SET_PLAYER_LIBRARY_COUNT',
              playerId,
              count: Math.max(0, (player.libraryCount ?? 0) - 1),
            })
          }
        >
          −
        </button>
        <strong>{player.libraryCount ?? '—'}</strong>
        <button
          onClick={() =>
            game.dispatch({
              type: 'SET_PLAYER_LIBRARY_COUNT',
              playerId,
              count: (player.libraryCount ?? 0) + 1,
            })
          }
        >
          +
        </button>
      </div>
      <div className="debug-counter-row">
        <span>Mano</span>
        <button
          onClick={() =>
            game.dispatch({
              type: 'SET_PLAYER_HAND_COUNT',
              playerId,
              count: Math.max(0, (player.handCount ?? 0) - 1),
            })
          }
        >
          −
        </button>
        <strong>{player.handCount ?? '—'}</strong>
        <button
          onClick={() =>
            game.dispatch({
              type: 'SET_PLAYER_HAND_COUNT',
              playerId,
              count: (player.handCount ?? 0) + 1,
            })
          }
        >
          +
        </button>
      </div>
      <div className="debug-mana-grid">
        {manaColors.map((color) => (
          <div className={`mana-item mana-${color}`} key={color}>
            <b>{color}</b>
            <strong>{manaPool[color]}</strong>
            <button
              onClick={() =>
                game.dispatch({
                  type: 'ADD_PLAYER_MANA',
                  playerId,
                  color,
                  amount: 1,
                })
              }
            >
              +
            </button>
            <button
              disabled={manaPool[color] <= 0}
              onClick={() =>
                game.dispatch({
                  type: 'SPEND_PLAYER_MANA',
                  playerId,
                  color,
                  amount: 1,
                })
              }
            >
              −
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

export function GameBoard({
  voiceLanguageId,
}: {
  voiceLanguageId: VoiceLanguageId
}) {
  const game = useGameStore()
  const { dispatch, dispatchMany, undoLastAction } = game
  const [turnFeedback, setTurnFeedback] = useState<string>()
  const [commandDockOpen, setCommandDockOpen] = useState(false)
  const activePlayerId = activePlayerIdOf(game)
  const localPlayerId = game.localPlayerId ?? 'player-1'
  const opponentPlayerId =
    opponentPlayerIds(game, localPlayerId)[0] ?? 'player-2'
  const activePlayer = playerStateFor(game, activePlayerId)
  const activeDeck = deckDefinitionForPlayer(game, activePlayerId)
  const pendingAbilityCount = game.pendingAbilities.length
  const pendingDecisionCount = game.pendingDecisions.length
  const stackCount = game.stack.length
  const hasSharedFocus =
    pendingAbilityCount > 0 || pendingDecisionCount > 0 || stackCount > 0

  const downloadMatchLog = () => {
    const blob = new Blob([game.exportMatchLog()], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'MATCH_LOG.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const nextTurn = () => {
    const result = game.executeTabletopCommand({ type: 'NEXT_TURN' })
    if (result.status === 'error') {
      setTurnFeedback(`⚠ ${result.error.code}: ${result.error.message}`)
      return
    }
    if (result.status === 'paused') {
      setTurnFeedback(`⚠ ${result.description}`)
      return
    }
    if (result.status === 'undo') return
    setTurnFeedback(`✓ ${result.description}`)
  }

  return (
    <main className="game-board match-board tabletop-shell tabletop-v2-shell">
      <header className="game-header tabletop-topbar">
        <div className="topbar-turn-copy">
          <p className="eyebrow">MagicJarvis · 1 vs 1</p>
          <div className="topbar-turn-line">
            <strong>
              {activeDeck?.name ?? activePlayer?.name ?? 'Commander'}
            </strong>
            <span>Turno {game.turn}</span>
            <span>{phaseLabel(game.turnState.phase, game.turnState.step)}</span>
          </div>
        </div>
        <div className="active-player-callout compact-active-callout">
          <span>Activo</span>
          <strong>{activePlayerId === localPlayerId ? 'J1' : 'J2'}</strong>
        </div>
        <button className="primary end-turn-button" onClick={nextTurn}>
          Pasar turno →
        </button>
      </header>

      {turnFeedback ? (
        <div className="turn-feedback tabletop-toast">{turnFeedback}</div>
      ) : null}

      <PlayerBoard
        game={game}
        playerId={opponentPlayerId}
        isActive={activePlayerId === opponentPlayerId}
        onDispatch={dispatch}
        onDispatchMany={dispatchMany}
      />

      <section
        className={`table-center${hasSharedFocus || game.combatState.active ? ' has-content' : ''}`}
      >
        <CombatLane game={game} />
        {hasSharedFocus ? (
          <div className="table-center-content">
            {stackCount > 0 ? (
              <div className="table-center-stack">
                <div className="table-center-title">
                  <strong>Stack</strong>
                  <span>{stackCount}</span>
                </div>
                <ZonePanel
                  title="Stack"
                  zone="stack"
                  cards={game.cards}
                  onDispatch={dispatch}
                  compact
                  showTitle={false}
                />
              </div>
            ) : null}
            {pendingAbilityCount > 0 ? (
              <div className="table-center-pending">
                <PendingAbilities />
              </div>
            ) : null}
            {pendingDecisionCount > 0 ? (
              <div className="table-center-pending">
                <PendingDecisions />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="table-center-empty">
            <span />
            <small>Stack vacío</small>
            <span />
          </div>
        )}
      </section>

      <PlayerBoard
        game={game}
        playerId={localPlayerId}
        isActive={activePlayerId === localPlayerId}
        onDispatch={dispatch}
        onDispatchMany={dispatchMany}
      />

      <section
        className={`floating-command-dock${commandDockOpen ? ' open' : ''}`}
      >
        <button
          type="button"
          className="command-dock-handle"
          onClick={() => setCommandDockOpen((current) => !current)}
          aria-expanded={commandDockOpen}
        >
          <span className="command-dock-mic">🎙</span>
          <span className="command-dock-copy">
            <strong>Comandos</strong>
            <small>
              {activeDeck?.name ?? activePlayer?.name ?? 'Jugador activo'} · voz
              o texto
            </small>
          </span>
          <span className="command-dock-chevron" aria-hidden="true">
            {commandDockOpen ? '⌄' : '⌃'}
          </span>
        </button>
        <div className="command-dock-body" aria-hidden={!commandDockOpen}>
          <CommandConsole voiceLanguageId={voiceLanguageId} />
        </div>
      </section>

      <details className="debug-drawer floating-debug-drawer">
        <summary>
          <span className="debug-summary-compact">
            <strong>⚙ Debug</strong>
          </span>
        </summary>
        <div className="debug-drawer-content">
          <div className="debug-toolbar">
            <button
              onClick={() => undoLastAction()}
              disabled={!game.undoStack.length}
            >
              ↶ Undo última acción
            </button>
            <button type="button" onClick={downloadMatchLog}>
              Descargar MATCH_LOG.json ({game.matchTransactions.length})
            </button>
            <small>La mesa física sigue siendo la fuente de verdad.</small>
          </div>
          <div className="debug-player-grid">
            <DebugPlayerState playerId={localPlayerId} />
            <DebugPlayerState playerId={opponentPlayerId} />
          </div>
          <PlayerControlReminder />
          <ExternalObjectsPanel />
          <section className="history">
            <h2>Acciones recientes</h2>
            {game.history.length ? (
              <ol>
                {game.history.map((entry) => (
                  <li key={entry.actionId}>{entry.description}</li>
                ))}
              </ol>
            ) : (
              <p className="empty">Aún no hay acciones.</p>
            )}
          </section>
        </div>
      </details>
    </main>
  )
}
