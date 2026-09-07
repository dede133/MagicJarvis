import { describe, expect, it } from 'vitest'
import { applyGameAction, createInitialGameState } from '../engine/gameEngine'
import { deriveGameEvents } from '../events/deriveGameEvents'
import { useGameStore } from '../store/gameStore'
import type { CardDefinition } from '../types/card'

const card = (name: string, typeLine = 'Instant'): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 2,
  typeLine,
  colors: ['U'],
  colorIdentity: ['U'],
})

const meta = { actionId: 'test', timestamp: 1 }

describe('known external physical objects', () => {
  it('registers a declared opposing permanent without inventing hidden-zone state', () => {
    const state = createInitialGameState()
    const next = applyGameAction(
      state,
      {
        type: 'DECLARE_EXTERNAL_CARD',
        instanceId: 'external-rhystic',
        card: card('Rhystic Study', 'Enchantment'),
        zone: 'battlefield',
        knownBecause: 'DECLARED',
      },
      meta,
    )
    expect(
      next.cards.find((item) => item.instanceId === 'external-rhystic'),
    ).toMatchObject({
      zone: 'battlefield',
      controller: 'OPPONENT',
      controllerId: 'player-2',
      ownerId: 'player-2',
      knownBecause: 'DECLARED',
    })
    expect(next.handCount).toBe(state.handCount)
    expect(next.libraryCount).toBe(state.libraryCount)
  })

  it('uses the normal cast action for a declared opposing spell and derives SPELL_CAST', () => {
    const state = createInitialGameState()
    const action = {
      type: 'CAST_SPELL' as const,
      instanceId: 'external-rift',
      card: card('Cyclonic Rift'),
      fromZone: 'hand' as const,
      actorPlayerId: 'player-2',
      variables: { MANA_SPENT_TO_CAST: 2 },
    }
    const next = applyGameAction(state, action, meta)
    const spell = next.cards.find((item) => item.instanceId === 'external-rift')
    expect(spell).toMatchObject({
      zone: 'stack',
      controller: 'OPPONENT',
      controllerId: 'player-2',
      knownBecause: 'CAST',
    })
    expect(next.stack.at(-1)).toMatchObject({
      kind: 'SPELL',
      spellInstanceId: 'external-rift',
      controllerId: 'player-2',
    })
    expect(deriveGameEvents(state, action, next)).toContainEqual(
      expect.objectContaining({
        type: 'SPELL_CAST',
        cardName: 'Cyclonic Rift',
        playerId: 'player-2',
        controller: 'OPPONENT',
        manaSpent: 2,
      }),
    )
  })

  it('asks for known targets before an external targeted spell enters the stack', () => {
    const base = createInitialGameState()
    const localSpellAction = {
      type: 'CAST_SPELL' as const,
      instanceId: 'local-brainstorm',
      card: card('Brainstorm'),
      fromZone: 'hand' as const,
    }
    const withLocalSpell = applyGameAction(base, localSpellAction, meta)
    useGameStore.getState().replaceGame(withLocalSpell)
    useGameStore.getState().declareExternalSpell({
      ...card('Counterspell'),
      manaCost: '{U}{U}',
      oracleText: 'Counter target spell.',
    }, 2)
    const pending = useGameStore.getState().pendingDecisions[0]
    expect(pending).toMatchObject({
      type: 'EXTERNAL_SPELL_TARGET_SELECTION',
      continuation: {
        externalSpellDeclaration: {
          castAction: { variables: { MANA_SPENT_TO_CAST: 2 } },
        },
      },
    })
    expect(pending.options).toContainEqual(
      expect.objectContaining({
        instanceId: withLocalSpell.stack[0].stackObjectId,
      }),
    )
    expect(
      useGameStore
        .getState()
        .cards.some((item) => item.card.name === 'Counterspell'),
    ).toBe(false)
    useGameStore
      .getState()
      .resolvePendingDecision(pending.id, withLocalSpell.stack[0].stackObjectId)
    expect(useGameStore.getState().stack.at(-1)).toMatchObject({
      controller: 'OPPONENT',
      declaredTargets: [
        expect.objectContaining({
          targetId: withLocalSpell.stack[0].stackObjectId,
        }),
      ],
    })
  })

  it('can mark a declared opposing creature as a physical attacker without modeling the rival turn', () => {
    const declared = applyGameAction(
      createInitialGameState(),
      {
        type: 'DECLARE_EXTERNAL_CARD',
        instanceId: 'external-attacker',
        card: card('River Boa', 'Creature — Snake'),
        zone: 'battlefield',
        knownBecause: 'DECLARED',
      },
      meta,
    )
    const attacking = applyGameAction(
      declared,
      { type: 'DECLARE_EXTERNAL_ATTACKER', instanceId: 'external-attacker' },
      meta,
    )
    expect(attacking.combatState).toMatchObject({
      active: true,
      attackingPlayerId: 'opponent',
      attackingPlayerStableId: 'player-2',
      attackers: [
        expect.objectContaining({
          attackerInstanceId: 'external-attacker',
          defendingTarget: expect.objectContaining({ playerId: 'player-1' }),
        }),
      ],
    })
    expect(
      attacking.cards.find((item) => item.instanceId === 'external-attacker')
        ?.tapped,
    ).toBe(true)

    const bounced = applyGameAction(
      attacking,
      {
        type: 'MOVE_CARD',
        instanceId: 'external-attacker',
        toZone: 'hand',
        controllerId: 'player-2',
      },
      meta,
    )
    expect(bounced.combatState.attackers).toEqual([])
    expect(
      bounced.cards.find((item) => item.instanceId === 'external-attacker'),
    ).toMatchObject({
      zone: 'hand',
      ownerId: 'player-2',
      controllerId: 'player-2',
    })
  })
})
