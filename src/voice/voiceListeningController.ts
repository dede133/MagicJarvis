import { DEFAULT_VOICE_LANGUAGE_PACK, type VoiceLanguagePack } from './languages'
import type {
  ContinuousSpeechToTextCallbacks,
  SpeechToTextFailure,
  SpeechToTextListenOptions,
  SpeechToTextProvider,
  SpeechToTextResult,
  SpeechToTextSuccess,
} from './types/speechToText'

export type VoiceListeningMode = 'push-to-talk' | 'continuous'

export type ContinuousListenOptionsSource =
  | SpeechToTextListenOptions
  | (() => SpeechToTextListenOptions)

export type VoiceListeningControllerOptions = {
  initialMode?: VoiceListeningMode
  continuousEnabled?: boolean
  duplicateWindowMs?: number
  restartDelayMs?: number
  maxRestartDelayMs?: number
  /**
   * Optional long-session watchdog. Keep disabled in the generic controller by
   * default; the UI enables it for match-long continuous listening.
   */
  watchdogIntervalMs?: number
  /** Force a fresh browser recognition session after this much inactivity. */
  staleSessionMs?: number
  languagePack?: VoiceLanguagePack
}

export type VoiceListeningDebugEvent = {
  type:
    | 'STARTED'
    | 'RESTART_SCHEDULED'
    | 'RESTARTED'
    | 'RECOVERY_REQUESTED'
    | 'WATCHDOG_RESTART'
    | 'STOPPED'
    | 'DUPLICATE_IGNORED'
    | 'TRANSIENT_ERROR'
    | 'FATAL_ERROR'
  message: string
  transcript?: string
}

export type VoiceContinuousListeningCallbacks = {
  onResult: (result: SpeechToTextSuccess) => void
  /** Only terminal errors are surfaced here; transient ones are debug events. */
  onError: (failure: SpeechToTextFailure) => void
  onDebug?: (event: VoiceListeningDebugEvent) => void
}

const transcriptKey = (
  transcript: string,
  languagePack: VoiceLanguagePack,
): string =>
  transcript
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase(languagePack.textLocale)

const terminalContinuousError = (failure: SpeechToTextFailure): boolean => {
  const code = failure.error?.code
  // Long-running listening must survive service/network/start glitches. Only a
  // genuinely unavailable provider or a denied microphone permission requires
  // user intervention and should stop the requested session.
  return (
    failure.status === 'UNAVAILABLE' ||
    code === 'UNAVAILABLE' ||
    code === 'PERMISSION_DENIED'
  )
}

const needsRestartBackoff = (failure: SpeechToTextFailure): boolean => {
  const code = failure.error?.code
  return code === 'NETWORK' || code === 'PROVIDER_ERROR'
}

/**
 * Owns voice listening lifecycle without interpreting transcripts.
 *
 * Push-to-talk delegates the existing one-shot flow unchanged. Continuous mode
 * is match-long by design: ordinary browser `onend`, silence, temporary network
 * errors and provider start glitches never clear the user's listening request.
 * Sessions restart until the user explicitly stops, the component unmounts, or
 * the provider becomes unavailable / microphone permission is denied.
 */
export class VoiceListeningController implements SpeechToTextProvider {
  readonly provider: string
  private mode: VoiceListeningMode
  private readonly continuousEnabled: boolean
  private readonly duplicateWindowMs: number
  private readonly restartDelayMs: number
  private readonly maxRestartDelayMs: number
  private readonly watchdogIntervalMs: number
  private readonly staleSessionMs: number
  private readonly languagePack: VoiceLanguagePack
  private continuousRequested = false
  private restartTimer?: ReturnType<typeof setTimeout>
  private watchdogTimer?: ReturnType<typeof setInterval>
  private restartFailures = 0
  private lastTranscript?: { key: string; at: number }
  private continuousOptionsSource?: ContinuousListenOptionsSource
  private lastContinuousOptions: SpeechToTextListenOptions = {}
  private continuousCallbacks?: VoiceContinuousListeningCallbacks
  private sessionToken = 0
  private sessionActive = false
  private lastSessionActivityAt = 0

  constructor(
    private readonly delegate: SpeechToTextProvider,
    options: VoiceListeningControllerOptions = {},
  ) {
    this.provider = delegate.provider
    this.mode = options.initialMode ?? 'push-to-talk'
    this.continuousEnabled = options.continuousEnabled ?? false
    this.duplicateWindowMs = options.duplicateWindowMs ?? 1_000
    this.restartDelayMs = options.restartDelayMs ?? 300
    this.maxRestartDelayMs = Math.max(
      this.restartDelayMs,
      options.maxRestartDelayMs ?? 5_000,
    )
    this.watchdogIntervalMs = Math.max(0, options.watchdogIntervalMs ?? 0)
    this.staleSessionMs = Math.max(
      this.watchdogIntervalMs,
      options.staleSessionMs ?? 5 * 60_000,
    )
    this.languagePack = options.languagePack ?? DEFAULT_VOICE_LANGUAGE_PACK

    if (this.mode === 'continuous' && !this.canUseMode('continuous'))
      this.mode = 'push-to-talk'
  }

