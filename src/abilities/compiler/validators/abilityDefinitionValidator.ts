import type {
  AbilityDefinition,
  ConditionDefinition,
  EffectDefinition,
} from '../../types/abilityTypes'
import { tokenDefinitions } from '../../../tokens/tokenDefinitions'
import type { Zone } from '../../../types/card'

export type ValidationResult<T> =
  { valid: true; value: T } | { valid: false; errors: string[] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const exactKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key) => key in value)

const validateCondition = (
  value: unknown,
  errors: string[],
): value is ConditionDefinition => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    errors.push('Condition must be an object with a type.')
    return false
  }
  if (value.type === 'EVENT_TURN_STEP_IS') {
    const valid =
      exactKeys(value, ['type', 'value']) && typeof value.value === 'string'
    if (!valid) errors.push('Invalid EVENT_TURN_STEP_IS condition.')
    return valid
  }
  if (value.type === 'EVENT_TRANSFORMED_TO_NAME') {
    const valid =
      exactKeys(value, ['type', 'value']) &&
      typeof value.value === 'string' &&
      value.value.length > 0
    if (!valid) errors.push('Invalid EVENT_TRANSFORMED_TO_NAME condition.')
    return valid
  }
  if (value.type === 'EVENT_SUBJECT_IS_SOURCE') {
    const valid = exactKeys(value, ['type'])
    if (!valid) errors.push('Invalid EVENT_SUBJECT_IS_SOURCE condition.')
    return valid
  }
  if (value.type === 'EVENT_SUBJECT_IS_NOT_SOURCE') {
    const valid = exactKeys(value, ['type'])
    if (!valid) errors.push('Invalid EVENT_SUBJECT_IS_NOT_SOURCE condition.')
    return valid
  }
  if (value.type === 'EVENT_IS_HISTORIC') {
    const valid = exactKeys(value, ['type'])
    if (!valid) errors.push('Invalid EVENT_IS_HISTORIC condition.')
    return valid
  }
  if (value.type === 'EVENT_HAS_ANY_COUNTERS') {
    const valid = exactKeys(value, ['type'])
    if (!valid) errors.push('Invalid EVENT_HAS_ANY_COUNTERS condition.')
    return valid
  }
  if (value.type === 'EVENT_HAS_COUNTER') {
    const valid =
      Object.keys(value).every((key) => ['type', 'counterType', 'atLeast'].includes(key)) &&
      typeof value.counterType === 'string' &&
      value.counterType.length > 0 &&
      (value.atLeast === undefined ||
        (typeof value.atLeast === 'number' && Number.isSafeInteger(value.atLeast) && value.atLeast >= 0))
    if (!valid) errors.push('Invalid EVENT_HAS_COUNTER condition.')
    return valid
  }
  if (value.type === 'EVENT_SOURCE_IS_ATTACHED_OBJECT') {
    const valid = exactKeys(value, ['type'])
    if (!valid)
      errors.push('Invalid EVENT_SOURCE_IS_ATTACHED_OBJECT condition.')
    return valid
  }
  if (value.type === 'EVENT_SUBJECT_IS_ATTACHED_OBJECT') {
    const valid = exactKeys(value, ['type'])
    if (!valid)
      errors.push('Invalid EVENT_SUBJECT_IS_ATTACHED_OBJECT condition.')
    return valid
  }
  if (value.type === 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER') {
    const valid = exactKeys(value, ['type'])
    if (!valid)
      errors.push('Invalid EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER condition.')
    return valid
  }
  if (value.type === 'EVENT_PLAYER_IS_SOURCE_CONTROLLER') {
    const valid = exactKeys(value, ['type'])
    if (!valid)
      errors.push('Invalid EVENT_PLAYER_IS_SOURCE_CONTROLLER condition.')
    return valid
  }
  if (value.type === 'EVENT_PLAYER_IS_OPPONENT_OF_SOURCE_CONTROLLER') {
    const valid = exactKeys(value, ['type'])
    if (!valid)
      errors.push(
        'Invalid EVENT_PLAYER_IS_OPPONENT_OF_SOURCE_CONTROLLER condition.',
      )
    return valid
  }
  if (value.type === 'SPELL_IS_CREATURE') {
    const valid =
      exactKeys(value, ['type', 'value']) && typeof value.value === 'boolean'
    if (!valid) errors.push('Invalid SPELL_IS_CREATURE condition.')
    return valid
  }
  if (value.type === 'EVENT_NUMBER_COMPARE') {
    const valid =
      exactKeys(value, ['type', 'field', 'operator', 'value']) &&
      ['blueManaSymbols', 'castNumberThisTurn', 'manaSpent', 'damageAmount'].includes(
        String(value.field),
      ) &&
      ['GT', 'GTE', 'EQ'].includes(String(value.operator)) &&
      typeof value.value === 'number' &&
      Number.isFinite(value.value)
    if (!valid) errors.push('Invalid EVENT_NUMBER_COMPARE condition.')
    return valid
  }
  if (value.type === 'EVENT_CONTROLLER_IS') {
    const valid =
      exactKeys(value, ['type', 'value']) &&
      (value.value === 'YOU' || value.value === 'OPPONENT')
    if (!valid) errors.push('Invalid EVENT_CONTROLLER_IS condition.')
    return valid
  }
  if (value.type === 'EVENT_IS_TOKEN') {
    const valid =
      exactKeys(value, ['type', 'value']) && typeof value.value === 'boolean'
    if (!valid) errors.push('Invalid EVENT_IS_TOKEN condition.')
    return valid
  }
  if (value.type === 'EVENT_HAS_KEYWORD') {
    const valid =
      exactKeys(value, ['type', 'value']) && typeof value.value === 'string'
    if (!valid) errors.push('Invalid EVENT_HAS_KEYWORD condition.')
    return valid
  }
  if (value.type === 'EVENT_DAMAGE_KIND_IS') {
    const valid =
      exactKeys(value, ['type', 'value']) &&
      (value.value === 'COMBAT' || value.value === 'NONCOMBAT')
    if (!valid) errors.push('Invalid EVENT_DAMAGE_KIND_IS condition.')
    return valid
  }
  if (value.type === 'EVENT_DAMAGE_TARGET_IS_PLAYER_OR_PLANESWALKER') {
    const valid = exactKeys(value, ['type'])
    if (!valid)
      errors.push('Invalid EVENT_DAMAGE_TARGET_IS_PLAYER_OR_PLANESWALKER condition.')
    return valid
  }
  if (
    value.type === 'EVENT_ATTACKS_PLAYER_WITH_GREATEST_LIFE_AMONG_OPPONENTS'
  ) {
    const valid = exactKeys(value, ['type'])
    if (!valid)
      errors.push(
        'Invalid EVENT_ATTACKS_PLAYER_WITH_GREATEST_LIFE_AMONG_OPPONENTS condition.',
      )
    return valid
  }
  if (value.type === 'EVENT_HAS_TYPE') {
    const valid =
      exactKeys(value, ['type', 'value']) &&
      typeof value.value === 'string' &&
      value.value.length > 0
    if (!valid) errors.push(`Invalid ${value.type} condition.`)
    return valid
  }
  if (value.type === 'EVENT_HAS_SUBTYPE') {
    const valid =
      exactKeys(value, ['type', 'value']) &&
      validateRuntimeTextReference(value.value)
    if (!valid) errors.push('Invalid EVENT_HAS_SUBTYPE condition.')
    return valid
  }
  errors.push(`Unknown condition: ${value.type}.`)
  return false
}

const zones: Zone[] = [
  'library',
  'hand',
  'battlefield',
  'graveyard',
  'exile',
  'command',
  'stack',
]
const references = [
  'SOURCE',
  'EVENT_SUBJECT',
  'SELECTED_TARGET',
  'FIRST_SELECTED_TARGET',
  'SECOND_SELECTED_TARGET',
  'SELECTED_CARD',
  'SELECTED_STACK_OBJECT',
  'EVENT_STACK_OBJECT',
  'CURRENT_OBJECT',
  'ATTACHED_OBJECT',
]

const playerReferences = [
  'SOURCE_CONTROLLER',
  'EVENT_PLAYER',
  'ACTIVE_PLAYER',
  'TARGET_PLAYER',
  'DEFENDING_PLAYER',
  'CURRENT_PLAYER',
  'TARGET_CONTROLLER',
  'ATTACHED_OBJECT_OWNER',
]

const validatePlayerReference = (value: unknown): boolean =>
  (typeof value === 'string' && playerReferences.includes(value)) ||
  (isRecord(value) &&
    ((value.type === 'VARIABLE' &&
      exactKeys(value, ['type', 'name']) &&
      typeof value.name === 'string' &&
      value.name.length > 0) ||
      (value.type === 'SOURCE_VALUE' &&
        exactKeys(value, ['type', 'key']) &&
        typeof value.key === 'string' &&
        value.key.length > 0)))

const validateRuntimeTextReference = (value: unknown): boolean =>
  typeof value === 'string' ||
  (isRecord(value) &&
    ((value.type === 'VARIABLE' &&
      exactKeys(value, ['type', 'name']) &&
      typeof value.name === 'string' &&
      value.name.length > 0) ||
      (value.type === 'SOURCE_VALUE' &&
        exactKeys(value, ['type', 'key']) &&
        typeof value.key === 'string' &&
        value.key.length > 0)))

