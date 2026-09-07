import {
  effectiveTypeLine,
  isProtectedFromSource,
} from '../../abilities/engine/staticEffects'
import type { CardDefinition, CardInstance } from '../../types/card'
import type { SelectionConstraints } from '../../abilities/types/abilityTypes'
import { isPresentPermanent } from '../phasing/phasingRules'
import type { GameState } from '../../types/game'

export const isAura = (card: CardInstance): boolean =>
  /\baura\b/i.test(card.card.typeLine)

export const isEquipment = (card: CardInstance): boolean =>
  /\bequipment\b/i.test(card.card.typeLine)

export const auraCastTargetConstraints = (
  card: CardDefinition,
): SelectionConstraints | undefined => {
  if (!/\baura\b/i.test(card.typeLine)) return undefined
  const enchantLine = card.oracleText
    ?.split(/\r?\n/)
    .find((line) => /^enchant\b/i.test(line.trim()))
    ?.trim()
    .toLocaleLowerCase()
  if (!enchantLine) return undefined
  const controller = /\byou control\b/.test(enchantLine)
    ? ('YOU' as const)
    : ('ANY' as const)
  if (/enchant artifact or creature\b/.test(enchantLine))
    return {
      zones: ['battlefield'],
      cardTypesAnyOf: ['Artifact', 'Creature'],
      controller,
    }
  if (/enchant creature\b/.test(enchantLine))
    return { zones: ['battlefield'], cardTypes: ['Creature'], controller }
  if (/enchant artifact\b/.test(enchantLine))
    return { zones: ['battlefield'], cardTypes: ['Artifact'], controller }
  return undefined
}

const sameController = (
  state: GameState,
  attachment: CardInstance,
  target: CardInstance,
): boolean => {
  const sourceController =
    attachment.controllerId ??
    (attachment.controller === 'OPPONENT'
      ? state.turnOrder.find((id) => id !== state.localPlayerId)
      : state.localPlayerId)
  const targetController =
    target.controllerId ??
    (target.controller === 'OPPONENT'
      ? state.turnOrder.find((id) => id !== state.localPlayerId)
      : state.localPlayerId)
  return Boolean(sourceController && sourceController === targetController)
}

/** Only parses enchant clauses that the current deck/runtime can justify. */
const auraEnchantClauseAllows = (
  state: GameState,
  aura: CardInstance,
  target: CardInstance,
): boolean => {
  const enchantLine = aura.card.oracleText
    ?.split(/\r?\n/)
    .find((line) => /^enchant\b/i.test(line.trim()))
    ?.trim()
    .toLocaleLowerCase()
  if (!enchantLine) return true

  const typeLine = effectiveTypeLine(state, target).toLocaleLowerCase()
  const requiresOwn = /\byou control\b/.test(enchantLine)
  if (requiresOwn && !sameController(state, aura, target)) return false

  if (/enchant artifact or creature\b/.test(enchantLine))
    return /\bartifact\b|\bcreature\b/.test(typeLine)
  if (/enchant creature\b/.test(enchantLine))
    return /\bcreature\b/.test(typeLine)
  if (/enchant artifact\b/.test(enchantLine))
    return /\bartifact\b/.test(typeLine)

  // Unknown enchant templates remain assisted rather than being guessed.
  return true
}

export const attachmentTargetIsLegal = (
  state: GameState,
  attachment: CardInstance,
  target: CardInstance,
): boolean => {
  if (!isPresentPermanent(attachment) || !isPresentPermanent(target)) return false
  if (attachment.instanceId === target.instanceId) return false
  if (isProtectedFromSource(state, target, attachment)) return false
  if (isEquipment(attachment))
    return /\bcreature\b/i.test(effectiveTypeLine(state, target))
  if (isAura(attachment))
    return auraEnchantClauseAllows(state, attachment, target)
  return true
}
