import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../../engine/gameEngine'
import type { CardDefinition, CardInstance } from '../../../types/card'
import type { DeckDefinition } from '../../../types/deck'
import { CATALAN_VOICE_LANGUAGE_PACK } from '../../languages'
import { DISCOURSE_PREFIXES } from '../grammar/macros'
import { matchSemanticVoiceCommand } from './semanticMatcher'

const card = (name: string, typeLine = 'Creature'): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(/[^a-z]/g, '-'),
  name,
  cmc: 0,
  typeLine,
  colors: [],
  colorIdentity: [],
})

const island = card('Island', 'Basic Land — Island')
const remora = card('Mystic Remora', 'Enchantment')
const solRing = card('Sol Ring', 'Artifact')
const eiganjo = card('Eiganjo, Seat of the Empire', 'Legendary Land')
const blackblade = card('Blackblade Reforged', 'Legendary Artifact — Equipment')
const waterskin = card("Bender's Waterskin", 'Artifact')
const restoration = card("Waterbender's Restoration", 'Sorcery')
const deeprootWaters = card('Deeproot Waters', 'Enchantment')
const arcaneSignet = card('Arcane Signet', 'Artifact')
const commandTower = card('Command Tower', 'Land')
const prairieStream = card('Prairie Stream', 'Land — Plains Island')
const jace = card('Jace, Test Mind', 'Legendary Planeswalker — Jace')
const rivalBear = card('Rival Bear', 'Creature — Bear')
const katara = card(
  "Katara, Water Tribe's Hope",
  'Legendary Creature — Human Warrior Ally',
)
const senu = card(
  'Senu, Keen-Eyed Protector',
  'Legendary Creature — Bird Scout',
)
const resourcefulDefense = card('Resourceful Defense', 'Enchantment')
const deck: DeckDefinition = {
  name: 'V3 grammar test',
  commander: { quantity: 1, name: 'Mystic Remora', card: remora },
  mainboard: [
    { quantity: 20, name: 'Island', card: island },
    { quantity: 1, name: 'Sol Ring', card: solRing },
    { quantity: 1, name: 'Eiganjo, Seat of the Empire', card: eiganjo },
    { quantity: 1, name: 'Blackblade Reforged', card: blackblade },
    { quantity: 1, name: "Bender's Waterskin", card: waterskin },
    { quantity: 1, name: "Waterbender's Restoration", card: restoration },
    { quantity: 1, name: 'Deeproot Waters', card: deeprootWaters },
    { quantity: 1, name: 'Arcane Signet', card: arcaneSignet },
    { quantity: 1, name: 'Command Tower', card: commandTower },
    { quantity: 1, name: 'Prairie Stream', card: prairieStream },
    { quantity: 1, name: "Katara, Water Tribe's Hope", card: katara },
  ],
}

const instance = (
  id: string,
  definition: CardDefinition,
  zone: CardInstance['zone'] = 'battlefield',
  tapped = false,
): CardInstance => ({
  instanceId: id,
  card: definition,
  zone,
  tapped,
  counters: {},
})

const permanent = (
  id: string,
  definition: CardDefinition,
  tapped = false,
): CardInstance => instance(id, definition, 'battlefield', tapped)

const game = (cards: CardInstance[] = []) => ({
  ...createInitialGameState(cards),
  deckDefinition: deck,
})