const validateAmount = (value: unknown): boolean =>
  isRecord(value) &&
  ((value.type === 'LITERAL' &&
    exactKeys(value, ['type', 'value']) &&
    typeof value.value === 'number' &&
    Number.isSafeInteger(value.value) &&
    value.value >= 0) ||
    (value.type === 'EVENT_VALUE' &&
      exactKeys(value, ['type', 'field']) &&
      ['blueManaSymbols', 'castNumberThisTurn', 'manaSpent', 'damageAmount'].includes(
        String(value.field),
      )) ||
    (value.type === 'VARIABLE' &&
      exactKeys(value, ['type', 'name']) &&
      typeof value.name === 'string') ||
    (value.type === 'SOURCE_VALUE' &&
      exactKeys(value, ['type', 'key']) &&
      typeof value.key === 'string' &&
      value.key.length > 0) ||
    (value.type === 'COUNTER_COUNT' &&
      exactKeys(value, ['type', 'target', 'counterType']) &&
      references.includes(String(value.target)) &&
      typeof value.counterType === 'string') ||
    (value.type === 'EVENT_COUNTER_COUNT' &&
      exactKeys(value, ['type', 'counterType']) &&
      typeof value.counterType === 'string' &&
      value.counterType.length > 0) ||
    (value.type === 'TOTAL_COUNTER_COUNT' &&
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))) ||
    (value.type === 'COUNT_OBJECTS' && isRecord(value.query)) ||
    (value.type === 'MANA_VALUE' &&
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))) ||
    (value.type === 'POWER' &&
      exactKeys(value, ['type', 'base', 'exponent']) &&
      validateAmount(value.base) &&
      validateAmount(value.exponent)) ||
    (value.type === 'MAX_SHARED_CREATURE_SUBTYPE_COUNT' &&
      exactKeys(value, ['type', 'controller']) &&
      validatePlayerReference(value.controller)) ||
    (value.type === 'SUBTRACT' &&
      exactKeys(value, ['type', 'left', 'right']) &&
      validateAmount(value.left) &&
      validateAmount(value.right)) ||
    ((value.type === 'ADD' || value.type === 'MULTIPLY') &&
      Array.isArray(value.values) &&
      value.values.every(validateAmount)))

const validateObjectQuery = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).every((key) =>
    [
      'zones',
      'controller',
      'owner',
      'controllerRelation',
      'cardTypes',
      'cardTypesAnyOf',
      'excludeCardTypes',
      'subtypes',
      'subtypesAnyOf',
      'excludeSubtypes',
      'historic',
      'hasCounterType',
      'counterCountAtLeast',
      'hasAnyCounters',
      'powerAtLeast',
      'toughnessAtLeast',
      'colors',
      'colorsAnyOf',
      'excludeColors',
      'isToken',
      'attacking',
      'tapped',
      'excludeSource',
      'manaValueMax',
    ].includes(key),
  ) &&
  (value.zones === undefined ||
    (Array.isArray(value.zones) &&
      value.zones.every((zone) => zones.includes(zone as Zone)))) &&
  (value.controller === undefined ||
    validatePlayerReference(value.controller)) &&
  (value.owner === undefined ||
    validatePlayerReference(value.owner)) &&
  (value.controllerRelation === undefined ||
    value.controllerRelation === 'NOT_SOURCE_CONTROLLER') &&
  (value.cardTypes === undefined ||
    (Array.isArray(value.cardTypes) &&
      value.cardTypes.every((type) => typeof type === 'string'))) &&
  (value.cardTypesAnyOf === undefined ||
    (Array.isArray(value.cardTypesAnyOf) &&
      value.cardTypesAnyOf.every((type) => typeof type === 'string'))) &&
  (value.excludeCardTypes === undefined ||
    (Array.isArray(value.excludeCardTypes) &&
      value.excludeCardTypes.every((type) => typeof type === 'string'))) &&
  (value.subtypes === undefined ||
    (Array.isArray(value.subtypes) &&
      value.subtypes.every(validateRuntimeTextReference))) &&
  (value.subtypesAnyOf === undefined ||
    (Array.isArray(value.subtypesAnyOf) &&
      value.subtypesAnyOf.every(validateRuntimeTextReference))) &&
  (value.excludeSubtypes === undefined ||
    (Array.isArray(value.excludeSubtypes) &&
      value.excludeSubtypes.every(validateRuntimeTextReference))) &&
  (value.historic === undefined || typeof value.historic === 'boolean') &&
  (value.hasCounterType === undefined || typeof value.hasCounterType === 'string') &&
  (value.counterCountAtLeast === undefined ||
    (typeof value.counterCountAtLeast === 'number' && Number.isSafeInteger(value.counterCountAtLeast) && value.counterCountAtLeast >= 0)) &&
  (value.hasAnyCounters === undefined || typeof value.hasAnyCounters === 'boolean') &&
  (value.powerAtLeast === undefined ||
    (typeof value.powerAtLeast === 'number' && Number.isFinite(value.powerAtLeast))) &&
  (value.toughnessAtLeast === undefined ||
    (typeof value.toughnessAtLeast === 'number' && Number.isFinite(value.toughnessAtLeast))) &&
  (value.colors === undefined ||
    (Array.isArray(value.colors) &&
      value.colors.every((color) =>
        ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(color)),
      ))) &&
  (value.colorsAnyOf === undefined ||
    (Array.isArray(value.colorsAnyOf) &&
      value.colorsAnyOf.every((color) =>
        ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(color)),
      ))) &&
  (value.excludeColors === undefined ||
    (Array.isArray(value.excludeColors) &&
      value.excludeColors.every((color) =>
        ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(color)),
      ))) &&
  (value.isToken === undefined || typeof value.isToken === 'boolean') &&
  (value.attacking === undefined || typeof value.attacking === 'boolean') &&
  (value.tapped === undefined || typeof value.tapped === 'boolean') &&
  (value.excludeSource === undefined ||
    typeof value.excludeSource === 'boolean') &&
  (value.manaValueMax === undefined || validateAmount(value.manaValueMax))

const validateConstraints = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'zones',
          'cardTypes',
          'cardTypesAnyOf',
          'excludeCardTypes',
          'subtypes',
          'subtypesAnyOf',
          'historic',
          'hasCounterType',
          'counterCountAtLeast',
          'hasAnyCounters',
          'powerAtLeast',
          'toughnessAtLeast',
          'controller',
          'owner',
          'controllerRelation',
          'controllerPlayer',
          'playerRelation',
          'isToken',
          'attacking',
          'isCommander',
          'cardType',
          'excludeCardType',
          'subtype',
          'excludeSubtype',
          'hasKeyword',
          'excludeSource',
          'excludeAttachedToSource',
          'sourceOnly',
          'nonbasicLand',
          'attachedToSource',
          'stackKind',
          'combatRole',
          'colors',
          'colorsAnyOf',
          'excludeColors',
          'manaValueMax',
          'sharesCreatureSubtypeWithFirstTarget',
          'anyOf',
        ].includes(key),
    )
  )
    return false
  return (
    (value.zones === undefined ||
      (Array.isArray(value.zones) &&
        value.zones.every((zone) => zones.includes(zone as Zone)))) &&
    (value.excludeCardType === undefined || typeof value.excludeCardType === 'string') &&
    (value.cardTypes === undefined ||
      (Array.isArray(value.cardTypes) &&
        value.cardTypes.every((type) => typeof type === 'string'))) &&
    (value.cardTypesAnyOf === undefined ||
      (Array.isArray(value.cardTypesAnyOf) &&
        value.cardTypesAnyOf.every((type) => typeof type === 'string'))) &&
    (value.excludeCardTypes === undefined ||
      (Array.isArray(value.excludeCardTypes) &&
        value.excludeCardTypes.every((type) => typeof type === 'string'))) &&
    (value.subtypes === undefined ||
      (Array.isArray(value.subtypes) &&
        value.subtypes.every((subtype) => typeof subtype === 'string'))) &&
    (value.subtypesAnyOf === undefined ||
      (Array.isArray(value.subtypesAnyOf) &&
        value.subtypesAnyOf.every((subtype) => typeof subtype === 'string'))) &&
    (value.historic === undefined || typeof value.historic === 'boolean') &&
    (value.hasCounterType === undefined || typeof value.hasCounterType === 'string') &&
    (value.counterCountAtLeast === undefined ||
      (typeof value.counterCountAtLeast === 'number' && Number.isSafeInteger(value.counterCountAtLeast) && value.counterCountAtLeast >= 0)) &&
    (value.hasAnyCounters === undefined || typeof value.hasAnyCounters === 'boolean') &&
    (value.powerAtLeast === undefined ||
      (typeof value.powerAtLeast === 'number' && Number.isFinite(value.powerAtLeast))) &&
    (value.toughnessAtLeast === undefined ||
      (typeof value.toughnessAtLeast === 'number' && Number.isFinite(value.toughnessAtLeast))) &&
    (value.controller === undefined ||
      value.controller === 'YOU' ||
      value.controller === 'OPPONENT' ||
      value.controller === 'ANY') &&
    (value.owner === undefined ||
      value.owner === 'YOU' ||
      value.owner === 'OPPONENT' ||
      value.owner === 'ANY') &&
    (value.controllerRelation === undefined ||
      value.controllerRelation === 'NOT_SOURCE_CONTROLLER') &&
    (value.controllerPlayer === undefined ||
      validatePlayerReference(value.controllerPlayer)) &&
    (value.playerRelation === undefined ||
      ['YOU', 'OPPONENT', 'ANY'].includes(String(value.playerRelation))) &&
    (value.isToken === undefined || typeof value.isToken === 'boolean') &&
    (value.attacking === undefined || typeof value.attacking === 'boolean') &&
    (value.isCommander === undefined ||
      typeof value.isCommander === 'boolean') &&
    (value.cardType === undefined || typeof value.cardType === 'string') &&
    (value.subtype === undefined ||
      validateRuntimeTextReference(value.subtype)) &&
    (value.excludeSubtype === undefined ||
      validateRuntimeTextReference(value.excludeSubtype)) &&
    (value.hasKeyword === undefined || typeof value.hasKeyword === 'string') &&
    (value.excludeSource === undefined ||
      typeof value.excludeSource === 'boolean') &&
    (value.combatRole === undefined ||
      value.combatRole === 'ATTACKING_OR_BLOCKING') &&
    (value.excludeAttachedToSource === undefined ||
      typeof value.excludeAttachedToSource === 'boolean') &&
    (value.sourceOnly === undefined || typeof value.sourceOnly === 'boolean') &&
    (value.nonbasicLand === undefined ||
      typeof value.nonbasicLand === 'boolean') &&
    (value.attachedToSource === undefined ||
      typeof value.attachedToSource === 'boolean') &&
    (value.stackKind === undefined || value.stackKind === 'SPELL') &&
    (value.colors === undefined ||
      (Array.isArray(value.colors) &&
        value.colors.every((color) =>
          ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(color)),
        ))) &&
    (value.colorsAnyOf === undefined ||
      (Array.isArray(value.colorsAnyOf) &&
        value.colorsAnyOf.every((color) =>
          ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(color)),
        ))) &&
    (value.excludeColors === undefined ||
      (Array.isArray(value.excludeColors) &&
        value.excludeColors.every((color) =>
          ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(color)),
        ))) &&
    (value.manaValueMax === undefined || validateAmount(value.manaValueMax)) &&
    (value.sharesCreatureSubtypeWithFirstTarget === undefined ||
      typeof value.sharesCreatureSubtypeWithFirstTarget === 'boolean') &&
    (value.anyOf === undefined ||
      (Array.isArray(value.anyOf) && value.anyOf.every(validateConstraints)))
  )
}