  isAvailable(): boolean {
    return this.delegate.isAvailable()
  }

  getMode(): VoiceListeningMode {
    return this.mode
  }

  isContinuousListening(): boolean {
    return this.continuousRequested
  }

  canUseMode(mode: VoiceListeningMode): boolean {
    return (
      mode === 'push-to-talk' ||
      (this.continuousEnabled &&
        typeof this.delegate.startContinuousListening === 'function')
    )
  }

  setMode(mode: VoiceListeningMode): boolean {
    if (!this.canUseMode(mode)) return false
    if (this.mode === mode) return true

    // Switching mode must never leave a previous browser recognition alive.
    this.stopListening()
    this.mode = mode
    return true
  }

  startListening(
    options: SpeechToTextListenOptions = {},
  ): Promise<SpeechToTextResult> {
    return this.delegate.startListening(options)
  }

  startContinuousListening(
    options: ContinuousListenOptionsSource,
    callbacks: VoiceContinuousListeningCallbacks,
  ): boolean {
    if (
      this.mode !== 'continuous' ||
      !this.canUseMode('continuous') ||
      !this.delegate.startContinuousListening
    )
      return false

    this.stopContinuousListening(false)
    this.continuousRequested = true
    this.restartFailures = 0
    this.lastTranscript = undefined
    this.continuousOptionsSource = options
    this.continuousCallbacks = callbacks
    this.lastSessionActivityAt = Date.now()
    callbacks.onDebug?.({
      type: 'STARTED',
      message: 'Escucha continua iniciada.',
    })
    this.startWatchdog()
    this.openContinuousSession(false)
    return true
  }

  /**
   * Re-establishes the underlying browser recognition while preserving the
   * user's continuous-listening request. Useful after tab resume, pageshow or
   * connectivity recovery, where Web Speech can remain silently stuck.
   */
  recoverContinuousListening(reason = 'resume'): boolean {
    if (!this.continuousRequested || !this.continuousCallbacks) return false

    this.continuousCallbacks.onDebug?.({
      type: 'RECOVERY_REQUESTED',
      message: `Recuperando escucha continua (${reason}).`,
    })
    this.restartFailures = 0
    this.replaceCurrentSession(true)
    return true
  }

  private resolveContinuousOptions(): SpeechToTextListenOptions {
    if (!this.continuousOptionsSource) return this.lastContinuousOptions
    if (typeof this.continuousOptionsSource !== 'function') {
      this.lastContinuousOptions = this.continuousOptionsSource
      return this.lastContinuousOptions
    }

    try {
      this.lastContinuousOptions = this.continuousOptionsSource()
    } catch (error) {
      this.continuousCallbacks?.onDebug?.({
        type: 'TRANSIENT_ERROR',
        message: `No se pudo refrescar el contexto de voz: ${
          error instanceof Error ? error.message : 'error desconocido'
        }. Se reutiliza el contexto anterior.`,
      })
    }
    return this.lastContinuousOptions
  }

