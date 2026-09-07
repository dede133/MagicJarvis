import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../engine/gameEngine'
import { serializeMatchLog, summarizeGameState } from './matchTrace'

const card = {
  scryfallId: 'ring',
  name: 'Sol Ring',
  cmc: 1,
  typeLine: 'Artifact',
  colors: [] as const,
  colorIdentity: [] as const,
}

describe('match trace summaries', () => {
  it('captures public tabletop state without serializing a full GameState per transaction', () => {
    const state = createInitialGameState([
      {
        instanceId: 'ring',
        card: { ...card, colors: [], colorIdentity: [] },
        zone: 'battlefield',
        tapped: true,
        counters: {},
        ownerId: 'player-1',
        controllerId: 'player-1',
      },
    ])

    const summary = summarizeGameState(state)

    expect(summary).toMatchObject({
      turn: 1,
      activePlayerId: 'player-1',
      pending: { abilities: 0, resolutions: 0, decisions: 0 },
    })
    expect(summary.battlefield).toEqual([
      expect.objectContaining({
        instanceId: 'ring',
        name: 'Sol Ring',
        tapped: true,
      }),
    ])
  })

  it('exports a versioned JSON match log', () => {
    const state = createInitialGameState()
    const exported = JSON.parse(serializeMatchLog(state, [])) as {
      format: string
      schemaVersion: number
      transactions: unknown[]
    }

    expect(exported).toMatchObject({
      format: 'MagicJarvis MATCH_LOG',
      schemaVersion: 1,
      transactions: [],
    })
  })
})
