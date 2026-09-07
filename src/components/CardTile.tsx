import type { GameAction } from '../actions/gameActions'
import {
  deriveActiveStaticEffects,
  effectiveAbilitiesForCard,
  modifiedPowerToughness,
  type ActiveStaticEffects,
} from '../abilities/engine/staticEffects'
import type { TriggerDefinition, AbilityDefinition } from '../abilities/types/abilityTypes'
import type { AvailableManaAbility } from '../rules/manaPlanner/manaPlanner'
import { useGameStore } from '../store/gameStore'
import { currentFaceDefinition } from '../rules/transform/transformRules'
import type { CardInstance, Zone } from '../types/card'

type Props = {
  instance: CardInstance
  onDispatch: (action: GameAction) => void
  onDispatchMany?: (actions: GameAction[]) => void
  label?: string
  manaActivation?: AvailableManaAbility
  compact?: boolean
  activeStaticEffects?: ActiveStaticEffects
}

const manaColors = ['W', 'U', 'B', 'R', 'G', 'C'] as const

const manaProductionLabel = (production: AvailableManaAbility['production']) =>
  manaColors
    .filter((color) => production[color] > 0)
    .map((color) => `{${color}}`.repeat(production[color]))
    .join('')

const nextZone: Record<Zone, Zone> = {
  library: 'hand',
  hand: 'battlefield',
  battlefield: 'graveyard',
  graveyard: 'exile',
  exile: 'command',
  command: 'library',
  stack: 'graveyard',
}

const triggerLabels: Record<TriggerDefinition['type'], string> = {
  SPELL_CAST: 'Se lanza un hechizo',
  CARD_ENTERED_BATTLEFIELD: 'Un permanente entra al campo',
  PLAYER_SHUFFLED: 'Un jugador baraja',
  PLAYER_GAINED_LIFE: 'Un jugador gana vida',
  PERMANENT_BECAME_TAPPED: 'Un permanente se gira',
  PERMANENT_TRANSFORMED: 'Un permanente se transforma',
  ATTACKERS_DECLARED: 'Se declaran atacantes',
  COMBAT_STARTED: 'Empieza el combate',
  CREATURE_ATTACKED: 'Una criatura ataca',
  CREATURE_ATTACKED_UNBLOCKED: 'Una criatura ataca sin ser bloqueada',
  BLOCKERS_DECLARED: 'Se declaran bloqueadores',
  CREATURE_BECAME_BLOCKED: 'Una criatura pasa a estar bloqueada',
  CREATURE_BLOCKED: 'Una criatura bloquea',
  DAMAGE_DEALT: 'Se hace daño',
  PLAYER_DEALT_DAMAGE: 'Un jugador recibe daño',
  CARD_LEFT_BATTLEFIELD: 'Un permanente deja el campo',
  CARD_DIED: 'Muere una criatura',
  TURN_STARTED: 'Empieza un turno',
  UPKEEP_STARTED: 'Inicio del mantenimiento',
  DRAW_STEP_STARTED: 'Inicio del paso de robar',
  MAIN_PHASE_STARTED: 'Inicio de fase principal',
  END_STEP_STARTED: 'Inicio del paso final',
  TURN_ENDED: 'Termina un turno',
}

const triggeredAbilityLabel = (
  ability: Extract<AbilityDefinition, { kind: 'TRIGGERED' }>,
): string => {
  if (ability.trigger.type === 'SPELL_CAST') {
    const opponent = ability.conditions.some(
      (condition) =>
        condition.type === 'EVENT_CONTROLLER_IS' &&
        condition.value === 'OPPONENT',
    )
    const noncreature = ability.conditions.some(
      (condition) =>
        condition.type === 'SPELL_IS_CREATURE' && condition.value === false,
    )
    if (opponent && noncreature) return 'Oponente lanza hechizo no criatura'
  }
  return triggerLabels[ability.trigger.type]
}

