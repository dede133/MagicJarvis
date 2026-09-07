import {
  controllerLabelForPlayer,
  playerStateFor,
} from '../rules/players/playerState'
import { useGameStore } from '../store/gameStore'

const durationLabel = (duration: 'NEXT_COMBAT' | 'NEXT_TURN'): string =>
  duration === 'NEXT_COMBAT' ? 'el próximo combate' : 'el próximo turno'

export function PlayerControlReminder() {
  const game = useGameStore()
  const effects = game.playerControlEffects ?? []

  if (!effects.length) return null

  return (
    <section className="status-card" aria-live="polite">
      <span>Control temporal de jugadores</span>
      {effects.map((effect) => {
        const target = playerStateFor(game, effect.targetPlayerId)
        const controller = playerStateFor(game, effect.controllerPlayerId)
        const targetLabel =
          target?.name ?? controllerLabelForPlayer(game, effect.targetPlayerId)
        const controllerLabel =
          controller?.name ??
          controllerLabelForPlayer(game, effect.controllerPlayerId)

        return (
          <p key={`${effect.targetPlayerId}-${effect.duration}`}>
            {controllerLabel} controla a {targetLabel} hasta{' '}
            {durationLabel(effect.duration)}.
          </p>
        )
      })}
    </section>
  )
}
