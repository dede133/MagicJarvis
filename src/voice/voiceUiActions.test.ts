import { describe, expect, it, vi } from 'vitest'
import type {
  PendingAbility,
  PendingDecision,
} from '../abilities/types/abilityTypes'
import { createInitialGameState } from '../engine/gameEngine'
import type { GameState } from '../types/game'
import { getVoicePhraseHints } from './contextualVocabulary'
import {
  processSpeechToTextResult,
  type VoiceExecutionTarget,
} from './voiceCommandExecution'
import {
  getVoiceUiActions,
  matchVoiceUiAction,
  tryHandleVoiceUiAction,
} from './voiceUiActions'

const pendingDecision = (
  overrides: Partial<PendingDecision> = {},
): PendingDecision => ({
  id: 'decision-1',
  sourceAbilityId: 'ability-1',
  sourceInstanceId: 'source-1',
  type: 'OPTIONAL_EFFECT',
  prompt: '¿Aplicar el efecto?',
  continuation: {
    effectsToExecute: [],
    resumeEffectIndex: 0,
  },
  ...overrides,
})

const stateWithDecision = (decision: PendingDecision): GameState => ({
  ...createInitialGameState([]),
  pendingDecisions: [decision],
})

const targetFor = (
  state: GameState,
  overrides: Partial<VoiceExecutionTarget> = {},
): VoiceExecutionTarget => ({
  ...state,
  dispatchMany: vi.fn(),
  executeTabletopCommand: vi.fn(() => ({
    status: 'error' as const,
    error: { code: 'UNKNOWN_COMMAND', message: 'Not expected.' },
    implicitResolutions: [],
  })),
  undoLastAction: vi.fn(),
  resolvePendingAbility: vi.fn(),
  resolvePendingAbilityPayment: vi.fn(),
  ignorePendingAbility: vi.fn(),
  resolvePendingDecision: vi.fn(),
  ...overrides,
})