const validateRuntimeValueSource = (value: unknown): boolean =>
  isRecord(value) &&
  ((value.type === 'VARIABLE' &&
    exactKeys(value, ['type', 'name']) &&
    typeof value.name === 'string' &&
    value.name.length > 0) ||
    (value.type === 'LITERAL' &&
      exactKeys(value, ['type', 'value']) &&
      (typeof value.value === 'string' ||
        (typeof value.value === 'number' && Number.isFinite(value.value)) ||
        typeof value.value === 'boolean')))

const validateStaticCondition = (value: unknown): boolean =>
  isRecord(value) &&
  ((value.type === 'CONTROL_COUNT_AT_LEAST' &&
    exactKeys(value, ['type', 'query', 'count']) &&
    validateObjectQuery(value.query) &&
    typeof value.count === 'number' &&
    Number.isSafeInteger(value.count) &&
    value.count >= 0) ||
    (value.type === 'DEVOTION_COMPARE' &&
      exactKeys(value, ['type', 'color', 'operator', 'value']) &&
      ['W', 'U', 'B', 'R', 'G'].includes(String(value.color)) &&
      ['LT', 'GTE'].includes(String(value.operator)) &&
      typeof value.value === 'number' &&
      Number.isSafeInteger(value.value) &&
      value.value >= 0) ||
    (value.type === 'SOURCE_CONTROLLER_LIFE_AT_LEAST' &&
      exactKeys(value, ['type', 'value']) &&
      typeof value.value === 'number' &&
      Number.isSafeInteger(value.value) &&
      value.value >= 0) ||
    (value.type === 'SOURCE_CONTROLLER_IS_ACTIVE_PLAYER' &&
      exactKeys(value, ['type'])) ||
    (value.type === 'SOURCE_IS_UNTAPPED' && exactKeys(value, ['type'])) ||
    (value.type === 'PERMANENT_ENTERED_THIS_TURN' &&
      exactKeys(value, ['type', 'query']) &&
      validateObjectQuery(value.query)) ||
    (value.type === 'ATTACKED_WITH_CREATURES_AT_LEAST' &&
      exactKeys(value, ['type', 'count']) &&
      typeof value.count === 'number' &&
      Number.isSafeInteger(value.count) &&
      value.count >= 0))

