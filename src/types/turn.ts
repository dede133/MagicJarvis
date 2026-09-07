export type TurnPhase =
  'BEGINNING' | 'PRECOMBAT_MAIN' | 'COMBAT' | 'POSTCOMBAT_MAIN' | 'ENDING'

export type TurnStep =
  | 'UNTAP'
  | 'UPKEEP'
  | 'DRAW'
  | 'MAIN_1'
  | 'BEGIN_COMBAT'
  | 'DECLARE_ATTACKERS'
  | 'DECLARE_BLOCKERS'
  | 'COMBAT_DAMAGE'
  | 'END_COMBAT'
  | 'MAIN_2'
  | 'END_STEP'
  | 'CLEANUP'

export type PriorityState = 'NONE' | 'WINDOW_OPEN'

export type TurnState = {
  phase: TurnPhase
  step: TurnStep
  priority: PriorityState
}

export const turnSteps: Array<{ phase: TurnPhase; step: TurnStep }> = [
  { phase: 'BEGINNING', step: 'UNTAP' },
  { phase: 'BEGINNING', step: 'UPKEEP' },
  { phase: 'BEGINNING', step: 'DRAW' },
  { phase: 'PRECOMBAT_MAIN', step: 'MAIN_1' },
  { phase: 'COMBAT', step: 'BEGIN_COMBAT' },
  { phase: 'COMBAT', step: 'DECLARE_ATTACKERS' },
  { phase: 'COMBAT', step: 'DECLARE_BLOCKERS' },
  { phase: 'COMBAT', step: 'COMBAT_DAMAGE' },
  { phase: 'COMBAT', step: 'END_COMBAT' },
  { phase: 'POSTCOMBAT_MAIN', step: 'MAIN_2' },
  { phase: 'ENDING', step: 'END_STEP' },
  { phase: 'ENDING', step: 'CLEANUP' },
]

export const turnStateFor = (step: TurnStep): TurnState => {
  const found = turnSteps.find((candidate) => candidate.step === step)
  if (!found) return { phase: 'BEGINNING', step: 'UNTAP', priority: 'NONE' }
  return {
    ...found,
    priority: step === 'UNTAP' || step === 'CLEANUP' ? 'NONE' : 'WINDOW_OPEN',
  }
}

export const nextStep = (current: TurnStep): TurnStep | undefined => {
  const index = turnSteps.findIndex((candidate) => candidate.step === current)
  return turnSteps[index + 1]?.step
}