const staticAbilityLabel = (
  ability: Extract<AbilityDefinition, { kind: 'STATIC' }>,
): string => {
  const first = ability.effects[0]
  if (!first) return 'Efecto estático'
  switch (first.type) {
    case 'MODIFY_COST':
      return first.operation === 'REDUCE_GENERIC_COST'
        ? 'Reduce costes'
        : 'Aumenta costes'
    case 'MODIFY_POWER_TOUGHNESS':
      return 'Modifica fuerza/resistencia'
    case 'BLOCKING_RESTRICTION':
      return 'Modifica bloqueos'
    case 'GRANT_KEYWORD':
      return `Concede ${first.keyword.toLowerCase()}`
    case 'WARD':
      return `Ward ${first.cost}`
    case 'PROTECTION_FROM_COLORS':
      return 'Concede protección'
    case 'MODIFY_TARGETING_COST':
      return 'Modifica costes al hacer objetivo'
    case 'SET_LAND_SUBTYPE':
      return `Convierte tierras en ${first.subtype}`
    case 'SET_MAX_HAND_SIZE':
      return 'Modifica tamaño máximo de mano'
    case 'ALLOW_CAST_FROM_LIBRARY_TOP':
      return 'Permite lanzar desde la parte superior'
  }
  return 'Efecto estático'
}

const trackedAbilityLabel = (
  ability: AbilityDefinition,
): string | undefined => {
  switch (ability.kind) {
    case 'TRIGGERED':
      return triggeredAbilityLabel(ability)
    case 'STATIC':
      return staticAbilityLabel(ability)
    case 'ACTIVATED':
      return ability.isManaAbility ? 'Habilidad de maná' : 'Habilidad activada'
    case 'AS_ENTERS':
    case 'SPELL_EFFECT':
      return undefined
  }
}

