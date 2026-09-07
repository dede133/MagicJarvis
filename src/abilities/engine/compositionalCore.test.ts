import { describe, expect, it } from 'vitest'
import { compileOracleText } from '../compiler/deterministic/compileOracleText'

const compile = (oracleText: string) =>
  compileOracleText({
    cardName: 'Fixture',
    typeLine: 'Enchantment',
    oracleText,
  })

describe('compositional runtime DSL', () => {
  it('compiles an end-step subtype untap as a step trigger and FOR_EACH', () => {
    const result = compile(
      'At the beginning of your end step, untap all Merfolk you control.',
    )
    expect(result.abilities[0]).toMatchObject({
      kind: 'TRIGGERED',
      trigger: { type: 'END_STEP_STARTED' },
      conditions: [{ type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' }],
      effects: [{ type: 'FOR_EACH', query: { subtypes: ['Merfolk'] } }],
    })
  })

  it('compiles opponent-cast unless payment without card identity logic', () => {
    const result = compile(
      'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
    )
    expect(result.abilities[0]).toMatchObject({
      trigger: { type: 'SPELL_CAST' },
      conditions: [{ type: 'EVENT_CONTROLLER_IS', value: 'OPPONENT' }],
      effects: [{ type: 'PAYMENT_BRANCH', payer: 'EVENT_PLAYER' }],
    })
  })

  it('adds the noncreature filter when Oracle specifies it', () => {
    const result = compile(
      'Whenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.',
    )
    expect(result.abilities[0]).toMatchObject({
      conditions: [
        { type: 'EVENT_CONTROLLER_IS', value: 'OPPONENT' },
        { type: 'SPELL_IS_CREATURE', value: false },
      ],
    })
  })

  it('expands cumulative upkeep using AGE counters and a compositional payment', () => {
    const result = compile(
      'Cumulative upkeep {1}\nWhenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.',
    )
    expect(result.abilities).toHaveLength(2)
    expect(result.abilities[1]).toMatchObject({
      trigger: { type: 'UPKEEP_STARTED' },
      conditions: [{ type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' }],
      effects: [
        { type: 'ADD_COUNTER', counterType: 'AGE' },
        { type: 'PAYMENT_BRANCH', payer: 'SOURCE_CONTROLLER' },
      ],
    })
  })

  it('maps generic tap draw discard', () => {
    expect(
      compile('{T}: Draw a card, then discard a card.').abilities[0],
    ).toMatchObject({
      kind: 'ACTIVATED',
      costs: [{ type: 'TAP_SOURCE' }],
      effects: [{ type: 'DRAW_CARD' }, { type: 'DISCARD_CARD' }],
    })
  })

  it('maps a generic colored cost reduction', () => {
    expect(
      compile('Blue spells you cast cost {1} less to cast.').abilities[0],
    ).toMatchObject({
      kind: 'STATIC',
      effects: [
        {
          type: 'MODIFY_COST',
          operation: 'REDUCE_GENERIC_COST',
          filter: { colors: ['U'] },
        },
      ],
    })
  })

  it('maps a generic subtype power toughness boost', () => {
    expect(
      compile('Other Merfolk creatures you control get +1/+1.').abilities[0],
    ).toMatchObject({
      kind: 'STATIC',
      effects: [{ filter: { subtype: 'Merfolk', excludeSource: true } }],
    })
  })

  it('maps mass return of known attacking creatures as assisted FOR_EACH', () => {
    expect(
      compile("Return all attacking creatures to their owners' hands.")
        .abilities[0],
    ).toMatchObject({
      kind: 'SPELL_EFFECT',
      effects: [{ type: 'FOR_EACH', query: { attacking: true } }],
    })
  })
})