describe('contextual voice UI actions', () => {
  it.each(['si', 'sí', 'vale', 'hazlo'])(
    'maps the natural optional-effect reply %s to the visible YES option',
    (phrase) => {
      const state = stateWithDecision(pendingDecision())
      const match = matchVoiceUiAction(phrase, state)
      expect(match).toMatchObject({
        status: 'MATCHED',
        action: { selection: 'YES', parsed: 'UI_OPTIONAL_EFFECT' },
      })
    },
  )

  it('does not let a pending choice fuzzily swallow an unrelated game command', () => {
    const state = stateWithDecision(
      pendingDecision({
        type: 'CHOOSE_MODE',
        prompt: 'Choose a mana color.',
        options: [
          { instanceId: 'W', label: 'W' },
          { instanceId: 'U', label: 'U' },
        ],
      }),
    )

    expect(matchVoiceUiAction('ataco con yoshimaru', state)).toEqual({
      status: 'NO_MATCH',
    })
    expect(matchVoiceUiAction('ataco con', state)).toEqual({ status: 'NO_MATCH' })
  })

  it('matches a visible target by label through natural selection wording', () => {
    const decision = pendingDecision({
      type: 'TARGET_SELECTION',
      prompt: 'Elige criatura objetivo.',
      options: [
        { instanceId: 'namor-1', label: 'Namor the Sub-Mariner' },
        { instanceId: 'pippin-1', label: 'Pippin, Guard of the Citadel' },
      ],
    })

    expect(
      matchVoiceUiAction('elijo Namor', stateWithDecision(decision)),
    ).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'namor-1' },
    })
  })

  it('supports ordinal wording for currently visible options', () => {
    const decision = pendingDecision({
      type: 'CHOOSE_MODE',
      prompt: 'Elige un modo.',
      options: [
        { instanceId: 'FOOD', label: 'Crear un Food' },
        { instanceId: 'COUNTER', label: 'Poner un contador' },
        { instanceId: 'SCRY', label: 'Scry 2' },
      ],
    })

    expect(
      matchVoiceUiAction('el segundo', stateWithDecision(decision)),
    ).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'COUNTER' },
    })
  })

  it('exposes Mystic Remora-style pending payment as paga / no pago actions', () => {
    const ability = {
      id: 'remora-upkeep',
      abilityId: 'remora-cumulative-upkeep',
      sourceInstanceId: 'remora-1',
      sourceCardName: 'Mystic Remora',
      createdFromEvent: {} as PendingAbility['createdFromEvent'],
      resolvedEffects: [
        {
          type: 'PAYMENT_BRANCH',
          payer: 'SOURCE_CONTROLLER',
          cost: { type: 'FIXED_MANA', cost: '{1}' },
          ifPaid: [],
          ifNotPaid: [],
          prompt: '¿Pagar el cumulative upkeep de Mystic Remora?',
        },
      ],
      automation: 'MANUAL',
    } as PendingAbility
    const state = {
      ...createInitialGameState([]),
      pendingAbilities: [ability],
    }

    expect(matchVoiceUiAction('paga', state)).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'PAID', entity: 'Mystic Remora' },
    })
    expect(matchVoiceUiAction('no lo pago', state)).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'NOT_PAID', entity: 'Mystic Remora' },
    })
  })

  it('executes the real pending decision resolver instead of the generic parser', () => {
    const state = stateWithDecision(pendingDecision())
    const resolvePendingDecision = vi.fn()
    const target = targetFor(state, { resolvePendingDecision })

    const result = tryHandleVoiceUiAction('si', target)

    expect(result).toMatchObject({ status: 'HANDLED', executed: true })
    expect(resolvePendingDecision).toHaveBeenCalledWith('decision-1', 'YES')
    expect(target.executeTabletopCommand).not.toHaveBeenCalled()
  })

  it('runs contextual UI handling before Command Gate and NLP', async () => {
    const state = stateWithDecision(pendingDecision())
    const resolvePendingDecision = vi.fn()
    const target = targetFor(state, { resolvePendingDecision })

    const result = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'fake',
        transcript: 'no',
        confidence: 0.95,
      },
      target,
      { commandGateEnabled: true, nlpIntentAssistedEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { parsed: 'UI_OPTIONAL_EFFECT', successful: true },
    })
    expect(resolvePendingDecision).toHaveBeenCalledWith('decision-1', 'NO')
  })

  it('refuses to guess when the same natural reply matches multiple visible choices', () => {
    const state = {
      ...createInitialGameState([]),
      pendingDecisions: [
        pendingDecision({ id: 'decision-1' }),
        pendingDecision({ id: 'decision-2' }),
      ],
    }
    const resolvePendingDecision = vi.fn()
    const target = targetFor(state, { resolvePendingDecision })

    const result = tryHandleVoiceUiAction('si', target)

    expect(result).toMatchObject({ status: 'AMBIGUOUS' })
    expect(resolvePendingDecision).not.toHaveBeenCalled()
  })

  it('boosts labels and natural aliases from the exact currently visible UI', () => {
    const decision = pendingDecision({
      type: 'CHOOSE_MODE',
      prompt: 'Elige un modo.',
      options: [
        { instanceId: 'FOOD', label: 'Crear un Food' },
        { instanceId: 'SCRY', label: 'Scry 2' },
      ],
    })
    const state = stateWithDecision(decision)
    const hints = getVoicePhraseHints(state)

    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phrase: 'crear 1 food', boost: 8 }),
        expect.objectContaining({ phrase: '1 food', boost: 8 }),
        expect.objectContaining({ phrase: 'scry 2', boost: 8 }),
      ]),
    )
  })

  it('routes natural cost verbs to the visible pending cost instead of a generic game command', () => {
    const cases: Array<[PendingDecision['type'], string, string]> = [
      ['CLEANUP_DISCARD_SELECTION', 'descarto Counterspell', 'counterspell-1'],
      ['CAST_COST_CARD_SELECTION', 'exilio Force of Will', 'force-1'],
      [
        'ACTIVATION_COST_PERMANENT_SELECTION',
        'sacrifico Silvergill Adept',
        'adept-1',
      ],
      ['ACTIVATION_WATERBEND_SELECTION', 'giro Sol Ring', 'ring-1'],
    ]

    for (const [type, phrase, selection] of cases) {
      const decision = pendingDecision({
        type,
        prompt: 'Paga el coste.',
        options: [
          { instanceId: selection, label: phrase.replace(/^[^ ]+\s+/, '') },
        ],
      })
      expect(
        matchVoiceUiAction(phrase, stateWithDecision(decision)),
      ).toMatchObject({
        status: 'MATCHED',
        action: { selection },
      })
    }
  })

  it('applies discourse macros to contextual costs, values and mana choices', () => {
    const variable = pendingDecision({
      type: 'ACTIVATION_VARIABLE_SELECTION',
      prompt: 'Elige X.',
      options: [0, 1, 2, 3].map((value) => ({
        instanceId: String(value),
        label: `X = ${value}`,
      })),
    })
    expect(
      matchVoiceUiAction('pues x tres', stateWithDecision(variable)),
    ).toMatchObject({
      status: 'MATCHED',
      action: { selection: '3' },
    })

    const waterbendCount = pendingDecision({
      type: 'ACTIVATION_WATERBEND_COUNT',
      prompt: '¿Cuántos permanentes quieres girar?',
      options: [0, 1, 2, 3].map((value) => ({
        instanceId: String(value),
        label: String(value),
      })),
    })
    expect(
      matchVoiceUiAction(
        'y ahora giro dos permanentes',
        stateWithDecision(waterbendCount),
      ),
    ).toMatchObject({ status: 'MATCHED', action: { selection: '2' } })

    const color = pendingDecision({
      type: 'CHOOSE_MODE',
      prompt: 'Elige un color.',
      options: [
        { instanceId: 'U', label: 'U' },
        { instanceId: 'R', label: 'R' },
      ],
    })
    expect(
      matchVoiceUiAction('bueno pues mana azul', stateWithDecision(color)),
    ).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'U' },
    })
  })

  it('fuzzily resolves only a unique visible cost option and keeps close choices ambiguous', () => {
    const cost = pendingDecision({
      type: 'ACTIVATION_COST_PERMANENT_SELECTION',
      prompt: 'Sacrifica un permanente.',
      options: [{ instanceId: 'blade-1', label: 'Blackblade Reforged' }],
    })
    expect(
      matchVoiceUiAction(
        'pues sacrifico blackblade reforget',
        stateWithDecision(cost),
      ),
    ).toMatchObject({ status: 'MATCHED', action: { selection: 'blade-1' } })

    const ambiguous = pendingDecision({
      type: 'TARGET_SELECTION',
      prompt: 'Elige un objetivo.',
      options: [
        { instanceId: 'waterskin-1', label: "Bender's Waterskin" },
        { instanceId: 'restoration-1', label: "Waterbender's Restoration" },
      ],
    })
    expect(
      matchVoiceUiAction('elijo bender', stateWithDecision(ambiguous)),
    ).toMatchObject({
      status: 'AMBIGUOUS',
    })
  })

  it('routes Delve-style graveyard contribution wording to the already-programmed cast contribution', () => {
    const decision = pendingDecision({
      type: 'CAST_GENERIC_CONTRIBUTION_SELECTION',
      prompt: 'Elige una carta del cementerio para exiliar.',
      options: [{ instanceId: 'grave-1', label: 'Counterspell' }],
      continuation: {
        effectsToExecute: [],
        resumeEffectIndex: 0,
        castContribution: {
          cardName: 'Example Spell',
          castAction: {
            type: 'CAST_SPELL',
            instanceId: 'spell-1',
            card: {
              scryfallId: 'example-spell',
              name: 'Example Spell',
              cmc: 1,
              typeLine: 'Instant',
              colors: [],
              colorIdentity: [],
            },
            fromZone: 'hand',
          },
          cost: { generic: 1, colors: {} },
          contributionType: 'EXILE_CARDS_FROM_GRAVEYARD',
          candidateIds: ['grave-1'],
        },
      },
    })

    expect(
      matchVoiceUiAction('delve Counterspell', stateWithDecision(decision)),
    ).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'grave-1' },
    })
  })

  it('treats spoken numbers as numeric values, not ordinal option indexes', () => {
    const decision = pendingDecision({
      type: 'ACTIVATION_VARIABLE_SELECTION',
      prompt: 'Elige X.',
      options: [0, 1, 2, 3, 4].map((value) => ({
        instanceId: String(value),
        label: `X = ${value}`,
      })),
    })

    expect(matchVoiceUiAction('3', stateWithDecision(decision))).toMatchObject({
      status: 'MATCHED',
      action: { selection: '3' },
    })
    expect(
      matchVoiceUiAction('el tercero', stateWithDecision(decision)),
    ).toMatchObject({
      status: 'MATCHED',
      action: { selection: '2' },
    })
  })

  it('understands mana color names exposed as W/U/B/R/G/C choices', () => {
    const decision = pendingDecision({
      type: 'CHOOSE_MODE',
      prompt: 'Elige un color de maná.',
      options: [
        { instanceId: 'W', label: 'W' },
        { instanceId: 'U', label: 'U' },
        { instanceId: 'B', label: 'B' },
        { instanceId: 'R', label: 'R' },
        { instanceId: 'G', label: 'G' },
      ],
    })

    expect(
      matchVoiceUiAction('azul', stateWithDecision(decision)),
    ).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'U' },
    })
  })

  it('accepts a local free-text value only while exactly one supported text decision is pending', () => {
    const decision = pendingDecision({
      type: 'CHOOSE_VALUE',
      prompt: 'Elige un tipo de criatura.',
      acceptsTextValue: true,
      textValueLabel: 'Creature type',
      options: [],
    })
    const state = stateWithDecision(decision)

    expect(matchVoiceUiAction('Merfolk', state)).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'merfolk', parsed: 'UI_CHOOSE_VALUE_TEXT' },
    })
    expect(matchVoiceUiAction('declaro Merfolk', state)).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'merfolk' },
    })
    expect(
      matchVoiceUiAction('bueno pues declaro Merfolk', state),
    ).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'merfolk' },
    })
  })

  it('keeps explicit hidden casting-cost declarations inside the pending cost resolver', () => {
    const decision = pendingDecision({
      type: 'CAST_COST_CARD_SELECTION',
      prompt: 'Declara una carta de tu mano para exiliar como coste.',
      acceptsTextValue: true,
      textValueLabel: 'Card name',
      options: [],
    })

    expect(
      matchVoiceUiAction('exilio Force of Will', stateWithDecision(decision)),
    ).toMatchObject({
      status: 'MATCHED',
      action: {
        selection: 'force of will',
        parsed: 'UI_CAST_COST_CARD_SELECTION_TEXT',
      },
    })
  })

  it('extracts a spoken library-search declaration for an existing hidden-zone decision', () => {
    const decision = pendingDecision({
      type: 'HIDDEN_ZONE_CARD_SELECTION',
      prompt: 'Busca una carta.',
      acceptsTextValue: true,
      textValueLabel: 'Card name',
      options: [],
    })

    expect(
      matchVoiceUiAction('busco Merrow Harbinger', stateWithDecision(decision)),
    ).toMatchObject({
      status: 'MATCHED',
      action: { selection: 'merrow harbinger' },
    })
  })

  it('does not swallow a normal game command as a free-text decision value', () => {
    const decision = pendingDecision({
      type: 'CHOOSE_VALUE',
      prompt: 'Elige un tipo de criatura.',
      acceptsTextValue: true,
      textValueLabel: 'Creature type',
      options: [],
    })

    expect(
      matchVoiceUiAction('giro Sol Ring', stateWithDecision(decision)),
    ).toEqual({
      status: 'NO_MATCH',
    })
    expect(
      matchVoiceUiAction(
        'quiero jugar Arcane Signet',
        stateWithDecision(decision),
      ),
    ).toEqual({ status: 'NO_MATCH' })
  })

  it('does not synthesize voice actions from an arbitrary text input field', () => {
    const decision = pendingDecision({
      type: 'PUBLIC_ZONE_CARD_SELECTION',
      acceptsTextValue: true,
      textValueLabel: 'Card name',
      options: [],
    })

    expect(getVoiceUiActions(stateWithDecision(decision))).toEqual([])
  })
})
