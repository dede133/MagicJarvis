import { DEFAULT_VOICE_LANGUAGE_PACK, type VoiceLanguagePack } from '../languages'
import type {
  ContinuousSpeechToTextCallbacks,
  SpeechPhraseHint,
  SpeechToTextAlternative,
  SpeechToTextFailure,
  SpeechToTextListenOptions,
  SpeechToTextProvider,
  SpeechToTextResult,
} from '../types/speechToText'

type RecognitionAlternative = { transcript: string; confidence?: number }
type RecognitionResult = {
  isFinal: boolean
  length: number
  [index: number]: RecognitionAlternative
}
type RecognitionEvent = {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
type RecognitionErrorEvent = { error: string }
type RecognitionPhrase = { phrase: string; boost: number }
type RecognitionPhraseList = {
  length: number
  push: (...items: RecognitionPhrase[]) => number
}
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  phrases?: RecognitionPhraseList
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionConstructor = new () => Recognition
type RecognitionPhraseConstructor = new (
  phrase: string,
  boost?: number,
) => RecognitionPhrase

type RecognitionConfiguration = {
  maxAlternatives: number
  phraseHintsApplied: boolean
}

type SpeechWindow = typeof window & {
  SpeechRecognition?: RecognitionConstructor
  webkitSpeechRecognition?: RecognitionConstructor
  SpeechRecognitionPhrase?: RecognitionPhraseConstructor
}

const browserWindow = (): SpeechWindow | undefined =>
  typeof window === 'undefined' ? undefined : (window as SpeechWindow)

const browserConstructor = (): RecognitionConstructor | undefined => {
  const candidate = browserWindow()
  return candidate?.SpeechRecognition ?? candidate?.webkitSpeechRecognition
}

const errorFor = (code: string): SpeechToTextFailure['error'] => {
  if (code === 'not-allowed' || code === 'service-not-allowed')
    return {
      code: 'PERMISSION_DENIED',
      message: 'Microphone permission was denied.',
    }
  if (code === 'no-speech')
    return { code: 'NO_SPEECH', message: 'No speech was detected.' }
  if (code === 'aborted')
    return { code: 'ABORTED', message: 'Listening was stopped.' }
  if (code === 'network')
    return { code: 'NETWORK', message: 'Speech recognition network error.' }
  if (code === 'provider-start-failed')
    return { code: 'PROVIDER_ERROR', message: 'Could not start listening.' }
  return {
    code: 'PROVIDER_ERROR',
    message: `Speech recognition error: ${code}.`,
  }
}

const clampBoost = (boost: number | undefined): number =>
  Math.min(10, Math.max(0, boost ?? 1))

const applyPhraseHints = (
  recognition: Recognition,
  hints: SpeechPhraseHint[] | undefined,
): boolean => {
  const Phrase = browserWindow()?.SpeechRecognitionPhrase
  if (!Phrase || !recognition.phrases || !hints?.length) return false

  let applied = false
  for (const hint of hints) {
    const phrase = hint.phrase.trim()
    if (!phrase) continue
    try {
      recognition.phrases.push(new Phrase(phrase, clampBoost(hint.boost)))
      applied = true
    } catch {
      // Contextual biasing is progressive enhancement. Recognition still works
      // normally if a browser exposes only part of the experimental API.
    }
  }
  return applied
}

const confidenceAverage = (
  alternatives: Array<RecognitionAlternative | undefined>,
): number | undefined => {
  const values = alternatives
    .map((alternative) => alternative?.confidence)
    .filter((value): value is number => typeof value === 'number')
  if (!values.length) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const buildAlternatives = (
  finalResults: Map<number, RecognitionResult>,
  maxAlternatives: number,
  languagePack: VoiceLanguagePack,
): SpeechToTextAlternative[] => {
  const ordered = [...finalResults.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, result]) => result)
  if (!ordered.length) return []

  const available = Math.min(
    maxAlternatives,
    Math.max(...ordered.map((result) => result.length)),
  )
  const alternatives: SpeechToTextAlternative[] = []

  for (let rank = 0; rank < available; rank += 1) {
    const selected = ordered.map((result) => result[rank] ?? result[0])
    const transcript = selected
      .map((alternative) => alternative?.transcript.trim() ?? '')
      .filter(Boolean)
      .join(' ')
      .trim()
    if (!transcript) continue

    const existing = alternatives.find(
      (candidate) =>
        candidate.transcript.toLocaleLowerCase(
          languagePack.textLocale,
        ) ===
        transcript.toLocaleLowerCase(languagePack.textLocale),
    )
    const confidence = confidenceAverage(selected)
    if (!existing) alternatives.push({ transcript, confidence })
    else if (
      typeof confidence === 'number' &&
      (typeof existing.confidence !== 'number' ||
        confidence > existing.confidence)
    )
      existing.confidence = confidence
  }

  return alternatives
}