const validateEffect = (
  value: unknown,
  errors: string[],
): value is EffectDefinition => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    errors.push(
      `Unknown or invalid effect: ${isRecord(value) ? String(value.type) : 'unknown'}.`,
    )
    return false
  }
  if (value.type === 'PLAYER_SELECTION') {
    const valid =
      exactKeys(value, ['type', 'prompt', 'relation', 'effects']) &&
      typeof value.prompt === 'string' &&
      ['YOU', 'OPPONENT', 'ANY'].includes(String(value.relation)) &&
      Array.isArray(value.effects) &&
      value.effects.every((effect) => validateEffect(effect, errors))
    if (!valid) errors.push('PLAYER_SELECTION is invalid.')
    return valid
  }
  if (value.type === 'FOR_EACH_PLAYER') {
    const valid =
      exactKeys(value, ['type', 'relation', 'effects']) &&
      ['OPPONENTS_OF_SOURCE_CONTROLLER', 'ALL_PLAYERS'].includes(
        String(value.relation),
      ) &&
      Array.isArray(value.effects) &&
      value.effects.every((effect) => validateEffect(effect, errors))
    if (!valid) errors.push('FOR_EACH_PLAYER is invalid.')
    return valid
  }
  if (
    value.type === 'DRAW_FOR_PLAYER' ||
    value.type === 'GAIN_LIFE_FOR_PLAYER' ||
    value.type === 'SCRY_PLAYER' ||
    value.type === 'SURVEIL_PLAYER' ||
    value.type === 'MILL_PLAYER'
  ) {
    const valid =
      exactKeys(value, ['type', 'player', 'amount']) &&
      validatePlayerReference(value.player) &&
      validateAmount(value.amount)
    if (!valid) errors.push(`${value.type} is invalid.`)
    return valid
  }
  if (value.type === 'SHUFFLE_PLAYER_ZONES_INTO_LIBRARY') {
    const valid =
      exactKeys(value, ['type', 'player', 'zones']) &&
      validatePlayerReference(value.player) &&
      Array.isArray(value.zones) &&
      value.zones.every((zone) => zone === 'hand' || zone === 'graveyard')
    if (!valid) errors.push('SHUFFLE_PLAYER_ZONES_INTO_LIBRARY is invalid.')
    return valid
  }
  if (value.type === 'CONTROL_PLAYER') {
    const valid =
      exactKeys(value, ['type', 'player', 'controller', 'duration']) &&
      validatePlayerReference(value.player) &&
      validatePlayerReference(value.controller) &&
      (value.duration === 'NEXT_COMBAT' || value.duration === 'NEXT_TURN')
    if (!valid) errors.push('CONTROL_PLAYER is invalid.')
    return valid
  }
  if (value.type === 'CONTROL_ATTACHED_OBJECT') {
    const valid =
      exactKeys(value, ['type', 'controller']) &&
      validatePlayerReference(value.controller)
    if (!valid) errors.push('CONTROL_ATTACHED_OBJECT is invalid.')
    return valid
  }
  if (value.type === 'COPY_OBJECT_CHARACTERISTICS') {
    const valid =
      exactKeys(value, ['type', 'target', 'source', 'duration']) &&
      references.includes(String(value.target)) &&
      references.includes(String(value.source)) &&
      value.duration === 'WHILE_SOURCE_ON_BATTLEFIELD'
    if (!valid) errors.push('COPY_OBJECT_CHARACTERISTICS is invalid.')
    return valid
  }
  if (value.type === 'CREATE_TOKEN') {
    const valid =
      Object.keys(value).every((key) =>
        ['type', 'tokenId', 'amount', 'player', 'tapped'].includes(key),
      ) &&
      ['type', 'tokenId', 'amount'].every((key) => key in value) &&
      typeof value.tokenId === 'string' &&
      Boolean(tokenDefinitions[value.tokenId]) &&
      validateAmount(value.amount) &&
      (value.player === undefined || validatePlayerReference(value.player)) &&
      (value.tapped === undefined || typeof value.tapped === 'boolean')
    if (!valid) errors.push('CREATE_TOKEN is invalid.')
    return valid
  }
  if (value.type === 'DRAW_CARD') {
    const valid =
      exactKeys(value, ['type', 'amount']) && validateAmount(value.amount)
    if (!valid) errors.push('DRAW_CARD is invalid.')
    return valid
  }
  if (value.type === 'MOVE_ZONE') {
    const valid =
      Object.keys(value).every((key) =>
        ['type', 'target', 'destination', 'controller'].includes(key),
      ) &&
      ['type', 'target', 'destination'].every((key) => key in value) &&
      references.includes(String(value.target)) &&
      zones.includes(value.destination as Zone) &&
      (value.controller === undefined ||
        value.controller === 'OWNER' ||
        value.controller === 'PRESERVE')
    if (!valid) errors.push('MOVE_ZONE is invalid.')
    return valid
  }
  if (
    value.type === 'TRANSFORM_PERMANENT' ||
    value.type === 'PHASE_OUT_PERMANENT'
  ) {
    const valid =
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))
    if (!valid) errors.push(`${String(value.type)} is invalid.`)
    return valid
  }
  if (value.type === 'UNTAP_PERMANENT') {
    const valid =
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))
    if (!valid) errors.push('UNTAP_PERMANENT is invalid.')
    return valid
  }
  if (value.type === 'TAP_PERMANENT') {
    const valid =
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))
    if (!valid) errors.push('TAP_PERMANENT is invalid.')
    return valid
  }
  if (value.type === 'ADD_COUNTER') {
    const valid =
      exactKeys(value, ['type', 'target', 'counterType', 'amount']) &&
      references.includes(String(value.target)) &&
      typeof value.counterType === 'string' &&
      value.counterType.length > 0 &&
      validateAmount(value.amount)
    if (!valid) errors.push('ADD_COUNTER is invalid.')
    return valid
  }
  if (value.type === 'PUT_EVENT_COUNTERS') {
    const valid =
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))
    if (!valid) errors.push('PUT_EVENT_COUNTERS is invalid.')
    return valid
  }
  if (value.type === 'MOVE_COUNTERS_BETWEEN_TARGETS') {
    const valid =
      Object.keys(value).every((key) =>
        ['type', 'from', 'to', 'prompt'].includes(key),
      ) &&
      references.includes(String(value.from)) &&
      references.includes(String(value.to)) &&
      (value.prompt === undefined || typeof value.prompt === 'string')
    if (!valid) errors.push('MOVE_COUNTERS_BETWEEN_TARGETS is invalid.')
    return valid
  }
  if (value.type === 'DISTRIBUTE_COUNTERS') {
    const valid =
      Object.keys(value).every((key) =>
        ['type', 'counterType', 'amount', 'query', 'prompt'].includes(key),
      ) &&
      typeof value.counterType === 'string' &&
      value.counterType.length > 0 &&
      validateAmount(value.amount) &&
      validateObjectQuery(value.query) &&
      (value.prompt === undefined || typeof value.prompt === 'string')
    if (!valid) errors.push('DISTRIBUTE_COUNTERS is invalid.')
    return valid
  }
  if (value.type === 'ADD_MANA') {
    const valid =
      exactKeys(value, ['type', 'color', 'amount']) &&
      ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(value.color)) &&
      typeof value.amount === 'number' &&
      Number.isSafeInteger(value.amount) &&
      value.amount > 0
    if (!valid) errors.push('ADD_MANA is invalid.')
    return valid
  }
  if (value.type === 'ADD_MANA_CHOICE') {
    const valid =
      exactKeys(value, ['type', 'player', 'allowedColors', 'amount']) &&
      validatePlayerReference(value.player) &&
      ((Array.isArray(value.allowedColors) &&
        value.allowedColors.every((color) =>
          ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(color)),
        )) ||
        (isRecord(value.allowedColors) &&
          exactKeys(value.allowedColors, ['type']) &&
          value.allowedColors.type === 'COMMANDER_COLOR_IDENTITY')) &&
      validateAmount(value.amount)
    if (!valid) errors.push('ADD_MANA_CHOICE is invalid.')
    return valid
  }
  if (value.type === 'ADD_MANA_FROM_LINKED_COLORS') {
    const valid =
      exactKeys(value, ['type', 'player', 'key', 'amount']) &&
      validatePlayerReference(value.player) &&
      typeof value.key === 'string' &&
      value.key.length > 0 &&
      validateAmount(value.amount)
    if (!valid) errors.push('ADD_MANA_FROM_LINKED_COLORS is invalid.')
    return valid
  }
  if (value.type === 'ADD_MANA_FROM_PUBLIC_ZONE_COLORS') {
    const valid =
      exactKeys(value, ['type', 'player', 'query', 'amount']) &&
      validatePlayerReference(value.player) &&
      validateObjectQuery(value.query) &&
      validateAmount(value.amount)
    if (!valid) errors.push('ADD_MANA_FROM_PUBLIC_ZONE_COLORS is invalid.')
    return valid
  }
  if (value.type === 'SELECT_HIDDEN_ZONE_CARD') {
    const valid =
      Object.keys(value).every((key) =>
        [
          'type',
          'player',
          'zone',
          'prompt',
          'constraints',
          'destination',
          'count',
          'allowFail',
          'linkKey',
          'lookAtTop',
        ].includes(key),
      ) &&
      ['type', 'player', 'zone', 'prompt', 'constraints', 'destination'].every(
        (key) => key in value,
      ) &&
      validatePlayerReference(value.player) &&
      (value.zone === 'hand' || value.zone === 'library') &&
      typeof value.prompt === 'string' &&
      value.prompt.length > 0 &&
      validateConstraints(value.constraints) &&
      zones.includes(value.destination as Zone) &&
      (value.count === undefined || validateAmount(value.count)) &&
      (value.allowFail === undefined || typeof value.allowFail === 'boolean') &&
      (value.linkKey === undefined ||
        (typeof value.linkKey === 'string' && value.linkKey.length > 0)) &&
      (value.lookAtTop === undefined || validateAmount(value.lookAtTop))
    if (!valid) errors.push('SELECT_HIDDEN_ZONE_CARD is invalid.')
    return valid
  }
  if (value.type === 'SELECT_PUBLIC_ZONE_CARD') {
    const valid =
      Object.keys(value).every((key) =>
        [
          'type',
          'player',
          'zone',
          'prompt',
          'constraints',
          'allowFail',
          'linkKey',
          'knownBecause',
        ].includes(key),
      ) &&
      ['type', 'player', 'zone', 'prompt', 'constraints'].every(
        (key) => key in value,
      ) &&
      validatePlayerReference(value.player) &&
      (value.zone === 'graveyard' || value.zone === 'exile') &&
      typeof value.prompt === 'string' &&
      value.prompt.length > 0 &&
      validateConstraints(value.constraints) &&
      (value.allowFail === undefined || typeof value.allowFail === 'boolean') &&
      (value.linkKey === undefined ||
        (typeof value.linkKey === 'string' && value.linkKey.length > 0)) &&
      (value.knownBecause === undefined ||
        ['DECLARED', 'REVEALED', 'SEARCHED', 'MILLED'].includes(
          String(value.knownBecause),
        ))
    if (!valid) errors.push('SELECT_PUBLIC_ZONE_CARD is invalid.')
    return valid
  }
  if (value.type === 'CAST_LINKED_CARD_WITHOUT_PAYING_MANA_COST') {
    const valid =
      Object.keys(value).every((key) =>
        ['type', 'key', 'fromZone', 'exileIfWouldEnterGraveyard'].includes(key),
      ) &&
      typeof value.key === 'string' &&
      value.key.length > 0 &&
      (value.fromZone === undefined ||
        value.fromZone === 'exile' ||
        value.fromZone === 'graveyard') &&
      (value.exileIfWouldEnterGraveyard === undefined ||
        typeof value.exileIfWouldEnterGraveyard === 'boolean')
    if (!valid)
      errors.push('CAST_LINKED_CARD_WITHOUT_PAYING_MANA_COST is invalid.')
    return valid
  }
  if (value.type === 'COUNTER_SPELL') {
    const validKeys =
      exactKeys(value, ['type', 'target']) ||
      exactKeys(value, ['type', 'target', 'destination'])
    const valid =
      validKeys &&
      references.includes(String(value.target)) &&
      (value.destination === undefined ||
        value.destination === 'graveyard' ||
        value.destination === 'exile')
    if (!valid) errors.push('COUNTER_SPELL is invalid.')
    return valid
  }
  if (value.type === 'DESTROY_PERMANENT') {
    const valid =
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))
    if (!valid) errors.push('DESTROY_PERMANENT is invalid.')
    return valid
  }
  if (value.type === 'CHANGE_CONTROLLER') {
    const valid =
      exactKeys(value, ['type', 'target', 'controller']) &&
      references.includes(String(value.target)) &&
      [
        'SOURCE_CONTROLLER',
        'EVENT_PLAYER',
        'ACTIVE_PLAYER',
        'TARGET_PLAYER',
        'DEFENDING_PLAYER',
      ].includes(String(value.controller))
    if (!valid) errors.push('CHANGE_CONTROLLER is invalid.')
    return valid
  }
  if (value.type === 'ATTACH') {
    const valid =
      exactKeys(value, ['type', 'attachment', 'target']) &&
      references.includes(String(value.attachment)) &&
      references.includes(String(value.target))
    if (!valid) errors.push('ATTACH is invalid.')
    return valid
  }
  if (value.type === 'DETACH') {
    const valid =
      exactKeys(value, ['type', 'attachment']) &&
      references.includes(String(value.attachment))
    if (!valid) errors.push('DETACH is invalid.')
    return valid
  }
  if (value.type === 'CREATE_TOKEN_COPY') {
    const overridesValid =
      value.overrides === undefined ||
      (isRecord(value.overrides) &&
        Object.keys(value.overrides).every((key) =>
          [
            'power',
            'toughness',
            'colors',
            'addSubtypes',
            'removeLegendary',
          ].includes(key),
        ) &&
        (value.overrides.power === undefined ||
          typeof value.overrides.power === 'string') &&
        (value.overrides.toughness === undefined ||
          typeof value.overrides.toughness === 'string') &&
        (value.overrides.colors === undefined ||
          (Array.isArray(value.overrides.colors) &&
            value.overrides.colors.every((color) =>
              ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(color)),
            ))) &&
        (value.overrides.addSubtypes === undefined ||
          (Array.isArray(value.overrides.addSubtypes) &&
            value.overrides.addSubtypes.every(
              (subtype) => typeof subtype === 'string',
            ))) &&
        (value.overrides.removeLegendary === undefined ||
          typeof value.overrides.removeLegendary === 'boolean'))
    const valid =
      Object.keys(value).every((key) =>
        ['type', 'target', 'amount', 'removeLegendary', 'overrides'].includes(
          key,
        ),
      ) &&
      ['type', 'target', 'amount'].every((key) => key in value) &&
      references.includes(String(value.target)) &&
      validateAmount(value.amount) &&
      (value.removeLegendary === undefined ||
        typeof value.removeLegendary === 'boolean') &&
      overridesValid
    if (!valid) errors.push('CREATE_TOKEN_COPY is invalid.')
    return valid
  }
  if (value.type === 'ENCORE') {
    const valid = exactKeys(value, ['type'])
    if (!valid) errors.push('ENCORE is invalid.')
    return valid
  }
  if (value.type === 'COPY_SPELL') {
    const valid =
      Object.keys(value).every((key) =>
        [
          'type',
          'target',
          'controller',
          'chooseNewTargets',
          'removeLegendary',
        ].includes(key),
      ) &&
      ['type', 'target'].every((key) => key in value) &&
      references.includes(String(value.target)) &&
      (value.controller === undefined ||
        [
          'SOURCE_CONTROLLER',
          'EVENT_PLAYER',
          'ACTIVE_PLAYER',
          'TARGET_PLAYER',
          'DEFENDING_PLAYER',
        ].includes(String(value.controller))) &&
      (value.chooseNewTargets === undefined ||
        typeof value.chooseNewTargets === 'boolean') &&
      (value.removeLegendary === undefined ||
        typeof value.removeLegendary === 'boolean')
    if (!valid) errors.push('COPY_SPELL is invalid.')
    return valid
  }
  if (value.type === 'RESET_STACK_TARGETS') {
    const valid =
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))
    if (!valid) errors.push('RESET_STACK_TARGETS is invalid.')
    return valid
  }
  if (value.type === 'RETARGET_STACK_OBJECT') {
    const valid =
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))
    if (!valid) errors.push('RETARGET_STACK_OBJECT is invalid.')
    return valid
  }
  if (value.type === 'LINK_OBJECT') {
    const returnRule = value.returnOnSourceLeaves
    const validReturnRule =
      returnRule === undefined ||
      (isRecord(returnRule) &&
        Object.keys(returnRule).every((key) =>
          ['fromZone', 'destination', 'controller'].includes(key),
        ) &&
        zones.includes(returnRule.fromZone as Zone) &&
        zones.includes(returnRule.destination as Zone) &&
        (returnRule.controller === undefined ||
          returnRule.controller === 'OWNER' ||
          returnRule.controller === 'PRESERVE'))
    const valid =
      Object.keys(value).every((key) =>
        ['type', 'target', 'key', 'returnOnSourceLeaves'].includes(key),
      ) &&
      references.includes(String(value.target)) &&
      typeof value.key === 'string' &&
      value.key.length > 0 &&
      validReturnRule
    if (!valid) errors.push('LINK_OBJECT is invalid.')
    return valid
  }
  if (value.type === 'RETURN_LINKED_OBJECTS') {
    const valid =
      Object.keys(value).every((key) =>
        ['type', 'key', 'destination', 'controller'].includes(key),
      ) &&
      ['type', 'key', 'destination'].every((key) => key in value) &&
      typeof value.key === 'string' &&
      value.key.length > 0 &&
      zones.includes(value.destination as Zone) &&
      (value.controller === undefined ||
        value.controller === 'OWNER' ||
        value.controller === 'PRESERVE')
    if (!valid) errors.push('RETURN_LINKED_OBJECTS is invalid.')
    return valid
  }
  if (value.type === 'DEAL_DAMAGE') {
    const valid =
      exactKeys(value, ['type', 'target', 'amount', 'damageKind']) &&
      references.includes(String(value.target)) &&
      validateAmount(value.amount) &&
      value.damageKind === 'NONCOMBAT'
    if (!valid) errors.push('DEAL_DAMAGE is invalid.')
    return valid
  }
  if (value.type === 'SET_BASE_POWER_TOUGHNESS') {
    const valid =
      exactKeys(value, ['type', 'target', 'power', 'toughness', 'duration']) &&
      references.includes(String(value.target)) &&
      validateAmount(value.power) &&
      validateAmount(value.toughness) &&
      value.duration === 'UNTIL_END_OF_TURN'
    if (!valid) errors.push('SET_BASE_POWER_TOUGHNESS is invalid.')
    return valid
  }
  if (value.type === 'REMOVE_ALL_COUNTERS') {
    const valid =
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))
    if (!valid) errors.push('REMOVE_ALL_COUNTERS is invalid.')
    return valid
  }
  if (value.type === 'ADD_CREATURE_SUBTYPE') {
    const valid =
      exactKeys(value, ['type', 'target', 'subtype', 'duration']) &&
      references.includes(String(value.target)) &&
      validateRuntimeTextReference(value.subtype) &&
      value.duration === 'UNTIL_END_OF_TURN'
    if (!valid) errors.push('ADD_CREATURE_SUBTYPE is invalid.')
    return valid
  }
  if (value.type === 'SET_COLORS') {
    const valid =
      exactKeys(value, ['type', 'target', 'colors', 'duration']) &&
      references.includes(String(value.target)) &&
      Array.isArray(value.colors) &&
      value.colors.every((color) =>
        ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(color)),
      ) &&
      value.duration === 'UNTIL_END_OF_TURN'
    if (!valid) errors.push('SET_COLORS is invalid.')
    return valid
  }
  if (value.type === 'GRANT_PROTECTION') {
    const protection = value.protection
    const valid =
      exactKeys(value, ['type', 'target', 'protection', 'duration']) &&
      references.includes(String(value.target)) &&
      isRecord(protection) &&
      ((protection.type === 'EVERYTHING' && exactKeys(protection, ['type'])) ||
        (protection.type === 'CARD_TYPE' &&
          exactKeys(protection, ['type', 'cardType']) &&
          validateRuntimeTextReference(protection.cardType)) ||
        (protection.type === 'COLORS' &&
          exactKeys(protection, ['type', 'colors']) &&
          Array.isArray(protection.colors) &&
          protection.colors.every((color) =>
            ['W', 'U', 'B', 'R', 'G'].includes(String(color)),
          ))) &&
      ['UNTIL_END_OF_TURN', 'UNTIL_SOURCE_CONTROLLER_NEXT_TURN'].includes(
        String(value.duration),
      )
    if (!valid) errors.push('GRANT_PROTECTION is invalid.')
    return valid
  }
  if (value.type === 'PREVENT_NEXT_DAMAGE') {
    const valid =
      exactKeys(value, ['type', 'target', 'amount', 'duration']) &&
      references.includes(String(value.target)) &&
      validateAmount(value.amount) &&
      value.duration === 'UNTIL_END_OF_TURN'
    if (!valid) errors.push('PREVENT_NEXT_DAMAGE is invalid.')
    return valid
  }
  if (value.type === 'ADD_PLAYER_RULE') {
    const rules = value.rules
    const valid =
      exactKeys(value, ['type', 'player', 'rules', 'duration']) &&
      validatePlayerReference(value.player) &&
      isRecord(rules) &&
      Object.keys(rules).every((key) =>
        [
          'hexproof',
          'protectionFromEverything',
          'lifeTotalCannotChange',
          'cannotLoseLife',
          'cannotWinOrLose',
        ].includes(key),
      ) &&
      Object.values(rules).every((entry) => typeof entry === 'boolean') &&
      ['UNTIL_END_OF_TURN', 'UNTIL_PLAYER_NEXT_TURN'].includes(
        String(value.duration),
      )
    if (!valid) errors.push('ADD_PLAYER_RULE is invalid.')
    return valid
  }
  if (value.type === 'AIRBEND') {
    const valid =
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))
    if (!valid) errors.push('AIRBEND is invalid.')
    return valid
  }
  if (value.type === 'PUT_SOURCE_ONTO_BATTLEFIELD_ATTACKING') {
    const defendingTarget = value.defendingTarget
    const validTarget =
      isRecord(defendingTarget) &&
      ((defendingTarget.type === 'PLAYER' &&
        exactKeys(defendingTarget, ['type', 'player']) &&
        validatePlayerReference(defendingTarget.player)) ||
        (defendingTarget.type === 'PERMANENT' &&
          exactKeys(defendingTarget, ['type', 'target']) &&
          references.includes(String(defendingTarget.target))))
    const valid =
      exactKeys(value, ['type', 'defendingTarget']) && validTarget
    if (!valid)
      errors.push('PUT_SOURCE_ONTO_BATTLEFIELD_ATTACKING is invalid.')
    return valid
  }
  if (value.type === 'ADD_RESTRICTED_MANA') {
    const valid =
      exactKeys(value, ['type', 'color', 'amount', 'restriction']) &&
      ['W', 'U', 'B', 'R', 'G', 'C'].includes(String(value.color)) &&
      typeof value.amount === 'number' &&
      Number.isSafeInteger(value.amount) &&
      value.amount > 0 &&
      value.restriction === 'CREATURE_SPELLS_ONLY'
    if (!valid) errors.push('ADD_RESTRICTED_MANA is invalid.')
    return valid
  }
  if (value.type === 'TEMPORARY_MODIFIER') {
    const valid =
      Object.keys(value).every((key) =>
        [
          'type',
          'target',
          'power',
          'toughness',
          'grantKeywords',
          'duration',
        ].includes(key),
      ) &&
      ['type', 'target', 'duration'].every((key) => key in value) &&
      references.includes(String(value.target)) &&
      (value.power === undefined ||
        (typeof value.power === 'number' && Number.isFinite(value.power))) &&
      (value.toughness === undefined ||
        (typeof value.toughness === 'number' &&
          Number.isFinite(value.toughness))) &&
      (value.grantKeywords === undefined ||
        (Array.isArray(value.grantKeywords) &&
          value.grantKeywords.every((item) => typeof item === 'string'))) &&
      value.duration === 'UNTIL_END_OF_TURN'
    if (!valid) errors.push('TEMPORARY_MODIFIER is invalid.')
    return valid
  }
  if (value.type === 'GRANT_TRIGGERED_ABILITY_UNTIL_END_OF_TURN') {
    const valid =
      exactKeys(value, ['type', 'target', 'ability']) &&
      references.includes(String(value.target)) &&
      validateGrantedTriggeredAbility(value.ability, errors)
    if (!valid)
      errors.push('GRANT_TRIGGERED_ABILITY_UNTIL_END_OF_TURN is invalid.')
    return valid
  }
  if (value.type === 'ADD_UNTAP_RESTRICTION') {
    const valid =
      exactKeys(value, ['type', 'target', 'duration']) &&
      references.includes(String(value.target)) &&
      value.duration === 'WHILE_SOURCE_CONTROLLED'
    if (!valid) errors.push('ADD_UNTAP_RESTRICTION is invalid.')
    return valid
  }
  if (value.type === 'QUEUE_EXTRA_TURN') {
    const valid =
      exactKeys(value, ['type', 'player']) &&
      [
        'SOURCE_CONTROLLER',
        'EVENT_PLAYER',
        'ACTIVE_PLAYER',
        'TARGET_PLAYER',
        'DEFENDING_PLAYER',
      ].includes(String(value.player))
    if (!valid) errors.push('QUEUE_EXTRA_TURN is invalid.')
    return valid
  }
  if (value.type === 'SKIP_NEXT_COMBAT_PHASES') {
    const valid =
      exactKeys(value, ['type', 'player']) && validatePlayerReference(value.player)
    if (!valid) errors.push('SKIP_NEXT_COMBAT_PHASES is invalid.')
    return valid
  }
  if (value.type === 'END_TURN' || value.type === 'ENTERS_TAPPED') {
    const valid = exactKeys(value, ['type'])
    if (!valid) errors.push(`${value.type} is invalid.`)
    return valid
  }
  if (value.type === 'CHANGE_LAND_SUBTYPE') {
    const valid =
      Object.keys(value).every((key) =>
        [
          'type',
          'target',
          'subtype',
          'mode',
          'duration',
          'counterType',
        ].includes(key),
      ) &&
      ['type', 'target', 'subtype', 'mode', 'duration'].every(
        (key) => key in value,
      ) &&
      references.includes(String(value.target)) &&
      validateRuntimeTextReference(value.subtype) &&
      (value.mode === 'ADD' || value.mode === 'SET') &&
      (value.duration === 'UNTIL_END_OF_TURN' ||
        value.duration === 'WHILE_COUNTER_PRESENT') &&
      (value.counterType === undefined ||
        typeof value.counterType === 'string') &&
      (value.duration !== 'WHILE_COUNTER_PRESENT' ||
        (typeof value.counterType === 'string' && value.counterType.length > 0))
    if (!valid) errors.push('CHANGE_LAND_SUBTYPE is invalid.')
    return valid
  }
  if (value.type === 'CANNOT_BE_BLOCKED') {
    const valid =
      exactKeys(value, ['type', 'target', 'duration']) &&
      references.includes(String(value.target)) &&
      value.duration === 'UNTIL_END_OF_TURN'
    if (!valid) errors.push('CANNOT_BE_BLOCKED is invalid.')
    return valid
  }
  if (value.type === 'DISCARD_CARD') {
    const valid =
      exactKeys(value, ['type', 'player', 'amount']) &&
      value.player === 'YOU' &&
      validateAmount(value.amount)
    if (!valid) errors.push('DISCARD_CARD is invalid.')
    return valid
  }
  if (value.type === 'SACRIFICE') {
    const valid =
      exactKeys(value, ['type', 'target']) &&
      references.includes(String(value.target))
    if (!valid) errors.push('SACRIFICE is invalid.')
    return valid
  }
  if (value.type === 'SET_VARIABLE') {
    const valid =
      exactKeys(value, ['type', 'variableName', 'value']) &&
      typeof value.variableName === 'string' &&
      value.variableName.length > 0 &&
      validateAmount(value.value)
    if (!valid) errors.push('SET_VARIABLE is invalid.')
    return valid
  }
  if (value.type === 'FOR_EACH_SELECTED') {
    const valid =
      Object.keys(value).every((key) =>
        ['type', 'selection', 'filter', 'effects'].includes(key),
      ) &&
      (value.selection === 'TARGETS' || value.selection === 'CARDS') &&
      (value.filter === undefined || validateObjectQuery(value.filter)) &&
      Array.isArray(value.effects) &&
      value.effects.every((effect) => validateEffect(effect, errors))
    if (!valid) errors.push('FOR_EACH_SELECTED is invalid.')
    return valid
  }
  if (value.type === 'DELAYED_EFFECT') {
    const valid =
      Object.keys(value).every((key) =>
        ['type', 'trigger', 'triggerPlayer', 'effects'].includes(key),
      ) &&
      isRecord(value.trigger) &&
      typeof value.trigger.type === 'string' &&
      (value.triggerPlayer === undefined ||
        [
          'SOURCE_CONTROLLER',
          'EVENT_PLAYER',
          'ACTIVE_PLAYER',
          'TARGET_PLAYER',
          'DEFENDING_PLAYER',
        ].includes(String(value.triggerPlayer))) &&
      Array.isArray(value.effects) &&
      value.effects.length > 0 &&
      value.effects.every((effect) => validateEffect(effect, errors))
    if (!valid) errors.push('DELAYED_EFFECT is invalid.')
    return valid
  }
  if (value.type === 'FOR_EACH') {
    const valid =
      exactKeys(value, ['type', 'query', 'effects']) &&
      isRecord(value.query) &&
      Array.isArray(value.effects) &&
      value.effects.every((effect) => validateEffect(effect, errors))
    if (!valid) errors.push('FOR_EACH is invalid.')
    return valid
  }
  if (value.type === 'CONDITIONAL_EFFECT') {
    const conditionValid =
      isRecord(value.condition) &&
      (value.condition.type === 'CURRENT_TURN_STEP_IS_MAIN_PHASE' ||
      value.condition.type === 'SOURCE_CONTROLLER_IS_ACTIVE_PLAYER' ||
      (value.condition.type === 'VALUE_COMPARE' &&
        validateAmount(value.condition.left) &&
        validateAmount(value.condition.right)) ||
        (value.condition.type === 'OBJECT_MATCHES_QUERY' &&
          references.includes(String(value.condition.object)) &&
          validateObjectQuery(value.condition.query)))
    const valid =
      conditionValid &&
      Array.isArray(value.ifTrue) &&
      value.ifTrue.every((effect) => validateEffect(effect, errors)) &&
      (value.ifFalse === undefined ||
        (Array.isArray(value.ifFalse) &&
          value.ifFalse.every((effect) => validateEffect(effect, errors))))
    if (!valid) errors.push('CONDITIONAL_EFFECT is invalid.')
    return valid
  }
  if (value.type === 'PAYMENT_BRANCH') {
    const valid =
      validatePlayerReference(value.payer) &&
      isRecord(value.cost) &&
      (value.cost.type === 'FIXED_MANA' ||
        value.cost.type === 'GENERIC_FROM_VALUE') &&
      Array.isArray(value.ifPaid) &&
      Array.isArray(value.ifNotPaid) &&
      value.ifPaid.every((effect) => validateEffect(effect, errors)) &&
      value.ifNotPaid.every((effect) => validateEffect(effect, errors))
    if (!valid) errors.push('PAYMENT_BRANCH is invalid.')
    return valid
  }
  if (value.type === 'CHOOSE_MODE') {
    const valid =
      typeof value.prompt === 'string' &&
      Array.isArray(value.modes) &&
      value.modes.every(
        (mode) =>
          isRecord(mode) &&
          typeof mode.id === 'string' &&
          typeof mode.label === 'string' &&
          Array.isArray(mode.effects) &&
          mode.effects.every((effect) => validateEffect(effect, errors)),
      )
    if (!valid) errors.push('CHOOSE_MODE is invalid.')
    return valid
  }
  if (value.type === 'CHOOSE_VALUE') {
    const allowedKeys = [
      'type',
      'prompt',
      'variableName',
      'options',
      'allowCustomValue',
      'customValueLabel',
    ]
    const optionsValid =
      value.options === undefined ||
      (Array.isArray(value.options) &&
        value.options.every(
          (option) =>
            isRecord(option) &&
            exactKeys(option, ['id', 'label', 'value']) &&
            typeof option.id === 'string' &&
            option.id.length > 0 &&
            typeof option.label === 'string' &&
            (typeof option.value === 'string' ||
              typeof option.value === 'number' ||
              typeof option.value === 'boolean'),
        ))
    const valid =
      Object.keys(value).every((key) => allowedKeys.includes(key)) &&
      ['type', 'prompt', 'variableName'].every((key) => key in value) &&
      typeof value.prompt === 'string' &&
      value.prompt.length > 0 &&
      typeof value.variableName === 'string' &&
      value.variableName.length > 0 &&
      optionsValid &&
      (value.allowCustomValue === undefined ||
        typeof value.allowCustomValue === 'boolean') &&
      (value.customValueLabel === undefined ||
        typeof value.customValueLabel === 'string') &&
      ((Array.isArray(value.options) && value.options.length > 0) ||
        value.allowCustomValue === true)
    if (!valid) errors.push('CHOOSE_VALUE is invalid.')
    return valid
  }
  if (value.type === 'STORE_SOURCE_VALUE') {
    const valid =
      exactKeys(value, ['type', 'key', 'value']) &&
      typeof value.key === 'string' &&
      value.key.length > 0 &&
      validateRuntimeValueSource(value.value)
    if (!valid) errors.push('STORE_SOURCE_VALUE is invalid.')
    return valid
  }
  if (value.type === 'SEARCH_LIBRARY_CARD') {
    const valid =
      Object.keys(value).every((key) =>
        [
          'type',
          'player',
          'prompt',
          'constraints',
          'reveal',
          'shuffle',
          'allowFail',
          'destination',
          'controller',
        ].includes(key),
      ) &&
      [
        'type',
        'player',
        'prompt',
        'constraints',
        'reveal',
        'shuffle',
        'destination',
      ].every((key) => key in value) &&
      validatePlayerReference(value.player) &&
      typeof value.prompt === 'string' &&
      validateConstraints(value.constraints) &&
      typeof value.reveal === 'boolean' &&
      typeof value.shuffle === 'boolean' &&
      (value.allowFail === undefined || typeof value.allowFail === 'boolean') &&
      ['TOP_OF_LIBRARY', 'hand', 'battlefield', 'graveyard', 'exile'].includes(
        String(value.destination),
      ) &&
      (value.controller === undefined ||
        value.controller === 'SOURCE_CONTROLLER' ||
        value.controller === 'OWNER')
    if (!valid) errors.push('SEARCH_LIBRARY_CARD is invalid.')
    return valid
  }
  if (value.type === 'PHYSICAL_CONFIRMATION') {
    const valid =
      exactKeys(value, ['type', 'prompt', 'effects']) &&
      typeof value.prompt === 'string' &&
      Array.isArray(value.effects) &&
      value.effects.every((effect) => validateEffect(effect, errors))
    if (!valid) errors.push('PHYSICAL_CONFIRMATION is invalid.')
    return valid
  }
  if (value.type === 'MOVE_UNKNOWN_HIDDEN_CARDS') {
    const valid =
      exactKeys(value, ['type', 'fromZone', 'toZone', 'amount']) &&
      (value.fromZone === 'library' || value.fromZone === 'hand') &&
      (value.toZone === 'library' || value.toZone === 'hand') &&
      validateAmount(value.amount)
    if (!valid) errors.push('MOVE_UNKNOWN_HIDDEN_CARDS is invalid.')
    return valid
  }
  if (value.type === 'SHUFFLE_LIBRARY') {
    const valid =
      exactKeys(value, ['type', 'player']) &&
      validatePlayerReference(value.player)
    if (!valid) errors.push('SHUFFLE_LIBRARY is invalid.')
    return valid
  }
  if (value.type === 'SET_PLAYER_MAX_HAND_SIZE') {
    const valid =
      exactKeys(value, ['type', 'player', 'value']) &&
      validatePlayerReference(value.player) &&
      (value.value === 'UNLIMITED' ||
        (typeof value.value === 'number' &&
          Number.isSafeInteger(value.value) &&
          value.value >= 0))
    if (!valid) errors.push('SET_PLAYER_MAX_HAND_SIZE is invalid.')
    return valid
  }
  if (
    value.type === 'OPTIONAL_EFFECT' ||
    value.type === 'TARGET_SELECTION' ||
    value.type === 'CARD_SELECTION'
  ) {
    const expected =
      value.type === 'OPTIONAL_EFFECT'
        ? ['type', 'prompt', 'effects']
        : [
            'type',
            'prompt',
            'constraints',
            'declarationConstraintOverrides',
            'effects',
            'count',
            'allowFewer',
          ]
    const keysValid =
      value.type === 'OPTIONAL_EFFECT'
        ? exactKeys(value, expected)
        : Object.keys(value).every((key) => expected.includes(key)) &&
          ['type', 'prompt', 'constraints', 'effects'].every(
            (key) => key in value,
          )
    const valid =
      keysValid &&
      typeof value.prompt === 'string' &&
      Array.isArray(value.effects) &&
      value.effects.every((effect) => validateEffect(effect, errors)) &&
      (value.type === 'OPTIONAL_EFFECT' ||
        (validateConstraints(value.constraints) &&
          (value.declarationConstraintOverrides === undefined ||
            (Array.isArray(value.declarationConstraintOverrides) &&
              value.declarationConstraintOverrides.every(
                (override) =>
                  isRecord(override) &&
                  exactKeys(override, [
                    'variableName',
                    'equals',
                    'constraints',
                  ]) &&
                  typeof override.variableName === 'string' &&
                  ['string', 'number', 'boolean'].includes(
                    typeof override.equals,
                  ) &&
                  validateConstraints(override.constraints),
              ))) &&
          (value.count === undefined || validateAmount(value.count)) &&
          (value.allowFewer === undefined ||
            typeof value.allowFewer === 'boolean')))
    if (!valid) errors.push(`${value.type} is invalid.`)
    return valid
  }
  errors.push(`Unknown or invalid effect: ${value.type}.`)
  return false
}

