export type SpeechToTextStatus =
  'IDLE' | 'LISTENING' | 'PROCESSING' | 'SUCCESS' | 'ERROR' | 'UNAVAILABLE'

export type SpeechToTextErrorCode =
  | 'UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'NO_SPEECH'
  | 'ABORTED'
  | 'NETWORK'
  | 'EMPTY_TRANSCRIPT'
  | 'PROVIDER_ERROR'

export type SpeechToTextAlternative = {
  transcript: string
  confidence?: number
}

export type SpeechPhraseHint = {
  phrase: string
  /** Web Speech contextual boost range. Providers that do not support it ignore it. */
  boost?: number
}

export type SpeechToTextListenOptions = {
  /** Provider-neutral phrase hints. Browser providers may map these to recognition.phrases. */
  phraseHints?: SpeechPhraseHint[]
  /** Requested N-best size. Providers may return fewer alternatives. */
  maxAlternatives?: number
}

export type SpeechToTextSuccess = {
  status: 'SUCCESS'
  provider: string
  /** Provider's highest-ranked transcript. */
  transcript: string
  confidence?: number
  /** N-best hypotheses, including the primary transcript when available. */
  alternatives?: SpeechToTextAlternative[]
}

export type SpeechToTextFailure = {
  status: 'ERROR' | 'UNAVAILABLE'
  provider: string
  error?: { code: SpeechToTextErrorCode; message: string }
}

export type SpeechToTextResult = SpeechToTextSuccess | SpeechToTextFailure

export type ContinuousSpeechToTextCallbacks = {
  /** Called once for every final utterance produced by the same recognition session. */
  onResult: (result: SpeechToTextSuccess) => void
  /** Called for provider errors. The controller decides whether they are recoverable. */
  onError: (failure: SpeechToTextFailure) => void
  /** Called whenever the underlying browser recognition session ends. */
  onEnd: () => void
}

/** Browser and future local providers share this non-React boundary. */
export interface SpeechToTextProvider {
  readonly provider: string
  isAvailable(): boolean
  startListening(
    options?: SpeechToTextListenOptions,
  ): Promise<SpeechToTextResult>
  /** Optional streaming capability. One-shot providers can omit it. */
  startContinuousListening?: (
    options: SpeechToTextListenOptions,
    callbacks: ContinuousSpeechToTextCallbacks,
  ) => void
  stopListening(): void
}
