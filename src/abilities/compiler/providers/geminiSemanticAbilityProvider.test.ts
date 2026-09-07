import { describe, expect, it } from 'vitest'
import { CompiledAbilityCache } from '../cache/abilityCache'
import { compileCardAbilitiesWithProvider } from '../compileCardAbilities'
import type { AbilityCompilerInput } from '../types/compilerTypes'
import {
  DEFAULT_GEMINI_ABILITY_MODEL,
  GeminiProviderError,
  GeminiSemanticAbilityProvider,
} from './geminiSemanticAbilityProvider'

const card = {
  name: "Cosi's Trickster",
  oracleId: 'cosi-oracle',
  typeLine: 'Creature — Merfolk Rogue',
  manaCost: '{U}',
  oracleText:
    "Whenever an opponent shuffles their library, you may put a +1/+1 counter on Cosi's Trickster.",
}

const input: AbilityCompilerInput = {
  cardName: card.name,
  oracleId: card.oracleId,
  typeLine: card.typeLine,
  manaCost: card.manaCost,
  oracleText: card.oracleText,
}

const validAnalysis = () => ({
  abilities: [
    {
      abilityKind: 'TRIGGERED',
      triggerDescription: 'An opponent shuffles their library.',
      costs: [],
      conditions: [],
      effects: ["Put a +1/+1 counter on Cosi's Trickster."],
      targets: ["Cosi's Trickster"],
      choices: ['You may put the counter.'],
      restrictions: [],
      duration: null,
      referencedObjects: ["Cosi's Trickster"],
      unsupportedOrUnclear: [],
    },
  ],
  unsupportedOrUnclear: [],
})

const fakeGenerator = (response: unknown) => async () => ({
  text: JSON.stringify(response),
})

describe('GeminiSemanticAbilityProvider', () => {
  it('sends the small semantic-only structured request and accepts valid output', async () => {
    let request: unknown
    const provider = new GeminiSemanticAbilityProvider({
      apiKey: 'test-key',
      generateContent: async (input) => {
        request = input
        return { text: JSON.stringify(validAnalysis()) }
      },
    })
    await expect(provider.analyze(input)).resolves.toMatchObject({
      abilities: [
        {
          requiredCapabilities: [
            'PLAYER_CHOICE',
            'SHUFFLE_LIBRARY',
            'ADD_COUNTER',
          ],
        },
      ],
    })
    expect(request).toMatchObject({
      model: DEFAULT_GEMINI_ABILITY_MODEL,
      config: {
        responseMimeType: 'application/json',
        responseSchema: { properties: { abilities: { type: 'array' } } },
      },
    })
    expect(JSON.stringify(request)).not.toContain('test-key')
    expect(JSON.stringify(request)).not.toContain('BLUE_MERFOLK_1_1')
    expect(JSON.stringify(request)).not.toContain('requiredCapabilities')
  })

  it('requires a key only when a real Gemini client is needed', async () => {
    const provider = new GeminiSemanticAbilityProvider()
    await expect(provider.analyze(input)).rejects.toMatchObject({
      code: 'MISSING_API_KEY',
    })
  })

  it('rejects non-JSON output before it reaches semantic validation', async () => {
    const provider = new GeminiSemanticAbilityProvider({
      apiKey: 'test-key',
      generateContent: async () => ({ text: 'not JSON' }),
    })
    await expect(provider.analyze(input)).rejects.toBeInstanceOf(
      GeminiProviderError,
    )
  })

  it('keeps malformed structured analysis outside the runtime', async () => {
    const provider = new GeminiSemanticAbilityProvider({
      apiKey: 'test-key',
      generateContent: fakeGenerator({ abilities: 'invalid' }),
    })
    const compilation = await compileCardAbilitiesWithProvider(card, provider, {
      cache: new CompiledAbilityCache(),
    })
    expect(compilation.result.status).toBe('FAILED')
    expect(compilation.result.warnings?.[0]).toContain(
      'invalid top-level shape',
    )
  })

  it('keeps provider/model caches isolated', async () => {
    const cache = new CompiledAbilityCache()
    let calls = 0
    const first = new GeminiSemanticAbilityProvider({
      apiKey: 'test-key',
      model: 'gemini-a',
      generateContent: async () => {
        calls += 1
        return { text: JSON.stringify(validAnalysis()) }
      },
    })
    const second = new GeminiSemanticAbilityProvider({
      apiKey: 'test-key',
      model: 'gemini-b',
      generateContent: async () => {
        calls += 1
        return { text: JSON.stringify(validAnalysis()) }
      },
    })
    await compileCardAbilitiesWithProvider(card, first, { cache })
    await compileCardAbilitiesWithProvider(card, first, { cache })
    await compileCardAbilitiesWithProvider(card, second, { cache })
    expect(calls).toBe(2)
  })

  it('normal provider API errors become FAILED without stopping the caller', async () => {
    const provider = new GeminiSemanticAbilityProvider({
      apiKey: 'test-key',
      generateContent: async () => {
        throw new Error('network unavailable')
      },
    })
    const compilation = await compileCardAbilitiesWithProvider(card, provider, {
      cache: new CompiledAbilityCache(),
    })
    expect(compilation.result.status).toBe('FAILED')
  })

  it('derives capabilities locally instead of sending them to Gemini', async () => {
    const provider = new GeminiSemanticAbilityProvider({
      apiKey: 'test-key',
      generateContent: fakeGenerator(validAnalysis()),
    })
    const analysis = (await provider.analyze(input)) as {
      abilities: Array<{ requiredCapabilities: string[] }>
    }
    expect(analysis.abilities[0].requiredCapabilities).toContain('ADD_COUNTER')
  })

  it('derives player choice from an explicit semantic choice', async () => {
    const output = validAnalysis()
    output.abilities[0].effects = ['Put a +1/+1 counter on this creature.']
    output.abilities[0].choices = ['Put a +1/+1 counter on this creature.']
    const provider = new GeminiSemanticAbilityProvider({
      apiKey: 'test-key',
      generateContent: fakeGenerator(output),
    })
    const analysis = (await provider.analyze(input)) as {
      abilities: Array<{ requiredCapabilities: string[] }>
    }
    expect(analysis.abilities[0].requiredCapabilities).toContain(
      'PLAYER_CHOICE',
    )
  })
})
