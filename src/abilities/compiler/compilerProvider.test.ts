import { describe, expect, it } from 'vitest'
import {
  compileCardAbilitiesWithProvider,
  type ProviderCompilationResult,
} from './compileCardAbilities'
import { CompiledAbilityCache } from './cache/abilityCache'
import {
  compileDeckWithProvider,
  selectCardsForProviderCompilation,
} from './compileDeckWithProvider'
import {
  DEFAULT_OLLAMA_ABILITY_MODEL,
  OllamaAbilityCompilerProvider,
  OllamaProviderError,
} from './providers/ollamaAbilityCompilerProvider'
import { getCapabilityCoverage } from './semantic/capabilityCoverage'
import type {
  AbilityCompilerInput,
  CapabilityGapCategory,
  SemanticAbilityAnalysisProvider,
} from './types/compilerTypes'
import type { CardDefinition } from '../../types/card'

const namor: CardDefinition = {
  scryfallId: 'namor',
  oracleId: 'namor-oracle',
  name: 'Namor the Sub-Mariner',
  manaCost: '{1}{U}',
  cmc: 2,
  typeLine: 'Legendary Creature — Human Mutant',
  oracleText:
    'Whenever you cast a noncreature spell with one or more blue mana symbols in its mana cost, create that many 1/1 blue Merfolk creature tokens.',
  colors: ['U'],
  colorIdentity: ['U'],
}

const manualCard = (name = 'Manual Card'): CardDefinition => ({
  ...namor,
  scryfallId: `${name}-id`,
  oracleId: `${name}-oracle`,
  name,
  oracleText:
    'Whenever a player shuffles their library, you may put a +1/+1 counter on this creature.',
})

const noRuntimeCard: CardDefinition = {
  ...manualCard('Vanilla Card'),
  oracleText: undefined,
}

const semanticAnalysis = (
  capabilities: CapabilityGapCategory[] = [
    'SHUFFLE_LIBRARY',
    'PLAYER_CHOICE',
    'ADD_COUNTER',
  ],
) => ({
  abilities: [
    {
      abilityKind: 'TRIGGERED',
      triggerDescription: 'An opponent shuffles their library.',
      costs: [],
      conditions: [],
      effects: ['Put a +1/+1 counter on this creature.'],
      targets: [],
      choices: ['You may apply the effect.'],
      restrictions: [],
      duration: null,
      referencedObjects: ['this creature', 'opponent library'],
      requiredCapabilities: capabilities,
      unsupportedOrUnclear: [],
    },
  ],
  unsupportedOrUnclear: [],
})

class FakeSemanticProvider implements SemanticAbilityAnalysisProvider {
  readonly providerId = 'fake-semantic'
  readonly model = 'fake-model'
  calls = 0

  constructor(
    private readonly response: (input: AbilityCompilerInput) => unknown = () =>
      semanticAnalysis(),
  ) {}

  async analyze(input: AbilityCompilerInput): Promise<unknown> {
    this.calls += 1
    return this.response(input)
  }
}

