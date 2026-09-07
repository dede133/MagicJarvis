import {
  ABILITY_COMPILER_VERSION,
  ABILITY_DSL_VERSION,
  type CompiledCardAbilities,
} from '../types/compilerTypes'

const stableHash = (value: string): string => {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export const compiledAbilityCacheKey = (
  oracleId: string | undefined,
  oracleText: string | undefined,
  cardName: string,
  identity: { provider?: string; model?: string } = {},
): string =>
  [
    oracleId ?? cardName,
    stableHash(oracleText ?? ''),
    `dsl:${ABILITY_DSL_VERSION}`,
    `compiler:${ABILITY_COMPILER_VERSION}`,
    `provider:${identity.provider ?? 'deterministic'}`,
    `model:${identity.model ?? 'none'}`,
  ].join(':')

/** Browser-safe cache abstraction; persistence can be added without changing compiler output. */
export class CompiledAbilityCache {
  private readonly entries = new Map<string, CompiledCardAbilities>()

  get(key: string): CompiledCardAbilities | undefined {
    return this.entries.get(key)
  }

  set(key: string, value: CompiledCardAbilities): void {
    this.entries.set(key, value)
  }

  entriesArray(): Array<[string, CompiledCardAbilities]> {
    return [...this.entries.entries()]
  }

  restore(entries: Array<[string, CompiledCardAbilities]>): void {
    entries.forEach(([key, value]) => this.entries.set(key, value))
  }
}
