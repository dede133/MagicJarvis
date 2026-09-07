import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { cleanupDiscardDecision } from './cleanup'

const cleanupState = () => ({
  ...createInitialGameState(),
  hiddenZoneTracking: 'COUNTS_ONLY' as const,
  handCount: 9,
  turnState: {
    phase: 'ENDING' as const,
    step: 'CLEANUP' as const,
    priority: 'NONE' as const,
  },
})

describe('cleanup hand size', () => {
  it('asks the local player to discard down to seven', () => {
    expect(cleanupDiscardDecision(cleanupState())).toMatchObject({
      type: 'CLEANUP_DISCARD_SELECTION',
      continuation: { cleanupDiscard: { maxHandSize: 7 } },
    })
  })

  it('does not ask for a discard with unlimited hand size', () => {
    expect(
      cleanupDiscardDecision({
        ...cleanupState(),
        maxHandSizeOverride: 'UNLIMITED',
      }),
    ).toBeUndefined()
  })
})