const validateGrantedTriggeredAbility = (
  value: unknown,
  errors: string[],
): boolean => {
  if (!isRecord(value)) return false
  const validKeys = Object.keys(value).every((key) =>
    [
      'id',
      'kind',
      'trigger',
      'conditions',
      'effects',
      'automation',
      'activeZones',
      'triggerLimit',
    ].includes(key),
  )
  if (
    !validKeys ||
    !['id', 'kind', 'trigger', 'conditions', 'effects', 'automation'].every(
      (key) => key in value,
    ) ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.kind !== 'TRIGGERED' ||
    !isRecord(value.trigger) ||
    !exactKeys(value.trigger, ['type']) ||
    ![
      'SPELL_CAST',
      'CARD_ENTERED_BATTLEFIELD',
      'PLAYER_GAINED_LIFE',
      'PLAYER_SHUFFLED',
      'PERMANENT_BECAME_TAPPED',
      'PERMANENT_TRANSFORMED',
      'ATTACKERS_DECLARED',
      'COMBAT_STARTED',
      'CREATURE_ATTACKED',
      'CREATURE_ATTACKED_UNBLOCKED',
      'BLOCKERS_DECLARED',
      'CREATURE_BECAME_BLOCKED',
      'CREATURE_BLOCKED',
      'DAMAGE_DEALT',
      'PLAYER_DEALT_DAMAGE',
      'CARD_LEFT_BATTLEFIELD',
      'CARD_DIED',
      'TURN_STARTED',
      'UPKEEP_STARTED',
      'DRAW_STEP_STARTED',
      'MAIN_PHASE_STARTED',
      'END_STEP_STARTED',
      'TURN_ENDED',
    ].includes(String(value.trigger.type)) ||
    !Array.isArray(value.conditions) ||
    !value.conditions.every((condition) => validateCondition(condition, errors)) ||
    !Array.isArray(value.effects) ||
    !value.effects.length ||
    !value.effects.every((effect) => validateEffect(effect, errors)) ||
    (value.activeZones !== undefined &&
      (!Array.isArray(value.activeZones) ||
        !value.activeZones.every((zone) => zones.includes(zone as Zone)))) ||
    (value.triggerLimit !== undefined &&
      value.triggerLimit !== 'ONCE_EACH_TURN') ||
    !['AUTO', 'ASSISTED', 'MANUAL'].includes(String(value.automation))
  )
    return false
  return true
}