const configureRecognition = (
  recognition: Recognition,
  options: SpeechToTextListenOptions,
  continuous: boolean,
  usePhraseHints: boolean,
  languagePack: VoiceLanguagePack,
): RecognitionConfiguration => {
  recognition.lang = languagePack.speechLocale
  recognition.continuous = continuous
  recognition.interimResults = false
  const maxAlternatives = Math.max(1, options.maxAlternatives ?? 5)
  recognition.maxAlternatives = maxAlternatives
  return {
    maxAlternatives,
    phraseHintsApplied:
      usePhraseHints && applyPhraseHints(recognition, options.phraseHints),
  }
}

const failureFor = (provider: string, code: string): SpeechToTextFailure => ({
  status: 'ERROR',
  provider,
  error: errorFor(code),
})

/** Experimental browser-only provider. Audio never leaves this abstraction. */
export class BrowserSpeechRecognitionProvider implements SpeechToTextProvider {
  readonly provider = 'browser-speech-recognition'

  constructor(
    private readonly languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
  ) {}
  private recognition?: Recognition
  /**
   * Some browsers expose recognition.phrases/SpeechRecognitionPhrase but the
   * active recognition service rejects contextual biasing at runtime with
   * `phrases-not-supported`. Once observed, keep phrase hints disabled for this
   * provider instance and transparently fall back to normal recognition.
   */
  private phraseHintsSupported = true

  isAvailable(): boolean {
    return Boolean(browserConstructor())
  }

  startListening(
    options: SpeechToTextListenOptions = {},
  ): Promise<SpeechToTextResult> {
    const Constructor = browserConstructor()
    if (!Constructor)
      return Promise.resolve({
        status: 'UNAVAILABLE',
        provider: this.provider,
        error: {
          code: 'UNAVAILABLE',
          message: 'Voice recognition is not available in this browser.',
        },
      })

    return new Promise((resolve) => {
      let settled = false
      let activeAttempt = 0

      const finish = (result: SpeechToTextResult) => {
        if (settled) return
        settled = true
        this.recognition = undefined
        resolve(result)
      }

      const startAttempt = (usePhraseHints: boolean) => {
        if (settled) return
        const recognition = new Constructor()
        const attempt = ++activeAttempt
        this.recognition = recognition
        const { maxAlternatives, phraseHintsApplied } = configureRecognition(
          recognition,
          options,
          false,
          usePhraseHints,
          this.languagePack,
        )
        const finalResults = new Map<number, RecognitionResult>()

        recognition.onresult = (event) => {
          if (attempt !== activeAttempt) return
          for (
            let index = event.resultIndex;
            index < event.results.length;
            index += 1
          ) {
            const result = event.results[index]
            if (!result.isFinal) continue
            finalResults.set(index, result)
          }
        }
        recognition.onerror = (event) => {
          if (attempt !== activeAttempt) return
          if (event.error === 'phrases-not-supported' && phraseHintsApplied) {
            this.phraseHintsSupported = false
            startAttempt(false)
            return
          }
          finish({
            status: 'ERROR',
            provider: this.provider,
            error: errorFor(event.error),
          })
        }
        recognition.onend = () => {
          if (attempt !== activeAttempt) return
          const alternatives = buildAlternatives(
            finalResults,
            maxAlternatives,
            this.languagePack,
          )
          const primary = alternatives[0]
          finish(
            primary
              ? {
                  status: 'SUCCESS',
                  provider: this.provider,
                  transcript: primary.transcript,
                  confidence: primary.confidence,
                  alternatives,
                }
              : {
                  status: 'ERROR',
                  provider: this.provider,
                  error: {
                    code: 'EMPTY_TRANSCRIPT',
                    message: 'No transcript was received.',
                  },
                },
          )
        }
        try {
          recognition.start()
        } catch {
          if (attempt !== activeAttempt) return
          finish({
            status: 'ERROR',
            provider: this.provider,
            error: {
              code: 'PROVIDER_ERROR',
              message: 'Could not start listening.',
            },
          })
        }
      }

      startAttempt(this.phraseHintsSupported)
    })
  }

