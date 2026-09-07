import { describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../../../engine/gameEngine'
import type { CardDefinition, CardInstance } from '../../../types/card'
import type { DeckDefinition } from '../../../types/deck'
import { matchSemanticVoiceCommand } from '../matcher/semanticMatcher'
import {
  executeSemanticCommand,
  type SemanticExecutionTarget,
} from './semanticCommandAdapter'

const card = (name: string, typeLine: string): CardDefinition => ({
  scryfallId: name.toLocaleLowerCase().replaceAll(/[^a-z]/g, '-'),
  name,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})

const solRing: CardDefinition = {
  ...card('Sol Ring', 'Artifact'),
  oracleText: '{T}: Add {C}{C}.',
}
const blackblade = card('Blackblade Reforged', 'Legendary Artifact — Equipment')
const remora = card('Mystic Remora', 'Enchantment')
const island = card('Island', 'Basic Land — Island')
const namor = card('Namor the Sub-Mariner', 'Legendary Creature — Mutant Noble')

const deck: DeckDefinition = {
  name: 'V3 activation adapter test',
  commander: { quantity: 1, name: remora.name, card: remora },
  mainboard: [
    { quantity: 2, name: solRing.name, card: solRing },
    { quantity: 2, name: blackblade.name, card: blackblade },
    { quantity: 1, name: namor.name, card: namor },
    { quantity: 4, name: island.name, card: island },
  ],
}

const permanent = (
  instanceId: string,
  definition: CardDefinition,
): CardInstance => ({
  instanceId,
  card: definition,
  zone: 'battlefield',
  tapped: false,
  counters: {},
})

const target = (): SemanticExecutionTarget => ({
  ...createInitialGameState([
    permanent('ring-1', solRing),
    permanent('ring-2', solRing),
    permanent('blade-1', blackblade),
    permanent('blade-2', blackblade),
  ]),
  turnState: {
    phase: 'PRECOMBAT_MAIN',
    step: 'MAIN_1',
    priority: 'WINDOW_OPEN',
  },
  deckDefinition: deck,
  resolvePendingAbility: () => undefined,
  resolvePendingAbilityPayment: () => undefined,
  ignorePendingAbility: () => undefined,
  resolvePendingDecision: () => undefined,
  dispatchMany: () => undefined,
  executeTabletopCommand: () => {
    throw new Error('execute=false must not dispatch')
  },
  undoLastAction: () => undefined,
})

const dryRunPhrase = (phrase: string, state: SemanticExecutionTarget) => {
  const matched = matchSemanticVoiceCommand(phrase, state)
  expect(matched).toMatchObject({ status: 'MATCHED' })
  if (matched.status !== 'MATCHED') throw new Error(`No match for: ${phrase}`)
  return executeSemanticCommand(matched.command, state, { execute: false })
}

describe('Voice V3 activated ability adapter', () => {
  it('preserves mana activation semantics for a just-cast top permanent and lets implicit execution retry it', () => {
    const state = target()
    const stackRing: CardInstance = {
      ...permanent('ring-stack', solRing),
      zone: 'stack',
      controllerId: state.activePlayerId,
      ownerId: state.activePlayerId,
    }
    state.cards = [stackRing]
    state.stackResolutionMode = 'TABLETOP_IMPLICIT'
    state.stack = [
      {
        stackObjectId: 'stack-object-ring',
        kind: 'SPELL',
        controller: 'YOU',
        controllerId: state.activePlayerId,
        sourceInstanceId: stackRing.instanceId,
        spellInstanceId: stackRing.instanceId,
        targets: [],
        order: 1,
      },
    ]
    const executeTabletopCommand = vi.fn(() => ({
      status: 'executed' as const,
      description: 'Sol Ring resolved · Activar habilidad de maná de Sol Ring',
      implicitResolutions: ['Sol Ring'],
    }))
    state.executeTabletopCommand = executeTabletopCommand

    const matched = matchSemanticVoiceCommand('giro sol ring', state)
    expect(matched).toMatchObject({ status: 'MATCHED' })
    if (matched.status !== 'MATCHED') throw new Error('Expected stack-ring match')
    expect(executeSemanticCommand(matched.command, state, { execute: true })).toMatchObject({
      status: 'resolved',
    })
    expect(executeTabletopCommand).toHaveBeenCalledWith({
      type: 'ACTIVATE_MANA',
      cardQuery: 'Sol Ring',
      instanceId: 'ring-stack',
      actorPlayerId: state.activePlayerId,
    })
  })

  it('promotes a bare tap to the same unique mana activation used by the battlefield UI', () => {
    expect(dryRunPhrase('giro sol ring 2', target())).toMatchObject({
      status: 'resolved',
      parsedCommand: {
        type: 'ACTIVATE_MANA',
        cardQuery: 'Sol Ring',
        instanceId: 'ring-2',
      },
    })
  })

  it('promotes a counted tap when every selected permanent has a unique mana activation', () => {
    const state = target()
    state.cards.push(
      permanent('island-1', island),
      permanent('island-2', island),
    )

    expect(dryRunPhrase('giro dos island', state)).toMatchObject({
      status: 'resolved',
      description: 'Activar 2 fuentes de maná',
      parsedCommand: { type: 'TAP_CARD', cardQuery: 'Island', count: 2 },
    })
  })

  it('keeps an ordinary tap when the selected permanent has no unique mana activation', () => {
    const state = target()
    state.cards.push(permanent('namor', namor))
    expect(dryRunPhrase('giro namor', state)).toMatchObject({
      status: 'resolved',
      parsedCommand: {
        type: 'TAP_CARD',
        cardQuery: 'Namor the Sub-Mariner',
      },
    })
  })

  it('preserves the exact mana-source instance selected by the semantic slot', () => {
    expect(dryRunPhrase('giro sol ring 2 para mana', target())).toMatchObject({
      status: 'resolved',
      parsedCommand: {
        type: 'ACTIVATE_MANA',
        cardQuery: 'Sol Ring',
        instanceId: 'ring-2',
      },
    })
  })

  it('executes a V3 pending decision through the real contextual resolver', () => {
    const state = target()
    state.pendingDecisions = [
      {
        id: 'x-choice',
        sourceAbilityId: 'ability-x',
        sourceInstanceId: 'source-x',
        type: 'ACTIVATION_VARIABLE_SELECTION',
        prompt: 'Elige X.',
        options: [0, 1, 2, 3].map((value) => ({
          instanceId: String(value),
          label: `X = ${value}`,
        })),
        continuation: { effectsToExecute: [], resumeEffectIndex: 0 },
      },
    ]
    const resolvePendingDecision = vi.fn()
    state.resolvePendingDecision = resolvePendingDecision

    const matched = matchSemanticVoiceCommand('pues x tres', state)
    expect(matched).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'PENDING_DECISION', slots: { selection: '3' } },
    })
    if (matched.status !== 'MATCHED')
      throw new Error('Expected pending decision match')

    expect(executeSemanticCommand(matched.command, state)).toMatchObject({
      status: 'resolved',
    })
    expect(resolvePendingDecision).toHaveBeenCalledWith('x-choice', '3')
  })

  it('preserves mechanic hint and exact source for activated abilities', () => {
    expect(
      dryRunPhrase('equipo blackblade reforged 2', target()),
    ).toMatchObject({
      status: 'resolved',
      parsedCommand: {
        type: 'ACTIVATE_ABILITY',
        cardQuery: 'Blackblade Reforged',
        instanceId: 'blade-2',
        abilityHint: 'EQUIP',
      },
    })
  })

  it('preserves the exact known instance selected for a zone move', () => {
    expect(
      dryRunPhrase('mando blackblade reforged 2 al cementerio', target()),
    ).toMatchObject({
      status: 'resolved',
      parsedCommand: {
        type: 'MOVE_CARD',
        cardQuery: 'Blackblade Reforged',
        instanceId: 'blade-2',
        destination: 'graveyard',
      },
    })
  })

  it('passes exact own attacker instances into the existing combat resolver', () => {
    const state = target()
    state.cards.push(permanent('namor', namor))
    state.turnState = {
      phase: 'COMBAT',
      step: 'DECLARE_ATTACKERS',
      priority: 'WINDOW_OPEN',
    }
    state.combatState = {
      ...state.combatState,
      active: true,
      combatId: 'combat-v3-adapter',
      attackingPlayerStableId: state.activePlayerId,
    }

    expect(dryRunPhrase('ataco con namor', state)).toMatchObject({
      status: 'resolved',
      parsedCommand: {
        type: 'DECLARE_ATTACKERS',
        attackerQueries: ['Namor the Sub-Mariner'],
        attackerInstanceIds: ['namor'],
      },
    })
  })

  it('marks explicit stack responses so implicit resolution cannot consume the previous stack object first', () => {
    const state = target()
    const executeTabletopCommand = vi.fn(() => ({
      status: 'resolved' as const,
      description: 'ok',
    }))
    state.executeTabletopCommand = executeTabletopCommand

    const matched = matchSemanticVoiceCommand(
      'en respuesta lanzo mystic remora',
      state,
    )
    expect(matched).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'PLAY_CARD', slots: { inResponse: true } },
    })
    if (matched.status !== 'MATCHED') throw new Error('Expected response match')

    expect(executeSemanticCommand(matched.command, state)).toMatchObject({
      status: 'resolved',
    })
    expect(executeTabletopCommand).toHaveBeenCalledWith({
      type: 'CAST_SPELL',
      cardQuery: 'Mystic Remora',
      inResponse: true,
      actorPlayerId: state.activePlayerId,
    })
  })

  it('binds V3 execution to the active voice actor instead of the legacy local player', () => {
    const state = target()
    state.localPlayerId = 'player-1'
    state.activePlayerId = 'player-2'
    state.turnOrder = ['player-1', 'player-2']
    state.players = [
      {
        id: 'player-1',
        isLocal: true,
        life: 40,
        manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
      },
      {
        id: 'player-2',
        life: 40,
        manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
      },
    ]

    expect(dryRunPhrase('gano dos vidas', state)).toMatchObject({
      status: 'resolved',
      parsedCommand: {
        type: 'GAIN_LIFE',
        amount: 2,
        actorPlayerId: 'player-2',
      },
    })
  })

  it('adapts an explicit no-attack declaration through the combat resolver', () => {
    const state = target()
    state.turnState = {
      phase: 'COMBAT',
      step: 'DECLARE_ATTACKERS',
      priority: 'WINDOW_OPEN',
    }
    state.combatState = {
      ...state.combatState,
      active: true,
      combatId: 'combat-no-attack-v3',
      attackingPlayerStableId: state.activePlayerId,
    }

    expect(dryRunPhrase('no ataco', state)).toMatchObject({
      status: 'resolved',
      description: 'Sin atacantes',
      parsedCommand: {
        type: 'DECLARE_ATTACKERS',
        attackerQueries: [],
        none: true,
      },
    })
  })
})
