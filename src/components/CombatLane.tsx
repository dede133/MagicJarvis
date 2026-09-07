import {
  deriveActiveStaticEffects,
  modifiedPowerToughness,
} from '../abilities/engine/staticEffects'
import type { GameState } from '../types/game'

const cardLabel = (game: GameState, instanceId: string): string =>
  game.cards.find((card) => card.instanceId === instanceId)?.card.name ?? instanceId

const ptLabel = (game: GameState, instanceId: string): string | undefined => {
  const card = game.cards.find((candidate) => candidate.instanceId === instanceId)
  if (!card) return undefined
  const pt = modifiedPowerToughness(card, deriveActiveStaticEffects(game))
  return pt ? `${pt.power}/${pt.toughness}` : undefined
}

const defendingTargetLabel = (
  game: GameState,
  attacker: GameState['combatState']['attackers'][number],
): string => {
  if (attacker.defendingTarget.kind === 'PLAYER')
    return attacker.defendingTarget.playerId ?? attacker.defendingTarget.id
  return cardLabel(game, attacker.defendingTarget.id)
}

export function CombatLane({ game }: { game: GameState }) {
  const combat = game.combatState
  if (!combat.active) return null

  return (
    <section className="combat-lane" aria-label="Estado del combate">
      <header className="combat-lane-header">
        <div>
          <span className="combat-lane-kicker">Combate</span>
          <strong>{game.turnState.step.replaceAll('_', ' ')}</strong>
        </div>
        <span>{combat.attackers.length} atacantes</span>
      </header>
      {!combat.attackersDeclared ? (
        <div className="combat-lane-empty">Esperando declaración de atacantes.</div>
      ) : combat.attackers.length === 0 ? (
        <div className="combat-lane-empty">No se declararon atacantes.</div>
      ) : (
        <div className="combat-lane-assignments">
          {combat.attackers.map((attacker) => {
            const blockers = attacker.blockedBy.map((blockerId) => ({
              id: blockerId,
              name: cardLabel(game, blockerId),
              pt: ptLabel(game, blockerId),
            }))
            return (
              <article className="combat-matchup" key={attacker.attackerInstanceId}>
                <div className="combat-creature attacking-creature">
                  <span>ATACA</span>
                  <strong>{cardLabel(game, attacker.attackerInstanceId)}</strong>
                  <small>{ptLabel(game, attacker.attackerInstanceId) ?? 'F/R ?'}</small>
                  <em>→ {defendingTargetLabel(game, attacker)}</em>
                </div>
                <div className="combat-arrow" aria-hidden="true">↓</div>
                <div className="combat-blockers">
                  {!combat.blockersDeclared ? (
                    <span className="combat-awaiting">Esperando bloqueos</span>
                  ) : blockers.length || attacker.externalBlockedBy.length ? (
                    <>
                      {blockers.map((blocker) => (
                        <div className="combat-creature blocking-creature" key={blocker.id}>
                          <span>BLOQUEA</span>
                          <strong>{blocker.name}</strong>
                          <small>{blocker.pt ?? 'F/R ?'}</small>
                        </div>
                      ))}
                      {attacker.externalBlockedBy.map((id) => (
                        <div className="combat-creature blocking-creature external" key={id}>
                          <span>BLOQUEA</span>
                          <strong>Objeto físico</strong>
                        </div>
                      ))}
                    </>
                  ) : (
                    <span className="combat-unblocked">SIN BLOQUEAR</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
