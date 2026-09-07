import type { CardDefinition } from '../../types/card'
import type { GameState } from '../../types/game'

export type TimingResult =
  | { legal: true }
  | {
      legal: false
      code: 'INVALID_TIMING' | 'STACK_NOT_EMPTY' | 'NO_PRIORITY'
      message: string
    }

const hasFlash = (card: CardDefinition): boolean =>
  /\bflash\b/i.test(card.oracleText ?? '') || /\bflash\b/i.test(card.typeLine)

const isInstant = (card: CardDefinition): boolean =>
  /\binstant\b/i.test(card.typeLine)

const isSorceryTimed = (card: CardDefinition): boolean =>
  /\b(?:creature|artifact|enchantment|planeswalker|sorcery|battle)\b/i.test(
    card.typeLine,
  )

export const isMainPhase = (state: GameState): boolean =>
  state.turnState.step === 'MAIN_1' || state.turnState.step === 'MAIN_2'

export const validateCastTiming = (
  state: GameState,
  card: CardDefinition,
): TimingResult => {
  if (state.turnState.priority !== 'WINDOW_OPEN')
    return {
      legal: false,
      code: 'NO_PRIORITY',
      message: 'No hay prioridad en este paso.',
    }
  if (isInstant(card) || hasFlash(card)) return { legal: true }
  if (!isSorceryTimed(card))
    return {
      legal: false,
      code: 'INVALID_TIMING',
      message: 'El timing de esta carta no es conocido.',
    }
  if (!isMainPhase(state))
    return {
      legal: false,
      code: 'INVALID_TIMING',
      message: 'Este hechizo requiere una fase principal.',
    }
  if (state.stack.length)
    return {
      legal: false,
      code: 'STACK_NOT_EMPTY',
      message: 'Este hechizo requiere un stack vacío.',
    }
  return { legal: true }
}

export const validateLandTiming = (state: GameState): TimingResult => {
  if (state.turnState.priority !== 'WINDOW_OPEN')
    return {
      legal: false,
      code: 'NO_PRIORITY',
      message: 'No hay prioridad para jugar una tierra.',
    }
  if (!isMainPhase(state))
    return {
      legal: false,
      code: 'INVALID_TIMING',
      message: 'Solo puedes jugar tierras en una fase principal.',
    }
  if (state.stack.length)
    return {
      legal: false,
      code: 'STACK_NOT_EMPTY',
      message: 'Solo puedes jugar tierras con el stack vacío.',
    }
  return { legal: true }
}
