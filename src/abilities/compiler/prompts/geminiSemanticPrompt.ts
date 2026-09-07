import type { AbilityCompilerInput } from '../types/compilerTypes'

/**
 * Intentionally small: Gemini receives card facts, never the runtime DSL,
 * capabilities expected by MagicJarvis, or card-specific examples.
 */
export const GEMINI_SEMANTIC_PROMPT = `You are a semantic parser for Magic: The Gathering Oracle text.

Analyze only the provided Oracle text. Do not add rules or information not explicitly present. Do not explain the card. Do not decide choices or targets for the player. Represent optional choices explicitly. If something cannot be represented confidently, mark it unclear. Return only data matching the provided schema.`

export const createGeminiSemanticPrompt = (
  input: AbilityCompilerInput,
): string =>
  `${GEMINI_SEMANTIC_PROMPT}\n\n${JSON.stringify({
    cardName: input.cardName,
    typeLine: input.typeLine,
    manaCost: input.manaCost,
    oracleText: input.oracleText,
  })}`
