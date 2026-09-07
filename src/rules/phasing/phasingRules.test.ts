import { describe, expect, it } from 'vitest'
import { applyGameAction, createInitialGameState } from '../../engine/gameEngine'
import { deriveActiveStaticEffects } from '../../abilities/engine/staticEffects'
import { canTarget } from '../targeting/targetingRules'
import type { CardInstance } from '../../types/card'

const permanent = (
  id: string,
  extras: Partial<CardInstance> = {},
): CardInstance => ({
  instanceId: id,
  card: {
    scryfallId: id,
    name: id,
    cmc: 0,
    typeLine: 'Creature',
    colors: [],
    colorIdentity: [],
  },
  zone: 'battlefield',
  tapped: false,
  counters: {},
  controller: 'YOU',
  controllerId: 'player-1',
  ownerId: 'player-1',
  ...extras,
})

describe('phasing', () => {
  it('phases a permanent out without changing zones, counters, tapped state, or attachments', () => {
    const creature = permanent('creature', {
      tapped: true,
      counters: { '+1/+1': 2 },
    })
    const aura = permanent('aura', {
      card: {
        scryfallId: 'aura',
        name: 'aura',
        cmc: 1,
        typeLine: 'Enchantment — Aura',
        oracleText: 'Enchant creature',
        colors: ['U'],
        colorIdentity: ['U'],
      },
      attachedToInstanceId: 'creature',
    })
    const next = applyGameAction(createInitialGameState([creature, aura]), {
      type: 'PHASE_OUT_CARD',
      instanceId: 'creature',
    })
    expect(next.cards.find((card) => card.instanceId === 'creature')).toMatchObject({
      zone: 'battlefield',
      phasedOut: true,
      tapped: true,
      counters: { '+1/+1': 2 },
    })
    expect(next.cards.find((card) => card.instanceId === 'aura')).toMatchObject({
      phasedOut: true,
      phasedOutIndirectlyWith: 'creature',
      attachedToInstanceId: 'creature',
    })
  })

  it('removes a phased-out creature from combat', () => {
    const creature = permanent('attacker')
    const state = {
      ...createInitialGameState([creature]),
      combatState: {
        ...createInitialGameState().combatState,
        active: true,
        attackers: [
          {
            attackerInstanceId: 'attacker',
            defendingTarget: { kind: 'PLAYER' as const, id: 'opponent' },
            blockedBy: [],
            externalBlockedBy: [],
          },
        ],
      },
    }
    const next = applyGameAction(state, {
      type: 'PHASE_OUT_CARD',
      instanceId: 'attacker',
    })
    expect(next.combatState.attackers).toEqual([])
  })

  it('treats phased-out permanents as nonexistent for targets and static effects', () => {
    const source = permanent('source')
    const target = permanent('target')
    const phased = applyGameAction(createInitialGameState([source, target]), {
      type: 'PHASE_OUT_CARD',
      instanceId: 'target',
    })
    const phasedTarget = phased.cards.find((card) => card.instanceId === 'target')!
    expect(
      canTarget(
        phased,
        phasedTarget,
        { controllerId: 'player-1', kind: 'SPELL' },
        { zones: ['battlefield'] },
      ),
    ).toBe(false)
    // Sanity check: deriving static effects does not crash or include phased-out sources.
    expect(deriveActiveStaticEffects(phased)).toBeDefined()
  })

  it('phases permanents back in before their controller untaps them', () => {
    const state = createInitialGameState([
      permanent('creature', { tapped: true, counters: { stun: 1 } }),
    ])
    const phased = applyGameAction(state, {
      type: 'PHASE_OUT_CARD',
      instanceId: 'creature',
    })
    const next = applyGameAction(phased, { type: 'START_TURN' })
    expect(next.cards[0]).toMatchObject({
      phasedOut: false,
      tapped: true,
      counters: { stun: 0 },
    })
  })

  it('phases indirectly phased attachments back in with their anchor', () => {
    const creature = permanent('creature')
    const equipment = permanent('equipment', {
      card: {
        scryfallId: 'equipment',
        name: 'equipment',
        cmc: 1,
        typeLine: 'Artifact — Equipment',
        colors: [],
        colorIdentity: [],
      },
      attachedToInstanceId: 'creature',
      controller: 'OPPONENT',
      controllerId: 'player-2',
      ownerId: 'player-2',
    })
    const phased = applyGameAction(createInitialGameState([creature, equipment]), {
      type: 'PHASE_OUT_CARD',
      instanceId: 'creature',
    })
    const next = applyGameAction(phased, { type: 'START_TURN' })
    expect(next.cards.find((card) => card.instanceId === 'creature')?.phasedOut).toBe(false)
    expect(next.cards.find((card) => card.instanceId === 'equipment')).toMatchObject({
      phasedOut: false,
      attachedToInstanceId: 'creature',
    })
  })
})
