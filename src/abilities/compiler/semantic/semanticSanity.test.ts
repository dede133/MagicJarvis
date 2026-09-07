import { describe, expect, it } from 'vitest'
import { passesGeminiSanityGate } from './semanticSanity'
import type { SemanticCoverageCard } from './semanticCoverage'

const sanityCard = (
  name: string,
  text: string,
  kind: 'TRIGGERED' | 'ACTIVATED' = 'TRIGGERED',
): SemanticCoverageCard =>
  ({
    card: { name },
    semanticAnalysis: {
      cardName: name,
      abilities: [
        {
          abilityKind: kind,
          triggerDescription: kind === 'TRIGGERED' ? text : null,
          costs: ['{T}'],
          conditions: [],
          effects: [text],
          targets: [],
          choices: ['may'],
          restrictions: [],
          duration: null,
          referencedObjects: [text],
          requiredCapabilities: [],
          unsupportedOrUnclear: [],
        },
      ],
      unsupportedOrUnclear: [],
    },
  }) as unknown as SemanticCoverageCard

describe('Flash-Lite sanity gate', () => {
  it('allows all three sanity cards only when their semantic concepts are present', () => {
    const cards = [
      sanityCard(
        'Chrome Mox',
        'enters exile nonartifact nonland hand exiled card mana colors',
        'ACTIVATED',
      ),
      sanityCard(
        "Cosi's Trickster",
        'opponent shuffles may put a +1/+1 counter on this creature',
      ),
      sanityCard(
        'Deeproot Pilgrimage',
        'one or more nontoken Merfolk you control become tapped create a 1/1 blue Merfolk token with hexproof',
      ),
    ]
    expect(passesGeminiSanityGate(cards)).toBe(true)
  })

  it('blocks the deck run when a sanity card regresses', () => {
    expect(
      passesGeminiSanityGate([
        sanityCard('Chrome Mox', 'exile', 'ACTIVATED'),
        sanityCard("Cosi's Trickster", 'opponent shuffles may +1/+1 counter'),
        sanityCard('Deeproot Pilgrimage', 'Merfolk become tapped create token'),
      ]),
    ).toBe(false)
  })
})
