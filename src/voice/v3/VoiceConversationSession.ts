import { normalizeCommandText } from '../../commands/parser/normalizeText'
import type { GameState } from '../../types/game'
import {
  DEFAULT_VOICE_LANGUAGE_PACK,
  type VoiceLanguagePack,
} from '../languages'
import { hasVoiceCommandCandidateAnchor } from '../voiceCommandGate'
import { matchSemanticVoiceCommand } from './matcher/semanticMatcher'
import type {
  SemanticClarificationChoice,
  SemanticCommand,
  SemanticIntent,
  SemanticMatchResult,
} from './semanticCommand'
import { resolveVoiceSlot } from './slots/resolveSlot'

const contextFingerprint = (state: GameState): string =>
  JSON.stringify({
    actor: state.activePlayerId,
    turn: state.turn,
    step: state.turnState.step,
    combat: {
      id: state.combatState.combatId,
      active: state.combatState.active,
      attackers: state.combatState.attackers.map(
        (entry) => entry.attackerInstanceId,
      ),
      blockers: state.combatState.blockers.map(
        (entry) => entry.blockerInstanceId,
      ),
    },
    pendingDecisions: state.pendingDecisions.map((decision) => decision.id),
    pendingAbilities: state.pendingAbilities.map((ability) => ability.id),
    cards: state.cards.map((card) => [
      card.instanceId,
      card.zone,
      card.tapped,
      card.phasedOut ?? false,
      card.controllerId ?? card.controller ?? '',
      card.currentFaceIndex ?? 0,
    ]),
  })

type PendingVoiceSlot = {
  kind: 'INCOMPLETE'
  intent: SemanticIntent
  resumePrefix: string
  contextKey: string
  expiresAt: number
}

type PendingClarification = {
  kind: 'AMBIGUOUS'
  choices: readonly SemanticClarificationChoice[]
  contextKey: string
  expiresAt: number
}

type PendingConversation = PendingVoiceSlot | PendingClarification

export type VoiceResumeResult = {
  transcript: string
  match: SemanticMatchResult
}

const commandLabel = (candidate: SemanticCommand): string => {
  const slots = candidate.slots as Record<string, unknown>
  for (const key of ['card', 'attacker', 'defender', 'uiEntity']) {
    const value = slots[key]
    if (typeof value === 'string' && value) return value
  }
  const cards = slots.cards
  return Array.isArray(cards) && cards.length
    ? cards
        .filter((value): value is string => typeof value === 'string')
        .join(' y ')
    : candidate.intent
}

const fallbackChoices = (
  match: Extract<SemanticMatchResult, { status: 'AMBIGUOUS' }>,
): SemanticClarificationChoice[] =>
  match.commands.map((candidate, index) => {
    const label = commandLabel(candidate)
    return {
      id: `${candidate.intent}:${index}`,
      label,
      aliases: [label, candidate.intent],
      command: candidate,
    }
  })

const ordinalIndex = (input: string): number | undefined => {
  const normalized = normalizeCommandText(input)
    .replace(/^(?:el|la|los|las)\s+/, '')
    .trim()
  const words: Record<string, number> = {
    primero: 0,
    primera: 0,
    primer: 0,
    segundo: 1,
    segunda: 1,
    tercero: 2,
    tercera: 2,
    cuarto: 3,
    cuarta: 3,
    quinto: 4,
    quinta: 4,
  }
  if (normalized in words) return words[normalized]
  const numeric = /^(\d+)(?:\s*(?:o|a))?$/.exec(normalized)
  if (!numeric) return undefined
  const value = Number(numeric[1])
  return Number.isSafeInteger(value) && value > 0 ? value - 1 : undefined
}

const clarifiedCommand = (
  candidate: SemanticCommand,
  input: string,
): SemanticCommand => ({
  ...candidate,
  normalizedText: normalizeCommandText(input),
  evidence: [...candidate.evidence, `clarificacion: ${input}`],
})

/**
 * Short-lived semantic conversation state. It can complete one missing slot or
 * refine a previously ambiguous set of fully-formed commands. It never stores
 * hidden card identity and invalidates itself on any relevant GameState change.
 */
export class VoiceConversationSession {
  private pending?: PendingConversation

