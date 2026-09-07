import { useState, type ChangeEvent } from 'react'
import { useGameStore } from '../store/gameStore'
import { searchCardByName } from '../services/scryfall/scryfall'

export function PendingDecisions() {
  const [textValues, setTextValues] = useState<Record<string, string>>({})
  const [lookupErrors, setLookupErrors] = useState<Record<string, string>>({})
  const [busyDecisionId, setBusyDecisionId] = useState<string | undefined>(
    undefined,
  )
  const decisions = useGameStore((state) => state.pendingDecisions)
  const cards = useGameStore((state) => state.cards)
  const handCount = useGameStore((state) => state.handCount)
  const hiddenZoneTracking = useGameStore((state) => state.hiddenZoneTracking)
  const localPlayerId = useGameStore((state) => state.localPlayerId)
  const resolve = useGameStore((state) => state.resolvePendingDecision)
  const resolveWithExternalCard = useGameStore(
    (state) => state.resolvePendingDecisionWithExternalCard,
  )
  return (
    <section className="pending-abilities">
      <h2>Pending decisions</h2>
      {decisions.length ? (
        decisions.map((decision) => (
          <article key={decision.id}>
            <strong>⚡ Ability</strong>
            <p>{decision.prompt}</p>
            {(decision.type === 'CARD_SELECTION' &&
              decision.constraints?.zones?.includes('hand')) ||
            (decision.type === 'HIDDEN_ZONE_CARD_SELECTION' &&
              decision.continuation.hiddenZoneSelection?.zone === 'hand') ? (
              <small>
                Known hand:{' '}
                {cards.filter((card) => card.zone === 'hand').length}
                {hiddenZoneTracking === 'COUNTS_ONLY'
                  ? ` · Unknown cards: ${Math.max(0, handCount - cards.filter((card) => card.zone === 'hand').length)}`
                  : ' · Hidden hand not tracked'}
              </small>
            ) : null}
            {decision.type === 'OPTIONAL_EFFECT' ? (
              <div>
                <button onClick={() => resolve(decision.id, 'YES')}>Yes</button>
                <button onClick={() => resolve(decision.id, 'NO')}>No</button>
              </div>
            ) : (
              <div>
                {decision.options?.map((option) => (
                  <button
                    key={option.instanceId}
                    onClick={() => resolve(decision.id, option.instanceId)}
                  >
                    {option.label}
                  </button>
                ))}
                {decision.acceptsTextValue ? (
                  <div>
                    <input
                      aria-label={decision.textValueLabel ?? 'Choice value'}
                      value={textValues[decision.id] ?? ''}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setTextValues((current) => ({
                          ...current,
                          [decision.id]: event.target.value,
                        }))
                      }
                      placeholder={decision.textValueLabel ?? 'Type a value'}
                    />
                    <button
                      disabled={
                        !(textValues[decision.id] ?? '').trim() ||
                        busyDecisionId === decision.id
                      }
                      onClick={() => {
                        const value = (textValues[decision.id] ?? '').trim()
                        if (!value) return
                        const externalLibrarySearch =
                          decision.type === 'HIDDEN_ZONE_CARD_SELECTION' &&
                          decision.continuation.librarySearch?.playerId !==
                            undefined &&
                          decision.continuation.librarySearch.playerId !==
                            localPlayerId
                        if (
                          decision.type !== 'PUBLIC_ZONE_CARD_SELECTION' &&
                          !externalLibrarySearch
                        ) {
                          resolve(decision.id, value)
                          return
                        }
                        setBusyDecisionId(decision.id)
                        setLookupErrors((current) => ({
                          ...current,
                          [decision.id]: '',
                        }))
                        void searchCardByName(value)
                          .then((card) => {
                            resolveWithExternalCard(decision.id, card)
                            const unresolved = useGameStore
                              .getState()
                              .pendingDecisions.some(
                                (candidate) => candidate.id === decision.id,
                              )
                            if (unresolved)
                              throw new Error(
                                `${card.name} no cumple las restricciones de esta elección.`,
                              )
                            setTextValues((current) => ({
                              ...current,
                              [decision.id]: '',
                            }))
                          })
                          .catch((error: unknown) => {
                            setLookupErrors((current) => ({
                              ...current,
                              [decision.id]:
                                error instanceof Error
                                  ? error.message
                                  : 'No se pudo resolver la carta declarada.',
                            }))
                          })
                          .finally(() => setBusyDecisionId(undefined))
                      }}
                    >
                      {busyDecisionId === decision.id ? 'Buscando…' : 'Confirm'}
                    </button>
                    {lookupErrors[decision.id] ? (
                      <small>⚠ {lookupErrors[decision.id]}</small>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </article>
        ))
      ) : (
        <p className="empty">No pending decisions.</p>
      )}
    </section>
  )
}
