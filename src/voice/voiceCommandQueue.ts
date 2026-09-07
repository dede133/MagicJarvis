import type { ParsedCommand } from '../commands/types/commandTypes'
import type { VoiceCommandHistoryEntry } from './voiceCommandExecution'
import type { VoiceNlpDecision } from './nlp/voiceIntentAssistance'

export type VoiceCommandQueueEntryStatus =
  'queued' | 'executing' | 'executed' | 'failed' | 'cancelled'

export type VoiceCommandQueueStatus = 'idle' | 'processing'

export type VoiceCommandQueueInput = {
  rawTranscript: string
  normalizedTranscript: string
  parsedCommand: ParsedCommand
  nlpIntent?: string
  nlpScore?: number
  nlpDecision?: VoiceNlpDecision
}

export type VoiceCommandQueueEntry = VoiceCommandQueueInput & {
  id: string
  status: VoiceCommandQueueEntryStatus
  result?: VoiceCommandHistoryEntry
  error?: string
}

export type VoiceCommandQueueSnapshot = {
  status: VoiceCommandQueueStatus
  entries: readonly VoiceCommandQueueEntry[]
}

export type VoiceCommandQueueExecutor = (
  entry: Readonly<VoiceCommandQueueEntry>,
) => VoiceCommandHistoryEntry | Promise<VoiceCommandHistoryEntry>

type Listener = (snapshot: VoiceCommandQueueSnapshot) => void

/**
 * Serializes already-parsed voice commands.
 *
 * Parsing happens before enqueueing, but execution/resolution is deliberately
 * deferred until an entry reaches the head of the queue. This lets every
 * command resolve against the GameState produced by the command before it.
 *
 * The queue is fail-fast per utterance: the first failed command is preserved
 * as failed and every command that has not started yet is cancelled. The queue
 * then becomes idle immediately, so a later utterance can be processed as a
 * fresh sequence without requiring resume/cancel UI.
 */
export class VoiceCommandQueue {
  private entries: VoiceCommandQueueEntry[] = []
  private listeners = new Set<Listener>()
  private draining = false
  private nextId = 1
  private settledWaiters = new Set<() => void>()

  constructor(private readonly executor: VoiceCommandQueueExecutor) {}

  enqueue(input: VoiceCommandQueueInput): VoiceCommandQueueEntry {
    return this.enqueueMany([input])[0]
  }

  enqueueMany(
    inputs: readonly VoiceCommandQueueInput[],
  ): VoiceCommandQueueEntry[] {
    const added = inputs.map<VoiceCommandQueueEntry>((input) => ({
      ...input,
      id: `voice-${this.nextId++}`,
      status: 'queued',
    }))
    this.entries.push(...added)
    this.emit()
    void this.drain()
    return added
  }

  getSnapshot(): VoiceCommandQueueSnapshot {
    return {
      status: this.draining ? 'processing' : 'idle',
      entries: this.entries.map((entry) => ({ ...entry })),
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  /** Cancels commands that have not started. The currently executing item is untouched. */
  cancelPending(): number {
    const cancelled = this.cancelQueuedEntries()
    if (cancelled > 0) this.emit()
    this.resolveSettledWaitersIfNeeded()
    return cancelled
  }

  /** Removes entries that can no longer execute while keeping queued/executing work. */
  clearFinished(): void {
    this.entries = this.entries.filter(
      (entry) => entry.status === 'queued' || entry.status === 'executing',
    )
    this.emit()
  }

  /** Useful for tests/debug tooling: resolves once no command is executing. */
  whenSettled(): Promise<VoiceCommandQueueSnapshot> {
    if (!this.draining) return Promise.resolve(this.getSnapshot())
    return new Promise((resolve) => {
      const waiter = () => resolve(this.getSnapshot())
      this.settledWaiters.add(waiter)
    })
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    this.emit()

    try {
      while (true) {
        const next = this.entries.find((entry) => entry.status === 'queued')
        if (!next) break

        next.status = 'executing'
        this.emit()

        let failed = false
        try {
          const result = await this.executor({ ...next })
          next.result = result
          if (result.successful) {
            next.status = 'executed'
          } else {
            next.status = 'failed'
            next.error = result.result
            failed = true
          }
        } catch (error) {
          next.status = 'failed'
          next.error =
            error instanceof Error
              ? error.message
              : 'Voice command execution failed.'
          failed = true
        }

        if (failed) {
          this.cancelQueuedEntries()
          this.emit()
          break
        }
        this.emit()
      }
    } finally {
      this.draining = false
      this.emit()
      this.resolveSettledWaitersIfNeeded()
    }
  }

  private cancelQueuedEntries(): number {
    let cancelled = 0
    for (const entry of this.entries) {
      if (entry.status !== 'queued') continue
      entry.status = 'cancelled'
      cancelled += 1
    }
    return cancelled
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }

  private resolveSettledWaitersIfNeeded(): void {
    if (this.draining) return
    const waiters = [...this.settledWaiters]
    this.settledWaiters.clear()
    for (const waiter of waiters) waiter()
  }
}
