import { useState, type ChangeEvent } from 'react'
import { searchCardByName } from '../services/scryfall/scryfall'
import { useGameStore } from '../store/gameStore'
import { opponentPlayerIds } from '../rules/players/playerState'
import type { Zone } from '../types/card'

type ExternalZone = Extract<Zone, 'battlefield' | 'graveyard' | 'exile'>

const externalInstanceId = (scryfallId: string): string =>
  `external-${scryfallId}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`

/**
 * Physical-table bridge: a rival object only enters Jarvis after the player
 * explicitly identifies it. Scryfall supplies characteristics, never hidden
 * information or an inferred identity.
 */
export function ExternalObjectsPanel() {
  const game = useGameStore()
  const [name, setName] = useState('')
  const [zone, setZone] = useState<ExternalZone>('battlefield')
  const [attacking, setAttacking] = useState(false)
  const [manaSpent, setManaSpent] = useState('')
  const [attackTaxPaid, setAttackTaxPaid] = useState('0')
  const [status, setStatus] = useState<string>()
  const [busy, setBusy] = useState(false)

  const opponentId =
    opponentPlayerIds(game, game.localPlayerId ?? 'player-1')[0] ?? 'player-2'

  const resolveDefinition = async () => {
    const query = name.trim()
    if (!query) throw new Error('Indica el nombre exacto de la carta.')
    return searchCardByName(query)
  }

  const declareCard = async () => {
    setBusy(true)
    try {
      const card = await resolveDefinition()
      const instanceId = externalInstanceId(card.scryfallId)
      game.dispatch({
        type: 'DECLARE_EXTERNAL_CARD',
        instanceId,
        card,
        zone,
        controllerId: opponentId,
        knownBecause: 'DECLARED',
      })
      if (zone === 'battlefield' && attacking) {
        const paid = Number(attackTaxPaid)
        if (!Number.isSafeInteger(paid) || paid < 0)
          throw new Error(
            'Indica el impuesto genérico total pagado por la declaración de atacantes.',
          )
        game.dispatch({
          type: 'DECLARE_EXTERNAL_ATTACKER',
          instanceId,
          genericTaxPaid: paid,
        })
      }
      setStatus(
        `✓ ${card.name} registrada en ${zone}${
          zone === 'battlefield' && attacking ? ' como atacante' : ''
        }.`,
      )
      setName('')
      setAttackTaxPaid('0')
    } catch (error) {
      setStatus(
        `⚠ ${error instanceof Error ? error.message : 'No se pudo resolver la carta.'}`,
      )
    } finally {
      setBusy(false)
    }
  }

  const declareSpell = async () => {
    setBusy(true)
    try {
      const card = await resolveDefinition()
      const spent = Number(manaSpent)
      if (!Number.isSafeInteger(spent) || spent < 0)
        throw new Error('Indica cuánto maná gastó realmente el rival.')
      game.declareExternalSpell(card, spent)
      setStatus(`✓ El rival lanza ${card.name} gastando ${spent} de maná.`)
      setName('')
      setManaSpent('')
    } catch (error) {
      setStatus(
        `⚠ ${error instanceof Error ? error.message : 'No se pudo resolver la carta.'}`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="command-console">
      <h2>Objetos físicos del rival</h2>
      <p className="empty">
        Registra solo cartas que un jugador haya declarado o hecho públicas.
      </p>
      <input
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setName(event.target.value)
        }
        placeholder="Nombre exacto, p. ej. Cyclonic Rift"
        aria-label="Carta externa"
      />
      <div>
        <input
          type="number"
          min={0}
          step={1}
          value={manaSpent}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setManaSpent(event.target.value)
          }
          placeholder="Maná gastado"
          aria-label="Maná gastado por el rival"
        />
        <button
          className="primary"
          disabled={
            busy ||
            !name.trim() ||
            manaSpent.trim() === '' ||
            !Number.isSafeInteger(Number(manaSpent)) ||
            Number(manaSpent) < 0
          }
          onClick={() => void declareSpell()}
        >
          Rival lanza
        </button>
        <select
          value={zone}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const nextZone = event.target.value as ExternalZone
            setZone(nextZone)
            if (nextZone !== 'battlefield') setAttacking(false)
          }}
        >
          <option value="battlefield">Battlefield</option>
          <option value="graveyard">Graveyard</option>
          <option value="exile">Exile</option>
        </select>
        {zone === 'battlefield' ? (
          <>
            <label>
              <input
                type="checkbox"
                checked={attacking}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setAttacking(event.target.checked)
                }
              />
              Está atacando
            </label>
            {attacking ? (
              <label>
                Impuesto genérico total pagado por la declaración
                <input
                  inputMode="numeric"
                  value={attackTaxPaid}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setAttackTaxPaid(event.target.value)
                  }
                />
              </label>
            ) : null}
          </>
        ) : null}
        <button
          disabled={busy || !name.trim()}
          onClick={() => void declareCard()}
        >
          Registrar carta
        </button>
      </div>
      {status ? <small>{status}</small> : null}
    </section>
  )
}
