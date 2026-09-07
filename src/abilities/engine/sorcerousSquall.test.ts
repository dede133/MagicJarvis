import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../engine/gameEngine'
import { getAbilitiesForCard } from '../definitions/abilityRegistry'
import { resolveFreeCastKnownCard } from '../../commands/resolver/resolveCommand'
import { planReplacement } from '../../rules/replacement/replacementCore'
import type { CardDefinition } from '../../types/card'
import type { GameState } from '../../types/game'

const squall: CardDefinition = {
  scryfallId: 'squall',
  name: 'Sorcerous Squall',
  manaCost: '{6}{U}{U}{U}',
  cmc: 9,
  typeLine: 'Sorcery',
  oracleText:
    "Delve\nTarget opponent mills nine cards, then you may cast an instant or sorcery spell from that player's graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead.",
  colors: ['U'],
  colorIdentity: ['U'],
}

const externalInstant: CardDefinition = {
  scryfallId: 'external-instant',
  name: 'External Instant',
  manaCost: '{3}{U}',
  cmc: 4,
  typeLine: 'Instant',
  oracleText: '',
  colors: ['U'],
  colorIdentity: ['U'],
}

describe('Sorcerous Squall runtime', () => {
  it('has an explicit assisted spell definition using the public graveyard bridge', () => {
    const abilities = getAbilitiesForCard(squall)
    expect(abilities).toHaveLength(1)
    expect(abilities[0]).toMatchObject({
      id: 'sorcerous-squall-spell',
      kind: 'SPELL_EFFECT',
      automation: 'ASSISTED',
    })
  })

  it('can free-cast a known opponent graveyard card under the local controller', () => {
    const base = createInitialGameState()
    const state: GameState = {
      ...base,
      cards: [
        ...base.cards,
        {
          instanceId: 'external-instant-instance',
          card: externalInstant,
          zone: 'graveyard',
          tapped: false,
          counters: {},
          ownerId: 'player-2',
          controllerId: 'player-2',
          controller: 'OPPONENT',
          knownBecause: 'MILLED',
        },
      ],
    }
    const result = resolveFreeCastKnownCard(
      state,
      'external-instant-instance',
      {
        fromZone: 'graveyard',
        actorPlayerId: state.localPlayerId,
        exileIfWouldEnterGraveyard: true,
      },
    )
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.actions).toContainEqual(
      expect.objectContaining({
        type: 'CAST_SPELL',
        instanceId: 'external-instant-instance',
        fromZone: 'graveyard',
        actorPlayerId: state.localPlayerId,
        variables: expect.objectContaining({
          FREE_CAST_WITHOUT_MANA_COST: true,
          EXILE_IF_WOULD_ENTER_GRAVEYARD: true,
          X: 0,
        }),
      }),
    )
  })

  it('rewrites the selected spell graveyard move to exile and consumes the one-shot replacement', () => {
    const base = createInitialGameState()
    const state: GameState = {
      ...base,
      cards: [
        ...base.cards,
        {
          instanceId: 'external-instant-instance',
          card: externalInstant,
          zone: 'stack',
          tapped: false,
          counters: {},
          ownerId: 'player-2',
          controllerId: base.localPlayerId,
          controller: 'YOU',
        },
      ],
      replacementEffects: [
        {
          id: 'spell-graveyard-exile:external-instant-instance',
          sourceInstanceId: 'external-instant-instance',
          duration: 'WHILE_SUBJECT_ON_STACK',
          consumeOnApply: true,
          event: {
            type: 'MOVE_CARD',
            toZone: 'graveyard',
            subjectInstanceId: 'external-instant-instance',
          },
          replacement: { type: 'MOVE_CARD', toZone: 'exile' },
        },
      ],
    }
    const plan = planReplacement(state, {
      type: 'MOVE_CARD',
      instanceId: 'external-instant-instance',
      toZone: 'graveyard',
    })
    expect(plan?.replacementActions).toEqual([
      expect.objectContaining({ type: 'MOVE_CARD', toZone: 'exile' }),
      {
        type: 'REMOVE_REPLACEMENT_EFFECT',
        replacementEffectId: 'spell-graveyard-exile:external-instant-instance',
      },
    ])
  })
})
