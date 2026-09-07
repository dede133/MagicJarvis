import { useEffect, useMemo, useState } from 'react'
import { GameBoard } from './components/GameBoard'
import { availableDeckRecipes } from './data/decks/deckCatalog'
import { parseDeckList } from './data/deckParser'
import { createStartedGameFromMatch } from './game/createGameFromDeck'
import { resolveDeckList } from './services/deckResolver'
import { useGameStore } from './store/gameStore'
import {
  clearMatchRecoverySnapshot,
  loadMatchRecoverySnapshot,
} from './persistence/matchRecovery'
import {
  getResolvedDeckCommanders,
  type DeckDefinition,
  type DeckList,
} from './types/deck'
import {
  DEFAULT_VOICE_LANGUAGE_ID,
  VOICE_LANGUAGE_OPTIONS,
  type VoiceLanguageId,
} from './voice/languages'

type DeckLoadState =
  | { status: 'loading'; list: DeckList }
  | { status: 'error'; list: DeckList; message: string }
  | {
      status: 'unresolved'
      list: DeckList
      notFound: string[]
      resolvedUniqueCards: number
    }
  | {
      status: 'ready'
      list: DeckList
      deck: DeckDefinition
      resolvedUniqueCards: number
    }

type DeckLoadMap = Record<string, DeckLoadState>

const mainboardTotal = (list: DeckList): number =>
  list.mainboard.reduce((total, entry) => total + entry.quantity, 0)