  startContinuousListening(
    options: SpeechToTextListenOptions,
    callbacks: ContinuousSpeechToTextCallbacks,
  ): void {
    const Constructor = browserConstructor()
    if (!Constructor) {
      callbacks.onError({
        status: 'UNAVAILABLE',
        provider: this.provider,
        error: {
          code: 'UNAVAILABLE',
          message: 'Voice recognition is not available in this browser.',
        },
      })
      callbacks.onEnd()
      return
    }

    let ended = false
    let activeAttempt = 0
    const endOnce = (recognition?: Recognition) => {
      if (ended) return
      ended = true
      // A controller recovery can start a newer recognition before the old
      // browser instance emits its delayed onend. Never let that stale session
      // clear the provider's reference to the replacement.
      if (!recognition || this.recognition === recognition)
        this.recognition = undefined
      callbacks.onEnd()
    }

    const startAttempt = (usePhraseHints: boolean) => {
      if (ended) return
      const recognition = new Constructor()
      const attempt = ++activeAttempt
      this.recognition = recognition
      const { maxAlternatives, phraseHintsApplied } = configureRecognition(
        recognition,
        options,
        true,
        usePhraseHints,
        this.languagePack,
      )

      recognition.onresult = (event) => {
        if (attempt !== activeAttempt) return
        for (
          let index = event.resultIndex;
          index < event.results.length;
          index += 1
        ) {
          const result = event.results[index]
          if (!result.isFinal) continue
          const alternatives = buildAlternatives(
            new Map([[index, result]]),
            maxAlternatives,
            this.languagePack,
          )
          const primary = alternatives[0]
          if (!primary) continue
          callbacks.onResult({
            status: 'SUCCESS',
            provider: this.provider,
            transcript: primary.transcript,
            confidence: primary.confidence,
            alternatives,
          })
        }
      }
      recognition.onerror = (event) => {
        if (attempt !== activeAttempt) return
        if (event.error === 'phrases-not-supported' && phraseHintsApplied) {
          this.phraseHintsSupported = false
          startAttempt(false)
          return
        }
        callbacks.onError(failureFor(this.provider, event.error))
      }
      recognition.onend = () => {
        if (attempt !== activeAttempt) return
        endOnce(recognition)
      }

      try {
        recognition.start()
      } catch {
        if (attempt !== activeAttempt) return
        callbacks.onError(failureFor(this.provider, 'provider-start-failed'))
        endOnce(recognition)
      }
    }

    startAttempt(this.phraseHintsSupported)
  }

  stopListening(): void {
    try {
      this.recognition?.stop()
    } catch {
      // Stopping an already-ended browser session is harmless for our lifecycle.
    }
  }
}
