import { describe, expect, it } from 'vitest'
import { resolveVoiceSlot } from './resolveSlot'
import type { VoiceSlotOption } from './slotTypes'

const option = (
  canonical: string,
  aliases: string[] = [],
): VoiceSlotOption => ({
  id: canonical,
  canonical,
  aliases,
})

describe('Voice V3 generic slot resolution', () => {
  it('matches merged words and one-character ASR loss without card-specific aliases', () => {
    const options = [option('Crystal Lens'), option('Moon Engine')]
    expect(resolveVoiceSlot('crystallens', options)).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Crystal Lens' },
    })
    expect(resolveVoiceSlot('crystallenss', options)).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Crystal Lens' },
    })
  })

  it('keeps weak short fragments conservative when several entities remain plausible', () => {
    const options = [option("Bender's Vessel"), option("Waterbender's Ritual")]
    expect(resolveVoiceSlot('bender', options)).not.toMatchObject({
      status: 'MATCHED',
    })
  })

  it('accepts a clearly separated two-edit ASR deformation without aliases', () => {
    const options = [option('Mystic Remora'), option('Arcane Signet'), option('Command Tower')]

    expect(resolveVoiceSlot('ramona', options)).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Mystic Remora' },
    })
  })

  it('resolves short contextual name fragments only when the legal catalog is unique', () => {
    const options = [
      option('Senu, Keen-Eyed Protector'),
      option('Yoshimaru, Ever Faithful'),
    ]

    for (const query of ['senu', 'seno', 'keen eye'])
      expect(resolveVoiceSlot(query, options), query).toMatchObject({
        status: 'MATCHED',
        option: { canonical: 'Senu, Keen-Eyed Protector' },
      })

    expect(
      resolveVoiceSlot('senu', [
        option('Senu, Keen-Eyed Protector'),
        option('Senu of Two Realms'),
      ]),
    ).toMatchObject({ status: 'AMBIGUOUS' })
  })

  it('coalesces duplicate deck representations of the same canonical card', () => {
    const options = [
      { ...option('Command Tower', ['torre de mando']), id: 'printing:a' },
      { ...option('Command Tower', ['command tower']), id: 'printing:b' },
      option('Arcane Signet'),
    ]

    expect(resolveVoiceSlot('command tower', options)).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Command Tower' },
    })
    expect(resolveVoiceSlot('coman tower', options)).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Command Tower' },
    })
  })

  it('prioritizes an exact canonical name over an alias collision from another entity', () => {
    const options = [
      option('Command Tower'),
      option('Signal Spire', ['command tower']),
      option('Arcane Signet'),
    ]

    expect(resolveVoiceSlot('command tower', options)).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Command Tower' },
    })
  })

  it('recovers generic ASR word fragmentation with compact edit distance', () => {
    const options = [
      option('Crystal Tower'),
      option('Arcane Compass'),
      option('Verdant Passage'),
    ]

    expect(resolveVoiceSlot('crys tal towr', options)).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Crystal Tower' },
    })
  })

  it('can stop a strong slot at conjunction noise but never drops another valid slot', () => {
    const options = [option('Crystal Lens'), option('Moon Engine')]
    expect(
      resolveVoiceSlot('crystal lens y hablamos luego', options),
    ).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Crystal Lens' },
      ignoredRemainder: 'hablamos luego',
    })
    expect(resolveVoiceSlot('crystal lens y moon engine', options)).toEqual({
      status: 'NO_MATCH',
    })
  })
  it('prefers strong identity evidence over generic subtype collisions', () => {
    const options: VoiceSlotOption[] = [
      {
        id: 'island',
        canonical: 'Island',
        aliases: ['isla'],
        aliasEvidence: [
          { value: 'isla', kind: 'LOCALIZED_NAME', fuzzy: true },
          { value: 'isla', kind: 'SUBTYPE', fuzzy: false },
        ],
      },
      {
        id: 'prairie-stream',
        canonical: 'Prairie Stream',
        aliases: ['isla'],
        aliasEvidence: [{ value: 'isla', kind: 'SUBTYPE', fuzzy: false }],
      },
    ]

    expect(resolveVoiceSlot('isla', options)).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Island' },
      method: 'ALIAS_EXACT',
      evidenceKind: 'LOCALIZED_NAME',
    })
  })

  it('uses strong identity provenance to break only fuzzy near-ties', () => {
    const options: VoiceSlotOption[] = [
      {
        id: 'localized',
        canonical: 'Alpha Device',
        aliases: ['crystal tower'],
        aliasEvidence: [
          { value: 'crystal tower', kind: 'LOCALIZED_NAME', fuzzy: true },
        ],
      },
      {
        id: 'generic',
        canonical: 'Beta Device',
        aliases: ['crystal towe'],
        aliasEvidence: [
          { value: 'crystal towe', kind: 'GENERIC_ALIAS', fuzzy: true },
        ],
      },
    ]

    expect(resolveVoiceSlot('crystal towr', options)).toMatchObject({
      status: 'MATCHED',
      option: { canonical: 'Alpha Device' },
      evidenceKind: 'LOCALIZED_NAME',
    })
  })

  it('keeps genuinely descriptive subtype references ambiguous', () => {
    const options: VoiceSlotOption[] = [
      {
        id: 'island-a',
        canonical: 'Alpha Coast',
        aliases: ['isla'],
        aliasEvidence: [{ value: 'isla', kind: 'SUBTYPE', fuzzy: false }],
      },
      {
        id: 'island-b',
        canonical: 'Beta Coast',
        aliases: ['isla'],
        aliasEvidence: [{ value: 'isla', kind: 'SUBTYPE', fuzzy: false }],
      },
    ]

    expect(resolveVoiceSlot('isla', options)).toMatchObject({
      status: 'AMBIGUOUS',
      evidenceKind: 'SUBTYPE',
    })
  })

})
