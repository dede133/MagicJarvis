import { afterEach, describe, expect, it, vi } from 'vitest'
import { CATALAN_VOICE_LANGUAGE_PACK } from '../languages'
import { BrowserSpeechRecognitionProvider } from './browserSpeechRecognitionProvider'

type FakeAlternative = { transcript: string; confidence?: number }
type FakeResult = FakeAlternative[] & { isFinal: boolean }
type FakeResultEvent = { resultIndex: number; results: FakeResult[] }

class FakeRecognitionPhrase {
  constructor(
    readonly phrase: string,
    readonly boost = 1,
  ) {}
}

class FakeRecognition {
  static instances: FakeRecognition[] = []

  lang = ''
  continuous = false
  interimResults = true
  maxAlternatives = 1
  phrases = { length: 0, push: vi.fn(() => 1) }
  onresult: ((event: FakeResultEvent) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())

  constructor() {
    FakeRecognition.instances.push(this)
  }

  emitFinal(...alternatives: FakeAlternative[]) {
    const result: FakeResult = Object.assign([...alternatives], {
      isFinal: true,
    })
    this.onresult?.({ resultIndex: 0, results: [result] })
  }
}

const stubSpeechWindow = (withPhrases = false) => {
  vi.stubGlobal('window', {
    webkitSpeechRecognition: FakeRecognition,
    ...(withPhrases ? { SpeechRecognitionPhrase: FakeRecognitionPhrase } : {}),
  })
}

afterEach(() => {
  FakeRecognition.instances = []
  vi.unstubAllGlobals()
})

describe('BrowserSpeechRecognitionProvider continuous mode', () => {
  it('uses the speech locale from the selected runtime language pack', () => {
    stubSpeechWindow()
    const provider = new BrowserSpeechRecognitionProvider(
      CATALAN_VOICE_LANGUAGE_PACK,
    )

    provider.startContinuousListening(
      {},
      { onResult: vi.fn(), onError: vi.fn(), onEnd: vi.fn() },
    )

    expect(FakeRecognition.instances[0].lang).toBe('ca-ES')
  })

  it('uses continuous recognition and emits each final utterance immediately', () => {
    stubSpeechWindow()
    const provider = new BrowserSpeechRecognitionProvider()
    const onResult = vi.fn()
    const onEnd = vi.fn()

    provider.startContinuousListening(
      { maxAlternatives: 5 },
      { onResult, onError: vi.fn(), onEnd },
    )

    const recognition = FakeRecognition.instances[0]
    expect(recognition.continuous).toBe(true)
    expect(recognition.interimResults).toBe(false)
    expect(recognition.maxAlternatives).toBe(5)

    recognition.emitFinal(
      { transcript: 'robo', confidence: 0.9 },
      { transcript: 'robot', confidence: 0.4 },
    )

    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SUCCESS',
        transcript: 'robo',
        alternatives: expect.arrayContaining([
          expect.objectContaining({ transcript: 'robo' }),
          expect.objectContaining({ transcript: 'robot' }),
        ]),
      }),
    )
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('falls back without phrase hints when the active service rejects them', () => {
    stubSpeechWindow(true)
    const provider = new BrowserSpeechRecognitionProvider()
    const onResult = vi.fn()
    const onError = vi.fn()
    const onEnd = vi.fn()

    provider.startContinuousListening(
      {
        maxAlternatives: 5,
        phraseHints: [{ phrase: 'Counterspell', boost: 4 }],
      },
      { onResult, onError, onEnd },
    )

    const first = FakeRecognition.instances[0]
    expect(first.phrases.push).toHaveBeenCalledTimes(1)

    first.onerror?.({ error: 'phrases-not-supported' })

    expect(FakeRecognition.instances).toHaveLength(2)
    const fallback = FakeRecognition.instances[1]
    expect(fallback.phrases.push).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()

    // The failed attempt can still emit end; it must not terminate the fallback.
    first.onend?.()
    expect(onEnd).not.toHaveBeenCalled()

    fallback.emitFinal({ transcript: 'lanzo counterspell', confidence: 0.9 })
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: 'lanzo counterspell' }),
    )
    fallback.onend?.()
    expect(onEnd).toHaveBeenCalledTimes(1)

    // The provider remembers the runtime incompatibility for later sessions.
    provider.startContinuousListening(
      { phraseHints: [{ phrase: 'Sol Ring', boost: 4 }] },
      { onResult: vi.fn(), onError: vi.fn(), onEnd: vi.fn() },
    )
    expect(FakeRecognition.instances[2].phrases.push).not.toHaveBeenCalled()
  })

  it('ends the continuous callback lifecycle when listening is stopped', () => {
    stubSpeechWindow()
    const provider = new BrowserSpeechRecognitionProvider()
    const onEnd = vi.fn()

    provider.startContinuousListening(
      {},
      { onResult: vi.fn(), onError: vi.fn(), onEnd },
    )
    provider.stopListening()

    expect(FakeRecognition.instances[0].stop).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('does not let a stale session end clear a newer active recognition', () => {
    stubSpeechWindow()
    const provider = new BrowserSpeechRecognitionProvider()

    provider.startContinuousListening(
      {},
      { onResult: vi.fn(), onError: vi.fn(), onEnd: vi.fn() },
    )
    const first = FakeRecognition.instances[0]

    provider.startContinuousListening(
      {},
      { onResult: vi.fn(), onError: vi.fn(), onEnd: vi.fn() },
    )
    const second = FakeRecognition.instances[1]

    // Simulate a delayed browser onend from the superseded recognition.
    first.onend?.()
    provider.stopListening()

    expect(second.stop).toHaveBeenCalledTimes(1)
  })
})

describe('BrowserSpeechRecognitionProvider phrase fallback', () => {
  it('retries one-shot recognition without phrase hints instead of surfacing phrases-not-supported', async () => {
    stubSpeechWindow(true)
    const provider = new BrowserSpeechRecognitionProvider()

    const pending = provider.startListening({
      phraseHints: [{ phrase: 'Mystic Remora', boost: 4 }],
    })

    const first = FakeRecognition.instances[0]
    expect(first.phrases.push).toHaveBeenCalledTimes(1)
    first.onerror?.({ error: 'phrases-not-supported' })

    const fallback = FakeRecognition.instances[1]
    expect(fallback.phrases.push).not.toHaveBeenCalled()
    first.onend?.()
    fallback.emitFinal({ transcript: 'lanzo mystic remora', confidence: 0.88 })
    fallback.onend?.()

    await expect(pending).resolves.toEqual(
      expect.objectContaining({
        status: 'SUCCESS',
        transcript: 'lanzo mystic remora',
      }),
    )
  })
})
