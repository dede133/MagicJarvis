import { describe, expect, it } from 'vitest'
import { deriveCapabilitiesForSemanticAbility } from './deriveCapabilities'

const ability = (
  effects: string[],
  triggerDescription: string | null = null,
) => ({
  abilityKind: 'SPELL_EFFECT' as const,
  triggerDescription,
  costs: [],
  conditions: [],
  effects,
  targets: [],
  choices: [],
  restrictions: [],
  duration: null,
  referencedObjects: [],
  requiredCapabilities: [],
  unsupportedOrUnclear: [],
})

describe('local semantic capability derivation', () => {
  it('classifies counter target spell without confusing it with a counter effect', () => {
    const capabilities = deriveCapabilitiesForSemanticAbility(
      ability(['Counter target spell.']),
    )
    expect(capabilities).toContain('COUNTER_SPELL')
    expect(capabilities).not.toContain('ADD_COUNTER')
  })

  it('detects gain life, scry, and surveil as distinct supported capabilities', () => {
    expect(
      deriveCapabilitiesForSemanticAbility(
        ability(['You gain 2 life and scry 2, then surveil 1.']),
      ),
    ).toEqual(expect.arrayContaining(['GAIN_LIFE', 'SCRY', 'SURVEIL']))
  })

  it('detects Gift as a declaration-time capability', () => {
    expect(
      deriveCapabilitiesForSemanticAbility(
        ability(['Gift a card. If the gift was promised, draw a card.']),
      ),
    ).toContain('GIFT')
  })

  it('detects granted triggered abilities as a supported reusable capability', () => {
    expect(
      deriveCapabilitiesForSemanticAbility(
        ability([
          'Commander creatures you own have "Whenever this creature attacks, it gains double strike until end of turn."',
        ]),
      ),
    ).toContain('GRANT_TRIGGERED_ABILITY')
  })

  it('detects untap effects deterministically', () => {
    expect(
      deriveCapabilitiesForSemanticAbility(
        ability(['Untap all Merfolk you control.']),
      ),
    ).toContain('UNTAP_PERMANENT')
  })
})
