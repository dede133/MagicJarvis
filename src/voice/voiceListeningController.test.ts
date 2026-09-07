import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ContinuousSpeechToTextCallbacks,
  SpeechToTextListenOptions,
  SpeechToTextProvider,
  SpeechToTextResult,
} from './types/speechToText'
import { VoiceListeningController } from './voiceListeningController'

type FakeProvider = SpeechToTextProvider & {
  startListening: ReturnType<typeof vi.fn>
  startContinuousListening: ReturnType<typeof vi.fn>
  stopListening: ReturnType<typeof vi.fn>
}

const makeProvider = (): FakeProvider => {
  const result: SpeechToTextResult = {
    status: 'SUCCESS',
    provider: 'fake',
    transcript: 'robo',
  }
  return {
    provider: 'fake',
    isAvailable: () => true,
    startListening: vi.fn((_options?: SpeechToTextListenOptions) =>
      Promise.resolve(result),
    ),
    startContinuousListening: vi.fn(
      (
        _options: SpeechToTextListenOptions,
        _callbacks: ContinuousSpeechToTextCallbacks,
      ) => undefined,
    ),
    stopListening: vi.fn(),
  }
}

const continuousCallbacksAt = (
  provider: FakeProvider,
  callIndex = 0,
): ContinuousSpeechToTextCallbacks =>
  provider.startContinuousListening.mock.calls[callIndex][1]

afterEach(() => {
  vi.useRealTimers()
})

