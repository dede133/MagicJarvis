import { describe, expect, it } from 'vitest'
import {
  analyzeSemanticCoverage,
  buildCapabilityReport,
  buildUnlockCombinations,
  SemanticCoverageCache,
  type SemanticCoverageCard,
} from './semanticCoverage'
import type {
  AbilityCompilerInput,
  SemanticAbilityAnalysisProvider,
} from '../types/compilerTypes'
import type { CardDefinition } from '../../../types/card'

const card = (name: string, oracleText: string): CardDefinition => ({
  scryfallId: `${name}-id`,
  oracleId: `${name}-oracle`,
  name,
  manaCost: '{U}',
  cmc: 1,
  typeLine: 'Creature — Merfolk',
  oracleText,
  colors: ['U'],
  colorIdentity: ['U'],
})

const manualCards = [
  card(
    'Counter Card',
    'Whenever a player shuffles their library, you may put a +1/+1 counter on this creature.',
  ),
  card('Draw Card', 'Whenever a player draws a card, {T}: Draw a card.'),
]

const analysis = (input: AbilityCompilerInput) => ({
  abilities: [
    input.cardName === 'Counter Card'
      ? {
          abilityKind: 'TRIGGERED',
          triggerDescription: 'An opponent shuffles.',
          costs: [],
          conditions: [],
          effects: ['Put a +1/+1 counter.'],
          targets: [],
          choices: ['You may put it.'],
          restrictions: [],
          duration: null,
          referencedObjects: [],
          requiredCapabilities: [
            'SHUFFLE_LIBRARY',
            'PLAYER_CHOICE',
            'ADD_COUNTER',
          ],
          unsupportedOrUnclear: [],
        }
      : {
          abilityKind: 'ACTIVATED',
          triggerDescription: null,
          costs: ['{T}'],
          conditions: [],
          effects: ['Draw a card.'],
          targets: [],
          choices: [],
          restrictions: [],
          duration: null,
          referencedObjects: [],
          requiredCapabilities: [
            'ACTIVATED_ABILITY',
            'TAP_SOURCE',
            'DRAW_CARD',
          ],
          unsupportedOrUnclear: [],
        },
  ],
  unsupportedOrUnclear: [],
})

class FakeProvider implements SemanticAbilityAnalysisProvider {
  readonly providerId = 'fake-gemini'
  readonly model = 'fake-model'
  calls = 0

  constructor(private readonly failCard?: string) {}

  async analyze(input: AbilityCompilerInput): Promise<unknown> {
    this.calls += 1
    if (input.cardName === this.failCard) throw new Error('provider failure')
    return analysis(input)
  }
}

const coverageCard = (
  name: string,
  requiredCapabilities: SemanticCoverageCard['requiredCapabilities'],
): SemanticCoverageCard =>
  ({
    card: card(name, 'Whenever an opponent shuffles their library.'),
    result: { status: 'PARTIAL' },
    durationMs: 1,
    providerCall: true,
    cacheHit: false,
    understanding: 'FULLY_UNDERSTOOD',
    runtime: 'UNSUPPORTED',
    requiredCapabilities,
    missingCapabilities: requiredCapabilities,
  }) as SemanticCoverageCard

describe('semantic coverage analysis', () => {
  it('aggregates capabilities and lists affected cards by frequency', () => {
    const report = buildCapabilityReport([
      coverageCard('One', ['DRAW_CARD', 'ACTIVATED_ABILITY']),
      coverageCard('Two', ['DRAW_CARD', 'DISCARD_CARD']),
    ])
    expect(report[0]).toMatchObject({
      capability: 'DRAW_CARD',
      count: 2,
      cards: ['One', 'Two'],
    })
    expect(
      report.find((item) => item.capability === 'DISCARD_CARD')?.unlocksAlone,
    ).toEqual([])
  })

  it('uses valid semantic cache entries instead of calling Gemini again', async () => {
    const provider = new FakeProvider()
    const cache = new SemanticCoverageCache()
    await analyzeSemanticCoverage(manualCards, provider, { cache })
    const cached = await analyzeSemanticCoverage(manualCards, provider, {
      cache,
    })
    expect(provider.calls).toBe(2)
    expect(cached.cacheHits).toBe(2)
    expect(cached.providerCalls).toBe(0)
  })

  it('can report cached semantic results without making a network request', async () => {
    const cache = new SemanticCoverageCache()
    await analyzeSemanticCoverage(manualCards, new FakeProvider(), { cache })
    const provider = new FakeProvider()
    const report = await analyzeSemanticCoverage(manualCards, provider, {
      cache,
      cacheOnly: true,
    })
    expect(report.cards).toHaveLength(2)
    expect(provider.calls).toBe(0)
  })

  it('keeps Flash and Flash-Lite semantic cache entries separate', async () => {
    const cache = new SemanticCoverageCache()
    const flash = new FakeProvider()
    const flashLite = new FakeProvider()
    Object.defineProperty(flashLite, 'model', {
      value: 'gemini-3.5-flash-lite',
    })
    await analyzeSemanticCoverage(manualCards, flash, { cache })
    await analyzeSemanticCoverage(manualCards, flashLite, { cache })
    expect(flash.calls).toBe(2)
    expect(flashLite.calls).toBe(2)
  })

  it('continues analyzing cards after a provider failure', async () => {
    const report = await analyzeSemanticCoverage(
      manualCards,
      new FakeProvider('Counter Card'),
    )
    expect(report.failed).toBe(1)
    expect(report.semanticAnalyzed).toBe(1)
    expect(
      report.cards.find((entry) => entry.card.name === 'Draw Card')
        ?.understanding,
    ).toBe('FULLY_UNDERSTOOD')
  })

  it('stops cleanly after a Free Tier rate-limit failure', async () => {
    const provider: SemanticAbilityAnalysisProvider = {
      providerId: 'fake-gemini',
      model: 'fake-model',
      analyze: async () => {
        throw new Error('429 RESOURCE_EXHAUSTED quota')
      },
    }
    const report = await analyzeSemanticCoverage(manualCards, provider)
    expect(report.stoppedForRateLimit).toBe(true)
    expect(report.cards).toHaveLength(1)
  })

  it('keeps semantic understanding separate from runtime support', async () => {
    const report = await analyzeSemanticCoverage(
      manualCards,
      new FakeProvider(),
    )
    const draw = report.cards.find((entry) => entry.card.name === 'Draw Card')
    expect(draw?.understanding).toBe('FULLY_UNDERSTOOD')
    expect(draw?.runtime).toBe('UNSUPPORTED')
  })

  it('finds small capability combinations that unlock full cards', () => {
    const cards = [
      coverageCard('Loot', ['ACTIVATED_ABILITY', 'TAP_SOURCE', 'DRAW_CARD']),
      coverageCard('Counter', ['ADD_COUNTER']),
    ]
    const combinations = buildUnlockCombinations(
      cards,
      buildCapabilityReport(cards),
    )
    expect(combinations).toContainEqual({
      capabilities: ['ACTIVATED_ABILITY', 'DRAW_CARD', 'TAP_SOURCE'],
      unlockedCards: ['Loot'],
    })
  })
})
