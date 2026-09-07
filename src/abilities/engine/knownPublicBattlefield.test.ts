import { describe, expect, it } from 'vitest'
import {
  applyGameAction,
  createInitialGameState,
} from '../../engine/gameEngine'
import type { CardDefinition, CardInstance } from '../../types/card'
import { getReadyRuntimeDefinitions } from '../generated/runtimeCatalogLoader'
import type { SpellEffectDefinition } from '../types/abilityTypes'
import {
  advancePendingResolution,
  createSpellEffectResolution,
} from './abilityEngine'

const definition = (
  name: string,
  typeLine: string,
  colors: CardDefinition['colors'] = ['U'],
): CardDefinition => ({
  scryfallId: name.toLowerCase().replaceAll(' ', '-'),
  name,
  cmc: 2,
  typeLine,
  colors,
  colorIdentity: colors,
})

const instance = (
  instanceId: string,
  card: CardDefinition,
  controllerId = 'player-1',
  ownerId = controllerId,
): CardInstance => ({
  instanceId,
  card,
  zone: 'battlefield',
  tapped: false,
  counters: {},
  ownerId,
  controllerId,
  controller: controllerId === 'player-1' ? 'YOU' : 'OPPONENT',
})

const spell = (name: string): CardInstance => ({
  instanceId: `spell-${name.toLowerCase().replaceAll(' ', '-')}`,
  card: definition(name, 'Instant'),
  zone: 'stack',
  tapped: false,
  counters: {},
  ownerId: 'player-1',
  controllerId: 'player-1',
  controller: 'YOU',
  stackObjectId: `stack-${name.toLowerCase().replaceAll(' ', '-')}`,
})

const spellAbility = (name: string): SpellEffectDefinition => {
  const ability = getReadyRuntimeDefinitions(name)?.find(
    (candidate): candidate is SpellEffectDefinition =>
      candidate.kind === 'SPELL_EFFECT',
  )
  if (!ability) throw new Error(`Missing READY spell ability for ${name}.`)
  return ability
}

const actionsFor = (
  name: string,
  state: ReturnType<typeof createInitialGameState>,
  variables: Record<string, string | number | boolean> = {},
  effects?: SpellEffectDefinition['effects'],
) => {
  const source = state.cards.find(
    (card) => card.instanceId === spell(name).instanceId,
  )
  if (!source) throw new Error(`Missing source ${name}.`)
  const ability = spellAbility(name)
  const resolution = createSpellEffectResolution(
    source,
    effects ? { ...ability, effects } : ability,
    variables,
  )
  const step = advancePendingResolution(state, resolution)
  if (step.type !== 'ACTIONS')
    throw new Error(
      `${name} did not produce deterministic actions: ${step.type}`,
    )
  return step.actions
}

const applyActions = (
  state: ReturnType<typeof createInitialGameState>,
  actions: ReturnType<typeof actionsFor>,
) =>
  actions.reduce((current, action) => applyGameAction(current, action), state)

describe('known public battlefield mass effects', () => {
  it('Aetherize returns every known physical attacker to its owner hand', () => {
    const source = spell('Aetherize')
    let state = createInitialGameState([
      source,
      instance(
        'external-attacker',
        definition('Opponent Attacker', 'Creature — Goblin', ['R']),
        'player-2',
      ),
      instance(
        'local-creature',
        definition('Local Merfolk', 'Creature — Merfolk'),
      ),
    ])
    state = applyGameAction(state, {
      type: 'DECLARE_EXTERNAL_ATTACKER',
      instanceId: 'external-attacker',
    })

    const next = applyActions(state, actionsFor('Aetherize', state))
    expect(
      next.cards.find((card) => card.instanceId === 'external-attacker'),
    ).toMatchObject({
      zone: 'hand',
      ownerId: 'player-2',
      controllerId: 'player-2',
    })
    expect(
      next.cards.find((card) => card.instanceId === 'local-creature')?.zone,
    ).toBe('battlefield')
    expect(next.combatState.attackers).toEqual([])
  })

  it('Cyclonic Rift overload returns every known opposing nonland permanent only', () => {
    const source = spell('Cyclonic Rift')
    const state = createInitialGameState([
      source,
      instance('local-rock', definition('Local Rock', 'Artifact')),
      instance(
        'external-rock',
        definition('Opponent Rock', 'Artifact'),
        'player-2',
      ),
      instance(
        'external-land',
        definition('Opponent Island', 'Basic Land — Island'),
        'player-2',
      ),
    ])

    const next = applyActions(
      state,
      actionsFor('Cyclonic Rift', state, { OVERLOAD: 1 }),
    )
    expect(
      next.cards.find((card) => card.instanceId === 'external-rock'),
    ).toMatchObject({
      zone: 'hand',
      controllerId: 'player-2',
    })
    expect(
      next.cards.find((card) => card.instanceId === 'external-land')?.zone,
    ).toBe('battlefield')
    expect(
      next.cards.find((card) => card.instanceId === 'local-rock')?.zone,
    ).toBe('battlefield')
  })

  it('Inundate uses effective colors and returns known nonblue creatures to owner hands', () => {
    const source = spell('Inundate')
    const state = createInitialGameState([
      source,
      instance('blue', definition('Blue Merfolk', 'Creature — Merfolk', ['U'])),
      instance('red', definition('Red Goblin', 'Creature — Goblin', ['R'])),
      instance(
        'external-green',
        definition('Green Elf', 'Creature — Elf', ['G']),
        'player-2',
      ),
    ])

    const next = applyActions(state, actionsFor('Inundate', state))
    expect(next.cards.find((card) => card.instanceId === 'blue')?.zone).toBe(
      'battlefield',
    )
    expect(next.cards.find((card) => card.instanceId === 'red')).toMatchObject({
      zone: 'hand',
      controllerId: 'player-1',
    })
    expect(
      next.cards.find((card) => card.instanceId === 'external-green'),
    ).toMatchObject({
      zone: 'hand',
      controllerId: 'player-2',
    })
  })

  it('Raise the Palisade keeps the chosen type and bounces every other known creature', () => {
    const source = spell('Raise the Palisade')
    const state = createInitialGameState([
      source,
      instance('merfolk', definition('Merfolk', 'Creature — Merfolk')),
      instance('human', definition('Human', 'Creature — Human', ['W'])),
      instance(
        'external-goblin',
        definition('Goblin', 'Creature — Goblin', ['R']),
        'player-2',
      ),
    ])
    const ability = spellAbility('Raise the Palisade')
    const forEach = ability.effects.find((effect) => effect.type === 'FOR_EACH')
    if (!forEach) throw new Error('Raise the Palisade FOR_EACH is missing.')

    const next = applyActions(
      state,
      actionsFor('Raise the Palisade', state, { chosenType: 'Merfolk' }, [
        forEach,
      ]),
    )
    expect(next.cards.find((card) => card.instanceId === 'merfolk')?.zone).toBe(
      'battlefield',
    )
    expect(next.cards.find((card) => card.instanceId === 'human')?.zone).toBe(
      'hand',
    )
    expect(
      next.cards.find((card) => card.instanceId === 'external-goblin'),
    ).toMatchObject({
      zone: 'hand',
      controllerId: 'player-2',
    })
  })
})
