import { describe, expect, it } from 'vitest'
import { VoiceProcessingCoordinator } from './voiceProcessingCoordinator'

describe('VoiceProcessingCoordinator', () => {
  it('drops queued work after the listening generation is invalidated', async () => {
    const coordinator = new VoiceProcessingCoordinator()
    const generation = coordinator.beginSession()
    const events: string[] = []

    let releaseFirst!: () => void
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = coordinator.enqueue(generation, async () => {
      events.push('first-start')
      await firstBlocked
      events.push('first-end')
    })
    const second = coordinator.enqueue(generation, async () => {
      events.push('second')
    })

    await Promise.resolve()
    coordinator.invalidate()
    releaseFirst()
    await Promise.all([first, second])

    expect(events).toEqual(['first-start', 'first-end'])
  })

  it('lets in-flight processing observe cancellation before mutation', async () => {
    const coordinator = new VoiceProcessingCoordinator()
    const generation = coordinator.beginSession()

    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let mutationCount = 0

    const processing = coordinator.enqueue(generation, async (lease) => {
      await blocked
      if (lease.isCurrent()) mutationCount += 1
    })

    await Promise.resolve()
    coordinator.invalidate()
    release()
    await processing

    expect(mutationCount).toBe(0)
  })

  it('accepts work from a new session after invalidating the old one', async () => {
    const coordinator = new VoiceProcessingCoordinator()
    const oldGeneration = coordinator.beginSession()
    coordinator.invalidate()
    const newGeneration = coordinator.beginSession()
    const events: string[] = []

    await coordinator.enqueue(oldGeneration, () => {
      events.push('old')
    })
    await coordinator.enqueue(newGeneration, () => {
      events.push('new')
    })

    expect(events).toEqual(['new'])
  })
})
