import { readFile } from 'node:fs/promises'
import type { SemanticCoverageEntry } from '../src/abilities/compiler/semantic/semanticCoverage'
import { getCapabilityCoverage } from '../src/abilities/compiler/semantic/capabilityCoverage'
import { deriveCapabilitiesForSemanticAnalysis } from '../src/abilities/compiler/semantic/deriveCapabilities'
import { mapSemanticAnalysisToRuntime } from '../src/abilities/compiler/semantic/mapSemanticAnalysisToRuntime'

const model = process.env.GEMINI_ABILITY_MODEL ?? 'gemini-3.5-flash-lite'
const raw = JSON.parse(
  await readFile('.magicjarvis/gemini-semantic-cache.json', 'utf8'),
) as { entries: Array<[string, SemanticCoverageEntry]> }

console.log('MagicJarvis Runtime Mapper Diagnosis (semantic cache only)\n')
const analyses = new Map(
  raw.entries
    .filter(([key]) => key.includes(`model:${model}`))
    .map(([, entry]) => [
      entry.semanticAnalysis.cardName,
      entry.semanticAnalysis,
    ]),
)
for (const analysis of analyses.values()) {
  const required = deriveCapabilitiesForSemanticAnalysis(analysis)
  if (getCapabilityCoverage(required).missing.length) continue
  const mapped = mapSemanticAnalysisToRuntime(
    {
      cardName: analysis.cardName,
      typeLine: '',
      oracleText: analysis.oracleText,
    },
    analysis,
  )
  if (mapped.status === 'COMPILED') continue
  console.log(`\n${analysis.cardName}`)
  console.log(`Capabilities: ${required.join(', ') || 'none'}`)
  console.log(
    `Mapper: ${mapped.warnings?.join(' ') ?? 'No complete deterministic mapping.'}`,
  )
  analysis.abilities.forEach((ability, index) => {
    console.log(
      `  Ability ${index + 1}: ${ability.abilityKind}; trigger=${ability.triggerDescription ?? 'none'}; effects=${ability.effects.join('; ') || 'none'}`,
    )
  })
}
