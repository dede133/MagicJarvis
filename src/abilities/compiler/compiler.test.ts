import { describe, expect, it } from 'vitest'
import { analyzeDeckAbilities } from './analyzeDeckAbilities'
import {
  CompiledAbilityCache,
  compiledAbilityCacheKey,
} from './cache/abilityCache'
import { compileCardAbilities } from './compileCardAbilities'
import { namorAbilities } from '../definitions/namor'
import { createAbilityCompilerPrompt } from './prompts/abilityCompilerPrompt'
import type { AbilityCompilerProvider } from './types/compilerTypes'
import {
  validateAbilityDefinition,
  validateAbilityDefinitions,
} from './validators/abilityDefinitionValidator'
import type { AbilityDefinition } from '../types/abilityTypes'
import type { CardDefinition } from '../../types/card'

const namorOracleText = `Flying
Namor's power is equal to the number of Merfolk you control.
Whenever you cast a noncreature spell with one or more blue mana symbols in its mana cost, create that many 1/1 blue Merfolk creature tokens.`

const namor: CardDefinition = {
  scryfallId: 'namor',
  oracleId: 'namor-oracle',
  name: 'Namor the Sub-Mariner',
  manaCost: '{1}{U}',
  cmc: 2,
  typeLine: 'Legendary Creature — Human Mutant',
  oracleText: namorOracleText,
  colors: ['U'],
  colorIdentity: ['U'],
}

const validAbility = (): AbilityDefinition => structuredClone(namorAbilities[0])

describe('Ability Compiler', () => {
  it('accepts a valid AbilityDefinition schema', () => {
    expect(validateAbilityDefinition(validAbility()).valid).toBe(true)
  })

  it.each([
    [
      'an invented trigger',
      (ability: Record<string, unknown>) => {
        ability.trigger = { type: 'MAGICALLY_TRIGGERED' }
      },
    ],
    [
      'an invented effect',
      (ability: Record<string, unknown>) => {
        ability.effects = [{ type: 'DESTROY_EVERYTHING_MAGICALLY' }]
      },
    ],
    [
      'an invalid event field',
      (ability: Record<string, unknown>) => {
        ability.conditions = [
          {
            type: 'EVENT_NUMBER_COMPARE',
            field: 'life',
            operator: 'GT',
            value: 0,
          },
        ]
      },
    ],
    [
      'an unknown token',
      (ability: Record<string, unknown>) => {
        ability.effects = [
          {
            type: 'CREATE_TOKEN',
            tokenId: 'UNKNOWN_TOKEN',
            amount: { type: 'LITERAL', value: 1 },
          },
        ]
      },
    ],
    [
      'an invalid amount',
      (ability: Record<string, unknown>) => {
        ability.effects = [
          {
            type: 'CREATE_TOKEN',
            tokenId: 'BLUE_MERFOLK_1_1',
            amount: { type: 'LITERAL', value: -1 },
          },
        ]
      },
    ],
  ])('rejects %s', (_label, mutate) => {
    const candidate = validAbility() as unknown as Record<string, unknown>
    mutate(candidate)
    expect(validateAbilityDefinition(candidate).valid).toBe(false)
  })

  it('compiles the real Namor oracle pattern to the DSL equivalent of the manual fixture', () => {
    const compiled = compileCardAbilities(namor)
    expect(compiled.status).toBe('COMPILED')
    expect(compiled.abilities).toHaveLength(1)
    const comparable = (
      ability: Extract<AbilityDefinition, { kind: 'TRIGGERED' }>,
    ) => ({
      sourceCardName: ability.sourceCardName,
      kind: ability.kind,
      trigger: ability.trigger,
      conditions: ability.conditions,
      effects: ability.effects,
      automation: ability.automation,
    })
    expect(
      comparable(
        compiled.abilities[0] as Extract<
          AbilityDefinition,
          { kind: 'TRIGGERED' }
        >,
      ),
    ).toEqual(
      comparable(
        namorAbilities[0] as Extract<AbilityDefinition, { kind: 'TRIGGERED' }>,
      ),
    )
  })

  it('returns MANUAL safely for unsupported triggered text and never creates an effect type', () => {
    const result = compileCardAbilities({
      ...namor,
      name: 'Unsupported Card',
      oracleText: 'Whenever an opponent draws a card, you may draw a card.',
    })
    expect(result).toMatchObject({
      status: 'MANUAL',
      abilities: [],
      unsupportedFragments: [
        'Whenever an opponent draws a card, you may draw a card.',
      ],
    })
    expect(
      result.abilities
        .filter(
          (
            ability,
          ): ability is Extract<AbilityDefinition, { kind: 'TRIGGERED' }> =>
            ability.kind === 'TRIGGERED',
        )
        .flatMap((ability) => ability.effects)
        .every((effect) => effect.type === 'CREATE_TOKEN'),
    ).toBe(true)
  })

  it('supports multiple abilities in the model', () => {
    const second = { ...validAbility(), id: 'second-ability' }
    expect(validateAbilityDefinitions([validAbility(), second]).valid).toBe(
      true,
    )
  })

  it('creates stable oracle cache keys that change with oracle text', () => {
    expect(compiledAbilityCacheKey('oracle-id', 'same text', 'Card')).toBe(
      compiledAbilityCacheKey('oracle-id', 'same text', 'Card'),
    )
    expect(compiledAbilityCacheKey('oracle-id', 'same text', 'Card')).not.toBe(
      compiledAbilityCacheKey('oracle-id', 'changed text', 'Card'),
    )
  })

  it('reuses a cached compilation for the same oracle identity and text', () => {
    const cache = new CompiledAbilityCache()
    const first = compileCardAbilities(namor, cache)
    const second = compileCardAbilities(namor, cache)
    expect(second).toBe(first)
  })

  it('keeps the provider contract independent from the runtime', async () => {
    const provider: AbilityCompilerProvider = {
      compile: async () => ({
        status: 'MANUAL',
        abilities: [],
        unsupportedFragments: ['manual'],
      }),
    }
    await expect(
      provider.compile({
        cardName: 'Card',
        typeLine: 'Instant',
        oracleText: 'Text',
      }),
    ).resolves.toMatchObject({ status: 'MANUAL' })
  })

  it('documents the closed DSL in the future-provider prompt contract', () => {
    expect(
      createAbilityCompilerPrompt({
        cardName: namor.name,
        typeLine: namor.typeLine,
        oracleText: namor.oracleText,
      }),
    ).toContain('CREATE_TOKEN')
  })

  it('analyzes cards locally without an LLM provider', () => {
    const analysis = analyzeDeckAbilities([
      namor,
      { ...namor, name: 'Vanilla', oracleId: 'vanilla', oracleText: undefined },
    ])
    expect(analysis).toMatchObject({
      total: 2,
      counts: { COMPILED: 1, NO_RUNTIME_ABILITY: 1 },
    })
  })
})
