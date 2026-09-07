import { useGameStore } from '../store/gameStore'
import type { CardInstance, Zone } from '../types/card'
import type { GameAction } from '../actions/gameActions'
import { getVisualCardLabel } from '../utils/cardLabels'
import { CardTile } from './CardTile'
import type { AvailableManaAbility } from '../rules/manaPlanner/manaPlanner'
import { deriveActiveStaticEffects } from '../abilities/engine/staticEffects'

type Props = {
  title: string
  zone: Zone
  cards: CardInstance[]
  onDispatch: (action: GameAction) => void
  onDispatchMany?: (actions: GameAction[]) => void
  manaSources?: AvailableManaAbility[]
  compact?: boolean
  showTitle?: boolean
  className?: string
}

export function ZonePanel({
  title,
  zone,
  cards,
  onDispatch,
  onDispatchMany,
  manaSources = [],
  compact = false,
  showTitle = true,
  className,
}: Props) {
  const inZone = cards.filter((card) => card.zone === zone)
  const game = useGameStore()
  const activeStaticEffects = deriveActiveStaticEffects(game)
  return (
    <section className={`zone-panel${compact ? ' compact-zone-panel' : ''}${className ? ` ${className}` : ''}`}>
      {showTitle ? (
        <h2>
          {title} <span>{inZone.length}</span>
        </h2>
      ) : null}
      <div className="cards">
        {inZone.length ? (
          inZone.map((card) => (
            <CardTile
              key={card.instanceId}
              instance={card}
              label={getVisualCardLabel(card, inZone)}
              onDispatch={onDispatch}
              onDispatchMany={onDispatchMany}
              manaActivation={manaSources.find(
                (source) => source.sourceInstanceId === card.instanceId,
              )}
              compact={compact}
              activeStaticEffects={activeStaticEffects}
            />
          ))
        ) : (
          <p className="empty">Vacío</p>
        )}
      </div>
    </section>
  )
}
