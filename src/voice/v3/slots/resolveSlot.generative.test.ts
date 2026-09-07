import { describe, expect, it } from 'vitest'
import {
  clearVoiceSlotResolverCache,
  resolveVoiceSlot,
  voiceSlotResolverCacheSize,
} from './resolveSlot'
import type { VoiceSlotOption } from './slotTypes'

const option = (canonical: string): VoiceSlotOption => ({
  id: canonical,
  canonical,
  aliases: [],
})

const deleteMiddleCharacter = (value: string): string => {
  const index = Math.max(1, Math.floor(value.length / 3))
  return value.slice(0, index) + value.slice(index + 1)
}

const swapAdjacentCharacters = (value: string): string => {
  const index = Math.max(1, Math.floor(value.length / 3))
  if (index + 1 >= value.length) return value
  return (
    value.slice(0, index) +
    value[index + 1] +
    value[index] +
    value.slice(index + 2)
  )
}

const syntheticNames = [
  'Aether Observatory',
  'Verdant Lantern',
  'Copper Citadel',
  'Obsidian Archive',
  'Silver Compass',
  'Radiant Workshop',
  'Crimson Reservoir',
  'Twilight Monolith',
] as const

describe('Voice V3 slot resolver generative invariants', () => {
  it('recovers generic spelling/spacing corruption without per-card aliases', () => {
    const options = syntheticNames.map(option)
    for (const canonical of syntheticNames) {
      const normalized = canonical.toLowerCase()
      const mutations = [
        normalized.replaceAll(' ', ''),
        deleteMiddleCharacter(normalized),
        swapAdjacentCharacters(normalized),
      ]
      for (const query of mutations)
        expect(resolveVoiceSlot(query, options), `${canonical} <- ${query}`).toMatchObject({
          status: 'MATCHED',
          option: { canonical },
        })
    }
  })

  it('keeps generic roles exact/contextual instead of fuzzy-guessing them', () => {
    const options: VoiceSlotOption[] = [
      {
        id: 'one',
        canonical: 'Obsidian Archive',
        aliases: ['criatura'],
        aliasEvidence: [
          { value: 'criatura', kind: 'TYPE', fuzzy: false },
        ],
      },
      option('Verdant Lantern'),
    ]

    expect(resolveVoiceSlot('criatura', options)).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Obsidian Archive' },
      evidenceKind: 'TYPE',
    })
    expect(resolveVoiceSlot('criatur', options)).toMatchObject({ status: 'NO_MATCH' })
  })

  it('reuses prepared Fuse catalogs and invalidates by semantic catalog signature', () => {
    clearVoiceSlotResolverCache()
    const options = syntheticNames.map(option)
    resolveVoiceSlot('aether observatory', options)
    expect(voiceSlotResolverCacheSize()).toBe(1)
    resolveVoiceSlot('aeter observatory', options)
    expect(voiceSlotResolverCacheSize()).toBe(1)
    resolveVoiceSlot('aether observatory', [...options, option('Golden Relay')])
    expect(voiceSlotResolverCacheSize()).toBe(2)
  })
})