describe('semantic provider ability compilation', () => {
  it('does not call a provider for deterministic Namor or no-runtime cards', async () => {
    const provider = new FakeSemanticProvider()
    await compileCardAbilitiesWithProvider(namor, provider)
    await compileCardAbilitiesWithProvider(noRuntimeCard, provider)
    expect(provider.calls).toBe(0)
  })

  it('accepts valid semantic output without creating runtime abilities', async () => {
    const provider = new FakeSemanticProvider()
    const compilation = await compileCardAbilitiesWithProvider(
      manualCard(),
      provider,
      { cache: new CompiledAbilityCache() },
    )
    expect(compilation.result).toMatchObject({
      status: 'MANUAL',
      abilities: [],
      capabilityGaps: [],
    })
    expect(compilation.semanticAnalysis?.abilities[0].abilityKind).toBe(
      'TRIGGERED',
    )
  })

  it('fails only for malformed semantic output, not missing runtime capability', async () => {
    const provider = new FakeSemanticProvider(() => ({
      abilities: 'not-an-array',
    }))
    const compilation = await compileCardAbilitiesWithProvider(
      manualCard(),
      provider,
      { cache: new CompiledAbilityCache() },
    )
    expect(compilation.result.status).toBe('FAILED')
    expect(compilation.semanticValidationErrors).toContain(
      'Semantic analysis has missing or unknown fields.',
    )
  })

  it('rejects invented semantic capability labels', async () => {
    const provider = new FakeSemanticProvider(() => {
      const output = semanticAnalysis()
      output.abilities[0].requiredCapabilities = [
        'DESTROY_EVERYTHING_MAGICALLY',
      ] as unknown as CapabilityGapCategory[]
      return output
    })
    const compilation = await compileCardAbilitiesWithProvider(
      manualCard(),
      provider,
      { cache: new CompiledAbilityCache() },
    )
    expect(compilation.result.status).toBe('FAILED')
  })

  it('compares required capabilities deterministically', () => {
    expect(
      getCapabilityCoverage(['CREATE_TOKEN', 'ADD_COUNTER', 'PLAYER_CHOICE']),
    ).toEqual({
      supported: ['CREATE_TOKEN', 'ADD_COUNTER', 'PLAYER_CHOICE'],
      missing: [],
    })
  })

  it('uses the semantic cache unless force is requested', async () => {
    const card = manualCard()
    const provider = new FakeSemanticProvider()
    const cache = new CompiledAbilityCache()
    await compileCardAbilitiesWithProvider(card, provider, { cache })
    const cached = await compileCardAbilitiesWithProvider(card, provider, {
      cache,
    })
    await compileCardAbilitiesWithProvider(card, provider, {
      cache,
      force: true,
    })
    expect(cached.cacheHit).toBe(true)
    expect(provider.calls).toBe(2)
  })

  it('turns provider timeouts into FAILED without throwing', async () => {
    const provider: SemanticAbilityAnalysisProvider = {
      providerId: 'fake',
      model: 'fake-model',
      analyze: async () => {
        throw new OllamaProviderError(
          'Ollama timed out after 180 seconds.',
          'TIMEOUT',
        )
      },
    }
    const compilation = await compileCardAbilitiesWithProvider(
      manualCard(),
      provider,
      { cache: new CompiledAbilityCache() },
    )
    expect(compilation.result.status).toBe('FAILED')
  })

  it('continues after one semantic provider failure and reports the remaining gaps', async () => {
    const first = manualCard('First Card')
    const second = manualCard('Second Card')
    const provider = new FakeSemanticProvider((input) => {
      if (input.cardName === first.name)
        throw new Error('Invalid provider response')
      return semanticAnalysis(['ADD_COUNTER'])
    })
    const report = await compileDeckWithProvider([first, second], provider)
    expect(report.counts).toMatchObject({ FAILED: 1, MANUAL: 1 })
    expect(report.capabilityGaps).toEqual({})
  })

  it('selects only manual or partial cards with limit and card filters', () => {
    const cards = [manualCard('One'), manualCard('Two'), namor, noRuntimeCard]
    expect(selectCardsForProviderCompilation(cards, { limit: 1 })).toHaveLength(
      1,
    )
    expect(
      selectCardsForProviderCompilation(cards, { cardName: 'two' }),
    ).toEqual([cards[1]])
  })

  it('uses Ollama health checks and reports a missing model', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).endsWith('/api/version'))
        return new Response(JSON.stringify({ version: '0.32.13' }))
      return new Response(JSON.stringify({ models: [] }))
    }
    const provider = new OllamaAbilityCompilerProvider({ fetchImpl })
    await expect(provider.healthCheck()).resolves.toEqual({
      available: true,
      modelAvailable: false,
      version: '0.32.13',
    })
    expect(provider.model).toBe(DEFAULT_OLLAMA_ABILITY_MODEL)
  })

  it('sends a semantic-only structured-output request to Ollama', async () => {
    let requestBody: unknown
    const provider = new OllamaAbilityCompilerProvider({
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body))
        return new Response(
          JSON.stringify({
            message: { content: JSON.stringify(semanticAnalysis()) },
          }),
        )
      },
    })
    await provider.analyze({
      cardName: 'Manual Card',
      typeLine: 'Creature',
      oracleText: manualCard().oracleText,
    })
    expect(requestBody).toMatchObject({
      model: DEFAULT_OLLAMA_ABILITY_MODEL,
      options: { temperature: 0 },
      format: { properties: { abilities: { type: 'array' } } },
    })
    expect(JSON.stringify(requestBody)).not.toContain('BLUE_MERFOLK_1_1')
  })

  it('keeps Namor deterministic end-to-end', async () => {
    const result: ProviderCompilationResult =
      await compileCardAbilitiesWithProvider(namor, new FakeSemanticProvider())
    expect(result).toMatchObject({
      providerCall: false,
      result: {
        status: 'COMPILED',
        abilities: [{ trigger: { type: 'SPELL_CAST' } }],
      },
    })
  })
})
