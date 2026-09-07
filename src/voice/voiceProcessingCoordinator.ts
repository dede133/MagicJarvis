export type VoiceProcessingLease = {
  generation: number
  isCurrent: () => boolean
}

/**
 * Serializes finalized continuous-voice utterances and gives each listening
 * lifecycle a cancellation generation. Invalidating the generation makes
 * queued work a no-op and lets in-flight processing re-check validity before
 * it mutates game state.
 */
export class VoiceProcessingCoordinator {
  private generation = 0
  private chain: Promise<void> = Promise.resolve()

  beginSession(): number {
    this.generation += 1
    return this.generation
  }

  invalidate(): void {
    this.generation += 1
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation
  }

  enqueue(
    generation: number,
    task: (lease: VoiceProcessingLease) => void | Promise<void>,
  ): Promise<void> {
    const run = async () => {
      if (!this.isCurrent(generation)) return
      await task({
        generation,
        isCurrent: () => this.isCurrent(generation),
      })
    }

    const next = this.chain.then(run, run)
    // Keep the internal chain usable after a task-level failure while still
    // returning the original promise so callers can surface that failure.
    this.chain = next.catch(() => undefined)
    return next
  }
}
