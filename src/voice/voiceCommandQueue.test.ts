import { describe, expect, it } from 'vitest'
import type { ParsedCommand } from '../commands/types/commandTypes'
import type { VoiceCommandHistoryEntry } from './voiceCommandExecution'
import {
  VoiceCommandQueue,
  type VoiceCommandQueueInput,
} from './voiceCommandQueue'

const command = (type: ParsedCommand['type']): ParsedCommand =>
  ({ type }) as ParsedCommand

const input = (
  label: string,
  type: ParsedCommand['type'],
): VoiceCommandQueueInput => ({
  rawTranscript: label,
  normalizedTranscript: label,
  parsedCommand: command(type),
})

const result = (
  rawTranscript: string,
  successful = true,
): VoiceCommandHistoryEntry => ({
  source: 'VOICE',
  rawTranscript,
  normalizedTranscript: rawTranscript,
  provider: 'queue-test',
  parsed: 'TEST',
  result: successful ? '✓ ok' : '⚠ failed',
  successful,
  durationMs: 0,
})

describe('VoiceCommandQueue', () => {
  it('executes commands strictly one at a time and in enqueue order', async () => {
    const order: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const queue = new VoiceCommandQueue(async (entry) => {
      order.push(`start:${entry.rawTranscript}`)
      if (entry.rawTranscript === 'bajo isla') await firstBlocked
      order.push(`end:${entry.rawTranscript}`)
      return result(entry.rawTranscript)
    })

    queue.enqueueMany([
      input('bajo isla', 'PLAY_LAND'),
      input('giro sol ring', 'TAP_CARD'),
      input('paso turno', 'PASS_TURN'),
    ])

    await Promise.resolve()
    expect(order).toEqual(['start:bajo isla'])

    releaseFirst?.()
    const settled = await queue.whenSettled()
    expect(order).toEqual([
      'start:bajo isla',
      'end:bajo isla',
      'start:giro sol ring',
      'end:giro sol ring',
      'start:paso turno',
      'end:paso turno',
    ])
    expect(settled.status).toBe('idle')
    expect(settled.entries.map((entry) => entry.status)).toEqual([
      'executed',
      'executed',
      'executed',
    ])
  })

  it('fails fast and cancels every later command in the same sequence', async () => {
    const executed: string[] = []
    const queue = new VoiceCommandQueue((entry) => {
      executed.push(entry.rawTranscript)
      return result(
        entry.rawTranscript,
        entry.rawTranscript !== 'giro sol ring',
      )
    })

    queue.enqueueMany([
      input('bajo isla', 'PLAY_LAND'),
      input('giro sol ring', 'TAP_CARD'),
      input('bajo remora', 'CAST_SPELL'),
      input('paso turno', 'PASS_TURN'),
    ])

    const settled = await queue.whenSettled()
    expect(settled.status).toBe('idle')
    expect(executed).toEqual(['bajo isla', 'giro sol ring'])
    expect(settled.entries.map((entry) => entry.status)).toEqual([
      'executed',
      'failed',
      'cancelled',
      'cancelled',
    ])
  })

  it('is ready to accept fresh work immediately after a failed sequence settles', async () => {
    const executed: string[] = []
    const queue = new VoiceCommandQueue((entry) => {
      executed.push(entry.rawTranscript)
      return result(entry.rawTranscript, entry.rawTranscript !== 'bad')
    })

    queue.enqueueMany([
      input('one', 'DRAW'),
      input('bad', 'TAP_CARD'),
      input('cancel me', 'PASS_TURN'),
    ])
    await queue.whenSettled()

    queue.enqueue(input('new utterance', 'DRAW'))
    const settled = await queue.whenSettled()

    expect(executed).toEqual(['one', 'bad', 'new utterance'])
    expect(settled.status).toBe('idle')
    expect(settled.entries.map((entry) => entry.status)).toEqual([
      'executed',
      'failed',
      'cancelled',
      'executed',
    ])
  })

  it('can cancel commands that have not started while preserving history', async () => {
    let releaseFirst: (() => void) | undefined
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const executed: string[] = []
    const queue = new VoiceCommandQueue(async (entry) => {
      executed.push(entry.rawTranscript)
      if (entry.rawTranscript === 'bajo isla') await firstBlocked
      return result(entry.rawTranscript)
    })

    queue.enqueueMany([
      input('bajo isla', 'PLAY_LAND'),
      input('bajo remora', 'CAST_SPELL'),
      input('paso turno', 'PASS_TURN'),
    ])
    await Promise.resolve()

    expect(queue.cancelPending()).toBe(2)
    releaseFirst?.()
    const settled = await queue.whenSettled()
    expect(executed).toEqual(['bajo isla'])
    expect(settled.entries.map((entry) => entry.status)).toEqual([
      'executed',
      'cancelled',
      'cancelled',
    ])
  })
})
