import { GoogleGenAI } from '@google/genai'
import { createGeminiSemanticPrompt } from '../prompts/geminiSemanticPrompt'
import { deriveCapabilitiesForSemanticAbility } from '../semantic/deriveCapabilities'
import type {
  AbilityCompilerInput,
  SemanticAbilityAnalysis,
  SemanticAbilityAnalysisProvider,
} from '../types/compilerTypes'

export const DEFAULT_GEMINI_ABILITY_MODEL = 'gemini-3.5-flash'

export class GeminiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: 'MISSING_API_KEY' | 'API_ERROR' | 'INVALID_RESPONSE',
  ) {
    super(message)
    this.name = 'GeminiProviderError'
  }
}

type GeminiResponse = { text?: string }
export type GeminiGenerateContent = (request: {
  model: string
  contents: string
  config: {
    responseMimeType: 'application/json'
    responseSchema: typeof geminiSemanticAnalysisSchema
  }
}) => Promise<GeminiResponse>

export type GeminiSemanticAbilityProviderOptions = {
  apiKey?: string
  model?: string
  generateContent?: GeminiGenerateContent
  onRawOutput?: (output: string, input: AbilityCompilerInput) => void
}

const stringListSchema = { type: 'array', items: { type: 'string' } }
const nullableStringSchema = { type: ['string', 'null'] }

/**
 * Structured output for the non-executable SemanticAbilityAnalysis contract.
 * Local validation still treats this response as untrusted.
 */
export const geminiSemanticAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['abilities', 'unsupportedOrUnclear'],
  properties: {
    abilities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'abilityKind',
          'triggerDescription',
          'costs',
          'conditions',
          'effects',
          'targets',
          'choices',
          'restrictions',
          'duration',
          'referencedObjects',
          'unsupportedOrUnclear',
        ],
        properties: {
          abilityKind: {
            type: 'string',
            enum: [
              'TRIGGERED',
              'ACTIVATED',
              'STATIC',
              'REPLACEMENT',
              'SPELL_EFFECT',
              'KEYWORD',
              'OTHER',
            ],
          },
          triggerDescription: nullableStringSchema,
          costs: stringListSchema,
          conditions: stringListSchema,
          effects: stringListSchema,
          targets: stringListSchema,
          choices: stringListSchema,
          restrictions: stringListSchema,
          duration: nullableStringSchema,
          referencedObjects: stringListSchema,
          unsupportedOrUnclear: stringListSchema,
        },
      },
    },
    unsupportedOrUnclear: stringListSchema,
  },
} as const

const abilityKinds = new Set([
  'TRIGGERED',
  'ACTIVATED',
  'STATIC',
  'REPLACEMENT',
  'SPELL_EFFECT',
  'KEYWORD',
  'OTHER',
])
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
const abilityKeys = [
  'abilityKind',
  'triggerDescription',
  'costs',
  'conditions',
  'effects',
  'targets',
  'choices',
  'restrictions',
  'duration',
  'referencedObjects',
  'unsupportedOrUnclear',
]

const deriveCapabilities = (ability: Record<string, unknown>): string[] =>
  deriveCapabilitiesForSemanticAbility(ability as SemanticAbilityAnalysis)

/** Adds deterministic diagnostics to Gemini's semantic description. */
const normalizeGeminiSemanticAnalysis = (value: unknown): unknown => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !('abilities' in value) ||
    !('unsupportedOrUnclear' in value) ||
    !Array.isArray(value.abilities) ||
    !isStringArray(value.unsupportedOrUnclear)
  )
    throw new GeminiProviderError(
      'Gemini structured response has an invalid top-level shape.',
      'INVALID_RESPONSE',
    )
  const abilities = value.abilities.map((ability) => {
    if (
      !isRecord(ability) ||
      Object.keys(ability).length !== abilityKeys.length ||
      !abilityKeys.every((key) => key in ability) ||
      !abilityKinds.has(String(ability.abilityKind)) ||
      (typeof ability.triggerDescription !== 'string' &&
        ability.triggerDescription !== null) ||
      !isStringArray(ability.costs) ||
      !isStringArray(ability.conditions) ||
      !isStringArray(ability.effects) ||
      !isStringArray(ability.targets) ||
      !isStringArray(ability.choices) ||
      !isStringArray(ability.restrictions) ||
      (typeof ability.duration !== 'string' && ability.duration !== null) ||
      !isStringArray(ability.referencedObjects) ||
      !isStringArray(ability.unsupportedOrUnclear)
    )
      throw new GeminiProviderError(
        'Gemini structured response has an invalid ability shape.',
        'INVALID_RESPONSE',
      )
    return { ...ability, requiredCapabilities: deriveCapabilities(ability) }
  })
  return { abilities, unsupportedOrUnclear: value.unsupportedOrUnclear }
}

/**
 * Dev/CLI-only semantic provider. It has no dependency on the game or ability
 * runtime and never creates an AbilityDefinition.
 */
export class GeminiSemanticAbilityProvider implements SemanticAbilityAnalysisProvider {
  readonly providerId = 'gemini-semantic-analysis'
  readonly model: string
  private readonly apiKey?: string
  private readonly generateContent?: GeminiGenerateContent
  private readonly onRawOutput?: GeminiSemanticAbilityProviderOptions['onRawOutput']

  constructor(options: GeminiSemanticAbilityProviderOptions = {}) {
    this.apiKey = options.apiKey
    this.model = options.model ?? DEFAULT_GEMINI_ABILITY_MODEL
    this.generateContent = options.generateContent
    this.onRawOutput = options.onRawOutput
  }

  async analyze(input: AbilityCompilerInput): Promise<unknown> {
    const generateContent = this.generateContent ?? this.createClientRequest()
    let response: GeminiResponse
    try {
      response = await generateContent({
        model: this.model,
        contents: createGeminiSemanticPrompt(input),
        config: {
          responseMimeType: 'application/json',
          responseSchema: geminiSemanticAnalysisSchema,
        },
      })
    } catch (error) {
      if (error instanceof GeminiProviderError) throw error
      throw new GeminiProviderError(
        error instanceof Error ? error.message : 'Gemini request failed.',
        'API_ERROR',
      )
    }
    if (typeof response.text !== 'string' || !response.text.trim())
      throw new GeminiProviderError(
        'Gemini returned an empty structured response.',
        'INVALID_RESPONSE',
      )
    this.onRawOutput?.(response.text, input)
    try {
      return normalizeGeminiSemanticAnalysis(JSON.parse(response.text))
    } catch (error) {
      if (error instanceof GeminiProviderError) throw error
      throw new GeminiProviderError(
        'Gemini returned invalid JSON.',
        'INVALID_RESPONSE',
      )
    }
  }

  private createClientRequest(): GeminiGenerateContent {
    if (!this.apiKey)
      throw new GeminiProviderError(
        'GEMINI_API_KEY is required for Gemini semantic analysis.',
        'MISSING_API_KEY',
      )
    const client = new GoogleGenAI({ apiKey: this.apiKey })
    return (request) => client.models.generateContent(request)
  }
}