describe('VoiceListeningController', () => {
  it('defaults to push-to-talk', () => {
    const controller = new VoiceListeningController(makeProvider())
    expect(controller.getMode()).toBe('push-to-talk')
  })

  it('does not allow continuous while the feature is disabled', () => {
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: false,
    })

    expect(controller.setMode('continuous')).toBe(false)
    expect(controller.getMode()).toBe('push-to-talk')
    expect(provider.stopListening).not.toHaveBeenCalled()
  })

  it('can switch modes when continuous is enabled and stops active listening', () => {
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
    })

    expect(controller.setMode('continuous')).toBe(true)
    expect(controller.getMode()).toBe('continuous')
    expect(provider.stopListening).toHaveBeenCalledTimes(1)
  })

  it('delegates push-to-talk listening unchanged', async () => {
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider)
    const options = { maxAlternatives: 5 }

    await expect(controller.startListening(options)).resolves.toMatchObject({
      status: 'SUCCESS',
      transcript: 'robo',
    })
    expect(provider.startListening).toHaveBeenCalledWith(options)
  })

  it('starts a continuous provider session only in continuous mode', () => {
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
    })
    const onResult = vi.fn()
    const onError = vi.fn()

    expect(controller.startContinuousListening({}, { onResult, onError })).toBe(
      false,
    )
    controller.setMode('continuous')
    expect(controller.startContinuousListening({}, { onResult, onError })).toBe(
      true,
    )
    expect(controller.isContinuousListening()).toBe(true)
    expect(provider.startContinuousListening).toHaveBeenCalledTimes(1)
  })

  it('drops the same final transcript inside the duplicate window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-16T20:00:00Z'))
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
      duplicateWindowMs: 1_000,
    })
    controller.setMode('continuous')
    const onResult = vi.fn()
    const onDebug = vi.fn()
    controller.startContinuousListening(
      {},
      { onResult, onError: vi.fn(), onDebug },
    )
    const callbacks = continuousCallbacksAt(provider)

    callbacks.onResult({
      status: 'SUCCESS',
      provider: 'fake',
      transcript: 'robo',
    })
    vi.advanceTimersByTime(500)
    callbacks.onResult({
      status: 'SUCCESS',
      provider: 'fake',
      transcript: '  ROBO  ',
    })

    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DUPLICATE_IGNORED' }),
    )
  })

  it('restarts a browser session when it ends while continuous is requested', () => {
    vi.useFakeTimers()
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
      restartDelayMs: 100,
    })
    controller.setMode('continuous')
    controller.startContinuousListening(
      {},
      { onResult: vi.fn(), onError: vi.fn() },
    )

    continuousCallbacksAt(provider).onEnd()
    expect(provider.startContinuousListening).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(provider.startContinuousListening).toHaveBeenCalledTimes(2)
  })

  it('does not restart after the user stops continuous listening', () => {
    vi.useFakeTimers()
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
      restartDelayMs: 100,
    })
    controller.setMode('continuous')
    controller.startContinuousListening(
      {},
      { onResult: vi.fn(), onError: vi.fn() },
    )
    const callbacks = continuousCallbacksAt(provider)

    controller.stopListening()
    callbacks.onEnd()
    vi.advanceTimersByTime(1_000)

    expect(controller.isContinuousListening()).toBe(false)
    expect(provider.startContinuousListening).toHaveBeenCalledTimes(1)
  })

  it('stops immediately on permission errors instead of entering a restart loop', () => {
    vi.useFakeTimers()
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
      restartDelayMs: 100,
    })
    controller.setMode('continuous')
    const onError = vi.fn()
    controller.startContinuousListening({}, { onResult: vi.fn(), onError })
    const callbacks = continuousCallbacksAt(provider)

    callbacks.onError({
      status: 'ERROR',
      provider: 'fake',
      error: { code: 'PERMISSION_DENIED', message: 'denied' },
    })
    callbacks.onEnd()
    vi.advanceTimersByTime(1_000)

    expect(controller.isContinuousListening()).toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(provider.startContinuousListening).toHaveBeenCalledTimes(1)
  })

  it('keeps restarting indefinitely across empty browser sessions', () => {
    vi.useFakeTimers()
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
      restartDelayMs: 100,
    })
    controller.setMode('continuous')
    const onError = vi.fn()
    controller.startContinuousListening({}, { onResult: vi.fn(), onError })

    for (let index = 0; index < 20; index += 1) {
      continuousCallbacksAt(provider, index).onEnd()
      vi.advanceTimersByTime(100)
    }

    expect(controller.isContinuousListening()).toBe(true)
    expect(onError).not.toHaveBeenCalled()
    expect(provider.startContinuousListening).toHaveBeenCalledTimes(21)
  })

  it('refreshes dynamic listen options on every browser-session restart', () => {
    vi.useFakeTimers()
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
      restartDelayMs: 100,
    })
    controller.setMode('continuous')
    const options = vi
      .fn()
      .mockReturnValueOnce({ phraseHints: [{ phrase: 'Sol Ring' }] })
      .mockReturnValueOnce({ phraseHints: [{ phrase: 'Mystic Remora' }] })

    controller.startContinuousListening(options, {
      onResult: vi.fn(),
      onError: vi.fn(),
    })
    expect(provider.startContinuousListening.mock.calls[0][0]).toEqual({
      phraseHints: [{ phrase: 'Sol Ring' }],
    })

    continuousCallbacksAt(provider, 0).onEnd()
    vi.advanceTimersByTime(100)

    expect(options).toHaveBeenCalledTimes(2)
    expect(provider.startContinuousListening.mock.calls[1][0]).toEqual({
      phraseHints: [{ phrase: 'Mystic Remora' }],
    })
  })

  it('recovers a long-running session and ignores a late end from the replaced one', () => {
    vi.useFakeTimers()
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
      restartDelayMs: 100,
    })
    controller.setMode('continuous')
    controller.startContinuousListening({}, {
      onResult: vi.fn(),
      onError: vi.fn(),
    })
    const oldCallbacks = continuousCallbacksAt(provider, 0)

    expect(controller.recoverContinuousListening('tab-visible')).toBe(true)
    expect(provider.startContinuousListening).toHaveBeenCalledTimes(2)

    oldCallbacks.onEnd()
    vi.advanceTimersByTime(1_000)

    expect(controller.isContinuousListening()).toBe(true)
    expect(provider.startContinuousListening).toHaveBeenCalledTimes(2)
  })

  it('survives temporary network/provider errors and retries with backoff', () => {
    vi.useFakeTimers()
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
      restartDelayMs: 100,
      maxRestartDelayMs: 1_000,
    })
    controller.setMode('continuous')
    const onError = vi.fn()
    controller.startContinuousListening({}, { onResult: vi.fn(), onError })
    const callbacks = continuousCallbacksAt(provider, 0)

    callbacks.onError({
      status: 'ERROR',
      provider: 'fake',
      error: { code: 'NETWORK', message: 'offline' },
    })
    callbacks.onEnd()
    vi.advanceTimersByTime(100)

    expect(controller.isContinuousListening()).toBe(true)
    expect(onError).not.toHaveBeenCalled()
    expect(provider.startContinuousListening).toHaveBeenCalledTimes(2)
  })

  it('watchdog renews a stale session without ending continuous listening', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T18:00:00Z'))
    const provider = makeProvider()
    const controller = new VoiceListeningController(provider, {
      continuousEnabled: true,
      watchdogIntervalMs: 1_000,
      staleSessionMs: 3_000,
    })
    controller.setMode('continuous')
    const onDebug = vi.fn()
    controller.startContinuousListening(
      {},
      { onResult: vi.fn(), onError: vi.fn(), onDebug },
    )

    vi.advanceTimersByTime(3_000)

    expect(controller.isContinuousListening()).toBe(true)
    expect(provider.startContinuousListening).toHaveBeenCalledTimes(2)
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WATCHDOG_RESTART' }),
    )
  })
})
