import { describe, expect, it } from 'vitest'
import { mapSemanticAnalysisToRuntime } from './mapSemanticAnalysisToRuntime'
import { validateSemanticCardAnalysis } from '../validators/semanticAnalysisValidator'
import type { AbilityCompilerInput } from '../types/compilerTypes'

const input: AbilityCompilerInput = {
  cardName: 'Example Creature',
  typeLine: 'Creature — Merfolk',
  oracleText:
    'Whenever a player shuffles their library, you may put a +1/+1 counter on this creature.',
}

const validAnalysis = () => ({
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
      requiredCapabilities: ['SHUFFLE_LIBRARY', 'PLAYER_CHOICE', 'ADD_COUNTER'],
      unsupportedOrUnclear: [],
    },
  ],
  unsupportedOrUnclear: [],
})

describe('SemanticAbilityAnalysis', () => {
  it('accepts a descriptive triggered ability without any runtime data', () => {
    expect(validateSemanticCardAnalysis(input, validAnalysis()).valid).toBe(
      true,
    )
  })

  it('rejects an incoherent triggered ability without a trigger description', () => {
    const analysis = validAnalysis()
    ;(
      analysis.abilities[0] as { triggerDescription: string | null }
    ).triggerDescription = null
    expect(validateSemanticCardAnalysis(input, analysis).valid).toBe(false)
  })

  it('rejects when/whenever text misclassified as a replacement or static ability', () => {
    const analysis = validAnalysis()
    analysis.abilities[0].abilityKind = 'REPLACEMENT'
    analysis.abilities[0].triggerDescription =
      'Whenever an opponent shuffles their library.'
    expect(validateSemanticCardAnalysis(input, analysis).valid).toBe(false)
  })

  it('rejects unknown semantic fields and capabilities', () => {
    const analysis = validAnalysis()
    Object.assign(analysis.abilities[0], { invented: true })
    expect(validateSemanticCardAnalysis(input, analysis).valid).toBe(false)
  })

  it('never substitutes a runtime effect when no deterministic mapping exists', () => {
    const validated = validateSemanticCardAnalysis(input, validAnalysis())
    if (!validated.valid) throw new Error('Fixture must be valid.')
    const mapped = mapSemanticAnalysisToRuntime(input, validated.value)
    expect(mapped).toMatchObject({
      status: 'MANUAL',
      abilities: [],
      capabilityGaps: [],
    })
  })
})