function DeckChoice({
  deckId,
  loadState,
  selected,
  onSelect,
}: {
  deckId: string
  loadState: DeckLoadState
  selected: boolean
  onSelect: () => void
}) {
  const recipe = availableDeckRecipes.find(
    (candidate) => candidate.id === deckId,
  )
  const commanderNames = loadState.list.commanders?.length
    ? loadState.list.commanders.map((entry) => entry.name)
    : [loadState.list.commander.name]
  const commanders =
    loadState.status === 'ready'
      ? getResolvedDeckCommanders(loadState.deck)
      : []

  return (
    <button
      type="button"
      className={`deck-choice${selected ? ' selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="deck-choice-art">
        {commanders.length ? (
          commanders.map((entry) =>
            entry.card.image ? (
              <img key={entry.card.scryfallId} src={entry.card.image} alt="" />
            ) : (
              <div
                className="deck-choice-placeholder"
                key={entry.card.scryfallId}
              >
                {entry.name.slice(0, 1)}
              </div>
            ),
          )
        ) : (
          <div className="deck-choice-placeholder">
            {recipe?.name.slice(0, 1) ?? '?'}
          </div>
        )}
      </div>
      <div className="deck-choice-copy">
        <span className="eyebrow">{recipe?.subtitle ?? 'Commander'}</span>
        <strong>{recipe?.name ?? deckId}</strong>
        <small>{commanderNames.join(' + ')}</small>
        <small>
          {mainboardTotal(loadState.list)} mainboard ·{' '}
          {loadState.status === 'ready' || loadState.status === 'unresolved'
            ? `${loadState.resolvedUniqueCards} únicas resueltas`
            : loadState.status === 'loading'
              ? 'Resolviendo cartas…'
              : 'No disponible'}
        </small>
        {loadState.status === 'unresolved' ? (
          <span className="deck-choice-error">
            Faltan {loadState.notFound.length} cartas
          </span>
        ) : null}
        {loadState.status === 'error' ? (
          <span className="deck-choice-error">{loadState.message}</span>
        ) : null}
      </div>
      <span className="deck-choice-check">{selected ? '✓' : ''}</span>
    </button>
  )
}

function MatchDeckSelector({
  title,
  selectedDeckId,
  loadStates,
  onChange,
}: {
  title: string
  selectedDeckId: string
  loadStates: DeckLoadMap
  onChange: (deckId: string) => void
}) {
  return (
    <section className="match-seat">
      <div className="match-seat-heading">
        <span className="match-seat-dot" />
        <div>
          <p className="eyebrow">{title}</p>
          <h2>Elige mazo</h2>
        </div>
      </div>
      <div className="deck-choice-list">
        {availableDeckRecipes.map((recipe) => (
          <DeckChoice
            key={recipe.id}
            deckId={recipe.id}
            loadState={loadStates[recipe.id]}
            selected={selectedDeckId === recipe.id}
            onSelect={() => onChange(recipe.id)}
          />
        ))}
      </div>
    </section>
  )
}

export default function App() {
  const replaceGame = useGameStore((state) => state.replaceGame)
  const parsedDecks = useMemo(
    () =>
      Object.fromEntries(
        availableDeckRecipes.map((recipe) => [
          recipe.id,
          parseDeckList(recipe.text),
        ]),
      ) as Record<string, DeckList>,
    [],
  )
  const [loadStates, setLoadStates] = useState<DeckLoadMap>(() =>
    Object.fromEntries(
      availableDeckRecipes.map((recipe) => [
        recipe.id,
        {
          status: 'loading',
          list: parsedDecks[recipe.id],
        } satisfies DeckLoadState,
      ]),
    ),
  )
  const [player1DeckId, setPlayer1DeckId] = useState('namor')
  const [player2DeckId, setPlayer2DeckId] = useState('cute')
  const [voiceLanguageId, setVoiceLanguageId] = useState<VoiceLanguageId>(
    DEFAULT_VOICE_LANGUAGE_ID,
  )
  const [started, setStarted] = useState(false)
  const [recovery, setRecovery] = useState(() => loadMatchRecoverySnapshot())

  useEffect(() => {
    let active = true
    availableDeckRecipes.forEach((recipe) => {
      const list = parsedDecks[recipe.id]
      void resolveDeckList(recipe.name, list)
        .then((resolution) => {
          if (!active) return
          setLoadStates((current) => ({
            ...current,
            [recipe.id]: resolution.deck
              ? {
                  status: 'ready',
                  list,
                  deck: resolution.deck,
                  resolvedUniqueCards: resolution.resolvedUniqueCards,
                }
              : {
                  status: 'unresolved',
                  list,
                  notFound: resolution.notFound,
                  resolvedUniqueCards: resolution.resolvedUniqueCards,
                },
          }))
        })
        .catch((error: unknown) => {
          if (!active) return
          setLoadStates((current) => ({
            ...current,
            [recipe.id]: {
              status: 'error',
              list,
              message:
                error instanceof Error
                  ? error.message
                  : `No se pudo resolver ${recipe.name} con Scryfall.`,
            },
          }))
        })
    })
    return () => {
      active = false
    }
  }, [parsedDecks])

  if (!started) {
    const player1 = loadStates[player1DeckId]
    const player2 = loadStates[player2DeckId]
    const canStart = player1?.status === 'ready' && player2?.status === 'ready'
    return (
      <main className="match-setup">
        <header className="match-setup-header">
          <div>
            <p className="eyebrow">MagicJarvis · Tabletop assistant</p>
            <h1>Preparar partida 1 vs 1</h1>
            <p className="match-setup-lead">
              El mazo determina vocabulario y reglas conocidas. Las manos siguen
              siendo físicas y desconocidas.
            </p>
          </div>
          <div className="match-format-pill">Commander · 40 vidas</div>
        </header>

        {recovery ? (
          <section
            className="match-start-card"
            aria-label="Recuperación de partida"
          >
            <div>
              <p className="eyebrow">Partida recuperable</p>
              <strong>Hay una partida guardada localmente</strong>
              <small>
                Guardada {new Date(recovery.savedAt).toLocaleString()} · turno{' '}
                {recovery.game.turn} · {recovery.game.activePlayerId}
              </small>
            </div>
            <div>
              <button
                type="button"
                className="primary match-start-button"
                onClick={() => {
                  replaceGame(recovery.game, {
                    transactions: recovery.transactions,
                  })
                  setRecovery(undefined)
                  setStarted(true)
                }}
              >
                Recuperar partida
              </button>
              <button
                type="button"
                onClick={() => {
                  clearMatchRecoverySnapshot()
                  setRecovery(undefined)
                }}
              >
                Descartar guardado
              </button>
            </div>
          </section>
        ) : null}

        <section className="voice-language-card" aria-label="Idioma de voz">
          <div>
            <p className="eyebrow">Idioma de voz</p>
            <strong>Elige el idioma para toda la partida</strong>
          </div>
          <div
            className="voice-language-options"
            role="group"
            aria-label="Idioma de voz"
          >
            {VOICE_LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`voice-language-option${
                  voiceLanguageId === option.id ? ' selected' : ''
                }`}
                aria-pressed={voiceLanguageId === option.id}
                onClick={() => setVoiceLanguageId(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <div className="versus-layout">
          <MatchDeckSelector
            title="Jugador 1 · Tú"
            selectedDeckId={player1DeckId}
            loadStates={loadStates}
            onChange={setPlayer1DeckId}
          />
          <div className="versus-mark" aria-hidden="true">
            VS
          </div>
          <MatchDeckSelector
            title="Jugador 2 · Rival"
            selectedDeckId={player2DeckId}
            loadStates={loadStates}
            onChange={setPlayer2DeckId}
          />
        </div>

        <section className="match-start-card">
          <div>
            <p className="eyebrow">Primer jugador</p>
            <strong>Se elegirá aleatoriamente al comenzar</strong>
            <small>
              Después, “paso turno” alternará automáticamente el contexto del
              mazo activo.
            </small>
          </div>
          <button
            className="primary match-start-button"
            disabled={!canStart}
            onClick={() => {
              if (player1.status !== 'ready' || player2.status !== 'ready')
                return
              const startingPlayerId =
                Math.random() < 0.5 ? 'player-1' : 'player-2'
              clearMatchRecoverySnapshot()
              replaceGame(
                createStartedGameFromMatch({
                  player1Deck: player1.deck,
                  player2Deck: player2.deck,
                  startingPlayerId,
                }),
              )
              setStarted(true)
            }}
          >
            {canStart ? 'Empezar partida' : 'Resolviendo mazos…'}
          </button>
        </section>
      </main>
    )
  }

  return (
    <>
      <GameBoard voiceLanguageId={voiceLanguageId} />
      <footer>El juego físico sigue siendo la fuente de verdad.</footer>
    </>
  )
}
