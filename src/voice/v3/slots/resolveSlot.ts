import Fuse from 'fuse.js'
import { normalizeCommandText } from '../../../commands/parser/normalizeText'
import type {
  SlotMatchMethod,
  SlotResolution,
  VoiceSlotAliasEvidence,
  VoiceSlotEvidenceKind,
  VoiceSlotOption,
} from './slotTypes'

const normalizeSlotText = (value: string): string =>
  normalizeCommandText(value)
    .replace(/[’']/g, '')
    .replace(/[,/\\_\-—–]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const compact = (value: string): string => value.replace(/\s+/g, '')

const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]
    previous[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]
      previous[rightIndex] = Math.min(
        above + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return previous[right.length]
}

const compactEditRatio = (left: string, right: string): number => {
  const longest = Math.max(left.length, right.length)
  return longest ? editDistance(left, right) / longest : 0
}

const semanticOptionKey = (option: VoiceSlotOption): string =>
  option.instanceId
    ? `instance:${option.instanceId}`
    : `canonical:${normalizeSlotText(option.canonical)}`

const mergeEvidence = (
  left: readonly VoiceSlotAliasEvidence[] = [],
  right: readonly VoiceSlotAliasEvidence[] = [],
): VoiceSlotAliasEvidence[] => {
  const byKey = new Map<string, VoiceSlotAliasEvidence>()
  for (const entry of [...left, ...right]) {
    const normalized = normalizeSlotText(entry.value)
    if (!normalized) continue
    const key = `${entry.kind}:${normalized}`
    const previous = byKey.get(key)
    byKey.set(key, {
      ...entry,
      value: normalized,
      fuzzy: previous?.fuzzy === true || entry.fuzzy === true,
    })
  }
  return [...byKey.values()]
}

const coalesceEquivalentOptions = (
  options: readonly VoiceSlotOption[],
): VoiceSlotOption[] => {
  const byEntity = new Map<string, VoiceSlotOption>()
  for (const option of options) {
    const key = semanticOptionKey(option)
    const previous = byEntity.get(key)
    if (!previous) {
      byEntity.set(key, option)
      continue
    }
    byEntity.set(key, {
      ...previous,
      aliases: [...new Set([...previous.aliases, ...option.aliases])],
      aliasEvidence: mergeEvidence(
        previous.aliasEvidence,
        option.aliasEvidence,
      ),
    })
  }
  return [...byEntity.values()]
}

const normalizedAliases = (option: VoiceSlotOption): string[] =>
  [
    normalizeSlotText(option.canonical),
    ...(option.aliasEvidence?.length
      ? option.aliasEvidence
          .filter((entry) => entry.fuzzy !== false)
          .map((entry) => normalizeSlotText(entry.value))
      : option.aliases.map(normalizeSlotText)),
  ].filter(Boolean)

type PreparedAlias = {
  normalized: string
  compact: string
  kind: VoiceSlotEvidenceKind
  fuzzy: boolean
}

type FuseSlotDocument = {
  optionIndex: number
  normalized: string
  compact: string
  kind?: VoiceSlotEvidenceKind
  penalty?: number
}
type RankedOption = {
  option: VoiceSlotOption
  fuseScore: number
  evidenceKind?: VoiceSlotEvidenceKind
}

type PreparedSlotCatalog = {
  options: readonly VoiceSlotOption[]
  aliasesByOption: readonly (readonly PreparedAlias[])[]
  documents: readonly FuseSlotDocument[]
  tokenFuse?: Fuse<FuseSlotDocument>
  compactFuse?: Fuse<FuseSlotDocument>
}

const TOKEN_FUSE_THRESHOLD = 0.4
const COMPACT_FUSE_THRESHOLD = 0.38
const MAX_ACCEPTED_FUSE_SCORE = 0.38
const WEAK_AMBIGUITY_FUSE_SCORE = 0.44
const AMBIGUITY_FUSE_MARGIN = 0.07
const MAX_COMPACT_EDIT_RATIO = 0.3
const COMPACT_EDIT_AMBIGUITY_MARGIN = 0.1
const MIN_FUZZY_QUERY_LENGTH = 5
const BOUNDARY_PREFIX_MIN_SCORE = 96
const FRAGMENT_MIN_COMPACT_LENGTH = 3
const FRAGMENT_MAX_EDIT_RATIO = 0.34
const FRAGMENT_MAX_TOKENS = 3
const SLOT_CACHE_LIMIT = 64

const FUZZY_KIND_PENALTY: Readonly<Record<VoiceSlotEvidenceKind, number>> = {
  CANONICAL_NAME: 0,
  LOCALIZED_NAME: 0.01,
  CARD_FACE: 0.01,
  VISUAL_LABEL: 0.015,
  ROLE: 0.08,
  TYPE: 0.08,
  SUBTYPE: 0.07,
  COMPOSITE_REFERENCE: 0.02,
  ORDINAL_REFERENCE: 0.03,
  PENDING_CHOICE: 0.01,
  GENERIC_ALIAS: 0.03,
}

const fuzzyByDefault = (kind: VoiceSlotEvidenceKind): boolean =>
  !['ROLE', 'TYPE', 'SUBTYPE', 'ORDINAL_REFERENCE'].includes(kind)

const EVIDENCE_PRECEDENCE: Readonly<Record<VoiceSlotEvidenceKind, number>> = {
  CANONICAL_NAME: 100,
  LOCALIZED_NAME: 90,
  CARD_FACE: 90,
  VISUAL_LABEL: 90,
  PENDING_CHOICE: 90,
  ORDINAL_REFERENCE: 90,
  COMPOSITE_REFERENCE: 70,
  GENERIC_ALIAS: 70,
  ROLE: 40,
  TYPE: 40,
  SUBTYPE: 40,
}

const preferStrongestEvidence = (
  candidates: readonly {
    option: VoiceSlotOption
    kind: VoiceSlotEvidenceKind
  }[],
): Array<{ option: VoiceSlotOption; kind: VoiceSlotEvidenceKind }> => {
  if (!candidates.length) return []
  const bestByEntity = new Map<
    string,
    { option: VoiceSlotOption; kind: VoiceSlotEvidenceKind }
  >()
  for (const candidate of candidates) {
    const key = semanticOptionKey(candidate.option)
    const previous = bestByEntity.get(key)
    if (
      !previous ||
      EVIDENCE_PRECEDENCE[candidate.kind] > EVIDENCE_PRECEDENCE[previous.kind]
    )
      bestByEntity.set(key, candidate)
  }
  const deduped = [...bestByEntity.values()]
  const strongest = Math.max(
    ...deduped.map((candidate) => EVIDENCE_PRECEDENCE[candidate.kind]),
  )
  return deduped.filter(
    (candidate) => EVIDENCE_PRECEDENCE[candidate.kind] === strongest,
  )
}

const EVIDENCE_NEAR_TIE_MARGIN = 0.03

/**
 * Fuzzy/edit ranking remains primarily about textual quality. Evidence kind is
 * only allowed to break a near-tie: a slightly worse canonical/localized name
 * may beat a generic descriptive reference, but strong evidence never rescues
 * a materially worse text match.
 */
const evidenceAwareContenders = <T>(
  candidates: readonly T[],
  metric: (candidate: T) => number,
  kind: (candidate: T) => VoiceSlotEvidenceKind,
  ambiguityMargin: number,
): T[] => {
  if (!candidates.length) return []
  const bestMetric = Math.min(...candidates.map(metric))
  const ordinary = candidates.filter(
    (candidate) => metric(candidate) - bestMetric <= ambiguityMargin,
  )
  if (ordinary.length <= 1) return ordinary

  const nearBest = ordinary.filter(
    (candidate) => metric(candidate) - bestMetric <= EVIDENCE_NEAR_TIE_MARGIN,
  )
  const strongest = Math.max(
    ...nearBest.map((candidate) => EVIDENCE_PRECEDENCE[kind(candidate)]),
  )
  // Evidence only suppresses weaker semantic descriptions. Candidates with the
  // same (or stronger) provenance still respect the normal ambiguity margin.
  const preferred = ordinary.filter(
    (candidate) => EVIDENCE_PRECEDENCE[kind(candidate)] >= strongest,
  )
  return preferred.length ? preferred : ordinary
}

const aliasRecords = (option: VoiceSlotOption): PreparedAlias[] => {
  const rawEvidence: VoiceSlotAliasEvidence[] = option.aliasEvidence?.length
    ? [...option.aliasEvidence]
    : option.aliases.map((value) => ({
        value,
        kind: 'GENERIC_ALIAS' as const,
        fuzzy: true,
      }))
  const records: PreparedAlias[] = [
    {
      normalized: normalizeSlotText(option.canonical),
      compact: compact(normalizeSlotText(option.canonical)),
      kind: 'CANONICAL_NAME',
      fuzzy: true,
    },
  ]
  const seen = new Set(
    records.map((entry) => `${entry.kind}:${entry.normalized}`),
  )
  for (const entry of rawEvidence) {
    const normalized = normalizeSlotText(entry.value)
    if (!normalized) continue
    const key = `${entry.kind}:${normalized}`
    if (seen.has(key)) continue
    seen.add(key)
    records.push({
      normalized,
      compact: compact(normalized),
      kind: entry.kind,
      fuzzy: entry.fuzzy ?? fuzzyByDefault(entry.kind),
    })
  }
  return records
}

const slotCatalogSignature = (options: readonly VoiceSlotOption[]): string =>
  JSON.stringify(
    options.map((option) => [
      option.id,
      option.instanceId ?? '',
      option.canonical,
      option.aliases,
      option.aliasEvidence?.map((entry) => [
        entry.value,
        entry.kind,
        entry.fuzzy ?? null,
      ]) ?? [],
    ]),
  )

const slotCatalogCache = new Map<string, PreparedSlotCatalog>()

const rememberPreparedCatalog = (
  key: string,
  catalog: PreparedSlotCatalog,
): PreparedSlotCatalog => {
  slotCatalogCache.delete(key)
  slotCatalogCache.set(key, catalog)
  while (slotCatalogCache.size > SLOT_CACHE_LIMIT) {
    const oldest = slotCatalogCache.keys().next().value as string | undefined
    if (!oldest) break
    slotCatalogCache.delete(oldest)
  }
  return catalog
}

export const clearVoiceSlotResolverCache = (): void => slotCatalogCache.clear()
export const voiceSlotResolverCacheSize = (): number => slotCatalogCache.size

const prepareSlotCatalog = (
  rawOptions: readonly VoiceSlotOption[],
): PreparedSlotCatalog => {
  const options = coalesceEquivalentOptions(rawOptions)
  const key = slotCatalogSignature(options)
  const cached = slotCatalogCache.get(key)
  if (cached) {
    // LRU refresh.
    slotCatalogCache.delete(key)
    slotCatalogCache.set(key, cached)
    return cached
  }

  const aliasesByOption = options.map(aliasRecords)
  const documents = aliasesByOption.flatMap((aliases, optionIndex) =>
    aliases
      .filter((alias) => alias.fuzzy)
      .map((alias) => ({
        optionIndex,
        normalized: alias.normalized,
        compact: alias.compact,
        kind: alias.kind,
        penalty: FUZZY_KIND_PENALTY[alias.kind],
      })),
  )

  const tokenFuse = documents.length
    ? new Fuse(documents, {
        keys: ['normalized'],
        includeScore: true,
        useTokenSearch: true,
        tokenMatch: 'all',
        threshold: TOKEN_FUSE_THRESHOLD,
        ignoreLocation: true,
        ignoreFieldNorm: true,
        ignoreDiacritics: true,
        minMatchCharLength: 2,
      })
    : undefined
  const compactFuse = documents.length
    ? new Fuse(documents, {
        keys: ['compact'],
        includeScore: true,
        threshold: COMPACT_FUSE_THRESHOLD,
        ignoreLocation: true,
        ignoreFieldNorm: true,
        ignoreDiacritics: true,
        minMatchCharLength: 2,
      })
    : undefined

  return rememberPreparedCatalog(key, {
    options,
    aliasesByOption,
    documents,
    tokenFuse: tokenFuse as Fuse<FuseSlotDocument> | undefined,
    compactFuse: compactFuse as Fuse<FuseSlotDocument> | undefined,
  })
}

const contiguousFragments = (value: string): string[] => {
  const tokens = value.split(/\s+/).filter(Boolean)
  const fragments: string[] = []
  for (let start = 0; start < tokens.length; start += 1)
    for (let size = 1; size <= FRAGMENT_MAX_TOKENS; size += 1) {
      const fragment = tokens.slice(start, start + size).join(' ')
      if (compact(fragment).length >= FRAGMENT_MIN_COMPACT_LENGTH)
        fragments.push(fragment)
    }
  return fragments
}

const fragmentMatchRatio = (
  query: string,
  fragment: string,
): number | undefined => {
  const queryCompact = compact(query)
  const fragmentCompact = compact(fragment)
  if (
    queryCompact === fragmentCompact ||
    (queryCompact.length >= 5 && fragmentCompact.includes(queryCompact)) ||
    (fragmentCompact.length >= 5 && queryCompact.includes(fragmentCompact))
  )
    return 0
  const ratio = compactEditRatio(queryCompact, fragmentCompact)
  return ratio <= FRAGMENT_MAX_EDIT_RATIO ? ratio : undefined
}

/**
 * Short/partial names are safe only when the current legal catalog makes the
 * reference unique. This deliberately uses no card-specific aliases: "senu",
 * "seno" or "keen eye" are resolved from name fragments, while "bender" stays
 * ambiguous if several legal entities contain a compatible fragment.
 */
const contextualFragmentResolution = (
  query: string,
  options: readonly VoiceSlotOption[],
): SlotResolution | null => {
  if (compact(query).length < FRAGMENT_MIN_COMPACT_LENGTH) return null
  const matched = options
    .map((option) => {
      let bestRatio: number | undefined
      for (const alias of normalizedAliases(option))
        for (const fragment of contiguousFragments(alias)) {
          const ratio = fragmentMatchRatio(query, fragment)
          if (ratio === undefined) continue
          if (bestRatio === undefined || ratio < bestRatio) bestRatio = ratio
        }
      return bestRatio === undefined ? undefined : { option, ratio: bestRatio }
    })
    .filter((value): value is { option: VoiceSlotOption; ratio: number } =>
      Boolean(value),
    )
    .sort((left, right) => left.ratio - right.ratio)

  if (!matched.length) return null
  const bestRatio = matched[0].ratio
  const contenders = matched.filter(({ ratio }) => ratio - bestRatio <= 0.08)
  if (contenders.length > 1)
    return {
      status: 'AMBIGUOUS',
      options: contenders.map(({ option }) => option),
      method: 'CONTEXTUAL_FRAGMENT',
      marginToSecond: contenders[1]
        ? contenders[1].ratio - bestRatio
        : undefined,
    }
  return {
    status: 'MATCHED',
    option: matched[0].option,
    score:
      bestRatio === 0 ? 96 : Math.max(86, Math.round((1 - bestRatio) * 100)),
    method: 'CONTEXTUAL_FRAGMENT',
    marginToSecond: matched[1] ? matched[1].ratio - bestRatio : undefined,
  }
}

const toDocuments = (options: readonly VoiceSlotOption[]): FuseSlotDocument[] =>
  options.flatMap((option, optionIndex) =>
    normalizedAliases(option).map((normalized) => ({
      optionIndex,
      normalized,
      compact: compact(normalized),
    })),
  )

const addFuseResults = (
  ranked: Map<number, number>,
  results: readonly { item: FuseSlotDocument; score?: number }[],
): void => {
  for (const result of results) {
    if (typeof result.score !== 'number') continue
    const previous = ranked.get(result.item.optionIndex)
    if (previous === undefined || result.score < previous)
      ranked.set(result.item.optionIndex, result.score)
  }
}

const rankWithFuse = (
  query: string,
  options: readonly VoiceSlotOption[],
): RankedOption[] => {
  const queryCompact = compact(query)
  if (queryCompact.length < MIN_FUZZY_QUERY_LENGTH) return []
  const documents = toDocuments(options)
  if (!documents.length) return []
  const ranked = new Map<number, number>()
  const tokenFuse = new Fuse(documents, {
    keys: ['normalized'],
    includeScore: true,
    useTokenSearch: true,
    tokenMatch: 'all',
    threshold: TOKEN_FUSE_THRESHOLD,
    ignoreLocation: true,
    ignoreFieldNorm: true,
    ignoreDiacritics: true,
    minMatchCharLength: 2,
  })
  addFuseResults(ranked, tokenFuse.search(query))
  const compactFuse = new Fuse(documents, {
    keys: ['compact'],
    includeScore: true,
    threshold: COMPACT_FUSE_THRESHOLD,
    ignoreLocation: true,
    ignoreFieldNorm: true,
    ignoreDiacritics: true,
    minMatchCharLength: 2,
  })
  addFuseResults(ranked, compactFuse.search(queryCompact))
  return [...ranked.entries()]
    .map(([optionIndex, fuseScore]) => ({
      option: options[optionIndex],
      fuseScore,
    }))
    .sort((left, right) => left.fuseScore - right.fuseScore)
}

const confidenceFromFuseScore = (score: number): number =>
  Math.max(0, Math.min(98, Math.round((1 - score) * 100)))

const exactCandidateResolution = (
  candidates: readonly VoiceSlotOption[],
  score: number,
  method: SlotMatchMethod,
  query: string,
): SlotResolution | null => {
  const evidenceCandidates = candidates.map((option) => ({
    option,
    kind:
      normalizeSlotText(option.canonical) === query
        ? ('CANONICAL_NAME' as const)
        : (option.aliasEvidence?.find(
            (entry) => normalizeSlotText(entry.value) === query,
          )?.kind ?? ('GENERIC_ALIAS' as const)),
  }))
  const preferred = preferStrongestEvidence(evidenceCandidates)
  if (!preferred.length) return null
  if (preferred.length > 1)
    return {
      status: 'AMBIGUOUS',
      options: preferred.map(({ option }) => option),
      method,
      evidenceKind: preferred[0].kind,
      marginToSecond: 0,
    }
  return {
    status: 'MATCHED',
    option: preferred[0].option,
    score,
    method,
    evidenceKind: preferred[0].kind,
  }
}

const exactResolution = (
  query: string,
  options: readonly VoiceSlotOption[],
): SlotResolution | null => {
  const queryCompact = compact(query)
  const exactCanonical = exactCandidateResolution(
    options.filter((option) => normalizeSlotText(option.canonical) === query),
    100,
    'CANONICAL_EXACT',
    query,
  )
  if (exactCanonical) return exactCanonical
  const compactCanonical = exactCandidateResolution(
    options.filter(
      (option) => compact(normalizeSlotText(option.canonical)) === queryCompact,
    ),
    99,
    'CANONICAL_COMPACT',
    query,
  )
  if (compactCanonical) return compactCanonical
  const exactAlias = exactCandidateResolution(
    options.filter((option) =>
      option.aliases.map(normalizeSlotText).includes(query),
    ),
    98,
    'ALIAS_EXACT',
    query,
  )
  if (exactAlias && exactAlias.status !== 'NO_MATCH') {
    const evidenceKind = options
      .find((option) => option.aliases.map(normalizeSlotText).includes(query))
      ?.aliasEvidence?.find(
        (entry) => normalizeSlotText(entry.value) === query,
      )?.kind
    return evidenceKind ? { ...exactAlias, evidenceKind } : exactAlias
  }
  const compactAlias = exactCandidateResolution(
    options.filter((option) =>
      option.aliases
        .map(normalizeSlotText)
        .some((alias) => compact(alias) === queryCompact),
    ),
    97,
    'ALIAS_COMPACT',
    query,
  )
  if (!compactAlias || compactAlias.status === 'NO_MATCH') return null
  const evidenceKind = options
    .flatMap((option) => option.aliasEvidence ?? [])
    .find(
      (entry) => compact(normalizeSlotText(entry.value)) === queryCompact,
    )?.kind
  return evidenceKind ? { ...compactAlias, evidenceKind } : compactAlias
}

const rankByCompactEdit = (
  query: string,
  options: readonly VoiceSlotOption[],
): Array<{ option: VoiceSlotOption; ratio: number }> => {
  const queryCompact = compact(query)
  if (queryCompact.length < MIN_FUZZY_QUERY_LENGTH) return []
  return options
    .map((option) => ({
      option,
      ratio: Math.min(
        ...normalizedAliases(option).map((alias) =>
          compactEditRatio(queryCompact, compact(alias)),
        ),
      ),
    }))
    .sort((left, right) => left.ratio - right.ratio)
}

const resolveNormalizedVoiceSlot = (
  query: string,
  options: readonly VoiceSlotOption[],
): SlotResolution => {
  const exact = exactResolution(query, options)
  if (exact) return exact
  const fragment = contextualFragmentResolution(query, options)
  if (fragment) return fragment
  const ranked = rankWithFuse(query, options)
  if (ranked.length && ranked[0].fuseScore <= MAX_ACCEPTED_FUSE_SCORE) {
    const best = ranked[0]
    const contenders = ranked.filter(
      ({ fuseScore }) =>
        fuseScore <= WEAK_AMBIGUITY_FUSE_SCORE &&
        fuseScore - best.fuseScore <= AMBIGUITY_FUSE_MARGIN,
    )
    if (contenders.length > 1)
      return {
        status: 'AMBIGUOUS',
        options: contenders.map(({ option }) => option),
        method: 'FUSE',
        marginToSecond: ranked[1]
          ? ranked[1].fuseScore - best.fuseScore
          : undefined,
      }
    return {
      status: 'MATCHED',
      option: best.option,
      score: confidenceFromFuseScore(best.fuseScore),
      method: 'FUSE',
      marginToSecond: ranked[1]
        ? ranked[1].fuseScore - best.fuseScore
        : undefined,
    }
  }

  const editRanked = rankByCompactEdit(query, options)
  const editBest = editRanked[0]
  if (!editBest || editBest.ratio > MAX_COMPACT_EDIT_RATIO)
    return { status: 'NO_MATCH' }
  const editContenders = editRanked.filter(
    ({ ratio }) =>
      ratio <= MAX_COMPACT_EDIT_RATIO &&
      ratio - editBest.ratio <= COMPACT_EDIT_AMBIGUITY_MARGIN,
  )
  if (editContenders.length > 1)
    return {
      status: 'AMBIGUOUS',
      options: editContenders.map(({ option }) => option),
      method: 'COMPACT_EDIT',
      marginToSecond: editRanked[1]
        ? editRanked[1].ratio - editBest.ratio
        : undefined,
    }
  return {
    status: 'MATCHED',
    option: editBest.option,
    score: Math.max(70, Math.round((1 - editBest.ratio) * 100)),
    method: 'COMPACT_EDIT',
    marginToSecond: editRanked[1]
      ? editRanked[1].ratio - editBest.ratio
      : undefined,
  }
}

const boundaryCandidates = (
  query: string,
): { prefix: string; remainder: string }[] => {
  const candidates: { prefix: string; remainder: string }[] = []
  const expression = /\s+y\s+/g
  for (const match of query.matchAll(expression)) {
    const index = match.index ?? -1
    if (index <= 0) continue
    const prefix = query.slice(0, index).trim()
    const remainder = query.slice(index + match[0].length).trim()
    if (prefix && remainder) candidates.push({ prefix, remainder })
  }
  return candidates.sort(
    (left, right) => right.prefix.length - left.prefix.length,
  )
}

export const resolveVoiceSlot = (
  rawQuery: string,
  options: readonly VoiceSlotOption[],
): SlotResolution => {
  const query = normalizeSlotText(rawQuery)
  if (!query || !options.length) return { status: 'NO_MATCH' }
  // Multiple recipe/printing entries can represent one deck entity. Physical
  // instances retain their instanceId and therefore remain distinct.
  const semanticOptions = coalesceEquivalentOptions(options)
  prepareSlotCatalog(semanticOptions)
  const whole = resolveNormalizedVoiceSlot(query, semanticOptions)
  if (
    whole.status !== 'NO_MATCH' &&
    !(
      boundaryCandidates(query).length > 0 &&
      (whole.status === 'AMBIGUOUS' ||
        (whole.status === 'MATCHED' && whole.method === 'CONTEXTUAL_FRAGMENT'))
    )
  )
    return whole
  let rejectedBoundary = false
  for (const boundary of boundaryCandidates(query)) {
    const prefix = resolveNormalizedVoiceSlot(boundary.prefix, semanticOptions)
    if (prefix.status !== 'MATCHED' || prefix.score < BOUNDARY_PREFIX_MIN_SCORE)
      continue
    const suffix = resolveNormalizedVoiceSlot(
      boundary.remainder,
      semanticOptions,
    )
    if (suffix.status !== 'NO_MATCH') {
      rejectedBoundary = true
      continue
    }
    return {
      ...prefix,
      consumedText: boundary.prefix,
      ignoredRemainder: boundary.remainder,
    }
  }
  if (rejectedBoundary) return { status: 'NO_MATCH' }
  return { status: 'NO_MATCH' }
}
