import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { getVoicePhraseHints } from '../voice/contextualVocabulary'
import { getVoiceLanguagePack, type VoiceLanguageId } from '../voice/languages'
import { BrowserSpeechRecognitionProvider } from '../voice/providers/browserSpeechRecognitionProvider'
import type { SpeechToTextStatus } from '../voice/types/speechToText'
import {
  processSpeechToTextCommand,
  processSpeechToTextResult,
  type VoiceCommandHistoryEntry,
  type VoiceProcessingResult,
} from '../voice/voiceCommandExecution'
import {
  clearVoiceNlpFeedback,
  readVoiceNlpFeedback,
  saveVoiceNlpFeedback,
  serializeVoiceNlpFeedback,
  type VoiceNlpFeedbackLabel,
} from '../voice/nlp/voiceNlpFeedback'
import { VOICE_FEATURE_FLAGS } from '../voice/voiceFeatureFlags'
import { VoiceProcessingCoordinator } from '../voice/voiceProcessingCoordinator'
import { VoiceConversationSession } from '../voice/v3/VoiceConversationSession'
import {
  VoiceListeningController,
  type VoiceListeningDebugEvent,
  type VoiceListeningMode,
} from '../voice/voiceListeningController'

type Props = {
  voiceLanguageId: VoiceLanguageId
  onVoiceResult: (entry: VoiceCommandHistoryEntry) => void
  onVoiceError: (message: string, transcript?: string) => void
  onEditTranscript: (transcript: string) => void
}

const labelFor = (status: SpeechToTextStatus): string =>
  ({
    IDLE: '🎙️ Mantén para hablar',
    LISTENING: '🎙️ Listening…',
    PROCESSING: 'Procesando voz…',
    SUCCESS: '🎙️ Mantén para hablar',
    ERROR: '🎙️ Reintentar voz',
    UNAVAILABLE: 'Voz no disponible',
  })[status]

