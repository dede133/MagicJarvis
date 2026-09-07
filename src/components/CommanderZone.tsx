import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { commanderInstanceIds } from '../rules/commander/commanderRules'
import { activePlayerIdOf, playerStateFor } from '../rules/players/playerState'
import type { PlayerId } from '../types/player'

const zoneLabel = (zone: string): string => {
  switch (zone) {
    case 'command':
      return 'Zona de mando'
    case 'stack':
      return 'Stack'
    case 'battlefield':
      return 'Campo de batalla'
    case 'graveyard':
      return 'Cementerio'
    case 'exile':
      return 'Exilio'
    case 'hand':
      return 'Mano'
    case 'library':
      return 'Biblioteca'
    default:
      return zone
  }
}

export function CommanderZone({ playerId }: { playerId: PlayerId }) {
  const game = useGameStore()
  const [feedback, setFeedback] = useState<string>()
  const commanders = commanderInstanceIds(game, playerId)
    .map((instanceId) => game.cards.find((card) => card.instanceId === instanceId))
    .filter((card): card is NonNullable<typeof card> => Boolean(card))

  if (!commanders.length) {
    return (
      <section className="zone-panel commander-zone">
        <h2>
          Zona de mando <span>0</span>
        </h2>
        <p className="empty">Comandante no identificado.</p>
      </section>
    )
  }

  const activePlayerId = activePlayerIdOf(game)
  const player = playerStateFor(game, playerId)

  const castCommander = (commander: (typeof commanders)[number]) => {
    const result = game.executeTabletopCommand({
      type: 'CAST_SPELL',
      cardQuery: commander.card.name,
    })
    if (result.status === 'error') {
      setFeedback(`⚠ ${result.error.code}: ${result.error.message}`)
      return
    }
    if (result.status === 'undo') {
      game.undoLastAction()
      setFeedback('↶ Lanzamiento deshecho')
      return
    }
    if (result.status === 'paused') {
      setFeedback(`⚠ ${result.description}`)
      return
    }
    setFeedback(`✓ ${result.description}`)
  }

  const inCommandZone = commanders.filter((commander) => commander.zone === 'command')

  return (
    <section className="zone-panel commander-zone">
      <h2>
        Zona de mando <span>{inCommandZone.length}</span>
      </h2>
      {commanders.map((commander) => {
        const castsFromCommand =
          player?.commanderCastsFromCommandZone?.[commander.instanceId] ?? 0
        const commanderTax = castsFromCommand * 2
        const isInCommandZone = commander.zone === 'command'
        return (
          <article className="commander-zone-card" key={commander.instanceId}>
            {commander.card.image ? (
              <img src={commander.card.image} alt="" />
            ) : (
              <div className="card-placeholder">
                {commander.card.name.slice(0, 1)}
              </div>
            )}
            <div className="commander-zone-content">
              <strong>{commander.card.name}</strong>
              <small>Comandante · {zoneLabel(commander.zone)}</small>
              <small>Coste impreso: {commander.card.manaCost ?? '—'}</small>
              <small>
                Impuesto de comandante:{' '}
                {commanderTax ? `+{${commanderTax}}` : 'ninguno'}
              </small>
              <small>
                Lanzamientos previos desde la zona de mando: {castsFromCommand}
              </small>
              {isInCommandZone ? (
                <>
                  <p className="commander-zone-note">
                    No está en el campo de batalla. Sus habilidades de permanente no
                    están activas.
                  </p>
                  <button
                    className="primary"
                    disabled={activePlayerId !== playerId}
                    onClick={() => castCommander(commander)}
                  >
                    {activePlayerId === playerId
                      ? 'Lanzar comandante'
                      : 'Disponible en su turno'}
                  </button>
                </>
              ) : (
                <p className="commander-zone-note">
                  El comandante está actualmente en {zoneLabel(commander.zone).toLowerCase()}.
                </p>
              )}
            </div>
          </article>
        )
      })}
      {feedback ? <small>{feedback}</small> : null}
    </section>
  )
}
