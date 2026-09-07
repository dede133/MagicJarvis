import { createAbilityCompilerPrompt } from '../prompts/abilityCompilerPrompt'
import type {
  AbilityCompilerInput,
  SemanticAbilityAnalysisProvider,
} from '../types/compilerTypes'
import { semanticCapabilityCategories } from '../validators/semanticAnalysisValidator'

export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
export const DEFAULT_OLLAMA_ABILITY_MODEL = 'qwen3:4b-instruct'

export class OllamaProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      'UNAVAILABLE' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'MODEL_MISSING',
  ) {
    super(message)
    this.name = 'OllamaProviderError'
  }
}

export type OllamaHealth = {
  available: boolean
  modelAvailable: boolean
  version?: string
  error?: string
}

export type OllamaAbilityCompilerProviderOptions = {
  baseUrl?: string
  model?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  onRawOutput?: (output: string, input: AbilityCompilerInput) => void
}

const stringListSchema = { type: 'array', items: { type: 'string' } }
const nullableStringSchema = { type: ['string', 'null'] }

/** Structured output schema for non-executable semantic analysis only. */
export const ollamaSemanticAnalysisSchema = {
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
          'requiredCapabilities',
          'unsupportedOrUnclear',
        ],
        properties: {
          abilityKind: {
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
          requiredCapabilities: {
            type: 'array',
            items: { type: 'string', enum: semanticCapabilityCategories },
          },
          unsupportedOrUnclear: stringListSchema,
        },
      },
    },
    unsupportedOrUnclear: stringListSchema,
  },
} as const

type OllamaChatResponse = { message?: { content?: unknown } }
type OllamaTagsResponse = { models?: Array<{ name?: unknown }> }

const responseError = (
  response: Response,
  body: unknown,
): OllamaProviderError =>
  new OllamaProviderError(
    `Ollama request failed (${response.status}): ${
      typeof body === 'object' && body && 'error' in body
        ? String(body.error)
        : 'unknown error'
    }`,
    'UNAVAILABLE',
  )

/** Dev/CLI-only provider. It does not import or depend on the game runtime. */
export class OllamaAbilityCompilerProvider implements SemanticAbilityAnalysisProvider {
  readonly providerId = 'ollama-semantic-analysis'
  readonly model: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly onRawOutput?: OllamaAbilityCompilerProviderOptions['onRawOutput']

  constructor(options: OllamaAbilityCompilerProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL).replace(
      /\/$/,
      '',
    )
    this.model = options.model ?? DEFAULT_OLLAMA_ABILITY_MODEL
    this.timeoutMs = options.timeoutMs ?? 180_000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.onRawOutput = options.onRawOutput
  }

  async healthCheck(): Promise<OllamaHealth> {
    try {
      const [versionResponse, tagsResponse] = await Promise.all([
        this.request('/api/version'),
        this.request('/api/tags'),
      ])
      const version = (await versionResponse.json()) as { version?: unknown }
      const tags = (await tagsResponse.json()) as OllamaTagsResponse
      return {
        available: true,
        modelAvailable: (tags.models ?? []).some(
          (entry) => entry.name === this.model,
        ),
        ...(typeof version.version === 'string'
          ? { version: version.version }
          : {}),
      }
    } catch (error) {
      return {
        available: false,
        modelAvailable: false,
        error:
          error instanceof Error ? error.message : 'Ollama is unavailable.',
      }
    }
  }

  async analyze(input: AbilityCompilerInput): Promise<unknown> {
    const response = await this.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: ollamaSemanticAnalysisSchema,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: createAbilityCompilerPrompt(input) },
          { role: 'user', content: JSON.stringify(input) },
        ],
      }),
    })
    const body = (await response.json()) as
      OllamaChatResponse | { error?: unknown }
    if (!response.ok) throw responseError(response, body)
    const raw = (body as OllamaChatResponse).message?.content
    if (typeof raw !== 'string' || !raw.trim())
      throw new OllamaProviderError(
        'Ollama returned an empty response.',
        'INVALID_RESPONSE',
      )
    this.onRawOutput?.(raw, input)
    try {
      return JSON.parse(raw) as unknown
    } catch {
      throw new OllamaProviderError(
        'Ollama returned invalid JSON.',
        'INVALID_RESPONSE',
      )
    }
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        throw new OllamaProviderError(
          `Ollama timed out after ${Math.round(this.timeoutMs / 1000)} seconds.`,
          'TIMEOUT',
        )
      throw new OllamaProviderError(
        `Ollama is unavailable at ${this.baseUrl}.`,
        'UNAVAILABLE',
      )
    } finally {
      clearTimeout(timer)
    }
  }
}
