export type VoiceRoutingSource =
  'V3' | 'V2_FALLBACK' | 'PENDING_DECISION' | 'REJECTED'

export type VoiceV3RoutingResult =
  | 'MATCHED'
  | 'NO_MATCH'
  | 'INCOMPLETE'
  | 'REJECTED_CONTEXT'
  | 'UNSAFE'
  | 'AMBIGUOUS'
  | 'SHADOW'
  | 'DISABLED'
  | 'CANCELLED'

export type VoiceFallbackReason =
  'V3_NO_MATCH' | 'STRUCTURED_CAST_DEFERRED' | 'V3_SHADOW_ONLY' | 'V3_DISABLED'

export type VoiceRoutingTelemetry = {
  source: VoiceRoutingSource
  v3Result: VoiceV3RoutingResult
  family: string
  fallbackReason?: VoiceFallbackReason
  legacyParsed?: string
}

export type VoiceRoutingSummary = {
  total: number
  bySource: Record<VoiceRoutingSource, number>
  v2FallbackByFamily: Record<string, number>
  v2FallbackByReason: Partial<Record<VoiceFallbackReason, number>>
}

const emptySourceCounts = (): Record<VoiceRoutingSource, number> => ({
  V3: 0,
  V2_FALLBACK: 0,
  PENDING_DECISION: 0,
  REJECTED: 0,
})

export const summarizeVoiceRouting = (
  entries: readonly VoiceRoutingTelemetry[],
): VoiceRoutingSummary => {
  const bySource = emptySourceCounts()
  const v2FallbackByFamily: Record<string, number> = {}
  const v2FallbackByReason: Partial<Record<VoiceFallbackReason, number>> = {}

  for (const entry of entries) {
    bySource[entry.source] += 1
    if (entry.source !== 'V2_FALLBACK') continue
    v2FallbackByFamily[entry.family] =
      (v2FallbackByFamily[entry.family] ?? 0) + 1
    if (entry.fallbackReason)
      v2FallbackByReason[entry.fallbackReason] =
        (v2FallbackByReason[entry.fallbackReason] ?? 0) + 1
  }

  return {
    total: entries.length,
    bySource,
    v2FallbackByFamily,
    v2FallbackByReason,
  }
}

const percent = (count: number, total: number): string =>
  total ? `${((count / total) * 100).toFixed(1)}%` : '0.0%'

const sortedCounts = (counts: Record<string, number>): [string, number][] =>
  Object.entries(counts).sort(
    ([leftName, leftCount], [rightName, rightCount]) =>
      rightCount - leftCount || leftName.localeCompare(rightName),
  )

export const formatVoiceRoutingSummary = (
  summary: VoiceRoutingSummary,
): string => {
  const lines = [
    'VOICE ROUTING SUMMARY',
    `Total terminal entries: ${summary.total}`,
    '',
    ...(['V3', 'V2_FALLBACK', 'PENDING_DECISION', 'REJECTED'] as const).map(
      (source) =>
        `${source}: ${summary.bySource[source]} (${percent(summary.bySource[source], summary.total)})`,
    ),
  ]

  const fallbackFamilies = sortedCounts(summary.v2FallbackByFamily)
  if (fallbackFamilies.length) {
    lines.push('', 'V2 fallbacks by family:')
    for (const [family, count] of fallbackFamilies)
      lines.push(`- ${family}: ${count}`)
  }

  const fallbackReasons = sortedCounts(
    summary.v2FallbackByReason as Record<string, number>,
  )
  if (fallbackReasons.length) {
    lines.push('', 'V2 fallbacks by reason:')
    for (const [reason, count] of fallbackReasons)
      lines.push(`- ${reason}: ${count}`)
  }

  return lines.join('\n')
}

export const formatVoiceRoutingEntry = (
  routing: VoiceRoutingTelemetry,
): string =>
  [
    `source=${routing.source}`,
    `v3=${routing.v3Result}`,
    `family=${routing.family}`,
    routing.fallbackReason ? `fallback=${routing.fallbackReason}` : undefined,
    routing.legacyParsed ? `legacy=${routing.legacyParsed}` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
