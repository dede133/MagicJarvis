import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInitialGameState } from '../engine/gameEngine'
import {
  clearMatchRecoverySnapshot,
  loadMatchRecoverySnapshot,
  MATCH_RECOVERY_STORAGE_KEY,
  saveMatchRecoverySnapshot,
} from './matchRecovery'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const originalLocalStorage = globalThis.localStorage

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  })
})

describe('match recovery', () => {
  it('persists and restores a real match snapshot', () => {
    const game = {
      ...createInitialGameState(),
      deckDefinitionsByPlayer: {} as NonNullable<
        ReturnType<typeof createInitialGameState>['deckDefinitionsByPlayer']
      >,
      history: [
        {
          actionId: 'a1',
          timestamp: 1,
          action: { type: 'LOSE_LIFE', amount: 1 } as const,
          description: '-1 vida',
          turn: 1,
        },
      ],
    }

    expect(saveMatchRecoverySnapshot(game, [])).toBe(true)
    expect(loadMatchRecoverySnapshot()?.game.history).toHaveLength(1)
  })

  it('drops an incompatible schema instead of attempting a risky restore', () => {
    globalThis.localStorage.setItem(
      MATCH_RECOVERY_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 999, savedAt: Date.now(), game: {} }),
    )

    expect(loadMatchRecoverySnapshot()).toBeUndefined()
    expect(
      globalThis.localStorage.getItem(MATCH_RECOVERY_STORAGE_KEY),
    ).toBeNull()
  })

  it('can explicitly discard the saved match', () => {
    const game = {
      ...createInitialGameState(),
      history: [
        {
          actionId: 'a1',
          timestamp: 1,
          action: { type: 'LOSE_LIFE', amount: 1 } as const,
          description: '-1 vida',
          turn: 1,
        },
      ],
    }
    saveMatchRecoverySnapshot(game, [])

    clearMatchRecoverySnapshot()

    expect(loadMatchRecoverySnapshot()).toBeUndefined()
  })
})