describe('Voice V3 semantic matcher', () => {
  it('generalizes PLAY_CARD across generated discourse/declaration combinations', () => {
    const discourses = ['', ...DISCOURSE_PREFIXES]
    const declarations = ['', 'voy a', 'quiero']
    const verbs = ['bajar', 'jugar', 'poner']
    for (const discourse of discourses)
      for (const declaration of declarations)
        for (const verb of verbs) {
          const phrase = [discourse, declaration, verb, 'remora']
            .filter(Boolean)
            .join(' ')
          expect(
            matchSemanticVoiceCommand(phrase, game()),
            phrase,
          ).toMatchObject({
            status: 'MATCHED',
            command: {
              intent: 'PLAY_CARD',
              slots: { card: 'Mystic Remora' },
            },
          })
        }
  })

  it("prefers the localized identity of a basic land over another card's matching subtype", () => {
    expect(matchSemanticVoiceCommand('bajo isla', game())).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'PLAY_CARD',
        slots: { card: 'Island' },
      },
    })
  })

  it('reuses deterministic action synonyms instead of maintaining a second voice-only list', () => {
    for (const phrase of ['saco island', 'play island'])
      expect(matchSemanticVoiceCommand(phrase, game()), phrase).toMatchObject({
        status: 'MATCHED',
        command: { intent: 'PLAY_CARD', slots: { card: 'Island' } },
      })
  })

  it('keeps uncertainty and negated declarations non executable', () => {
    expect(
      matchSemanticVoiceCommand(
        'y tambien creo que voy a bajar remora',
        game(),
      ),
    ).toMatchObject({ status: 'UNSAFE', reason: 'UNCERTAINTY' })
    expect(
      matchSemanticVoiceCommand('y ademas no voy a bajar remora', game()),
    ).toMatchObject({ status: 'UNSAFE', reason: 'NEGATED_ACTION' })
  })

  it('resolves a battlefield card slot against current state', () => {
    expect(
      matchSemanticVoiceCommand(
        'pues giro sol ring',
        game([permanent('ring', solRing)]),
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'TAP_CARD',
        slots: { card: 'Sol Ring', cardInstanceId: 'ring' },
      },
    })
  })

  it('does not guess between duplicate battlefield instances', () => {
    expect(
      matchSemanticVoiceCommand(
        'giro isla',
        game([permanent('i1', island), permanent('i2', island)]),
      ),
    ).toMatchObject({ status: 'AMBIGUOUS', ambiguitySource: 'ENTITY' })
    expect(
      matchSemanticVoiceCommand(
        'giro isla 1',
        game([permanent('i1', island), permanent('i2', island)]),
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: { slots: { cardInstanceId: 'i1' } },
    })
  })

  it('extracts number and counter slots structurally', () => {
    expect(
      matchSemanticVoiceCommand(
        'le pongo dos contadores +1/+1 a sol ring',
        game([permanent('ring', solRing)]),
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'ADD_COUNTER',
        slots: {
          amount: 2,
          counter: '+1/+1',
          card: 'Sol Ring',
          cardInstanceId: 'ring',
        },
      },
    })
  })

  it('keeps draw and turn grammar semantically distinct across discourse prefixes', () => {
    for (const phrase of ['pues robo', 'y robo', 'ahora robo'])
      expect(matchSemanticVoiceCommand(phrase, game()), phrase).toMatchObject({
        status: 'MATCHED',
        command: { intent: 'DRAW', slots: { amount: 1 } },
      })

    for (const phrase of [
      'y pasa turno',
      'pues pasa el turno',
      'ahora termino turno',
    ])
      expect(matchSemanticVoiceCommand(phrase, game()), phrase).toMatchObject({
        status: 'MATCHED',
        command: { intent: 'NEXT_TURN' },
      })
  })

  it('resolves ASR-damaged card slots without guessing short partial names', () => {
    const matchedCases = [
      ['voy a jugar Benders waterskin', "Bender's Waterskin"],
      ['juego water skin', "Bender's Waterskin"],
      ['quiero jugar arcanes signet', 'Arcane Signet'],
    ] as const

    for (const [phrase, expectedCard] of matchedCases)
      expect(matchSemanticVoiceCommand(phrase, game()), phrase).toMatchObject({
        status: 'MATCHED',
        command: { intent: 'PLAY_CARD', slots: { card: expectedCard } },
      })

    expect(matchSemanticVoiceCommand('juego bender', game())).toMatchObject({
      status: 'AMBIGUOUS',
    })
    expect(matchSemanticVoiceCommand('juego waters', game())).toMatchObject({
      status: 'AMBIGUOUS',
    })
  })

  it('uses the active player deck for PLAY_CARD vocabulary in a two-player match', () => {
    const commandeer = card('Commandeer', 'Instant')
    const commandersPlate = card("Commander's Plate", 'Artifact — Equipment')
    const legacyDeck: DeckDefinition = {
      name: 'Legacy local deck',
      commander: { quantity: 1, name: 'Commandeer', card: commandeer },
      mainboard: [
        { quantity: 1, name: "Commander's Plate", card: commandersPlate },
      ],
    }
    const activeDeck: DeckDefinition = {
      name: 'Active player deck',
      commander: { quantity: 1, name: 'Command Tower', card: commandTower },
      mainboard: [{ quantity: 1, name: 'Sol Ring', card: solRing }],
    }
    const state = game()
    state.deckDefinition = legacyDeck
    state.deckDefinitionsByPlayer = {
      'player-1': legacyDeck,
      'player-2': activeDeck,
    }
    state.activePlayerId = 'player-2'

    for (const phrase of ['bajo command tower', 'bajo coman tower'])
      expect(matchSemanticVoiceCommand(phrase, state), phrase).toMatchObject({
        status: 'MATCHED',
        command: { intent: 'PLAY_CARD', slots: { card: 'Command Tower' } },
      })

    expect(matchSemanticVoiceCommand('bajo commandeer', state)).toMatchObject({
      status: 'REJECTED_CONTEXT',
      intent: 'PLAY_CARD',
    })
  })

  it('recovers generic multi-token ASR damage against the dynamic catalog', () => {
    for (const phrase of ['bajo coman tower', 'bajo como en tower'])
      expect(matchSemanticVoiceCommand(phrase, game()), phrase).toMatchObject({
        status: 'MATCHED',
        command: { intent: 'PLAY_CARD', slots: { card: 'Command Tower' } },
      })
  })

  it('extracts life, draw and turn commands without card regexes', () => {
    expect(
      matchSemanticVoiceCommand('pues gano tres vidas', game()),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'GAIN_LIFE', slots: { amount: 3 } },
    })
    expect(
      matchSemanticVoiceCommand('ahora robo dos cartas', game()),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'DRAW', slots: { amount: 2 } },
    })
    expect(matchSemanticVoiceCommand('voy a combate', game())).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'ADVANCE_STEP',
        slots: { targetStep: 'BEGIN_COMBAT' },
      },
    })
  })

  it('migrates activated ability families through dynamic source slots', () => {
    const state = game([
      permanent('ring', solRing),
      instance('eiganjo', eiganjo, 'hand'),
      permanent('blackblade', blackblade),
      permanent('katara', katara),
    ])

    expect(
      matchSemanticVoiceCommand('giro sol ring para mana', state),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'ACTIVATE_MANA',
        slots: { card: 'Sol Ring', cardInstanceId: 'ring' },
      },
    })
    expect(matchSemanticVoiceCommand('canalizo eiganjo', state)).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'ACTIVATE_ABILITY',
        slots: {
          card: 'Eiganjo, Seat of the Empire',
          cardInstanceId: 'eiganjo',
          abilityHint: 'CHANNEL',
        },
      },
    })
    expect(
      matchSemanticVoiceCommand('equipo blackblade reforged', state),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'ACTIVATE_ABILITY',
        slots: {
          card: 'Blackblade Reforged',
          cardInstanceId: 'blackblade',
          abilityHint: 'EQUIP',
        },
      },
    })
    expect(matchSemanticVoiceCommand('equipo reforget', state)).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'ACTIVATE_ABILITY',
        slots: {
          card: 'Blackblade Reforged',
          cardInstanceId: 'blackblade',
          abilityHint: 'EQUIP',
        },
      },
    })
    expect(
      matchSemanticVoiceCommand('hago waterbend con katara', state),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'ACTIVATE_ABILITY',
        slots: {
          card: "Katara, Water Tribe's Hope",
          cardInstanceId: 'katara',
          abilityHint: 'WATERBEND',
        },
      },
    })
  })

  it('generalizes generic activation framing without card-name regexes', () => {
    const state = game([permanent('katara', katara)])
    for (const phrase of [
      'activo katara',
      'voy a activar katara',
      'pues uso la habilidad de katara',
      'y tambien quiero activar katara',
    ])
      expect(matchSemanticVoiceCommand(phrase, state), phrase).toMatchObject({
        status: 'MATCHED',
        command: {
          intent: 'ACTIVATE_ABILITY',
          slots: {
            card: "Katara, Water Tribe's Hope",
            cardInstanceId: 'katara',
          },
        },
      })
  })

  it('only exposes mechanic slots from a zone where that ability is active', () => {
    const eiganjoOnBattlefield = game([permanent('eiganjo', eiganjo)])
    expect(
      matchSemanticVoiceCommand('canalizo eiganjo', eiganjoOnBattlefield),
    ).toMatchObject({
      status: 'NO_MATCH',
    })

    const eiganjoInHand = game([instance('eiganjo', eiganjo, 'hand')])
    expect(
      matchSemanticVoiceCommand('canalizo eiganjo', eiganjoInHand),
    ).toMatchObject({
      status: 'MATCHED',
      command: { slots: { abilityHint: 'CHANNEL' } },
    })
  })

  it('keeps mechanic activation ambiguity explicit for duplicate valid sources', () => {
    const state = game([
      permanent('b1', blackblade),
      permanent('b2', blackblade),
    ])
    expect(
      matchSemanticVoiceCommand('equipo blackblade reforged', state),
    ).toMatchObject({
      status: 'AMBIGUOUS',
    })
    expect(
      matchSemanticVoiceCommand('equipo blackblade reforged 2', state),
    ).toMatchObject({
      status: 'MATCHED',
      command: { slots: { cardInstanceId: 'b2', abilityHint: 'EQUIP' } },
    })
  })

  it('keeps uncertainty unsafe for free-text decisions while exact negative choices stay contextual', () => {
    const state = game()
    state.pendingDecisions = [
      {
        id: 'creature-type',
        sourceAbilityId: 'choose-type',
        sourceInstanceId: 'source',
        type: 'CHOOSE_VALUE',
        prompt: 'Elige un tipo de criatura.',
        acceptsTextValue: true,
        textValueLabel: 'Creature type',
        options: [],
        continuation: { effectsToExecute: [], resumeEffectIndex: 0 },
      },
    ]
    expect(matchSemanticVoiceCommand('creo que Merfolk', state)).toMatchObject({
      status: 'UNSAFE',
      reason: 'UNCERTAINTY',
    })
  })

  it('gives an exposed pending decision priority over generic safety/parser logic', () => {
    const state = game()
    state.pendingDecisions = [
      {
        id: 'remora-pay',
        sourceAbilityId: 'remora-upkeep',
        sourceInstanceId: 'remora',
        type: 'OPTIONAL_EFFECT',
        prompt: '¿Pagar el cumulative upkeep?',
        continuation: { effectsToExecute: [], resumeEffectIndex: 0 },
      },
    ]
    expect(matchSemanticVoiceCommand('no', state)).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'PENDING_DECISION',
        trace: expect.arrayContaining([
          expect.objectContaining({ kind: 'PENDING_CONTEXT', uiActionId: expect.any(String) }),
        ]),
      },
    })
  })

  it('migrates known-card zone moves without assuming hidden-zone identities', () => {
    const state = game([
      instance('ring', solRing, 'battlefield'),
      instance('signet', arcaneSignet, 'graveyard'),
    ])

    for (const [phrase, cardName, destination] of [
      ['mando sol ring al cementerio', 'Sol Ring', 'graveyard'],
      ['devuelvo arcane signet a la mano', 'Arcane Signet', 'hand'],
      ['exilio arcane signet', 'Arcane Signet', 'exile'],
      ['sol ring al cementerio', 'Sol Ring', 'graveyard'],
    ] as const)
      expect(matchSemanticVoiceCommand(phrase, state), phrase).toMatchObject({
        status: 'MATCHED',
        command: {
          intent: 'MOVE_ZONE',
          slots: { card: cardName, destination },
        },
      })

    // Deck vocabulary is not possession. An unmaterialized physical card may
    // be playable by declaration, but it is not a known object that V3 can move.
    expect(
      matchSemanticVoiceCommand('exilio benders waterskin', state),
    ).toMatchObject({
      status: 'REJECTED_CONTEXT',
    })

    // V3 owns this family now. A known opponent object must be rejected here
    // instead of falling back to V2, whose generic tabletop MOVE_CARD command
    // intentionally supports public external objects for non-voice workflows.
    const withOpponentPermanent = game([
      { ...instance('opponent-ring', solRing), controller: 'OPPONENT' },
    ])
    expect(
      matchSemanticVoiceCommand(
        'mando sol ring al cementerio',
        withOpponentPermanent,
      ),
    ).toMatchObject({ status: 'REJECTED_CONTEXT' })
  })

  it('migrates local shuffle as a structural state declaration', () => {
    for (const phrase of ['barajo', 'barajo mi biblioteca', 'barajo mi mazo'])
      expect(matchSemanticVoiceCommand(phrase, game()), phrase).toMatchObject({
        status: 'MATCHED',
        command: { intent: 'SHUFFLE_LIBRARY' },
      })
  })

  it('migrates explicit hand/library count synchronization without inferring identities', () => {
    expect(
      matchSemanticVoiceCommand('tengo siete cartas en mano', game()),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'SET_HAND_COUNT', slots: { amount: 7 } },
    })
    expect(
      matchSemanticVoiceCommand('me quedan treinta en biblioteca', game()),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'SET_LIBRARY_COUNT', slots: { amount: 30 } },
    })
  })

  it('resolves own attackers from the current legal combat catalog', () => {
    const state = game([
      permanent('katara', katara),
      permanent('ring', solRing),
    ])
    state.turnState = {
      phase: 'COMBAT',
      step: 'DECLARE_ATTACKERS',
      priority: 'WINDOW_OPEN',
    }
    state.combatState = {
      ...state.combatState,
      active: true,
      combatId: 'combat-v3',
      attackingPlayerStableId: state.activePlayerId,
    }

    for (const phrase of [
      'ataco con katara',
      'te pego con katara',
      'voy con katara',
    ])
      expect(matchSemanticVoiceCommand(phrase, state), phrase).toMatchObject({
        status: 'MATCHED',
        command: {
          intent: 'DECLARE_ATTACKERS',
          slots: {
            cards: ["Katara, Water Tribe's Hope"],
            cardInstanceIds: ['katara'],
          },
        },
      })

    expect(matchSemanticVoiceCommand('ataco con todos', state)).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'DECLARE_ATTACKERS', slots: { all: true } },
    })
  })

  it('resolves dynamic role/type references without card-specific aliases', () => {
    expect(
      matchSemanticVoiceCommand('juego mi comandante', game()),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'PLAY_CARD', slots: { card: 'Mystic Remora' } },
    })
    expect(
      matchSemanticVoiceCommand('juego una tierra legendaria', game()),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'PLAY_CARD',
        slots: { card: 'Eiganjo, Seat of the Empire' },
      },
    })
    expect(matchSemanticVoiceCommand('juego tierra', game())).toMatchObject({
      status: 'AMBIGUOUS',
    })
    expect(
      matchSemanticVoiceCommand('juego encantamiento deeproot waters', game()),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'PLAY_CARD', slots: { card: 'Deeproot Waters' } },
    })

    const state = game()
    state.deckDefinition = {
      name: 'Descriptor fuzzy test',
      commander: { quantity: 1, name: 'Mystic Remora', card: remora },
      mainboard: [
        { quantity: 1, name: 'Resourceful Defense', card: resourcefulDefense },
      ],
    }
    expect(
      matchSemanticVoiceCommand(
        'juego encantamiento resortsful defense',
        state,
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'PLAY_CARD', slots: { card: 'Resourceful Defense' } },
    })
  })

  it('recovers unique short battlefield references and a fuzzy action anchor conservatively', () => {
    const state = game([permanent('senu', senu)])
    // Keep Senu in the deck vocabulary too: fuzzy action recovery must prefer
    // the context-backed TAP interpretation instead of guessing PLAY_CARD.
    state.deckDefinition = {
      ...deck,
      mainboard: [
        ...deck.mainboard,
        { quantity: 1, name: senu.name, card: senu },
      ],
    }
    for (const phrase of [
      'giro senu',
      'giro seno',
      'giro keen eye',
      'hero senu',
    ])
      expect(matchSemanticVoiceCommand(phrase, state), phrase).toMatchObject({
        status: 'MATCHED',
        command: {
          intent: 'TAP_CARD',
          slots: { card: 'Senu, Keen-Eyed Protector', cardInstanceId: 'senu' },
        },
      })

    // Do not combine a damaged verb with a weak damaged slot: at least one side
    // of the declaration must remain high-confidence.
    expect(matchSemanticVoiceCommand('hero seno', state)).not.toMatchObject({
      status: 'MATCHED',
    })
  })

  it('extracts only safe edge command spans from conversation-contaminated finals', () => {
    expect(
      matchSemanticVoiceCommand(
        'paso turno el texto vale pronto para turno aqui tambien vale',
        game(),
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'NEXT_TURN' },
    })
    expect(matchSemanticVoiceCommand('asi paso turno', game())).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'NEXT_TURN' },
    })
    expect(
      matchSemanticVoiceCommand(
        'paz y clan de island ya esta bajo isla',
        game(),
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'PLAY_CARD', slots: { card: 'Island' } },
    })

    expect(
      matchSemanticVoiceCommand('cuando digo paso turno no registra', game()),
    ).toMatchObject({ status: 'UNSAFE', reason: 'QUESTION' })
    expect(
      matchSemanticVoiceCommand(
        'estamos hablando y al final paso turno',
        game(),
      ),
    ).toMatchObject({ status: 'NO_MATCH' })
  })

  it('returns incomplete semantic intents instead of errors for split declarations', () => {
    expect(matchSemanticVoiceCommand('juego', game())).toMatchObject({
      status: 'INCOMPLETE',
      intent: 'PLAY_CARD',
      resumePrefix: 'juego',
    })
    expect(matchSemanticVoiceCommand('girar', game())).toMatchObject({
      status: 'INCOMPLETE',
      intent: 'TAP_CARD',
      resumePrefix: 'girar',
    })
  })

  it('builds battlefield slots for the active player instead of always the local player', () => {
    const state = game([
      {
        ...permanent('p1-senu', senu),
        controllerId: 'player-1',
        ownerId: 'player-1',
      },
      {
        ...permanent('p2-senu', senu),
        controllerId: 'player-2',
        ownerId: 'player-2',
      },
    ])
    state.localPlayerId = 'player-1'
    state.activePlayerId = 'player-2'
    state.turnOrder = ['player-1', 'player-2']

    expect(matchSemanticVoiceCommand('giro senu', state)).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'TAP_CARD',
        slots: { cardInstanceId: 'p2-senu' },
      },
    })
  })

  it('only owns combat-damage resolution when combat is actually at damage', () => {
    const state = game([permanent('katara', katara)])
    state.turnState = {
      phase: 'COMBAT',
      step: 'COMBAT_DAMAGE',
      priority: 'WINDOW_OPEN',
    }
    state.combatState = {
      ...state.combatState,
      active: true,
      combatId: 'combat-damage-v3',
    }
    expect(
      matchSemanticVoiceCommand('resuelvo daño de combate', state),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'RESOLVE_COMBAT_DAMAGE' },
    })

    const main = game([permanent('katara', katara)])
    expect(
      matchSemanticVoiceCommand('resuelvo daño de combate', main),
    ).toMatchObject({
      status: 'NO_MATCH',
    })
  })

  it('migrates defender targeting, no-attack, blockers and no-blocks contextually', () => {
    const attackState = game([
      permanent('katara', katara),
      {
        ...permanent('jace', jace),
        controller: 'OPPONENT' as const,
        controllerId: 'player-2',
        ownerId: 'player-2',
      },
    ])
    attackState.turnState = {
      phase: 'COMBAT',
      step: 'DECLARE_ATTACKERS',
      priority: 'WINDOW_OPEN',
    }
    attackState.combatState = {
      ...attackState.combatState,
      active: true,
      combatId: 'combat-target-v3',
      attackingPlayerStableId: attackState.activePlayerId,
    }

    expect(
      matchSemanticVoiceCommand(
        'ataco a jace test mind con katara',
        attackState,
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'DECLARE_ATTACKERS',
        slots: {
          cards: ["Katara, Water Tribe's Hope"],
          cardInstanceIds: ['katara'],
          defender: 'Jace, Test Mind',
          defenderInstanceId: 'jace',
        },
      },
    })
    expect(matchSemanticVoiceCommand('no ataco', attackState)).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'DECLARE_ATTACKERS', slots: { none: true } },
    })

    const blockState = game([
      permanent('katara', katara),
      {
        ...permanent('bear', rivalBear),
        controller: 'OPPONENT' as const,
        controllerId: 'player-2',
        ownerId: 'player-2',
      },
    ])
    blockState.activePlayerId = 'player-2'
    blockState.turnState = {
      phase: 'COMBAT',
      step: 'DECLARE_BLOCKERS',
      priority: 'WINDOW_OPEN',
    }
    blockState.combatState = {
      ...blockState.combatState,
      active: true,
      combatId: 'combat-block-v3',
      attackingPlayerStableId: 'player-2',
      attackers: [
        {
          attackerInstanceId: 'bear',
          defendingTarget: {
            kind: 'PLAYER',
            id: 'local',
            playerId: 'player-1',
          },
          blockedBy: [],
          externalBlockedBy: [],
        },
      ],
    }

    expect(
      matchSemanticVoiceCommand('bloqueo rival bear con katara', blockState),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'DECLARE_BLOCKERS',
        slots: {
          attacker: 'Rival Bear',
          attackerInstanceId: 'bear',
          cards: ["Katara, Water Tribe's Hope"],
          cardInstanceIds: ['katara'],
        },
      },
    })
    expect(matchSemanticVoiceCommand('sin bloqueos', blockState)).toMatchObject(
      {
        status: 'MATCHED',
        command: { intent: 'DECLARE_BLOCKERS', slots: { none: true } },
      },
    )
    for (const phrase of ['defiendo con katara', 'defiendo con una katara'])
      expect(matchSemanticVoiceCommand(phrase, blockState), phrase).toMatchObject({
        status: 'MATCHED',
        command: {
          intent: 'DECLARE_BLOCKERS',
          slots: {
            cards: ["Katara, Water Tribe's Hope"],
            cardInstanceIds: ['katara'],
          },
        },
      })
  })

  it('offers legal blockers while tabletop flow is still on DECLARE_ATTACKERS after attackers were declared', () => {
    const blocker = {
      ...permanent('katara-projected-blocker', katara),
      controller: 'YOU' as const,
      controllerId: 'player-1',
      ownerId: 'player-1',
    }
    const attacker = {
      ...permanent('bear-projected-attacker', rivalBear),
      controller: 'OPPONENT' as const,
      controllerId: 'player-2',
      ownerId: 'player-2',
    }
    const state = game([blocker, attacker])
    state.localPlayerId = 'player-1'
    state.activePlayerId = 'player-2'
    state.turnState = {
      phase: 'COMBAT',
      step: 'DECLARE_ATTACKERS',
      priority: 'WINDOW_OPEN',
    }
    state.combatState = {
      ...state.combatState,
      active: true,
      combatId: 'combat-projected-blockers',
      attackingPlayerStableId: 'player-2',
      attackersDeclared: true,
      attackers: [
        {
          attackerInstanceId: attacker.instanceId,
          defendingTarget: {
            kind: 'PLAYER',
            id: 'local',
            playerId: 'player-1',
          },
          blockedBy: [],
          externalBlockedBy: [],
        },
      ],
    }

    expect(
      matchSemanticVoiceCommand('defiendo con katara', state),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'DECLARE_BLOCKERS',
        slots: {
          cards: ["Katara, Water Tribe's Hope"],
          cardInstanceIds: [blocker.instanceId],
        },
      },
    })
    expect(matchSemanticVoiceCommand('no bloqueo', state)).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'DECLARE_BLOCKERS', slots: { none: true } },
    })
  })

  it('recognizes a legal attacker from MAIN_1 and leaves combat progression to the engine', () => {
    const state = game([permanent('katara-main', katara)])
    state.turnState = { ...state.turnState, step: 'MAIN_1' }
    state.combatState = { ...state.combatState, active: false }

    expect(matchSemanticVoiceCommand('ataco con katara', state)).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'DECLARE_ATTACKERS',
        slots: { cardInstanceIds: ['katara-main'] },
      },
    })
  })

  it('can identify the active player top just-cast permanent even when legacy card ownership fields disagree', () => {
    const ring = {
      ...instance('stack-ring', solRing, 'stack'),
      // Legacy controller fallback says local player, while the authoritative
      // stack object belongs to the active remote player. MOVE_CARD ownership
      // filtering must not hide this top spell from implicit follow-up matching.
      controller: 'YOU' as const,
    }
    const state = game([ring])
    state.activePlayerId = 'player-2'
    state.stackResolutionMode = 'TABLETOP_IMPLICIT'
    state.stack = [
      {
        stackObjectId: 'stack-object-ring',
        kind: 'SPELL',
        controller: 'OPPONENT',
        controllerId: 'player-2',
        sourceInstanceId: ring.instanceId,
        spellInstanceId: ring.instanceId,
        targets: [],
        order: 1,
      },
    ]

    expect(matchSemanticVoiceCommand('giro sol ring', state)).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'TAP_CARD',
        slots: { card: 'Sol Ring', cardInstanceId: 'stack-ring' },
      },
    })
  })

  it('maps legacy stack controller OPPONENT to an active non-local voice actor', () => {
    const ring = {
      ...instance('stack-ring-legacy-controller', solRing, 'stack'),
      controller: 'OPPONENT' as const,
    }
    const state = game([ring])
    state.localPlayerId = 'player-1'
    state.activePlayerId = 'player-2'
    state.stackResolutionMode = 'TABLETOP_IMPLICIT'
    state.stack = [
      {
        stackObjectId: 'stack-object-ring-legacy-controller',
        kind: 'SPELL',
        controller: 'OPPONENT',
        sourceInstanceId: ring.instanceId,
        spellInstanceId: ring.instanceId,
        targets: [],
        order: 1,
      },
    ]

    expect(matchSemanticVoiceCommand('giro sol ring', state)).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'TAP_CARD',
        slots: { card: 'Sol Ring', cardInstanceId: ring.instanceId },
      },
    })
  })

  it('treats a missing legacy stackResolutionMode as TABLETOP_IMPLICIT for a just-cast permanent', () => {
    const ring = instance('stack-ring-legacy-mode', solRing, 'stack')
    const state = game([ring])
    state.stack = [
      {
        stackObjectId: 'stack-object-ring-legacy-mode',
        kind: 'SPELL',
        controller: 'YOU',
        controllerId: state.activePlayerId,
        sourceInstanceId: ring.instanceId,
        spellInstanceId: ring.instanceId,
        targets: [],
        order: 1,
      },
    ]
    delete (state as unknown as { stackResolutionMode?: unknown }).stackResolutionMode

    expect(matchSemanticVoiceCommand('giro sol ring', state)).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'TAP_CARD',
        slots: { card: 'Sol Ring', cardInstanceId: ring.instanceId },
      },
    })
  })

  it('treats resolver as the same bare top-of-stack command as resuelve', () => {
    const stackState = game([instance('stack-remora-resolver', remora, 'stack')])
    stackState.stack = [
      {
        stackObjectId: 'stack-object-remora-resolver',
        kind: 'SPELL',
        controller: 'YOU',
        controllerId: stackState.localPlayerId,
        sourceInstanceId: 'stack-remora-resolver',
        spellInstanceId: 'stack-remora-resolver',
        targets: [],
        order: 1,
      },
    ]
    expect(matchSemanticVoiceCommand('resolver', stackState)).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'RESOLVE_SPELL' },
    })
  })

  it('migrates stack resolution, explicit responses, undo and concede to V3', () => {
    const stackState = game([instance('stack-remora', remora, 'stack')])
    stackState.stack = [
      {
        stackObjectId: 'stack-object-remora',
        kind: 'SPELL',
        controller: 'YOU',
        controllerId: stackState.localPlayerId,
        sourceInstanceId: 'stack-remora',
        spellInstanceId: 'stack-remora',
        targets: [],
        order: 1,
      },
    ]

    expect(matchSemanticVoiceCommand('resuelve', stackState)).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'RESOLVE_SPELL' },
    })
    expect(
      matchSemanticVoiceCommand('resuelve mystic remora', stackState),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'RESOLVE_SPELL',
        slots: { card: 'Mystic Remora', cardInstanceId: 'stack-remora' },
      },
    })
    expect(
      matchSemanticVoiceCommand('en respuesta lanzo mystic remora', game()),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'PLAY_CARD',
        slots: { card: 'Mystic Remora', inResponse: true },
      },
    })
    expect(matchSemanticVoiceCommand('deshaz eso', game())).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'UNDO' },
    })
    expect(matchSemanticVoiceCommand('me rindo', game())).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'CONCEDE' },
    })
  })
})

