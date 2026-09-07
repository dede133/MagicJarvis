import { useGameStore } from '../store/gameStore'
import { tokenDefinitions } from '../tokens/tokenDefinitions'
import type { ResolvedEffect } from '../abilities/types/abilityTypes'

const effectDescription = (effect: ResolvedEffect): string => {
  if (effect.type === 'CREATE_TOKEN')
    return `Create ${effect.amount} ${tokenDefinitions[effect.tokenId]?.name ?? effect.tokenId}${effect.amount === 1 ? '' : 's'}`
  if (effect.type === 'DRAW_CARD') return `Draw ${effect.amount} card(s)`
  if (effect.type === 'MOVE_ZONE')
    return `Move ${effect.target} to ${effect.destination}`
  if (effect.type === 'UNTAP_PERMANENT') return `Untap ${effect.target}`
  if (effect.type === 'ADD_COUNTER')
    return `Add ${effect.amount} ${effect.counterType} counter to ${effect.target}`
  if (effect.type === 'ADD_MANA') return `Add ${effect.amount} ${effect.color}`
  if (effect.type === 'ADD_MANA_CHOICE') return 'Choose mana color'
  if (effect.type === 'COUNTER_SPELL') return `Counter ${effect.target}`
  if (effect.type === 'DESTROY_PERMANENT') return `Destroy ${effect.target}`
  if (effect.type === 'CANNOT_BE_BLOCKED')
    return `Cannot be blocked: ${effect.target}`
  if (effect.type === 'DISCARD_CARD') return `Discard ${effect.amount} card(s)`
  if (effect.type === 'OPTIONAL_EFFECT') return effect.prompt
  if (effect.type === 'SACRIFICE') return `Sacrifice ${effect.target}`
  if (effect.type === 'FOR_EACH') return 'Apply effects to matching objects'
  if (effect.type === 'CONDITIONAL_EFFECT') return 'Apply conditional effect'
  if (effect.type === 'TAP_PERMANENT') return `Tap ${effect.target}`
  if (effect.type === 'CHOOSE_MODE' || effect.type === 'CHOOSE_VALUE')
    return effect.prompt
  if (effect.type === 'STORE_SOURCE_VALUE') return `Remember ${effect.key}`
  if (effect.type === 'PAYMENT_BRANCH')
    return effect.prompt ?? 'Payment decision'
  return 'Runtime effect'
}

const effectRequiresPlayerDecision = (effect: ResolvedEffect): boolean =>
  effect.type === 'PAYMENT_BRANCH' ||
  effect.type === 'OPTIONAL_EFFECT' ||
  effect.type === 'TARGET_SELECTION' ||
  effect.type === 'CARD_SELECTION' ||
  effect.type === 'CHOOSE_MODE' ||
  effect.type === 'CHOOSE_VALUE' ||
  effect.type === 'SEARCH_LIBRARY_CARD' ||
  effect.type === 'PHYSICAL_CONFIRMATION' ||
  effect.type === 'PLAYER_SELECTION' ||
  effect.type === 'ADD_MANA_CHOICE' ||
  effect.type === 'ADD_MANA_FROM_LINKED_COLORS'

const directPaymentEffect = (
  effects: ResolvedEffect[],
): Extract<ResolvedEffect, { type: 'PAYMENT_BRANCH' }> | undefined => {
  const firstDecision = effects.find(effectRequiresPlayerDecision)
  return firstDecision?.type === 'PAYMENT_BRANCH' ? firstDecision : undefined
}

export function PendingAbilities() {
  const pending = useGameStore((state) => state.pendingAbilities)
  const stack = useGameStore((state) => state.stack)
  const resolvePendingAbility = useGameStore(
    (state) => state.resolvePendingAbility,
  )
  const resolvePendingAbilityPayment = useGameStore(
    (state) => state.resolvePendingAbilityPayment,
  )
  const ignorePendingAbility = useGameStore(
    (state) => state.ignorePendingAbility,
  )
  return (
    <section className="pending-abilities">
      <h2>Pending abilities</h2>
      {pending.length ? (
        pending.map((ability) => {
          const payment = directPaymentEffect(ability.resolvedEffects)
          const stackObject = stack.find(
            (object) => object.pendingAbilityId === ability.id,
          )
          const isTopOfStack =
            !stackObject ||
            stack.at(-1)?.stackObjectId === stackObject.stackObjectId

          if (payment)
            return (
              <article key={ability.id}>
                <strong>⚡ {ability.sourceCardName}</strong>
                <p>{payment.prompt ?? '¿Pagar el coste de la habilidad?'}</p>
                <small>
                  Puedes responder con cualquier acción legal antes de elegir.
                  El turno no avanzará hasta resolver esta habilidad.
                </small>
                {!isTopOfStack ? (
                  <p>Hay una respuesta pendiente encima de esta habilidad.</p>
                ) : null}
                <div>
                  <button
                    disabled={!isTopOfStack}
                    onClick={() =>
                      resolvePendingAbilityPayment(ability.id, 'PAID')
                    }
                  >
                    Pagar
                  </button>
                  <button
                    disabled={!isTopOfStack}
                    onClick={() =>
                      resolvePendingAbilityPayment(ability.id, 'NOT_PAID')
                    }
                  >
                    No pagar
                  </button>
                </div>
              </article>
            )

          return (
            <article key={ability.id}>
              <strong>⚡ {ability.sourceCardName}</strong>
              <p>Triggered ability</p>
              {ability.resolvedEffects.map((effect, index) => (
                <p key={`${effect.type}-${index}`}>
                  {effectDescription(effect)}
                </p>
              ))}
              <button onClick={() => resolvePendingAbility(ability.id)}>
                Resolve
              </button>
              <button onClick={() => ignorePendingAbility(ability.id)}>
                Ignore
              </button>
            </article>
          )
        })
      ) : (
        <p className="empty">No pending abilities.</p>
      )}
    </section>
  )
}
