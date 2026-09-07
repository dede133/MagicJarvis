import type { AbilityCompilerInput } from '../types/compilerTypes'

export const ABILITY_COMPILER_PROMPT_CONTRACT = `
Return only the requested structured JSON. Never return code, JavaScript, TypeScript, markdown, or prose.
Use only cardName, typeLine, manaCost, and oracleText supplied in this request. Do not add rules from prior knowledge of Magic and do not approximate rules.
Your task is semantic analysis only. Do NOT produce GameActions, AbilityDefinitions, triggers, conditions, effects, tokens, or any executable DSL data.
For each Oracle ability, describe its kind, trigger, costs, conditions, effects, targets, choices, restrictions, duration, referenced objects, required capabilities, and unclear fragments.
The player declares game decisions. Record player choices and targets; never automate or omit them.
Required capabilities may only use these labels: DRAW_CARD, DISCARD_CARD, TAP_PERMANENT, UNTAP_PERMANENT, ADD_COUNTER, REMOVE_COUNTER, GAIN_LIFE, SCRY, SURVEIL, GIFT, PREVENT_DAMAGE, PROTECTION, AIRBEND, RESTRICTED_MANA, CHANNEL, WATERBEND, CHARACTERISTIC_MODIFICATION, LOSE_LIFE, CREATE_TOKEN, MOVE_ZONE, MANA_PRODUCTION, COST_MODIFICATION, STATIC_EFFECT, CONTINUOUS_EFFECT, REPLACEMENT_EFFECT, ACTIVATED_ABILITY, PLAYER_CHOICE, TARGET_SELECTION, CARD_SELECTION, VARIABLE_X, COPY_SPELL, COUNTER_SPELL, TYPE_MODIFICATION, POWER_TOUGHNESS_MODIFICATION, ENTER_BATTLEFIELD, SHUFFLE_LIBRARY, LINKED_OBJECT, TOKEN_KEYWORD_ABILITY, NON_TOKEN_FILTER, COLOR_QUERY, SPELL_CAST_TRIGGER, NONCREATURE_SPELL_CONDITION, BLUE_MANA_SYMBOL_COUNT, BLUE_MERFOLK_TOKEN, OTHER.
If a concept is not covered by a listed capability, write it in unsupportedOrUnclear and use OTHER. Never replace a missing concept with a different capability.
`

export const createAbilityCompilerPrompt = (
  input: AbilityCompilerInput,
): string =>
  `${ABILITY_COMPILER_PROMPT_CONTRACT}\nCARD\n${JSON.stringify(input)}`