describe('Voice V3 Catalan parity', () => {
  it('resolves Catalan card references and basic-land vocabulary through the same slots', () => {
    expect(
      matchSemanticVoiceCommand(
        'giro una illa',
        game([permanent('island-ca', island)]),
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'TAP_CARD',
        slots: { card: 'Island', cardInstanceId: 'island-ca' },
      },
    })

    expect(
      matchSemanticVoiceCommand(
        'jugo Mystic Remora',
        game(),
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'PLAY_CARD', slots: { card: 'Mystic Remora' } },
    })
  })

  it('keeps V3-only counter commands language agnostic', () => {
    const state = game([permanent('ring-ca', solRing)])
    expect(
      matchSemanticVoiceCommand(
        'afegeixo dos comptadors +1/+1 a Sol Ring',
        state,
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'ADD_COUNTER',
        slots: {
          card: 'Sol Ring',
          cardInstanceId: 'ring-ca',
          amount: 2,
          counter: '+1/+1',
        },
      },
    })
    expect(
      matchSemanticVoiceCommand(
        'trec dos comptadors +1/+1 de Sol Ring',
        state,
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'REMOVE_COUNTER',
        slots: {
          card: 'Sol Ring',
          cardInstanceId: 'ring-ca',
          amount: 2,
          counter: '+1/+1',
        },
      },
    })
  })

  it('keeps Catalan negative combat declarations structural', () => {
    const attackState = game([permanent('katara-ca', katara)])
    attackState.turnState = {
      phase: 'COMBAT',
      step: 'DECLARE_ATTACKERS',
      priority: 'WINDOW_OPEN',
    }
    attackState.combatState = {
      ...attackState.combatState,
      active: true,
      combatId: 'combat-ca-negative',
      attackingPlayerStableId: attackState.activePlayerId,
    }
    expect(
      matchSemanticVoiceCommand(
        'no ataco',
        attackState,
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'DECLARE_ATTACKERS', slots: { none: true } },
    })

    const blockState = game([permanent('katara-ca-block', katara)])
    blockState.activePlayerId = 'player-2'
    blockState.turnState = {
      phase: 'COMBAT',
      step: 'DECLARE_BLOCKERS',
      priority: 'WINDOW_OPEN',
    }
    blockState.combatState = {
      ...blockState.combatState,
      active: true,
      combatId: 'combat-ca-no-blocks',
      attackingPlayerStableId: 'player-2',
    }
    expect(
      matchSemanticVoiceCommand(
        'sense bloquejos',
        blockState,
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'DECLARE_BLOCKERS', slots: { none: true } },
    })
  })

  it('generates dynamic token and effective-type references from GameState', () => {
    const token = permanent(
      'token-1',
      card('Soldier Token', 'Creature — Soldier'),
    )
    token.isToken = true
    expect(
      matchSemanticVoiceCommand('giro la ficha', game([token])),
    ).toMatchObject({
      status: 'MATCHED',
      command: { intent: 'TAP_CARD', slots: { cardInstanceId: 'token-1' } },
    })

    const changed = game([permanent('ring-creature', solRing)])
    changed.temporaryCharacteristicEffects = [
      {
        sourceInstanceId: 'effect-source',
        targetInstanceId: 'ring-creature',
        addCardTypes: ['Creature'],
        duration: 'UNTIL_END_OF_TURN',
      },
    ]
    expect(
      matchSemanticVoiceCommand('giro la criatura', changed),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'TAP_CARD',
        slots: { cardInstanceId: 'ring-creature' },
      },
    })
  })

  it('does not semantically promise multi-discard before the engine supports it', () => {
    expect(
      matchSemanticVoiceCommand('descarto dos island', game()),
    ).toMatchObject({
      status: 'REJECTED_CONTEXT',
      intent: 'DISCARD_CARD',
    })
  })

  it('restricts named RESOLVE_SPELL candidates to the actual top spell', () => {
    const bottom = instance('stack-bottom', remora, 'stack')
    const topCard = card('Top Spell', 'Instant')
    const top = instance('stack-top', topCard, 'stack')
    const state = game([bottom, top])
    state.stack = [
      {
        stackObjectId: 'object-bottom',
        kind: 'SPELL',
        controller: 'YOU',
        sourceInstanceId: 'stack-bottom',
        spellInstanceId: 'stack-bottom',
        targets: [],
        order: 1,
      },
      {
        stackObjectId: 'object-top',
        kind: 'SPELL',
        controller: 'YOU',
        sourceInstanceId: 'stack-top',
        spellInstanceId: 'stack-top',
        targets: [],
        order: 2,
      },
    ]

    expect(
      matchSemanticVoiceCommand('resuelve top spell', state),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'RESOLVE_SPELL',
        slots: { cardInstanceId: 'stack-top' },
      },
    })
    expect(
      matchSemanticVoiceCommand('resuelve mystic remora', state),
    ).toMatchObject({
      status: 'REJECTED_CONTEXT',
      intent: 'RESOLVE_SPELL',
    })
  })

  it('keeps stack, response, safety and concession semantics identical in Catalan', () => {
    const stackState = game([instance('stack-remora-ca', remora, 'stack')])
    stackState.stack = [
      {
        stackObjectId: 'stack-object-remora-ca',
        kind: 'SPELL',
        controller: 'YOU',
        controllerId: stackState.localPlayerId,
        sourceInstanceId: 'stack-remora-ca',
        spellInstanceId: 'stack-remora-ca',
        targets: [],
        order: 1,
      },
    ]

    expect(
      matchSemanticVoiceCommand(
        'resol',
        stackState,
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toMatchObject({ status: 'MATCHED', command: { intent: 'RESOLVE_SPELL' } })
    expect(
      matchSemanticVoiceCommand(
        'en resposta llanço Mystic Remora',
        game(),
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'PLAY_CARD',
        slots: { card: 'Mystic Remora', inResponse: true },
      },
    })
    expect(
      matchSemanticVoiceCommand(
        'crec que vaig a jugar Mystic Remora',
        game(),
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toMatchObject({ status: 'UNSAFE', reason: 'UNCERTAINTY' })
    expect(
      matchSemanticVoiceCommand(
        'em rendeixo',
        game(),
        CATALAN_VOICE_LANGUAGE_PACK,
      ),
    ).toMatchObject({ status: 'MATCHED', command: { intent: 'CONCEDE' } })
  })
})

describe('Voice V3 deck-independent semantic robustness', () => {
  it('accepts a completely synthetic deck without voice code or aliases', () => {
    const syntheticCard = card('Aether Observatory', 'Artifact')
    const syntheticDeck: DeckDefinition = {
      name: 'Synthetic zero-code deck',
      commander: { quantity: 1, name: 'Aether Observatory', card: syntheticCard },
      mainboard: [
        { quantity: 1, name: 'Verdant Lantern', card: card('Verdant Lantern', 'Artifact') },
        { quantity: 1, name: 'Obsidian Archive', card: card('Obsidian Archive', 'Enchantment') },
      ],
    }
    const state = {
      ...createInitialGameState([]),
      deckDefinition: syntheticDeck,
    }

    expect(matchSemanticVoiceCommand('bajo aeter observatory', state)).toMatchObject({
      status: 'MATCHED',
      command: {
        intent: 'PLAY_CARD',
        slots: { card: 'Aether Observatory' },
        trace: expect.arrayContaining([
          expect.objectContaining({ kind: 'ENTITY_RESOLUTION' }),
          expect.objectContaining({ kind: 'ACTION_SPEC', specId: 'play-card' }),
        ]),
      },
    })
  })

  it('traces the contextual candidate set when an entity family is recognized but unavailable', () => {
    const state = {
      ...createInitialGameState([]),
      deckDefinition: deck,
    }
    const result = matchSemanticVoiceCommand('giro sol ring', state)
    expect(result).toMatchObject({
      status: 'REJECTED_CONTEXT',
      intent: 'TAP_CARD',
      trace: [
        expect.objectContaining({
          kind: 'CONTEXT_CANDIDATES',
          intent: 'TAP_CARD',
          query: 'sol ring',
          candidateCount: 0,
        }),
      ],
    })
  })

})
