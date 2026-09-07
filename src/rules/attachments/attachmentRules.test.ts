import { describe, expect, it } from 'vitest'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import type { CardDefinition, CardInstance } from '../../types/card'
import { checkStateBasedActions } from '../stateBasedActions'
import { auraCastTargetConstraints } from './attachmentRules'

const card = (
  name: string,
  typeLine: string,
  oracleText?: string,
): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 0,
  typeLine,
  oracleText,
  colors: [],
  colorIdentity: [],
})
const permanent = (
  instanceId: string,
  definition: CardDefinition,
  attachedToInstanceId?: string,
): CardInstance => ({
  instanceId,
  card: definition,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  controller: 'YOU',
  controllerId: 'player-1',
  ownerId: 'player-1',
  attachedToInstanceId,
})

describe('attachment state-based actions', () => {
  it('puts an unattached Aura into its owner graveyard', () => {
    const aura = permanent(
      'aura',
      card('Test Aura', 'Enchantment — Aura', 'Enchant creature you control'),
    )
    expect(
      checkStateBasedActions(createInitialGameState([aura])).actions,
    ).toMatchObject([
      {
        type: 'APPLY_STATE_BASED_ACTIONS',
        moves: [{ instanceId: 'aura', toZone: 'graveyard' }],
      },
    ])
  })

  it('detaches Equipment when its attached object is no longer a creature', () => {
    const equipment = permanent(
      'equipment',
      card('Test Equipment', 'Artifact — Equipment'),
      'land',
    )
    const land = permanent('land', card('Test Land', 'Land'))
    expect(
      checkStateBasedActions(createInitialGameState([equipment, land])).actions,
    ).toMatchObject([
      { type: 'APPLY_STATE_BASED_ACTIONS', detachInstanceIds: ['equipment'] },
    ])
  })

  it('derives supported Aura cast targets and resolves the Aura already attached', () => {
    const auraDef = card(
      'Moonlit Meditation',
      'Enchantment — Aura',
      'Enchant artifact or creature you control',
    )
    expect(auraCastTargetConstraints(auraDef)).toEqual({
      zones: ['battlefield'],
      cardTypesAnyOf: ['Artifact', 'Creature'],
      controller: 'YOU',
    })
    const target = permanent('target', card('Target', 'Creature — Merfolk'))
    const aura: CardInstance = {
      ...permanent('aura', auraDef),
      zone: 'stack',
      stackObjectId: 'stack-aura',
    }
    const state = {
      ...createInitialGameState([target, aura]),
      stack: [
        {
          stackObjectId: 'stack-aura',
          kind: 'SPELL' as const,
          controller: 'YOU' as const,
          controllerId: 'player-1',
          sourceInstanceId: aura.instanceId,
          spellInstanceId: aura.instanceId,
          targets: [target.instanceId],
          declaredTargets: [
            {
              targetId: target.instanceId,
              constraints: auraCastTargetConstraints(auraDef)!,
            },
          ],
          order: 1,
        },
      ],
    }
    const resolved = applyGameAction(state, {
      type: 'RESOLVE_SPELL',
      instanceId: aura.instanceId,
    })
    expect(
      resolved.cards.find(
        (candidate) => candidate.instanceId === aura.instanceId,
      ),
    ).toMatchObject({
      zone: 'battlefield',
      attachedToInstanceId: target.instanceId,
    })
  })
})