  private openContinuousSession(restarted: boolean): void {
    if (
      !this.continuousRequested ||
      !this.continuousCallbacks ||
      !this.delegate.startContinuousListening
    )
      return

    const callbacks = this.continuousCallbacks
    const sessionToken = ++this.sessionToken
    let sessionProducedResult = false
    let sessionNeedsBackoff = false
    this.sessionActive = true
    this.lastSessionActivityAt = Date.now()

    if (restarted)
      callbacks.onDebug?.({
        type: 'RESTARTED',
        message: 'Sesión de reconocimiento continuo reiniciada.',
      })

    const providerCallbacks: ContinuousSpeechToTextCallbacks = {
      onResult: (result) => {
        if (!this.isCurrentSession(sessionToken)) return
        sessionProducedResult = true
        this.restartFailures = 0
        this.lastSessionActivityAt = Date.now()

        const key = transcriptKey(result.transcript, this.languagePack)
        const now = Date.now()
        if (
          key &&
          this.lastTranscript?.key === key &&
          now - this.lastTranscript.at <= this.duplicateWindowMs
        ) {
          callbacks.onDebug?.({
            type: 'DUPLICATE_IGNORED',
            message: `Duplicado ignorado: ${result.transcript}`,
            transcript: result.transcript,
          })
          return
        }

        this.lastTranscript = { key, at: now }
        callbacks.onResult(result)
      },
      onError: (failure) => {
        if (!this.isCurrentSession(sessionToken)) return
        this.lastSessionActivityAt = Date.now()
        if (failure.error?.code === 'ABORTED') return

        if (terminalContinuousError(failure)) {
          this.continuousRequested = false
          this.sessionActive = false
          ++this.sessionToken
          this.clearRestartTimer()
          this.clearWatchdog()
          this.delegate.stopListening()
          callbacks.onDebug?.({
            type: 'FATAL_ERROR',
            message:
              failure.error?.message ?? 'La escucha continua se ha detenido.',
          })
          callbacks.onError(failure)
          return
        }

        sessionNeedsBackoff ||= needsRestartBackoff(failure)
        callbacks.onDebug?.({
          type: 'TRANSIENT_ERROR',
          message:
            failure.error?.message ?? 'Error transitorio de reconocimiento.',
        })
      },
      onEnd: () => {
        if (!this.isCurrentSession(sessionToken)) return
        this.sessionActive = false
        this.lastSessionActivityAt = Date.now()
        this.scheduleRestart(sessionProducedResult, sessionNeedsBackoff)
      },
    }

    this.delegate.startContinuousListening(
      this.resolveContinuousOptions(),
      providerCallbacks,
    )
  }

  private isCurrentSession(sessionToken: number): boolean {
    return this.continuousRequested && sessionToken === this.sessionToken
  }

  private scheduleRestart(
    sessionProducedResult: boolean,
    sessionNeedsBackoff: boolean,
  ): void {
    if (!this.continuousRequested || !this.continuousCallbacks) return

    if (sessionProducedResult || !sessionNeedsBackoff) this.restartFailures = 0
    else this.restartFailures += 1

    const exponentialMultiplier = sessionNeedsBackoff
      ? 2 ** Math.min(Math.max(0, this.restartFailures - 1), 6)
      : 1
    const delay = Math.min(
      this.maxRestartDelayMs,
      this.restartDelayMs * exponentialMultiplier,
    )
    this.continuousCallbacks.onDebug?.({
      type: 'RESTART_SCHEDULED',
      message: `Reinicio de voz continua en ${delay} ms.`,
    })
    this.clearRestartTimer()
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined
      this.openContinuousSession(true)
    }, delay)
  }

  private replaceCurrentSession(restarted: boolean): void {
    if (!this.continuousRequested) return
    // Invalidate callbacks before stopping. A late onEnd from the old browser
    // recognition must not schedule an extra restart over the replacement.
    ++this.sessionToken
    this.sessionActive = false
    this.clearRestartTimer()
    this.delegate.stopListening()
    this.lastSessionActivityAt = Date.now()
    this.openContinuousSession(restarted)
  }

  private startWatchdog(): void {
    this.clearWatchdog()
    if (this.watchdogIntervalMs <= 0) return
    this.watchdogTimer = setInterval(() => {
      if (!this.continuousRequested) return

      if (!this.sessionActive && this.restartTimer === undefined) {
        this.continuousCallbacks?.onDebug?.({
          type: 'WATCHDOG_RESTART',
          message: 'Watchdog: no hay sesión activa; se recupera la escucha.',
        })
        this.openContinuousSession(true)
        return
      }

      if (
        this.sessionActive &&
        Date.now() - this.lastSessionActivityAt >= this.staleSessionMs
      ) {
        this.continuousCallbacks?.onDebug?.({
          type: 'WATCHDOG_RESTART',
          message:
            'Watchdog: sesión sin actividad durante demasiado tiempo; se renueva.',
        })
        this.replaceCurrentSession(true)
      }
    }, this.watchdogIntervalMs)
  }

  private clearRestartTimer(): void {
    if (this.restartTimer !== undefined) clearTimeout(this.restartTimer)
    this.restartTimer = undefined
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer !== undefined) clearInterval(this.watchdogTimer)
    this.watchdogTimer = undefined
  }

  private stopContinuousListening(emitDebug: boolean): void {
    const wasRequested = this.continuousRequested
    this.continuousRequested = false
    this.sessionActive = false
    ++this.sessionToken
    this.clearRestartTimer()
    this.clearWatchdog()
    this.delegate.stopListening()
    if (wasRequested && emitDebug)
      this.continuousCallbacks?.onDebug?.({
        type: 'STOPPED',
        message: 'Escucha continua detenida.',
      })
  }

  stopListening(): void {
    if (this.continuousRequested) {
      this.stopContinuousListening(true)
      return
    }
    ++this.sessionToken
    this.sessionActive = false
    this.clearRestartTimer()
    this.clearWatchdog()
    this.delegate.stopListening()
  }
}
