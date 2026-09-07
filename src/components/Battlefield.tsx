import type { GameAction } from '../actions/gameActions'
import type { AvailableManaAbility } from '../rules/manaPlanner/manaPlanner'
import type { CardInstance } from '../types/card'
import type { PlayerId } from '../types/player'
import { ZonePanel } from './ZonePanel'

type BattlefieldCategory = 'Permanents' | 'Lands'

const categories: BattlefieldCategory[] = ['Permanents', 'Lands']

const categoryFor = (card: CardInstance): BattlefieldCategory =>
  /\bland\b/i.test(card.card.typeLine) ? 'Lands' : 'Permanents'

type Props = {
  cards: CardInstance[]
  playerId: PlayerId
  onDispatch: (action: GameAction) => void
  onDispatchMany?: (actions: GameAction[]) => void
  manaSources?: AvailableManaAbility[]
}

export function Battlefield({
  cards,
  playerId,
  onDispatch,
  onDispatchMany,
  manaSources = [],
}: Props) {
  const battlefield = cards.filter(
    (card) => card.zone === 'battlefield' && card.controllerId === playerId,
  )

  return (
    <section className="battlefield tabletop-battlefield">
      {battlefield.length ? (
        <div className="tabletop-battlefield-rows">
          {categories.map((category) => {
            const categoryCards = battlefield.filter(
              (card) => categoryFor(card) === category,
            )
            if (!categoryCards.length) return null
            return (
              <div className="tabletop-battlefield-row" key={category}>
                <div className="battlefield-row-label">
                  <strong>{category}</strong>
                  <span>{categoryCards.length}</span>
                </div>
                <ZonePanel
                  title={category}
                  zone="battlefield"
                  cards={categoryCards}
                  onDispatch={onDispatch}
                  onDispatchMany={onDispatchMany}
                  manaSources={manaSources}
                  compact
                  showTitle={false}
                  className="battlefield-row-zone"
                />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty-battlefield">Aún no hay permanentes.</div>
      )}
    </section>
  )
}
