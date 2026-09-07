import { describe, expect, it } from 'vitest'
import {
  getReadyRuntimeDefinitions,
  loadReadyRuntimeDefinitions,
  loadRuntimeCatalogReadyDefinitions,
  readyRuntimeDefinitionCount,
  runtimeCatalogValidation,
  validateRuntimeCatalogMetadata,
} from './runtimeCatalogLoader'
import readyCatalog from './tritones-runtime-ready-definitions.json'
import {
  getAbilitiesForCard,
  getCardRuntimeSupport,
} from '../definitions/abilityRegistry'
import type { CardDefinition } from '../../types/card'

const card = (name: string, oracleText = ''): CardDefinition => ({
  scryfallId: name,
  name,
  cmc: 0,
  typeLine: 'Artifact',
  colors: [],
  colorIdentity: [],
  oracleText,
})

describe('Tritones precompiled runtime catalog', () => {
  it('loads ready definitions through normalized lookup', () => {
    expect(readyRuntimeDefinitionCount).toBeGreaterThanOrEqual(
      loadReadyRuntimeDefinitions(readyCatalog).size,
    )
    expect(getReadyRuntimeDefinitions('merfolk looter')?.[0]?.kind).toBe(
      'ACTIVATED',
    )
  })

  it('wins over deterministic compilation without combining definitions', () => {
    const abilities = getAbilitiesForCard(
      card('Merfolk Looter', '{T}: Draw a card, then discard a card.'),
    )
    expect(abilities).toHaveLength(1)
    expect(abilities[0]?.id).toBe('tritones-merfolk-looter-loot')
  })

  it('keeps a missing READY card on the deterministic fallback', () => {
    expect(getAbilitiesForCard(card('Fallback', '{T}: Add {U}.'))[0]?.id).toBe(
      'compiled-tap-add-mana',
    )
    expect(
      getCardRuntimeSupport(card('Fallback', '{T}: Add {U}.')),
    ).toMatchObject({
      status: 'READY',
      source: 'DETERMINISTIC',
      executable: true,
    })
  })

  it('never executes a deterministic PARTIAL compilation', () => {
    const partial = card(
      'Diagnostic Partial Counter',
      'Counter target spell. Draw a card.',
    )
    expect(getAbilitiesForCard(partial)).toEqual([])
    expect(getCardRuntimeSupport(partial)).toMatchObject({
      status: 'PARTIAL',
      source: 'DETERMINISTIC',
      executable: false,
      abilities: [],
    })
  })

  it('never loads even a valid static sub-ability from a PARTIAL catalog entry', () => {
    const loaded = loadRuntimeCatalogReadyDefinitions({
      cards: {
        PartialLord: {
          status: 'PARTIAL',
          runtimeAbilities: [
            {
              id: 'partial-static',
              sourceCardName: 'PartialLord',
              kind: 'STATIC',
              effects: [
                {
                  type: 'MODIFY_POWER_TOUGHNESS',
                  power: 1,
                  toughness: 1,
                  filter: { controller: 'YOU', cardType: 'Creature' },
                },
              ],
            },
          ],
        },
      },
    })
    expect(loaded.size).toBe(0)
  })

  it('rejects invalid definitions safely', () => {
    expect(
      loadReadyRuntimeDefinitions({
        definitions: { Broken: [{ kind: 'TRIGGERED' }] },
      }).size,
    ).toBe(0)
  })

  it('loads newly promoted READY cards from the strict runtime catalog', () => {
    expect(
      loadRuntimeCatalogReadyDefinitions().get('svyelunofseaandsky'),
    ).toHaveLength(3)
    expect(getReadyRuntimeDefinitions('Svyelun of Sea and Sky')).toHaveLength(3)
    expect(getReadyRuntimeDefinitions('Kopala, Warden of Waves')).toHaveLength(
      2,
    )
    // READY can legitimately mean that generic engine rules are sufficient.
    expect(getReadyRuntimeDefinitions('Island')).toEqual([])
  })

  it('keeps generated status metadata consistent with actual entries', () => {
    expect(runtimeCatalogValidation).toMatchObject({
      valid: true,
      actualStatusSummary: {
        READY: 71,
        PARTIAL: 0,
        MANUAL: 0,
      },
    })
  })

  it('reports stale generated status summaries instead of trusting them', () => {
    const validation = validateRuntimeCatalogMetadata({
      uniqueActiveCards: 1,
      statusSummary: { READY: 0, PARTIAL: 1 },
      cards: { Example: { status: 'READY', runtimeAbilities: [] } },
    })
    expect(validation.valid).toBe(false)
    expect(validation.errors.join(' ')).toContain('statusSummary.READY')
    expect(validation.errors.join(' ')).toContain('statusSummary.PARTIAL')
  })

  it('returns one precompiled source for Remora and Looter', () => {
    const remora = getReadyRuntimeDefinitions('Mystic Remora')
    expect(remora).toHaveLength(2)
    expect(
      remora?.find(
        (ability) => ability.id === 'tritones-mystic-remora-cumulative-upkeep',
      ),
    ).toMatchObject({
      trigger: { type: 'UPKEEP_STARTED' },
      conditions: [{ type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' }],
    })
    expect(getReadyRuntimeDefinitions('Merrow Commerce')?.[0]).toMatchObject({
      trigger: { type: 'END_STEP_STARTED' },
      conditions: [{ type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' }],
    })
    expect(getReadyRuntimeDefinitions('Merfolk Looter')).toHaveLength(1)
  })
})