const parseStat = (value?: string): number | undefined => {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function CardTile({
  instance,
  label,
  onDispatch,
  onDispatchMany,
  manaActivation,
  compact = false,
  activeStaticEffects,
}: Props) {
  const game = useGameStore()
  const card = currentFaceDefinition(instance)
  const statics = activeStaticEffects ?? deriveActiveStaticEffects(game)
  const pt = modifiedPowerToughness(instance, statics)
  const printedPower = parseStat(card.power)
  const printedToughness = parseStat(card.toughness)
  const basePower = printedPower ?? pt?.power
  const baseToughness = printedToughness ?? pt?.toughness
  const effectivePower = pt?.power ?? printedPower
  const effectiveToughness = pt?.toughness ?? printedToughness
  const hasDisplayedStats =
    effectivePower !== undefined && effectiveToughness !== undefined
  const statsChanged =
    hasDisplayedStats &&
    (printedPower === undefined ||
      printedToughness === undefined ||
      effectivePower !== printedPower ||
      effectiveToughness !== printedToughness)

  const cardAbilities =
    instance.zone === 'battlefield' && !instance.phasedOut
      ? effectiveAbilitiesForCard(game, instance)
      : []
  const trackedAbilities = cardAbilities
    .map(trackedAbilityLabel)
    .filter((ability): ability is string => Boolean(ability))
  const activatedAbilities = cardAbilities.filter(
    (ability): ability is Extract<AbilityDefinition, { kind: 'ACTIVATED' }> =>
      ability.kind === 'ACTIVATED',
  )
  const manaAbilities = activatedAbilities.filter(
    (ability) => ability.isManaAbility === true,
  )
  const nonManaActivatedAbilities = activatedAbilities.filter(
    (ability) => ability.isManaAbility !== true,
  )
  const assistedManaAbility =
    !manaActivation && manaAbilities.length === 1 ? manaAbilities[0] : undefined
  const manualManaAvailable =
    instance.zone === 'battlefield' &&
    !instance.phasedOut &&
    !instance.tapped &&
    Boolean(manaActivation || assistedManaAbility)
  const counterEntries = Object.entries(instance.counters).filter(
    ([, amount]) => amount > 0,
  )

  const toggleTap = () => {
    if (instance.tapped) {
      onDispatch({ type: 'UNTAP_CARD', instanceId: instance.instanceId })
      return
    }
    if (manaActivation && onDispatchMany) {
      onDispatchMany(manaActivation.activationActions)
      return
    }
    if (assistedManaAbility) {
      onDispatch({
        type: 'ACTIVATE_ABILITY',
        instanceId: instance.instanceId,
        abilityId: assistedManaAbility.id,
      })
    }
  }

  const activateAbility = () => {
    if (!nonManaActivatedAbilities.length) return
    onDispatch({
      type: 'ACTIVATE_ABILITY',
      instanceId: instance.instanceId,
      ...(nonManaActivatedAbilities.length === 1
        ? { abilityId: nonManaActivatedAbilities[0].id }
        : {}),
    })
  }

  return (
    <article className={`card-tile${instance.tapped ? ' tapped' : ''}${compact ? ' compact-card-tile' : ''}`}>
      <div className="card-visual">
        {card.image ? (
          <img src={card.image} alt="" />
        ) : (
          <div className="card-placeholder">{card.name.slice(0, 1)}</div>
        )}
        <div className="card-topline">
          <span className={`card-state-chip${instance.phasedOut ? ' is-phased-out' : ''}`}>
            {instance.phasedOut
              ? 'Fuera de fase'
              : instance.tapped
                ? 'Girado'
                : 'Listo'}
          </span>
          {hasDisplayedStats ? (
            <span className="card-pt-badge" title={statsChanged ? `Base ${basePower}/${baseToughness}` : undefined}>
              {effectivePower}/{effectiveToughness}
            </span>
          ) : null}
        </div>
        {counterEntries.length ? (
          <div className="card-counter-badges">
            {counterEntries.map(([name, amount]) => (
              <span key={name} className="card-counter-badge">
                {name === '+1/+1' ? `+${amount}` : `${amount} ${name}`}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="card-content">
        <strong>{label ?? card.name}</strong>
        <div className="card-meta-row">
          <small>{card.typeLine}</small>
          {instance.zone === 'stack' ? (
            <small>
              {instance.controllerId ?? instance.controller ?? 'Jugador'} · {instance.stackObjectId}
            </small>
          ) : null}
        </div>
        {statsChanged && hasDisplayedStats ? (
          <small className="card-base-pt">Base {basePower}/{baseToughness}</small>
        ) : null}
        {instance.keywords?.length ? (
          <small className="card-keywords">{instance.keywords.join(', ')}</small>
        ) : null}
        {!compact && trackedAbilities.length ? (
          <details className="tracked-abilities">
            <summary>
              Jarvis · {trackedAbilities.length}{' '}
              {trackedAbilities.length === 1 ? 'habilidad' : 'habilidades'}
            </summary>
            <div>
              {trackedAbilities.map((ability, index) => (
                <small key={`${ability}-${index}`}>• {ability}</small>
              ))}
            </div>
          </details>
        ) : null}
        <div className="card-controls">
          {instance.zone === 'stack' && (
            <button
              onClick={() =>
                onDispatch({
                  type: 'RESOLVE_SPELL',
                  instanceId: instance.instanceId,
                })
              }
            >
              Resolver
            </button>
          )}
          {instance.zone === 'battlefield' &&
          !instance.phasedOut &&
          (instance.tapped || manualManaAvailable) ? (
            <button onClick={toggleTap}>
              {instance.tapped
                ? 'Enderezar'
                : manaActivation
                  ? `Girar → ${manaProductionLabel(manaActivation.production)}`
                  : 'Girar para maná'}
            </button>
          ) : null}
          {instance.zone === 'battlefield' &&
          !instance.phasedOut &&
          nonManaActivatedAbilities.length ? (
            <button
              onClick={activateAbility}
              disabled={game.turnState.priority !== 'WINDOW_OPEN'}
              title={
                game.turnState.priority !== 'WINDOW_OPEN'
                  ? 'No hay prioridad para activar una habilidad.'
                  : undefined
              }
            >
              {nonManaActivatedAbilities.length === 1
                ? 'Activar habilidad'
                : `Activar habilidad (${nonManaActivatedAbilities.length})`}
            </button>
          ) : null}
          <button
            onClick={() =>
              onDispatch({
                type: 'MOVE_CARD',
                instanceId: instance.instanceId,
                toZone: nextZone[instance.zone],
              })
            }
          >
            Mover a {nextZone[instance.zone]}
          </button>
        </div>
      </div>
    </article>
  )
}