/** Strictly validates the small, intentionally closed Ability DSL v1 schema. */
export const validateAbilityDefinition = (
  value: unknown,
): ValidationResult<AbilityDefinition> => {
  const errors: string[] = []
  if (isRecord(value) && value.kind === 'SPELL_EFFECT') {
    const valid =
      Object.keys(value).every((key) =>
        ['id', 'sourceCardName', 'kind', 'effects', 'gift', 'cannotBeCountered', 'automation'].includes(
          key,
        ),
      ) &&
      ['id', 'sourceCardName', 'kind', 'effects', 'automation'].every(
        (key) => key in value,
      ) &&
      typeof value.id === 'string' &&
      typeof value.sourceCardName === 'string' &&
      Array.isArray(value.effects) &&
      (value.effects.length > 0 || value.gift !== undefined) &&
      value.effects.every((effect) => validateEffect(effect, errors)) &&
      (value.cannotBeCountered === undefined || value.cannotBeCountered === true) &&
      (value.gift === undefined ||
        (isRecord(value.gift) &&
          Object.keys(value.gift).every((key) =>
            [
              'promisedVariableName',
              'recipientVariableName',
              'prompt',
              'recipientPrompt',
            ].includes(key),
          ) &&
          'promisedVariableName' in value.gift &&
          'recipientVariableName' in value.gift &&
          typeof value.gift.promisedVariableName === 'string' &&
          typeof value.gift.recipientVariableName === 'string' &&
          (value.gift.prompt === undefined ||
            typeof value.gift.prompt === 'string') &&
          (value.gift.recipientPrompt === undefined ||
            typeof value.gift.recipientPrompt === 'string'))) &&
      ['AUTO', 'ASSISTED', 'MANUAL'].includes(String(value.automation))
    return valid
      ? { valid: true, value: value as AbilityDefinition }
      : { valid: false, errors: [...errors, 'Spell effect is invalid.'] }
  }
  if (isRecord(value) && value.kind === 'ACTIVATED') {
    const valid =
      Object.keys(value).every((key) =>
        [
          'id',
          'sourceCardName',
          'kind',
          'costs',
          'effects',
          'restrictions',
          'activationConditions',
          'activeZones',
          'activationLimit',
          'isManaAbility',
          'automation',
        ].includes(key),
      ) &&
      ['id', 'sourceCardName', 'kind', 'costs', 'effects', 'automation'].every(
        (key) => key in value,
      ) &&
      typeof value.id === 'string' &&
      typeof value.sourceCardName === 'string' &&
      Array.isArray(value.costs) &&
      value.costs.every(
        (cost) =>
          isRecord(cost) &&
          ((cost.type === 'TAP_SOURCE' && exactKeys(cost, ['type'])) ||
            (cost.type === 'SACRIFICE_SOURCE' && exactKeys(cost, ['type'])) ||
            (cost.type === 'EXILE_SOURCE_FROM_GRAVEYARD' &&
              exactKeys(cost, ['type'])) ||
            (cost.type === 'EXILE_SOURCE_FROM_BATTLEFIELD' &&
              exactKeys(cost, ['type'])) ||
            (cost.type === 'REMOVE_COUNTERS_FROM_SOURCE' &&
              exactKeys(cost, ['type', 'counterType', 'amount']) &&
              typeof cost.counterType === 'string' &&
              cost.counterType.length > 0 &&
              validateAmount(cost.amount)) ||
            (cost.type === 'SACRIFICE_PERMANENT' &&
              exactKeys(cost, ['type', 'constraints', 'prompt']) &&
              validateConstraints(cost.constraints) &&
              typeof cost.prompt === 'string') ||
            (cost.type === 'MANA_COST' &&
              Object.keys(cost).every((key) =>
                ['type', 'cost', 'genericReduction'].includes(key),
              ) &&
              typeof cost.cost === 'string' &&
              (cost.genericReduction === undefined ||
                validateAmount(cost.genericReduction))) ||
            (cost.type === 'WATERBEND' &&
              exactKeys(cost, ['type', 'amount']) &&
              validateAmount(cost.amount)) ||
            (cost.type === 'LOYALTY' &&
              exactKeys(cost, ['type', 'amount']) &&
              typeof cost.amount === 'number' &&
              Number.isInteger(cost.amount)) ||
            (cost.type === 'DISCARD_SOURCE' && exactKeys(cost, ['type']))),
      ) &&
      Array.isArray(value.effects) &&
      value.effects.length > 0 &&
      value.effects.every((effect) => validateEffect(effect, errors)) &&
      (value.restrictions === undefined ||
        (Array.isArray(value.restrictions) &&
          value.restrictions.every((item) => typeof item === 'string'))) &&
      (value.activationConditions === undefined ||
        (Array.isArray(value.activationConditions) &&
          value.activationConditions.every(validateStaticCondition))) &&
      (value.activeZones === undefined ||
        (Array.isArray(value.activeZones) &&
          value.activeZones.every((zone) => zones.includes(zone as Zone)))) &&
      (value.activationLimit === undefined ||
        value.activationLimit === 'ONCE_PER_OBJECT') &&
      (value.isManaAbility === undefined ||
        typeof value.isManaAbility === 'boolean') &&
      ['AUTO', 'ASSISTED', 'MANUAL'].includes(String(value.automation))
    return valid
      ? { valid: true, value: value as AbilityDefinition }
      : { valid: false, errors: [...errors, 'Activated ability is invalid.'] }
  }
  if (isRecord(value) && value.kind === 'AS_ENTERS') {
    const valid =
      exactKeys(value, [
        'id',
        'sourceCardName',
        'kind',
        'effects',
        'automation',
      ]) &&
      typeof value.id === 'string' &&
      typeof value.sourceCardName === 'string' &&
      Array.isArray(value.effects) &&
      value.effects.length > 0 &&
      value.effects.every((effect) => validateEffect(effect, errors)) &&
      ['AUTO', 'ASSISTED', 'MANUAL'].includes(String(value.automation))
    return valid
      ? { valid: true, value: value as AbilityDefinition }
      : { valid: false, errors: [...errors, 'As-enters ability is invalid.'] }
  }
  if (isRecord(value) && value.kind === 'STATIC') {
    const validEffect = (effect: unknown): boolean =>
      isRecord(effect) &&
      ((effect.type === 'MODIFY_COST' &&
        Object.keys(effect).every((key) =>
          ['type', 'operation', 'amount', 'filter', 'condition', 'spellOrdinal'].includes(key),
        ) &&
        ['INCREASE_GENERIC_COST', 'REDUCE_GENERIC_COST'].includes(
          String(effect.operation),
        ) &&
        typeof effect.amount === 'number' &&
        Number.isSafeInteger(effect.amount) &&
        effect.amount >= 0 &&
        validateConstraints(effect.filter) &&
        (effect.condition === undefined || validateStaticCondition(effect.condition)) &&
        (effect.spellOrdinal === undefined ||
          effect.spellOrdinal === 'FIRST_MATCHING_EACH_TURN')) ||
        (effect.type === 'CAST_RESTRICTION' &&
          exactKeys(effect, ['type', 'filter', 'rule']) &&
          validateConstraints(effect.filter) &&
          effect.rule === 'MANA_VALUE_AT_MOST_LANDS_CONTROLLED') ||
        (effect.type === 'DRAW_LIMIT' &&
          exactKeys(effect, ['type', 'player', 'maxPerTurn']) &&
          effect.player === 'OPPONENT' &&
          typeof effect.maxPerTurn === 'number' &&
          Number.isSafeInteger(effect.maxPerTurn) &&
          effect.maxPerTurn >= 0) ||
        (effect.type === 'ENTERS_TAPPED_FILTER' &&
          exactKeys(effect, ['type', 'filter']) &&
          validateConstraints(effect.filter)) ||
        (effect.type === 'ATTACK_TAX' &&
          exactKeys(effect, [
            'type',
            'defendingPlayer',
            'genericPerAttacker',
          ]) &&
          effect.defendingPlayer === 'SOURCE_CONTROLLER' &&
          typeof effect.genericPerAttacker === 'number' &&
          Number.isSafeInteger(effect.genericPerAttacker) &&
          effect.genericPerAttacker >= 0) ||
        (effect.type === 'BLOCK_TAX' &&
          exactKeys(effect, ['type', 'attackingPlayer', 'genericPerBlocker']) &&
          effect.attackingPlayer === 'SOURCE_CONTROLLER' &&
          typeof effect.genericPerBlocker === 'number' &&
          Number.isSafeInteger(effect.genericPerBlocker) &&
          effect.genericPerBlocker >= 0) ||
        (effect.type === 'COMBAT_RESTRICTION' &&
          exactKeys(effect, ['type', 'rule', 'filter']) &&
          ['CANNOT_ATTACK', 'CANNOT_BLOCK', 'CANNOT_ATTACK_OR_BLOCK'].includes(
            String(effect.rule),
          ) &&
          validateConstraints(effect.filter)) ||
        (effect.type === 'UNTAP_RESTRICTION' &&
          exactKeys(effect, ['type', 'filter']) &&
          validateConstraints(effect.filter)) ||
        (effect.type === 'UNTAP_DURING_EACH_PLAYERS_UNTAP' &&
          exactKeys(effect, ['type', 'filter']) &&
          validateConstraints(effect.filter)) ||
        (effect.type === 'MODIFY_POWER_TOUGHNESS' &&
          Object.keys(effect).every((key) =>
            ['type', 'power', 'toughness', 'operation', 'filter', 'condition'].includes(key),
          ) &&
          (Number.isSafeInteger(effect.power) || validateAmount(effect.power)) &&
          (Number.isSafeInteger(effect.toughness) || validateAmount(effect.toughness)) &&
          (effect.operation === undefined || effect.operation === 'ADD') &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'BLOCKING_RESTRICTION' &&
          isRecord(effect.restriction) &&
          ((effect.restriction.type === 'CANNOT_BE_BLOCKED' &&
            validateConstraints(effect.restriction.filter)) ||
            (effect.restriction.type === 'LANDWALK' &&
              typeof effect.restriction.landSubtype === 'string' &&
              validateConstraints(effect.restriction.filter)) ||
            (effect.restriction.type === 'CANNOT_BE_BLOCKED_BY_POWER_AT_MOST' &&
              typeof effect.restriction.power === 'number' &&
              Number.isFinite(effect.restriction.power) &&
              validateConstraints(effect.restriction.filter)))) ||
        (effect.type === 'GRANT_KEYWORD' &&
          Object.keys(effect).every((key) =>
            ['type', 'keyword', 'filter', 'condition'].includes(key),
          ) &&
          ['type', 'keyword', 'filter'].every((key) => key in effect) &&
          typeof effect.keyword === 'string' &&
          effect.keyword.length > 0 &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined ||
            validateStaticCondition(effect.condition))) ||
        (effect.type === 'WARD' &&
          Object.keys(effect).every((key) => ['type', 'cost', 'filter', 'condition'].includes(key)) &&
          typeof effect.cost === 'string' &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'PROTECTION_FROM_COLORS' &&
          exactKeys(effect, ['type', 'colors', 'filter']) &&
          ((Array.isArray(effect.colors) &&
            effect.colors.every((color) =>
              ['W', 'U', 'B', 'R', 'G'].includes(String(color)),
            )) ||
            (isRecord(effect.colors) &&
              effect.colors.type === 'NOT_IN_COMMANDER_COLOR_IDENTITY')) &&
          validateConstraints(effect.filter)) ||
        (effect.type === 'SET_BASE_POWER_TOUGHNESS' &&
          Object.keys(effect).every((key) =>
            ['type', 'power', 'toughness', 'filter', 'condition'].includes(key),
          ) &&
          (Number.isSafeInteger(effect.power) || validateAmount(effect.power)) &&
          (Number.isSafeInteger(effect.toughness) || validateAmount(effect.toughness)) &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'ADD_CARD_TYPE' &&
          typeof effect.cardType === 'string' &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'REMOVE_CARD_TYPE' &&
          typeof effect.cardType === 'string' &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'SET_CREATURE_SUBTYPES' &&
          Array.isArray(effect.subtypes) &&
          effect.subtypes.every((subtype) => typeof subtype === 'string') &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'ADD_CREATURE_SUBTYPE' &&
          validateRuntimeTextReference(effect.subtype) &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'SET_NAME' &&
          typeof effect.name === 'string' &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'LOSE_ALL_ABILITIES' &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'GRANT_ACTIVATED_ABILITY' &&
          isRecord(effect.ability) &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'GRANT_TRIGGERED_ABILITY' &&
          validateGrantedTriggeredAbility(effect.ability, errors) &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'PREVENT_ALL_DAMAGE' &&
          validateConstraints(effect.filter) &&
          (effect.condition === undefined || validateStaticCondition(effect.condition))) ||
        (effect.type === 'PROTECTION_FROM_CARD_TYPES' &&
          Array.isArray(effect.cardTypes) &&
          effect.cardTypes.every((type) => typeof type === 'string') &&
          validateConstraints(effect.filter)) ||
        (effect.type === 'PROTECTION_FROM_EVERYTHING' &&
          validateConstraints(effect.filter)) ||
        (effect.type === 'MODIFY_TARGETING_COST' &&
          exactKeys(effect, [
            'type',
            'amount',
            'appliesTo',
            'targetFilter',
            'sourceController',
          ]) &&
          typeof effect.amount === 'number' &&
          Number.isSafeInteger(effect.amount) &&
          effect.amount >= 0 &&
          ['SPELL', 'ACTIVATED_ABILITY', 'BOTH'].includes(
            String(effect.appliesTo),
          ) &&
          effect.sourceController === 'OPPONENT' &&
          validateConstraints(effect.targetFilter)) ||
        (effect.type === 'SET_LAND_SUBTYPE' &&
          exactKeys(effect, ['type', 'subtype', 'filter']) &&
          typeof effect.subtype === 'string' &&
          effect.subtype.length > 0 &&
          validateConstraints(effect.filter)) ||
        (effect.type === 'SET_MAX_HAND_SIZE' &&
          validatePlayerReference(effect.player) &&
          (effect.value === 'UNLIMITED' ||
            (typeof effect.value === 'number' &&
              Number.isSafeInteger(effect.value)))) ||
        (effect.type === 'ALLOW_CAST_FROM_LIBRARY_TOP' &&
          exactKeys(effect, ['type', 'filter']) &&
          validateConstraints(effect.filter)) ||
        (effect.type === 'REPLACE_FIRST_TOKEN_CREATION_WITH_ATTACHED_COPIES' &&
          exactKeys(effect, ['type', 'optional']) &&
          typeof effect.optional === 'boolean'))
    const valid =
      exactKeys(value, ['id', 'sourceCardName', 'kind', 'effects']) &&
      typeof value.id === 'string' &&
      typeof value.sourceCardName === 'string' &&
      Array.isArray(value.effects) &&
      value.effects.length > 0 &&
      value.effects.every(validEffect)
    return valid
      ? { valid: true, value: value as AbilityDefinition }
      : { valid: false, errors: ['Static ability is invalid.'] }
  }
  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) =>
      ['id', 'sourceCardName', 'kind', 'trigger', 'conditions', 'effects', 'automation', 'activeZones', 'triggerLimit'].includes(key),
    ) ||
    !['id', 'sourceCardName', 'kind', 'trigger', 'conditions', 'effects', 'automation'].every((key) => key in value)
  )
    return { valid: false, errors: ['Ability has missing or unknown fields.'] }
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.sourceCardName !== 'string' ||
    !value.sourceCardName ||
    value.kind !== 'TRIGGERED'
  )
    errors.push('Ability identity fields are invalid.')
  if (
    !isRecord(value.trigger) ||
    !(
      exactKeys(value.trigger, ['type']) ||
      (value.trigger.type === 'PERMANENT_BECAME_TAPPED' &&
        exactKeys(value.trigger, ['type', 'oneOrMore']) &&
        value.trigger.oneOrMore === true)
    ) ||
    ![
      'SPELL_CAST',
      'CARD_ENTERED_BATTLEFIELD',
      'PLAYER_GAINED_LIFE',
      'PLAYER_SHUFFLED',
      'PERMANENT_BECAME_TAPPED',
      'PERMANENT_TRANSFORMED',
      'ATTACKERS_DECLARED',
      'COMBAT_STARTED',
      'CREATURE_ATTACKED',
      'CREATURE_ATTACKED_UNBLOCKED',
      'BLOCKERS_DECLARED',
      'CREATURE_BECAME_BLOCKED',
      'CREATURE_BLOCKED',
      'DAMAGE_DEALT',
      'PLAYER_DEALT_DAMAGE',
      'CARD_LEFT_BATTLEFIELD',
      'CARD_DIED',
      'TURN_STARTED',
      'UPKEEP_STARTED',
      'DRAW_STEP_STARTED',
      'MAIN_PHASE_STARTED',
      'END_STEP_STARTED',
      'TURN_ENDED',
    ].includes(String(value.trigger.type))
  )
    errors.push('Unknown or invalid trigger.')
  if (
    !Array.isArray(value.conditions) ||
    !value.conditions.every((condition) => validateCondition(condition, errors))
  )
    errors.push('Ability conditions are invalid.')
  if (
    !Array.isArray(value.effects) ||
    !value.effects.length ||
    !value.effects.every((effect) => validateEffect(effect, errors))
  )
    errors.push('Ability effects are invalid.')
  if (
    value.activeZones !== undefined &&
    (!Array.isArray(value.activeZones) ||
      !value.activeZones.every((zone) => zones.includes(zone as Zone)))
  )
    errors.push('Triggered ability activeZones are invalid.')
  if (value.triggerLimit !== undefined && value.triggerLimit !== 'ONCE_EACH_TURN')
    errors.push('Trigger limit is invalid.')
  if (!['AUTO', 'ASSISTED', 'MANUAL'].includes(String(value.automation)))
    errors.push('Automation level is invalid.')
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: value as AbilityDefinition }
}

export const validateAbilityDefinitions = (
  values: unknown[],
): ValidationResult<AbilityDefinition[]> => {
  const results = values.map(validateAbilityDefinition)
  const errors = results.flatMap((result) =>
    result.valid === false ? result.errors : [],
  )
  return errors.length
    ? { valid: false, errors }
    : {
        valid: true,
        value: results.map(
          (result) =>
            (result as { valid: true; value: AbilityDefinition }).value,
        ),
      }
}
