import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialGameState } from '../engine/gameEngine'
import { parseCommand } from '../commands/parser/parseCommand'
import { resolveCommand } from '../commands/resolver/resolveCommand'
import { useGameStore } from '../store/gameStore'
import type { CardDefinition, CardInstance } from '../types/card'
import type { DeckDefinition } from '../types/deck'
import {
  getVoicePhraseHints,
  normalizeVoiceTranscript,
} from './contextualVocabulary'
import type {
  SpeechToTextListenOptions,
  SpeechToTextProvider,
  SpeechToTextResult,
} from './types/speechToText'
import { VoiceConversationSession } from './v3/VoiceConversationSession'
import {
  processSpeechToTextCommand,
  processSpeechToTextResult,
  selectSemanticRecognitionCandidate,
  selectVoiceRecognitionCandidate,
} from './voiceCommandExecution'

const definition = (
  name: string,
  typeLine = 'Basic Land — Island',
): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(/[^a-z]/g, '-'),
  name,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})

const island = definition('Island')
const counterspell = definition('Counterspell', 'Instant')
const cosi = definition("Cosi's Trickster", 'Creature — Merfolk Wizard')
const solRing = {
  ...definition('Sol Ring', 'Artifact'),
  oracleText: '{T}: Add {C}{C}.',
}
const deck: DeckDefinition = {
  name: 'Voice test',
  commander: {
    quantity: 1,
    name: 'Namor the Sub-Mariner',
    card: definition('Namor the Sub-Mariner', 'Legendary Creature'),
  },
  mainboard: [
    { quantity: 30, name: 'Island', card: island },
    { quantity: 1, name: 'Counterspell', card: counterspell },
    { quantity: 1, name: "Cosi's Trickster", card: cosi },
    { quantity: 1, name: 'Sol Ring', card: solRing },
  ],
}

const instance = (id: string, card: CardDefinition): CardInstance => ({
  instanceId: id,
  card,
  zone: 'battlefield',
  tapped: false,
  counters: {},
})

class FakeSpeechProvider implements SpeechToTextProvider {
  readonly provider = 'fake-speech'
  lastOptions?: SpeechToTextListenOptions
  constructor(private readonly result: SpeechToTextResult) {}
  isAvailable(): boolean {
    return this.result.status !== 'UNAVAILABLE'
  }
  startListening(
    options?: SpeechToTextListenOptions,
  ): Promise<SpeechToTextResult> {
    this.lastOptions = options
    return Promise.resolve(this.result)
  }
  stopListening(): void {}
}

const spoken = (transcript: string): FakeSpeechProvider =>
  new FakeSpeechProvider({
    status: 'SUCCESS',
    provider: 'fake-speech',
    transcript,
    confidence: 0.92,
  })

