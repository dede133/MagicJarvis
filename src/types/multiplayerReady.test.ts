import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../engine/gameEngine'
import { zoneInformationVisibility } from './zoneVisibility'
import type { CardDefinition, CardInstance } from './card'
import type { PendingDecision } from '../abilities/types/abilityTypes'

const card: CardDefinition = {
  scryfallId: 'demo',
  name: 'Demo Permanent',
  cmc: 0,
  typeLine: 'Creature',
  colors: [],
  colorIdentity: [],
}

describe('multiplayer-ready identity guardrails', () => {
  it('keeps owner and controller independently representable', () => {
    const instance: CardInstance = {
      instanceId: 'demo-1',
      card,
      zone: 'battlefield',
      tapped: false,
      counters: {},
      ownerId: 'player-1',
      controllerId: 'player-2',
    }
    expect(instance.ownerId).not.toBe(instance.controllerId)
  })

  it('provides a stable local player identity without migrating state', () => {
    const state = createInitialGameState()
    expect(state.localPlayerId).toBe('player-1')
    expect(state.playerState?.id).toBe('player-1')
  })

  it('classifies hidden information without storing secret identities', () => {
    expect(zoneInformationVisibility('battlefield')).toBe('PUBLIC')
    expect(zoneInformationVisibility('graveyard')).toBe('PUBLIC')
    expect(zoneInformationVisibility('hand')).toBe('HIDDEN')
    expect(zoneInformationVisibility('library')).toBe('HIDDEN')
  })

  it('serializes the decision player field', () => {
    const decision: PendingDecision = {
      id: 'decision-1',
      sourceAbilityId: 'ability-1',
      sourceInstanceId: 'source-1',
      decisionPlayerId: 'player-2',
      type: 'PAYMENT_CHOICE',
      prompt: 'Pay?',
      continuation: { effectsToExecute: [], resumeEffectIndex: 0 },
    }
    expect(JSON.parse(JSON.stringify(decision)).decisionPlayerId).toBe(
      'player-2',
    )
  })
})