  constructor(
    private readonly pendingTtlMs = 5_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  clear(): void {
    this.pending = undefined
  }

  rememberIncomplete(
    match: Extract<SemanticMatchResult, { status: 'INCOMPLETE' }>,
    state: GameState,
  ): void {
    this.pending = {
      kind: 'INCOMPLETE',
      intent: match.intent,
      resumePrefix: match.resumePrefix,
      contextKey: contextFingerprint(state),
      expiresAt: this.now() + this.pendingTtlMs,
    }
  }

  rememberAmbiguous(
    match: Extract<SemanticMatchResult, { status: 'AMBIGUOUS' }>,
    state: GameState,
  ): void {
    this.pending = {
      kind: 'AMBIGUOUS',
      choices: match.clarification?.choices ?? fallbackChoices(match),
      contextKey: contextFingerprint(state),
      expiresAt: this.now() + this.pendingTtlMs,
    }
  }

  private validPending(state: GameState): PendingConversation | undefined {
    const pending = this.pending
    if (!pending) return undefined
    if (
      pending.expiresAt < this.now() ||
      pending.contextKey !== contextFingerprint(state)
    ) {
      this.clear()
      return undefined
    }
    return pending
  }

  private resumeAmbiguity(
    input: string,
    pending: PendingClarification,
  ): VoiceResumeResult | undefined {
    const ordinal = ordinalIndex(input)
    if (ordinal !== undefined) {
      const choice = pending.choices[ordinal]
      if (!choice) return undefined
      this.clear()
      return {
        transcript: input,
        match: {
          status: 'MATCHED',
          command: clarifiedCommand(choice.command, input),
        },
      }
    }

    const options = pending.choices.map((choice, index) => ({
      id: choice.id,
      // Keep choices semantically distinct even when two physical instances
      // share the same canonical card name.
      instanceId: `clarification:${index}`,
      canonical: choice.label,
      aliases: choice.aliases,
      aliasEvidence: choice.aliases.map((value) => ({
        value,
        kind: 'PENDING_CHOICE' as const,
        fuzzy: true,
      })),
    }))
    const resolved = resolveVoiceSlot(input, options)
    if (resolved.status === 'MATCHED') {
      const index = Number(resolved.option.instanceId?.split(':').at(-1))
      const choice = pending.choices[index]
      if (!choice) return undefined
      this.clear()
      return {
        transcript: input,
        match: {
          status: 'MATCHED',
          command: clarifiedCommand(choice.command, input),
        },
      }
    }
    if (resolved.status === 'AMBIGUOUS') {
      const indexes = new Set(
        resolved.options.flatMap((option) => {
          const value = Number(option.instanceId?.split(':').at(-1))
          return Number.isSafeInteger(value) ? [value] : []
        }),
      )
      const choices = pending.choices.filter((_choice, index) =>
        indexes.has(index),
      )
      if (choices.length > 1) this.pending = { ...pending, choices }
      return {
        transcript: input,
        match: {
          status: 'AMBIGUOUS',
          normalizedText: normalizeCommandText(input),
          commands: choices.map((choice) => choice.command),
          description: `La aclaración todavía coincide con ${choices.length} opciones.`,
          clarification: {
            kind: 'ENTITY',
            prompt: 'Indica cuál de las opciones quieres usar.',
            choices,
          },
        },
      }
    }
    return undefined
  }

  tryResume(
    input: string,
    state: GameState,
    languagePack: VoiceLanguagePack = DEFAULT_VOICE_LANGUAGE_PACK,
  ): VoiceResumeResult | undefined {
    const pending = this.validPending(state)
    if (!pending) return undefined

    if (pending.kind === 'AMBIGUOUS') {
      const resolved = this.resumeAmbiguity(input, pending)
      if (resolved) return resolved
      if (hasVoiceCommandCandidateAnchor(input, languagePack)) this.clear()
      return undefined
    }

    const transcript = `${pending.resumePrefix} ${input}`.trim()
    const match = matchSemanticVoiceCommand(transcript, state, languagePack)
    if (match.status === 'MATCHED' && match.command.intent === pending.intent) {
      this.clear()
      return { transcript, match }
    }
    if (match.status === 'AMBIGUOUS') {
      const compatible = match.commands.filter(
        (candidate) => candidate.intent === pending.intent,
      )
      if (compatible.length) {
        this.rememberAmbiguous(
          {
            ...match,
            commands: compatible,
            clarification: match.clarification
              ? {
                  ...match.clarification,
                  choices: match.clarification.choices.filter((choice) =>
                    compatible.includes(choice.command),
                  ),
                }
              : undefined,
          },
          state,
        )
        return { transcript, match }
      }
    }

    // Only after the pending intent failed to consume this utterance do we
    // treat an explicit new action as a replacement. This avoids mistaking a
    // card name containing a Magic word (for example "Mana Crypt") for a new
    // command before the slot resolver gets a chance to identify it.
    if (hasVoiceCommandCandidateAnchor(input, languagePack)) this.clear()
    return undefined
  }
}