describe('voice command execution', () => {
  beforeEach(() => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([instance('island-1', island)]),
      deckDefinition: deck,
      hiddenZoneTracking: 'COUNTS_ONLY',
      libraryCount: 10,
      handCount: 2,
    })
  })

  it('ignores ordinary table conversation instead of surfacing UNKNOWN_COMMAND', async () => {
    const result = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'fake-speech',
        transcript: 'me estais en plan aqui',
        confidence: 0.9,
      },
      useGameStore.getState(),
      { commandGateEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        ignored: true,
        gateReason: 'NO_COMMAND_CANDIDATE',
        successful: false,
        routing: {
          source: 'REJECTED',
          v3Result: 'NO_MATCH',
        },
      },
    })
    if (result.status === 'SUCCESS')
      expect(result.entry.result).not.toContain('UNKNOWN_COMMAND')
  })

  it('does not mutate through V3 when the listening generation was cancelled', async () => {
    useGameStore.getState().replaceGame({
      ...useGameStore.getState(),
      hiddenZoneTracking: 'UNTRACKED',
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })

    const allowed = false
    const result = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'fake-speech',
        transcript: 'juego island',
        confidence: 0.9,
      },
      useGameStore.getState(),
      {
        commandGateEnabled: true,
        isExecutionAllowed: () => allowed,
      },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        semanticIntent: 'PLAY_CARD',
        semanticDecision: 'CANCELLED',
        successful: false,
        ignored: true,
      },
    })
  })

  it('completes a split declaration across consecutive finals with session context', async () => {
    useGameStore.getState().replaceGame({
      ...useGameStore.getState(),
      hiddenZoneTracking: 'UNTRACKED',
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })
    const session = new VoiceConversationSession()
    const first = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'fake-speech',
        transcript: 'juego',
        confidence: 0.9,
      },
      useGameStore.getState(),
      { commandGateEnabled: true, conversationSession: session },
    )
    expect(first).toMatchObject({
      status: 'SUCCESS',
      entry: {
        parsed: 'V3_INCOMPLETE',
        semanticIntent: 'PLAY_CARD',
        semanticDecision: 'INCOMPLETE',
        ignored: true,
      },
    })

    const second = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'fake-speech',
        transcript: 'island',
        confidence: 0.9,
      },
      useGameStore.getState(),
      { commandGateEnabled: true, conversationSession: session },
    )
    expect(second).toMatchObject({
      status: 'SUCCESS',
      entry: {
        semanticIntent: 'PLAY_CARD',
        semanticDecision: 'EXECUTED',
        successful: true,
      },
    })
  })

  it('defers richer cast syntax to V2 instead of shadowing it with a V3 context rejection', async () => {
    const result = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'fake-speech',
        transcript: 'lanzo counterspell desde arriba de la biblioteca',
        confidence: 0.9,
      },
      useGameStore.getState(),
      { commandGateEnabled: false },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        parsed: 'CAST_SPELL',
        routing: {
          source: 'V2_FALLBACK',
          family: 'PLAY_CARD',
          fallbackReason: 'STRUCTURED_CAST_DEFERRED',
          legacyParsed: 'CAST_SPELL',
        },
      },
    })
    if (result.status === 'SUCCESS')
      expect(result.entry.parsed).not.toBe('V3_CONTEXT')
  })

  it('accepts a clear command prefixed by continuous-speech continuation wording', async () => {
    const result = await processSpeechToTextCommand(
      spoken('y también voy a bajar isla'),
      useGameStore.getState(),
      { commandGateEnabled: true, nlpIntentAssistedEnabled: false },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        normalizedTranscript: 'bajo isla',
        parsed: 'DECLARE_CARD',
        successful: true,
      },
    })
  })

  it('continues a V3 ambiguity through the shared conversation session', async () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([
        instance('island-1', island),
        instance('island-2', island),
      ]),
      deckDefinition: deck,
    })
    const session = new VoiceConversationSession()

    const first = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'giro isla',
        confidence: 0.94,
      },
      useGameStore.getState(),
      { conversationSession: session },
    )
    expect(first).toMatchObject({
      status: 'SUCCESS',
      entry: {
        parsed: 'V3_AMBIGUOUS',
        semanticDecision: 'AMBIGUOUS',
        semanticAmbiguitySource: 'ENTITY',
      },
    })

    const second = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'la segunda',
        confidence: 0.93,
      },
      useGameStore.getState(),
      { conversationSession: session },
    )
    expect(second).toMatchObject({
      status: 'SUCCESS',
      entry: { semanticIntent: 'TAP_CARD', successful: true },
    })
    expect(
      useGameStore
        .getState()
        .cards.find((candidate) => candidate.instanceId === 'island-2')?.tapped,
    ).toBe(true)
  })

  it('executes the migrated V3 family before NLP/V2 while keeping V2 as comparison data', async () => {
    useGameStore.getState().replaceGame({
      ...useGameStore.getState(),
      hiddenZoneTracking: 'UNTRACKED',
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })
    const result = await processSpeechToTextCommand(
      spoken('bueno pues ahora voy a bajar isla'),
      useGameStore.getState(),
      { commandGateEnabled: true },
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        parsed: 'DECLARE_CARD',
        semanticIntent: 'PLAY_CARD',
        semanticDecision: 'EXECUTED',
        v2Parsed: 'DECLARE_CARD',
        routing: {
          source: 'V3',
          v3Result: 'MATCHED',
          family: 'PLAY_CARD',
        },
        successful: true,
      },
    })
  })

  it('can run V3 in phase-1 shadow without changing V2 execution authority', async () => {
    useGameStore.getState().replaceGame({
      ...useGameStore.getState(),
      hiddenZoneTracking: 'UNTRACKED',
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })
    const result = await processSpeechToTextCommand(
      spoken('voy a bajar isla'),
      useGameStore.getState(),
      {
        semanticVoiceV3ExecutionEnabled: false,
        nlpIntentAssistedEnabled: false,
      },
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        parsed: 'DECLARE_CARD',
        semanticIntent: 'PLAY_CARD',
        semanticDecision: 'SHADOW',
        routing: {
          source: 'V2_FALLBACK',
          v3Result: 'MATCHED',
          family: 'PLAY_CARD',
          fallbackReason: 'V3_SHADOW_ONLY',
        },
        successful: true,
      },
    })
  })

  it('executes a V3 counter semantic command through the existing GameAction engine', async () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([instance('ring-1', solRing)]),
      deckDefinition: deck,
    })
    const result = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'le pongo dos contadores +1/+1 a sol ring',
        confidence: 0.95,
      },
      useGameStore.getState(),
      { commandGateEnabled: true },
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        parsed: 'ADD_COUNTER',
        semanticIntent: 'ADD_COUNTER',
        successful: true,
      },
    })
    expect(useGameStore.getState().cards[0].counters['+1/+1']).toBe(2)
  })

  it('uses GameState semantics to recover a lower ASR alternative', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([instance('ring-1', solRing)]),
      deckDefinition: deck,
    })
    const selected = selectSemanticRecognitionCandidate(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'giro solo rin',
        confidence: 0.96,
        alternatives: [{ transcript: 'giro sol ring', confidence: 0.82 }],
      },
      useGameStore.getState(),
    )
    expect(selected.transcript).toBe('giro sol ring')
    expect(selected.match).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'TAP_CARD', slots: { card: 'Sol Ring' } },
    })
  })

  it('returns semantic ambiguity when N-best hypotheses imply different valid commands', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([
        instance('island-1', island),
        instance('ring-1', solRing),
      ]),
      deckDefinition: deck,
    })
    const selected = selectSemanticRecognitionCandidate(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'giro sol ring',
        confidence: 0.94,
        alternatives: [{ transcript: 'giro island', confidence: 0.91 }],
      },
      useGameStore.getState(),
    )

    expect(selected.match).toMatchObject({
      status: 'AMBIGUOUS',
      ambiguitySource: 'ASR',
      commands: [
        { intent: 'TAP_CARD', slots: { card: 'Sol Ring' } },
        { intent: 'TAP_CARD', slots: { card: 'Island' } },
      ],
    })
    expect(selected.semanticDebug).toEqual(
      expect.arrayContaining([
        expect.stringContaining('N-BEST DEBUG selector=p2.5'),
        expect.stringContaining('ASR #1.1 \"giro sol ring\"'),
        expect.stringContaining('ASR #2.1 \"giro island\"'),
        expect.stringContaining('N-BEST DECISION AMBIGUOUS'),
      ]),
    )
  })

  it('discounts one noisy ASR hypothesis that fans out into several fuzzy entities', () => {
    const commandTower = definition('Command Tower', 'Land')
    const momoFriendly = definition('Momo, Friendly Flier', 'Creature')
    const momoPlayful = definition('Momo, Playful Pet', 'Creature')
    const urdnan = definition('Urdnan, Dromoka Warrior', 'Creature')
    const noisyDeck: DeckDefinition = {
      name: 'N-best noisy fanout',
      commander: { quantity: 1, name: 'Command Tower', card: commandTower },
      mainboard: [
        { quantity: 1, name: 'Momo, Friendly Flier', card: momoFriendly },
        { quantity: 1, name: 'Momo, Playful Pet', card: momoPlayful },
        { quantity: 1, name: 'Urdnan, Dromoka Warrior', card: urdnan },
      ],
    }
    useGameStore.getState().replaceGame({
      ...createInitialGameState([]),
      deckDefinition: noisyDeck,
    })

    const selected = selectSemanticRecognitionCandidate(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'bajo como en tower',
        confidence: 0.928,
        alternatives: [
          { transcript: 'bajo como tower', confidence: 0.891 },
          { transcript: 'bajo como en', confidence: 0.936 },
        ],
      },
      useGameStore.getState(),
    )

    expect(selected.match).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'PLAY_CARD', slots: { card: 'Command Tower' } },
    })
  })

  it('lets a semantically stronger exact hypothesis dominate a weaker fuzzy alternative', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([]),
      deckDefinition: deck,
    })
    const selected = selectSemanticRecognitionCandidate(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'bajo island',
        confidence: 0.91,
        alternatives: [{ transcript: 'bajo remorra', confidence: 0.86 }],
      },
      useGameStore.getState(),
    )

    expect(selected.match).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'PLAY_CARD', slots: { card: 'Island' } },
    })
    if (selected.match.status === 'MATCHED')
      expect(selected.match.command.trace).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'ASR_SELECTION',
            decision: 'DOMINANT',
          }),
        ]),
      )
  })

  it('aggregates support across N-best before allowing a one-off ambiguous alternative to block execution', () => {
    const mysticRemora = definition('Mystic Remora', 'Enchantment')
    const tideshaperMystic = definition('Tideshaper Mystic', 'Creature — Merfolk Wizard')
    const ambiguityDeck: DeckDefinition = {
      ...deck,
      mainboard: [
        ...deck.mainboard,
        { quantity: 1, name: 'Mystic Remora', card: mysticRemora },
        { quantity: 1, name: 'Tideshaper Mystic', card: tideshaperMystic },
      ],
    }
    useGameStore.getState().replaceGame({
      ...createInitialGameState([]),
      deckDefinition: ambiguityDeck,
    })

    const selected = selectSemanticRecognitionCandidate(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'bajo Mystic remora',
        confidence: 0.958,
        alternatives: [
          { transcript: 'bajo mystick remora', confidence: 0.884 },
          { transcript: 'bajo Mystic remorá', confidence: 0.916 },
        ],
      },
      useGameStore.getState(),
    )

    expect(selected.match).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'PLAY_CARD', slots: { card: 'Mystic Remora' } },
    })
    expect(selected.semanticDebug).toEqual(
      expect.arrayContaining([
        expect.stringContaining('N-BEST DEBUG selector=p2.5'),
        expect.stringContaining('N-BEST DECISION DOMINANT'),
      ]),
    )
  })

  it('collapses N-best hypotheses that resolve to the same semantic command', () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([instance('ring-1', solRing)]),
      deckDefinition: deck,
    })
    const selected = selectSemanticRecognitionCandidate(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'giro solrin',
        confidence: 0.93,
        alternatives: [{ transcript: 'giro sol ring', confidence: 0.89 }],
      },
      useGameStore.getState(),
    )

    expect(selected.match).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'TAP_CARD',
        slots: { card: 'Sol Ring', cardInstanceId: 'ring-1' },
      },
    })
  })

  it('sends a fake-provider transcript through the existing command parser', async () => {
    const result = await processSpeechToTextCommand(
      spoken('giro la isla uno'),
      useGameStore.getState(),
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { parsed: 'TAP_CARD', successful: true },
    })
    expect(useGameStore.getState().cards[0].tapped).toBe(true)
  })

  it('matches the battlefield UI by activating a unique mana ability on bare spoken tap', async () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([instance('ring-1', solRing)]),
      deckDefinition: deck,
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })

    const result = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'giro Sol Ring',
        confidence: 0.95,
      },
      useGameStore.getState(),
      { commandGateEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        parsed: 'ACTIVATE_MANA',
        semanticIntent: 'TAP_CARD',
        successful: true,
      },
    })
    expect(useGameStore.getState().cards[0].tapped).toBe(true)
    expect(useGameStore.getState().manaPool.C).toBe(2)
  })

  it('executes a spoken nonbasic mana ability through the real activated-ability engine path', async () => {
    useGameStore.getState().replaceGame({
      ...createInitialGameState([instance('ring-1', solRing)]),
      deckDefinition: deck,
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })

    const result = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'giro Sol Ring para mana',
        confidence: 0.95,
      },
      useGameStore.getState(),
      { commandGateEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { parsed: 'ACTIVATE_MANA', successful: true },
    })
    expect(useGameStore.getState().cards[0].tapped).toBe(true)
    expect(useGameStore.getState().manaPool.C).toBe(2)
  })

  it('refreshes a stale push-to-talk snapshot before semantic matching', async () => {
    const staleSnapshot = useGameStore.getState()
    useGameStore.getState().replaceGame({
      ...createInitialGameState([instance('ring-live', solRing)]),
      deckDefinition: deck,
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })

    const result = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'fake-speech',
        transcript: 'giro sol ring',
        confidence: 0.96,
      },
      staleSnapshot,
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { parsed: 'ACTIVATE_MANA', successful: true },
    })
    expect(useGameStore.getState().cards[0].tapped).toBe(true)
    expect(useGameStore.getState().manaPool.C).toBe(2)
  })

  it('processes an already-final transcript without starting another provider session', async () => {
    const result = await processSpeechToTextResult(
      {
        status: 'SUCCESS',
        provider: 'continuous-fake',
        transcript: 'robo',
        confidence: 0.9,
      },
      useGameStore.getState(),
      { commandGateEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { parsed: 'DRAW', successful: true },
    })
    expect(useGameStore.getState()).toMatchObject({
      libraryCount: 9,
      handCount: 3,
    })
  })

  it('executes a successful voice command through the same game action path', async () => {
    const result = await processSpeechToTextCommand(
      spoken('robo'),
      useGameStore.getState(),
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { parsed: 'DRAW' },
    })
    expect(useGameStore.getState()).toMatchObject({
      libraryCount: 9,
      handCount: 3,
    })
  })

  it('accepts the regression phrase bajar isla from a voice transcript', async () => {
    useGameStore.getState().replaceGame({
      ...useGameStore.getState(),
      hiddenZoneTracking: 'UNTRACKED',
      turnState: {
        phase: 'PRECOMBAT_MAIN',
        step: 'MAIN_1',
        priority: 'WINDOW_OPEN',
      },
    })
    const result = await processSpeechToTextCommand(
      spoken('bajar isla'),
      useGameStore.getState(),
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        parsed: 'DECLARE_CARD',
        entity: 'Island',
        semanticIntent: 'PLAY_CARD',
        successful: true,
      },
    })
    expect(useGameStore.getState().handCount).toBe(2)
    expect(
      useGameStore
        .getState()
        .cards.filter(
          (card) => card.zone === 'battlefield' && card.card.name === 'Island',
        ),
    ).toHaveLength(2)
  })

  it('does not change state for an unknown voice command', async () => {
    const before = useGameStore.getState().life
    const result = await processSpeechToTextCommand(
      spoken('haz magia'),
      useGameStore.getState(),
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { successful: false },
    })
    expect(useGameStore.getState().life).toBe(before)
  })

  it('does not choose an ambiguous voice target', async () => {
    useGameStore.getState().replaceGame({
      ...useGameStore.getState(),
      cards: [instance('island-1', island), instance('island-2', island)],
    })
    const result = await processSpeechToTextCommand(
      spoken('giro isla'),
      useGameStore.getState(),
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        result: expect.stringContaining('AMBIGUOUS_CARD'),
        successful: false,
      },
    })
    expect(useGameStore.getState().cards.every((card) => !card.tapped)).toBe(
      true,
    )
  })

  it('uses the existing undo command from voice', async () => {
    useGameStore.getState().dispatch({ type: 'LOSE_LIFE', amount: 4 })
    await processSpeechToTextCommand(
      spoken('deshaz eso'),
      useGameStore.getState(),
    )
    expect(useGameStore.getState().life).toBe(40)
  })

  it.each(['cancela', 'cancela eso', 'anula', 'revierte eso'])(
    'undoes the last executed action from the strong cancellation phrase %s',
    async (phrase) => {
      useGameStore.getState().dispatch({ type: 'LOSE_LIFE', amount: 4 })
      expect(useGameStore.getState().life).toBe(36)

      const result = await processSpeechToTextCommand(
        spoken(phrase),
        useGameStore.getState(),
      )

      expect(result).toMatchObject({
        status: 'SUCCESS',
        entry: { parsed: 'UNDO', successful: true },
      })
      expect(useGameStore.getState().life).toBe(40)
    },
  )

  it.each(['espera', 'perdon', 'no'])(
    'does not treat the ambiguous correction word %s as undo',
    async (phrase) => {
      useGameStore.getState().dispatch({ type: 'LOSE_LIFE', amount: 4 })

      const result = await processSpeechToTextCommand(
        spoken(phrase),
        useGameStore.getState(),
      )

      expect(result).toMatchObject({
        status: 'SUCCESS',
        entry: { successful: false },
      })
      expect(useGameStore.getState().life).toBe(36)
    },
  )

  it('reports an unavailable provider without changing game state', async () => {
    const result = await processSpeechToTextCommand(
      new FakeSpeechProvider({
        status: 'UNAVAILABLE',
        provider: 'fake-speech',
        error: { code: 'UNAVAILABLE', message: 'Unavailable.' },
      }),
      useGameStore.getState(),
    )
    expect(result).toEqual({ status: 'UNAVAILABLE', message: 'Unavailable.' })
    expect(useGameStore.getState().history).toHaveLength(0)
  })

  it('reports microphone permission denial without parsing', async () => {
    const result = await processSpeechToTextCommand(
      new FakeSpeechProvider({
        status: 'ERROR',
        provider: 'fake-speech',
        error: { code: 'PERMISSION_DENIED', message: 'Denied.' },
      }),
      useGameStore.getState(),
    )
    expect(result).toEqual({ status: 'ERROR', message: 'Denied.' })
  })

  it('reports an empty transcript without executing', async () => {
    const result = await processSpeechToTextCommand(
      new FakeSpeechProvider({
        status: 'ERROR',
        provider: 'fake-speech',
        error: { code: 'EMPTY_TRANSCRIPT', message: 'No transcript.' },
      }),
      useGameStore.getState(),
    )
    expect(result).toEqual({ status: 'ERROR', message: 'No transcript.' })
  })

  it('corrects a clear multiword fuzzy card name from the active deck', () => {
    expect(
      normalizeVoiceTranscript('giro cosis trickster', useGameStore.getState()),
    ).toBe("giro Cosi's Trickster")
  })

  it('does not aggressively replace ordinary words that only resemble a card', () => {
    expect(
      normalizeVoiceTranscript(
        'robo tres islas rapidamente',
        useGameStore.getState(),
      ),
    ).toBe('robo 3 islas rapidamente')
  })

  it('voice and typed text resolve to the same game action', async () => {
    const parsed = parseCommand('pierdo cuatro vidas')
    if (parsed.status !== 'parsed')
      throw new Error('Expected a parsed command.')
    const typed = resolveCommand(useGameStore.getState(), parsed.command)
    if (typed.status !== 'resolved')
      throw new Error('Expected a resolved command.')
    await processSpeechToTextCommand(
      spoken('pierdo cuatro vidas'),
      useGameStore.getState(),
    )
    expect(useGameStore.getState().history[0].action).toEqual(typed.actions[0])
  })

  it('keeps raw transcript, normalized transcript, confidence and parser result in history', async () => {
    const result = await processSpeechToTextCommand(
      spoken('  GIRO la isla uno '),
      useGameStore.getState(),
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        rawTranscript: 'GIRO la isla uno',
        normalizedTranscript: 'giro la isla 1',
        confidence: 0.92,
        parsed: 'TAP_CARD',
      },
    })
  })

  it('passes five alternatives and contextual phrase hints to the provider', async () => {
    const provider = spoken('robo')
    await processSpeechToTextCommand(provider, useGameStore.getState())
    expect(provider.lastOptions?.maxAlternatives).toBe(5)
    expect(provider.lastOptions?.phraseHints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phrase: 'Counterspell', boost: 3 }),
        expect.objectContaining({ phrase: 'Island', boost: 6 }),
        expect.objectContaining({ phrase: 'isla', boost: 6 }),
        expect.objectContaining({ phrase: 'cancela', boost: 1.5 }),
        expect.objectContaining({ phrase: 'deshaz', boost: 1.5 }),
      ]),
    )
  })

  it('prefers a lower-ranked speech hypothesis when the primary is not understood', () => {
    const selected = selectVoiceRecognitionCandidate(
      {
        status: 'SUCCESS',
        provider: 'fake-speech',
        transcript: 'cero la isla uno',
        confidence: 0.9,
        alternatives: [
          { transcript: 'cero la isla uno', confidence: 0.9 },
          { transcript: 'giro la isla uno', confidence: 0.82 },
        ],
      },
      useGameStore.getState(),
    )
    expect(selected).toMatchObject({
      transcript: 'giro la isla uno',
      confidence: 0.82,
    })
  })

  it('keeps the primary speech hypothesis when it already resolves', () => {
    const selected = selectVoiceRecognitionCandidate(
      {
        status: 'SUCCESS',
        provider: 'fake-speech',
        transcript: 'robo',
        confidence: 0.9,
        alternatives: [
          { transcript: 'robo', confidence: 0.9 },
          { transcript: 'pierdo cuatro vidas', confidence: 0.85 },
        ],
      },
      useGameStore.getState(),
    )
    expect(selected.transcript).toBe('robo')
  })

  it('builds contextual hints without reading hidden hand identities', () => {
    const hiddenCard = instance('hidden-1', definition('Secret Hand Card'))
    hiddenCard.zone = 'hand'
    useGameStore.getState().replaceGame({
      ...useGameStore.getState(),
      cards: [...useGameStore.getState().cards, hiddenCard],
    })
    const hints = getVoicePhraseHints(useGameStore.getState())
    expect(hints.some((hint) => hint.phrase === 'Secret Hand Card')).toBe(false)
  })

  it('executes a natural spoken life declaration through the existing parser', async () => {
    const result = await processSpeechToTextCommand(
      spoken('me entran cinco'),
      useGameStore.getState(),
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        normalizedTranscript: 'pierdo 5',
        parsed: 'LOSE_LIFE',
        successful: true,
      },
    })
    expect(useGameStore.getState().life).toBe(35)
  })

  it('normalizes a natural addressed spell declaration before parsing it', async () => {
    const result = await processSpeechToTextCommand(
      spoken('te lanzo Counterspell'),
      useGameStore.getState(),
      { autoExecuteVoiceCommands: false },
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        normalizedTranscript: 'lanzo counterspell',
        parsed: 'CAST_SPELL',
      },
    })
  })

  it('can preview a transcript without auto-executing it', async () => {
    const result = await processSpeechToTextCommand(
      spoken('robo'),
      useGameStore.getState(),
      { autoExecuteVoiceCommands: false },
    )
    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { successful: false },
    })
    expect(useGameStore.getState()).toMatchObject({
      libraryCount: 10,
      handCount: 2,
    })
  })

  it('keeps the command gate disabled by default so the established flow is unchanged', async () => {
    const result = await processSpeechToTextCommand(
      spoken('¿robo?'),
      useGameStore.getState(),
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { parsed: 'DRAW', successful: true },
    })
    expect(useGameStore.getState()).toMatchObject({
      libraryCount: 9,
      handCount: 3,
    })
  })

  it('ignores a clear question when the command gate is enabled', async () => {
    const result = await processSpeechToTextCommand(
      spoken('¿robo?'),
      useGameStore.getState(),
      { commandGateEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        ignored: true,
        gateReason: 'QUESTION',
        parsed: '—',
        successful: false,
      },
    })
    expect(useGameStore.getState()).toMatchObject({
      libraryCount: 10,
      handCount: 2,
    })
  })

  it('does not let N-best replace a gate-ignored primary with an executable alternative', async () => {
    const provider = new FakeSpeechProvider({
      status: 'SUCCESS',
      provider: 'fake-speech',
      transcript: '¿robo?',
      confidence: 0.92,
      alternatives: [
        { transcript: '¿robo?', confidence: 0.92 },
        { transcript: 'robo', confidence: 0.86 },
      ],
    })

    const result = await processSpeechToTextCommand(
      provider,
      useGameStore.getState(),
      { commandGateEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: {
        rawTranscript: '¿robo?',
        ignored: true,
        gateReason: 'QUESTION',
      },
    })
    expect(useGameStore.getState()).toMatchObject({
      libraryCount: 10,
      handCount: 2,
    })
  })

  it('still executes strong undo wording with the command gate enabled', async () => {
    useGameStore.getState().dispatch({ type: 'LOSE_LIFE', amount: 4 })

    const result = await processSpeechToTextCommand(
      spoken('cancela'),
      useGameStore.getState(),
      { commandGateEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { parsed: 'UNDO', successful: true },
    })
    expect(useGameStore.getState().life).toBe(40)
  })

  it('executes multiple clear commands from one final transcript in order', async () => {
    const result = await processSpeechToTextCommand(
      spoken('pierdo uno y gano dos'),
      useGameStore.getState(),
      { multiCommandEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entries: [
        { parsed: 'LOSE_LIFE', successful: true },
        { parsed: 'GAIN_LIFE', successful: true },
      ],
    })
    expect(useGameStore.getState().life).toBe(41)
  })

  it('treats trailing "y paso" as pass turn only inside a multi-command utterance', async () => {
    const result = await processSpeechToTextCommand(
      spoken('pierdo uno y paso'),
      useGameStore.getState(),
      { autoExecuteVoiceCommands: false, multiCommandEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entries: [
        { parsed: 'LOSE_LIFE', normalizedTranscript: 'pierdo 1' },
        { parsed: 'NEXT_TURN', normalizedTranscript: 'paso turno' },
      ],
    })
    expect(useGameStore.getState().life).toBe(40)
  })

  it('keeps standalone "paso" unsupported outside multi-command context', async () => {
    const result = await processSpeechToTextCommand(
      spoken('paso'),
      useGameStore.getState(),
      { multiCommandEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { parsed: '—', successful: false },
    })
  })

  it('cancels the rest of a multi-command utterance after the first execution failure', async () => {
    const result = await processSpeechToTextCommand(
      spoken('giro isla y giro isla y robo'),
      useGameStore.getState(),
      { multiCommandEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entries: [
        { parsed: 'TAP_CARD', successful: true },
        { parsed: 'TAP_CARD', successful: false },
      ],
    })
    expect(useGameStore.getState().libraryCount).toBe(10)
    expect(useGameStore.getState().cards[0].tapped).toBe(true)
  })

  it('accepts a new utterance immediately after a previous sequence failed', async () => {
    const failed = await processSpeechToTextCommand(
      spoken('giro isla y giro isla y robo'),
      useGameStore.getState(),
      { multiCommandEnabled: true },
    )
    expect(failed).toMatchObject({
      status: 'SUCCESS',
      entries: [
        { parsed: 'TAP_CARD', successful: true },
        { parsed: 'TAP_CARD', successful: false },
      ],
    })
    expect(useGameStore.getState().libraryCount).toBe(10)

    const next = await processSpeechToTextCommand(
      spoken('robo'),
      useGameStore.getState(),
      { multiCommandEnabled: true },
    )
    expect(next).toMatchObject({
      status: 'SUCCESS',
      entry: { parsed: 'DRAW', successful: true },
    })
    expect(useGameStore.getState().libraryCount).toBe(9)
  })

  it('does not let N-best collapse a multi-command primary into a single alternative', () => {
    const selected = selectVoiceRecognitionCandidate(
      {
        status: 'SUCCESS',
        provider: 'fake-speech',
        transcript: 'robo y paso',
        confidence: 0.9,
        alternatives: [
          { transcript: 'robo y paso', confidence: 0.9 },
          { transcript: 'robo', confidence: 0.88 },
        ],
      },
      useGameStore.getState(),
      { multiCommandEnabled: true },
    )

    expect(selected.transcript).toBe('robo y paso')
  })

  it('stops a multi-command utterance when the Command Gate rejects a middle segment', async () => {
    const result = await processSpeechToTextCommand(
      spoken('pierdo uno y creo que robo y gano dos'),
      useGameStore.getState(),
      { commandGateEnabled: true, multiCommandEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entries: [
        { parsed: 'LOSE_LIFE', successful: true },
        { ignored: true, gateReason: 'UNCERTAINTY' },
      ],
    })
    expect(useGameStore.getState().life).toBe(39)
    expect(useGameStore.getState().libraryCount).toBe(10)
  })

  it('skips leading conversational clauses and executes a later explicit command', async () => {
    const result = await processSpeechToTextCommand(
      spoken('creo que voy a bajar isla y luego robo'),
      useGameStore.getState(),
      { commandGateEnabled: true, multiCommandEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entries: [
        { ignored: true, gateReason: 'UNCERTAINTY' },
        { parsed: 'DRAW', successful: true },
      ],
    })
    expect(useGameStore.getState().libraryCount).toBe(9)
  })

  it('keeps fail-fast once execution has already started before a doubtful clause', async () => {
    const result = await processSpeechToTextCommand(
      spoken('pierdo uno y creo que robo y gano dos'),
      useGameStore.getState(),
      { commandGateEnabled: true, multiCommandEnabled: true },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entries: [
        { parsed: 'LOSE_LIFE', successful: true },
        { ignored: true, gateReason: 'UNCERTAINTY' },
      ],
    })
    expect(useGameStore.getState().life).toBe(39)
  })

  it('can disable multi-command handling and fall back to the previous single-command flow', async () => {
    const result = await processSpeechToTextCommand(
      spoken('pierdo uno y gano dos'),
      useGameStore.getState(),
      { multiCommandEnabled: false },
    )

    expect(result).toMatchObject({
      status: 'SUCCESS',
      entry: { successful: false },
    })
    expect(useGameStore.getState().life).toBe(40)
  })
})