/** UI shell only: all transcript interpretation lives in voiceCommandExecution. */
export function VoiceCommandControls({
  voiceLanguageId,
  onVoiceResult,
  onVoiceError,
  onEditTranscript,
}: Props) {
  const game = useGameStore()
  const languagePack = useMemo(
    () => getVoiceLanguagePack(voiceLanguageId),
    [voiceLanguageId],
  )
  const controller = useMemo(
    () =>
      new VoiceListeningController(
        new BrowserSpeechRecognitionProvider(languagePack),
        {
          continuousEnabled: VOICE_FEATURE_FLAGS.continuousListeningEnabled,
          // Match-long hardening: if a browser session goes silent/stuck for a
          // long time, renew it without clearing the user's listening request.
          watchdogIntervalMs: 30_000,
          staleSessionMs: 5 * 60_000,
          languagePack,
        },
      ),
    [languagePack],
  )
  const conversationSession = useMemo(() => new VoiceConversationSession(), [])
  const processingCoordinator = useMemo(
    () => new VoiceProcessingCoordinator(),
    [],
  )
  const [mode, setMode] = useState<VoiceListeningMode>(controller.getMode())
  const [status, setStatus] = useState<SpeechToTextStatus>(
    controller.isAvailable() ? 'IDLE' : 'UNAVAILABLE',
  )
  const [lastVoice, setLastVoice] = useState<VoiceCommandHistoryEntry>()
  const [continuousDebug, setContinuousDebug] = useState<string[]>([])
  const [feedbackCandidates, setFeedbackCandidates] = useState<
    VoiceCommandHistoryEntry[]
  >([])
  const [feedbackCount, setFeedbackCount] = useState(
    () => readVoiceNlpFeedback().length,
  )
  const [feedbackNotice, setFeedbackNotice] = useState<string>()

  useEffect(
    () => () => {
      processingCoordinator.invalidate()
      conversationSession.clear()
      controller.stopListening()
    },
    [controller, conversationSession, processingCoordinator],
  )

  useEffect(() => {
    const recover = (reason: string) => {
      if (controller.isContinuousListening())
        controller.recoverContinuousListening(reason)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') recover('tab-visible')
    }
    const onOnline = () => recover('network-online')
    const onPageShow = () => recover('page-show')

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [controller])

  useEffect(() => {
    if (
      languagePack.id !== 'es' ||
      (!VOICE_FEATURE_FLAGS.nlpIntentShadowEnabled &&
        !VOICE_FEATURE_FLAGS.nlpIntentAssistedEnabled)
    )
      return
    void import('../voice/nlp/voiceIntentClassifier')
      .then(({ warmVoiceIntentClassifier }) => warmVoiceIntentClassifier())
      .catch((error: unknown) => {
        if (import.meta.env.DEV)
          console.warn('MagicJarvis NLP warmup failed', error)
      })
  }, [languagePack.id])

  const appendContinuousDebug = (message: string) => {
    setContinuousDebug((current) => [message, ...current].slice(0, 8))
  }

  const logControllerDebug = (event: VoiceListeningDebugEvent) => {
    appendContinuousDebug(`${event.type}: ${event.message}`)
    if (import.meta.env.DEV) console.info('MagicJarvis continuous voice', event)
  }

  const rememberFeedbackCandidates = (
    entries: readonly VoiceCommandHistoryEntry[],
  ) => {
    if (!VOICE_FEATURE_FLAGS.nlpFeedbackEnabled) return
    const candidates = entries.filter((entry) => entry.nlpIntent)
    if (!candidates.length) return
    setFeedbackCandidates((current) =>
      [...candidates].reverse().concat(current).slice(0, 8),
    )
  }

  const recordNlpFeedback = (
    entry: VoiceCommandHistoryEntry,
    label: VoiceNlpFeedbackLabel,
  ) => {
    const saved = saveVoiceNlpFeedback(entry, label)
    setFeedbackCount(readVoiceNlpFeedback().length)
    setFeedbackNotice(
      `${label === 'ACTION' ? 'Orden' : 'Conversación'} guardada: ${saved.transcript}`,
    )
  }

  const exportNlpFeedback = () => {
    const records = readVoiceNlpFeedback()
    if (!records.length) return
    const blob = new Blob([serializeVoiceNlpFeedback(records)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `magicjarvis-voice-nlp-feedback-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setFeedbackNotice(`${records.length} ejemplos exportados.`)
  }

  const clearNlpFeedback = () => {
    clearVoiceNlpFeedback()
    setFeedbackCount(0)
    setFeedbackNotice('Feedback NLP local borrado.')
  }

  const applyProcessingResult = (
    result: VoiceProcessingResult,
    listeningMode: VoiceListeningMode,
  ) => {
    if (result.status !== 'SUCCESS') {
      if (listeningMode === 'continuous') {
        appendContinuousDebug(`ERROR: ${result.message}`)
        onVoiceError(result.message)
        return
      }
      setStatus(result.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR')
      onVoiceError(result.message)
      return
    }

    const entries = result.entries
    const entry = result.entry
    setLastVoice(entry)
    rememberFeedbackCandidates(entries)
    for (const voiceEntry of entries) onVoiceResult(voiceEntry)

    if (listeningMode === 'continuous') {
      for (const voiceEntry of entries) {
        appendContinuousDebug(
          `${voiceEntry.ignored ? 'IGNORE' : voiceEntry.successful ? 'OK' : 'FAIL'}: ${voiceEntry.rawTranscript} → ${voiceEntry.result}`,
        )
        if (voiceEntry.semanticIntent)
          appendContinuousDebug(
            `V3_${voiceEntry.semanticDecision ?? 'SHADOW'}: ${voiceEntry.semanticIntent} ${voiceEntry.semanticScore ?? 0} · V2 ${voiceEntry.v2Parsed ?? '—'}`,
          )
        if (voiceEntry.nlpIntent)
          appendContinuousDebug(
            `NLP_SHADOW: ${voiceEntry.nlpIntent} ${((voiceEntry.nlpScore ?? 0) * 100).toFixed(1)}%`,
          )
      }
      if (!controller.isContinuousListening())
        setStatus(
          entry.ignored ? 'IDLE' : entry.successful ? 'SUCCESS' : 'ERROR',
        )
    } else {
      setStatus(entry.ignored ? 'IDLE' : entry.successful ? 'SUCCESS' : 'ERROR')
    }

    if (import.meta.env.DEV)
      console.info('MagicJarvis voice command', {
        rawTranscript: entry.rawTranscript,
        normalizedTranscript: entry.normalizedTranscript,
        confidence: entry.confidence,
        parsed: entry.parsed,
        result: entry.result,
        durationMs: entry.durationMs,
        commandCount: entries.length,
        listeningMode,
        nlpIntent: entry.nlpIntent,
        nlpScore: entry.nlpScore,
        nlpDecision: entry.nlpDecision,
        semanticIntent: entry.semanticIntent,
        semanticScore: entry.semanticScore,
        semanticDecision: entry.semanticDecision,
        v2Parsed: entry.v2Parsed,
      })
  }

  const startPushToTalk = () => {
    if (!controller.isAvailable()) {
      setStatus('UNAVAILABLE')
      onVoiceError('Voice recognition is not available in this browser.')
      return
    }
    setStatus('LISTENING')
    void processSpeechToTextCommand(controller, game, {
      autoExecuteVoiceCommands: true,
      conversationSession,
      languagePack,
    }).then((result) => {
      setStatus('PROCESSING')
      applyProcessingResult(result, 'push-to-talk')
    })
  }

  const stopPushToTalk = () => {
    if (status === 'LISTENING') controller.stopListening()
  }

  const startContinuous = () => {
    if (!controller.isAvailable()) {
      setStatus('UNAVAILABLE')
      onVoiceError('Voice recognition is not available in this browser.')
      return
    }

    setContinuousDebug([])
    setStatus('LISTENING')
    const processingGeneration = processingCoordinator.beginSession()
    const started = controller.startContinuousListening(
      () => ({
        maxAlternatives: 5,
        // Refresh contextual biasing on every browser-session restart so a
        // multi-hour match follows the current battlefield/stack/decision.
        phraseHints: getVoicePhraseHints(useGameStore.getState(), languagePack),
      }),
      {
        onResult: (speech) => {
          appendContinuousDebug(`HEARD: ${speech.transcript}`)
          if (
            languagePack.id === 'es' &&
            VOICE_FEATURE_FLAGS.nlpIntentShadowEnabled
          ) {
            void import('../voice/nlp/voiceIntentClassifier')
              .then(({ classifyVoiceIntent }) =>
                classifyVoiceIntent(speech.transcript),
              )
              .then((classification) => {
                appendContinuousDebug(
                  `NLP_SHADOW: ${classification.intent} ${(classification.score * 100).toFixed(1)}%${classification.isActionIntent ? ' ACTION' : ''}`,
                )
                if (import.meta.env.DEV)
                  console.info('MagicJarvis NLP shadow', classification)
              })
              .catch((error: unknown) => {
                const message =
                  error instanceof Error ? error.message : 'NLP shadow failed'
                appendContinuousDebug(`NLP_SHADOW_ERROR: ${message}`)
              })
          }
          // Final utterances can arrive while the previous one is still being
          // interpreted. Serialize them and bind them to this listening
          // generation so Stop/mode switch/unmount can invalidate stale work.
          void processingCoordinator
            .enqueue(processingGeneration, async (lease) => {
              const result = await processSpeechToTextResult(
                speech,
                useGameStore.getState(),
                {
                  autoExecuteVoiceCommands: true,
                  // Continuous is experimental and intentionally conservative.
                  commandGateEnabled: true,
                  isExecutionAllowed: lease.isCurrent,
                  conversationSession,
                  languagePack,
                },
              )
              if (!lease.isCurrent()) return
              applyProcessingResult(result, 'continuous')
            })
            .catch((error: unknown) => {
              if (!processingCoordinator.isCurrent(processingGeneration)) return
              const message =
                error instanceof Error
                  ? error.message
                  : 'Unexpected continuous voice processing error.'
              appendContinuousDebug(`ERROR: ${message}`)
              onVoiceError(message, speech.transcript)
            })
        },
        onError: (failure) => {
          processingCoordinator.invalidate()
          conversationSession.clear()
          const message =
            failure.error?.message ?? 'Continuous voice recognition failed.'
          appendContinuousDebug(`STOPPED: ${message}`)
          setStatus(failure.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR')
          onVoiceError(message)
        },
        onDebug: logControllerDebug,
      },
    )

    if (!started) {
      processingCoordinator.invalidate()
      setStatus('ERROR')
      onVoiceError('Continuous voice recognition is not available.')
    }
  }

  const stopContinuous = () => {
    processingCoordinator.invalidate()
    controller.stopListening()
    conversationSession.clear()
    setStatus(controller.isAvailable() ? 'IDLE' : 'UNAVAILABLE')
  }

  const changeMode = (nextMode: VoiceListeningMode) => {
    if (nextMode === mode) return
    if (!controller.setMode(nextMode)) return
    processingCoordinator.invalidate()
    conversationSession.clear()
    setMode(controller.getMode())
    setContinuousDebug([])
    setStatus(controller.isAvailable() ? 'IDLE' : 'UNAVAILABLE')
  }

  const continuousActive =
    mode === 'continuous' && controller.isContinuousListening()

  return (
    <section className="voice-controls">
      <h3>Voz experimental</h3>
      <div
        className="voice-mode-selector"
        role="group"
        aria-label="Modo de voz"
      >
        <button
          type="button"
          className={mode === 'push-to-talk' ? 'primary' : undefined}
          onClick={() => changeMode('push-to-talk')}
          disabled={status === 'PROCESSING'}
        >
          Push-to-talk
        </button>
        <button
          type="button"
          className={mode === 'continuous' ? 'primary' : undefined}
          onClick={() => changeMode('continuous')}
          disabled={
            status === 'PROCESSING' || !controller.canUseMode('continuous')
          }
          title={
            controller.canUseMode('continuous')
              ? 'Escucha continua experimental'
              : 'Escucha continua no disponible'
          }
        >
          Continuous
        </button>
      </div>

      {status === 'UNAVAILABLE' ? (
        <p className="empty">
          Voice recognition is not available in this browser.
        </p>
      ) : mode === 'push-to-talk' ? (
        <>
          <button
            type="button"
            className={status === 'LISTENING' ? 'primary' : undefined}
            onPointerDown={startPushToTalk}
            onPointerUp={stopPushToTalk}
            onPointerCancel={stopPushToTalk}
            disabled={status === 'PROCESSING'}
          >
            {labelFor(status)}
          </button>
          <button
            type="button"
            onClick={() =>
              status === 'LISTENING' ? stopPushToTalk() : startPushToTalk()
            }
            disabled={status === 'PROCESSING'}
          >
            {status === 'LISTENING' ? 'Detener' : 'Click para iniciar'}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={continuousActive ? 'primary' : undefined}
            onClick={continuousActive ? stopContinuous : startContinuous}
          >
            {continuousActive
              ? '🔴 Detener escucha continua'
              : '🎙️ Iniciar escucha continua'}
          </button>
          <small className="voice-continuous-note">
            Continuous usa Command Gate automáticamente, solo procesa frases
            finales y mantiene la escucha solicitada durante toda la partida
            hasta que pulses Detener.
            {VOICE_FEATURE_FLAGS.semanticVoiceV3Enabled
              ? ' Voice V3 usa gramática semántica + slots del GameState para las familias migradas; V2 queda como fallback.'
              : ''}
            {VOICE_FEATURE_FLAGS.nlpIntentShadowEnabled
              ? ' NLP.js queda solo en shadow para diagnóstico: no ejecuta, bloquea ni rescata comandos.'
              : ''}
          </small>
          {continuousDebug.length ? (
            <details className="voice-debug">
              <summary>Debug de voz ({continuousDebug.length})</summary>
              <ol>
                {continuousDebug.map((message, index) => (
                  <li key={`${index}-${message}`}>{message}</li>
                ))}
              </ol>
            </details>
          ) : null}
        </>
      )}

      {VOICE_FEATURE_FLAGS.nlpFeedbackEnabled ? (
        <details className="voice-debug">
          <summary>Feedback NLP ({feedbackCount} guardados)</summary>
          <p className="empty">
            Marca frases reales para calibrar el corpus después. Estos botones
            no reentrenan NLP ni cambian la ejecución actual.
          </p>
          {feedbackCandidates.length ? (
            <ol>
              {feedbackCandidates.map((entry, index) => (
                <li
                  key={`${index}-${entry.rawTranscript}-${entry.nlpIntent ?? 'none'}`}
                >
                  <div>
                    <strong>{entry.rawTranscript}</strong>
                    <small>
                      NLP: {entry.nlpIntent ?? '—'}{' '}
                      {typeof entry.nlpScore === 'number'
                        ? `${(entry.nlpScore * 100).toFixed(1)}%`
                        : ''}{' '}
                      · Parser: {entry.parsed}
                    </small>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => recordNlpFeedback(entry, 'ACTION')}
                    >
                      ✓ Era una orden
                    </button>
                    <button
                      type="button"
                      onClick={() => recordNlpFeedback(entry, 'NOT_ACTION')}
                    >
                      ✗ No era una orden
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty">Aún no hay frases NLP recientes.</p>
          )}
          <div>
            <button
              type="button"
              onClick={exportNlpFeedback}
              disabled={feedbackCount === 0}
            >
              Exportar JSON
            </button>
            <button
              type="button"
              onClick={clearNlpFeedback}
              disabled={feedbackCount === 0}
            >
              Borrar feedback
            </button>
          </div>
          {feedbackNotice ? <small>{feedbackNotice}</small> : null}
        </details>
      ) : null}

      {lastVoice ? (
        <article
          className={
            lastVoice.ignored
              ? undefined
              : lastVoice.successful
                ? 'command-success'
                : 'command-error'
          }
        >
          <small>He entendido: {lastVoice.rawTranscript}</small>
          <small>Normalized: {lastVoice.normalizedTranscript}</small>
          <small>Parsed: {lastVoice.parsed}</small>
          <strong>{lastVoice.result}</strong>
          <div>
            {lastVoice.successful ? (
              <button type="button" onClick={() => game.undoLastAction()}>
                Undo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onEditTranscript(lastVoice.normalizedTranscript)}
            >
              Editar comando
            </button>
          </div>
        </article>
      ) : null}
    </section>
  )
}
