import type {
  AbilityCompilerCandidate,
  AbilityCompilerInput,
} from '../types/compilerTypes'

const namorPattern = (oracleText: string): boolean => {
  const text = oracleText.toLocaleLowerCase().replace(/\s+/g, ' ')
  return (
    /whenever you cast a noncreature spell/.test(text) &&
    /one or more (?:blue|\{u\}) mana symbols? in (?:that|its) mana cost/.test(
      text,
    ) &&
    /create (?:that many|a number of) 1\/1 blue merfolk creature tokens?/.test(
      text,
    )
  )
}

const hasTriggeredAbilityLanguage = (oracleText: string): boolean =>
  /\b(?:whenever|when|at the beginning)\b/i.test(oracleText)

const normalizeOracle = (oracleText: string): string =>
  oracleText.toLocaleLowerCase().replace(/\s+/g, ' ').trim()

const withoutReminderText = (oracleText: string): string =>
  oracleText
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const cosiPattern = (oracleText: string): boolean =>
  /whenever an opponent shuffles (?:their|his or her) library, you may put a \+1\/\+1 counter on this creature/.test(
    normalizeOracle(oracleText),
  )

const deeprootPattern = (oracleText: string): boolean =>
  /whenever one or more nontoken merfolk you control become tapped, create a 1\/1 blue merfolk creature token with hexproof/.test(
    normalizeOracle(oracleText),
  )

const merfolkCastTokenPattern = (oracleText: string): boolean =>
  /whenever you cast a merfolk spell, create a 1\/1 blue merfolk creature token with hexproof/.test(
    normalizeOracle(oracleText),
  )

const simpleTapMana = (
  oracleText: string,
): { color: 'W' | 'U' | 'B' | 'R' | 'G' | 'C'; amount: number } | undefined => {
  const match = /^\{t\}: add ((?:\{[wubrgc]\})+)\.?$/i.exec(oracleText.trim())
  if (!match) return undefined
  const symbols = [...match[1].matchAll(/\{([WUBRGC])\}/gi)].map((value) =>
    value[1].toUpperCase(),
  )
  if (!symbols.length || new Set(symbols).size !== 1) return undefined
  return {
    color: symbols[0] as 'W' | 'U' | 'B' | 'R' | 'G' | 'C',
    amount: symbols.length,
  }
}

const otherMerfolkBoost = (
  oracleText: string,
): { power: number; toughness: number } | undefined => {
  const match =
    /other merfolk creatures you control get \+(\d+)\/\+(\d+)/i.exec(oracleText)
  return match
    ? { power: Number(match[1]), toughness: Number(match[2]) }
    : undefined
}

const subtypeBoost = (text: string) =>
  /^(other )?([a-z]+)(?: creatures)? you control get \+(\d+)\/\+(\d+)\.?$/i.exec(
    text.trim(),
  )

const endStepUntapPattern = (text: string) =>
  /^at the beginning of your end step, untap all ([a-z]+) you control\.?$/i.exec(
    text.trim(),
  )

const rhysticPattern = (text: string) =>
  /whenever an opponent casts (?:a |an )?(noncreature )?spell, you may draw a card unless that player pays \{(\d+)\}\.?/i.exec(
    text,
  )

const cumulativeUpkeepCost = (text: string) =>
  /cumulative upkeep \{(\d+)\}/i.exec(text)?.[1]

const staticCostReduction = (text: string) =>
  /^([a-z]+) spells you cast cost \{(\d+)\} less to cast\.?$/i.exec(text.trim())

const tapDrawDiscard = (text: string): boolean =>
  /^\{t\}: draw a card, then discard a card\.?$/i.test(text.trim())

const massAttackingReturn = (text: string): boolean =>
  /^return all attacking creatures to their owners' hands\.?$/i.test(
    text.trim(),
  )

const hydroblastPattern = (text: string): boolean =>
  /^choose one —?\s*•?\s*counter target spell if it's red\.\s*•?\s*destroy target permanent if it's red\.?$/is.test(
    text.trim(),
  )

const subtypeCastTapUntap = (text: string) =>
  /^other ([a-z]+) creatures you control get \+(\d+)\/\+(\d+)\.\s*whenever you cast a \1 spell, you may tap or untap target permanent\.?$/is.exec(
    text.trim(),
  )

const cannotBeBlockedPattern = (text: string, cardName: string) => {
  const blue = /^blue creatures you control can't be blocked\.?$/i.exec(
    text.trim(),
  )
  if (blue)
    return {
      filter: {
        controller: 'YOU',
        cardType: 'Creature',
        colors: ['U' as const],
      },
    }
  const escaped = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const self = new RegExp(
    `^(?:this creature|${escaped}) can't be blocked\\.?$`,
    'i',
  ).test(text.trim())
  return self ? { filter: { sourceOnly: true } } : undefined
}

const islandwalkBoostPattern = (text: string) =>
  /^other ([a-z]+) creatures you control get \+(\d+)\/\+(\d+) and have islandwalk\.?$/i.exec(
    withoutReminderText(text),
  )

const merfolkSovereignPattern = (text: string) =>
  /^\{t\}: target ([a-z]+) creature can't be blocked this turn\.?$/i.exec(
    text.trim(),
  )

const noMaxHandPattern = (text: string): boolean =>
  /^you have no maximum hand size\.?$/i.test(text.trim())

/** Compiles only recognized semantics; it never relies on a card name. */
export const compileOracleText = (
  input: AbilityCompilerInput,
): AbilityCompilerCandidate => {
  const oracleText = input.oracleText?.trim()
  if (!oracleText)
    return {
      status: 'NO_RUNTIME_ABILITY',
      abilities: [],
      warnings: ['Card has no oracle text.'],
    }
  if (hydroblastPattern(oracleText))
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-choose-red-spell-or-permanent',
          sourceCardName: input.cardName,
          kind: 'SPELL_EFFECT',
          effects: [
            {
              type: 'CHOOSE_MODE',
              prompt: 'Choose one.',
              modes: [
                {
                  id: 'COUNTER',
                  label: 'Counter target spell if it is red.',
                  effects: [
                    {
                      type: 'TARGET_SELECTION',
                      prompt: 'Choose a spell.',
                      constraints: { zones: ['stack'], stackKind: 'SPELL' },
                      effects: [
                        {
                          type: 'CONDITIONAL_EFFECT',
                          condition: {
                            type: 'OBJECT_MATCHES_QUERY',
                            object: 'SELECTED_STACK_OBJECT',
                            query: { colors: ['R'] },
                          },
                          ifTrue: [
                            {
                              type: 'COUNTER_SPELL',
                              target: 'SELECTED_STACK_OBJECT',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'DESTROY',
                  label: 'Destroy target permanent if it is red.',
                  effects: [
                    {
                      type: 'TARGET_SELECTION',
                      prompt: 'Choose a permanent.',
                      constraints: { zones: ['battlefield'] },
                      effects: [
                        {
                          type: 'CONDITIONAL_EFFECT',
                          condition: {
                            type: 'OBJECT_MATCHES_QUERY',
                            object: 'SELECTED_TARGET',
                            query: { colors: ['R'] },
                          },
                          ifTrue: [
                            {
                              type: 'DESTROY_PERMANENT',
                              target: 'SELECTED_TARGET',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          automation: 'ASSISTED',
        },
      ],
    }
  const sovereign = merfolkSovereignPattern(oracleText)
  const combinedSovereign =
    /^\{t\}: target ([a-z]+) creature can't be blocked this turn\.?\s*other merfolk creatures you control get \+(\d+)\/\+(\d+)\.?$/is.exec(
      oracleText,
    )
  if (combinedSovereign) {
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-target-cannot-block',
          sourceCardName: input.cardName,
          kind: 'ACTIVATED',
          costs: [{ type: 'TAP_SOURCE' }],
          effects: [
            {
              type: 'TARGET_SELECTION',
              prompt: 'Choose a Merfolk creature.',
              constraints: {
                zones: ['battlefield'],
                cardTypes: ['Creature'],
                subtypes: [combinedSovereign[1]],
              },
              effects: [
                {
                  type: 'CANNOT_BE_BLOCKED',
                  target: 'SELECTED_TARGET',
                  duration: 'UNTIL_END_OF_TURN',
                },
              ],
            },
          ],
          automation: 'ASSISTED',
        },
        {
          id: 'compiled-other-merfolk-pt-islandwalk',
          sourceCardName: input.cardName,
          kind: 'STATIC',
          effects: [
            {
              type: 'MODIFY_POWER_TOUGHNESS',
              power: Number(combinedSovereign[2]),
              toughness: Number(combinedSovereign[3]),
              filter: {
                controller: 'YOU',
                cardType: 'Creature',
                subtype: 'Merfolk',
                excludeSource: true,
              },
            },
          ],
        },
      ],
    }
  }
  if (sovereign) {
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-target-cannot-block',
          sourceCardName: input.cardName,
          kind: 'ACTIVATED',
          costs: [{ type: 'TAP_SOURCE' }],
          effects: [
            {
              type: 'TARGET_SELECTION',
              prompt: 'Choose a creature.',
              constraints: {
                zones: ['battlefield'],
                cardTypes: ['Creature'],
                subtypes: [sovereign[1]],
              },
              effects: [
                {
                  type: 'CANNOT_BE_BLOCKED',
                  target: 'SELECTED_TARGET',
                  duration: 'UNTIL_END_OF_TURN',
                },
              ],
            },
          ],
          automation: 'ASSISTED',
        },
      ],
    }
  }
  const islandwalk = islandwalkBoostPattern(oracleText)
  if (islandwalk) {
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-subtype-pt-islandwalk',
          sourceCardName: input.cardName,
          kind: 'STATIC',
          effects: [
            {
              type: 'MODIFY_POWER_TOUGHNESS',
              power: Number(islandwalk[2]),
              toughness: Number(islandwalk[3]),
              filter: {
                controller: 'YOU',
                cardType: 'Creature',
                subtype: islandwalk[1],
                excludeSource: true,
              },
            },
            {
              type: 'BLOCKING_RESTRICTION',
              restriction: {
                type: 'LANDWALK',
                landSubtype: 'Island',
                filter: {
                  controller: 'YOU',
                  cardType: 'Creature',
                  subtype: islandwalk[1],
                  excludeSource: true,
                },
                duration: 'STATIC',
              },
            },
          ],
        },
      ],
    }
  }
  const merfolkStatic = otherMerfolkBoost(withoutReminderText(oracleText))
  const hasSovereignActivation =
    /\{t\}:\s*target merfolk creature can't be blocked this turn/i.test(
      oracleText,
    )
  if (merfolkStatic && hasSovereignActivation)
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-other-merfolk-pt',
          sourceCardName: input.cardName,
          kind: 'STATIC',
          effects: [
            {
              type: 'MODIFY_POWER_TOUGHNESS',
              ...merfolkStatic,
              filter: {
                controller: 'YOU',
                cardType: 'Creature',
                subtype: 'Merfolk',
                excludeSource: true,
              },
            },
          ],
        },
        {
          id: 'compiled-target-cannot-block',
          sourceCardName: input.cardName,
          kind: 'ACTIVATED',
          costs: [{ type: 'TAP_SOURCE' }],
          effects: [
            {
              type: 'TARGET_SELECTION',
              prompt: 'Choose a Merfolk creature.',
              constraints: {
                zones: ['battlefield'],
                cardTypes: ['Creature'],
                subtypes: ['Merfolk'],
              },
              effects: [
                {
                  type: 'CANNOT_BE_BLOCKED',
                  target: 'SELECTED_TARGET',
                  duration: 'UNTIL_END_OF_TURN',
                },
              ],
            },
          ],
          automation: 'ASSISTED',
        },
      ],
    }
  if (merfolkStatic)
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-other-merfolk-pt',
          sourceCardName: input.cardName,
          kind: 'STATIC',
          effects: [
            {
              type: 'MODIFY_POWER_TOUGHNESS',
              ...merfolkStatic,
              filter: {
                controller: 'YOU',
                cardType: 'Creature',
                subtype: 'Merfolk',
                excludeSource: true,
              },
            },
          ],
        },
      ],
    }
  const cannotBlock = cannotBeBlockedPattern(oracleText, input.cardName)
  if (cannotBlock)
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-cannot-be-blocked',
          sourceCardName: input.cardName,
          kind: 'STATIC',
          effects: [
            {
              type: 'BLOCKING_RESTRICTION',
              restriction: {
                type: 'CANNOT_BE_BLOCKED',
                filter: cannotBlock.filter,
                duration: 'STATIC',
              },
            },
          ],
        },
      ],
    }
  if (noMaxHandPattern(oracleText))
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-unlimited-hand-size',
          sourceCardName: input.cardName,
          kind: 'STATIC',
          effects: [
            {
              type: 'SET_MAX_HAND_SIZE',
              player: 'SOURCE_CONTROLLER',
              value: 'UNLIMITED',
            },
          ],
        },
      ],
    }
  if (namorPattern(oracleText)) {
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-spell-cast-blue-noncreature-merfolk',
          sourceCardName: input.cardName,
          kind: 'TRIGGERED',
          trigger: { type: 'SPELL_CAST' },
          conditions: [
            { type: 'SPELL_IS_CREATURE', value: false },
            {
              type: 'EVENT_NUMBER_COMPARE',
              field: 'blueManaSymbols',
              operator: 'GT',
              value: 0,
            },
          ],
          effects: [
            {
              type: 'CREATE_TOKEN',
              tokenId: 'BLUE_MERFOLK_1_1',
              amount: { type: 'EVENT_VALUE', field: 'blueManaSymbols' },
            },
          ],
          automation: 'AUTO',
        },
      ],
    }
  }
  const manaLine = oracleText!
    .split(/\n/)
    .map((line) => simpleTapMana(line))
    .find(Boolean)
  if (manaLine && /you have no maximum hand size/i.test(oracleText!)) {
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-tap-add-mana',
          sourceCardName: input.cardName,
          kind: 'ACTIVATED',
          costs: [{ type: 'TAP_SOURCE' }],
          effects: [{ type: 'ADD_MANA', ...manaLine }],
          restrictions: [],
          isManaAbility: true,
          automation: 'AUTO',
        },
        {
          id: 'compiled-unlimited-hand-size',
          sourceCardName: input.cardName,
          kind: 'STATIC',
          effects: [
            {
              type: 'SET_MAX_HAND_SIZE',
              player: 'SOURCE_CONTROLLER',
              value: 'UNLIMITED',
            },
          ],
        },
      ],
    }
  }
  const mana = simpleTapMana(oracleText)
  if (mana)
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-tap-add-mana',
          sourceCardName: input.cardName,
          kind: 'ACTIVATED',
          costs: [{ type: 'TAP_SOURCE' }],
          effects: [{ type: 'ADD_MANA', ...mana }],
          restrictions: [],
          isManaAbility: true,
          automation: 'AUTO',
        },
      ],
    }
  const castTapUntap = subtypeCastTapUntap(oracleText)
  if (castTapUntap)
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-subtype-pt',
          sourceCardName: input.cardName,
          kind: 'STATIC',
          effects: [
            {
              type: 'MODIFY_POWER_TOUGHNESS',
              power: Number(castTapUntap[2]),
              toughness: Number(castTapUntap[3]),
              filter: {
                controller: 'YOU',
                cardType: 'Creature',
                subtype: castTapUntap[1],
                excludeSource: true,
              },
            },
          ],
        },
        {
          id: 'compiled-subtype-spell-tap-untap',
          sourceCardName: input.cardName,
          kind: 'TRIGGERED',
          trigger: { type: 'SPELL_CAST' },
          conditions: [{ type: 'EVENT_HAS_SUBTYPE', value: castTapUntap[1] }],
          effects: [
            {
              type: 'OPTIONAL_EFFECT',
              prompt: 'You may tap or untap target permanent.',
              effects: [
                {
                  type: 'TARGET_SELECTION',
                  prompt: 'Choose a permanent.',
                  constraints: { zones: ['battlefield'] },
                  effects: [
                    {
                      type: 'CHOOSE_MODE',
                      prompt: 'Tap or untap?',
                      modes: [
                        {
                          id: 'TAP',
                          label: 'Tap',
                          effects: [
                            {
                              type: 'TAP_PERMANENT',
                              target: 'SELECTED_TARGET',
                            },
                          ],
                        },
                        {
                          id: 'UNTAP',
                          label: 'Untap',
                          effects: [
                            {
                              type: 'UNTAP_PERMANENT',
                              target: 'SELECTED_TARGET',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          automation: 'ASSISTED',
        },
      ],
    }
  if (tapDrawDiscard(oracleText))
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-tap-draw-discard',
          sourceCardName: input.cardName,
          kind: 'ACTIVATED',
          costs: [{ type: 'TAP_SOURCE' }],
          effects: [
            { type: 'DRAW_CARD', amount: { type: 'LITERAL', value: 1 } },
            {
              type: 'DISCARD_CARD',
              player: 'YOU',
              amount: { type: 'LITERAL', value: 1 },
            },
          ],
          restrictions: [],
          automation: 'ASSISTED',
        },
      ],
    }
  const costReduction = staticCostReduction(oracleText)
  if (costReduction) {
    const color = (
      { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' } as const
    )[costReduction[1].toLowerCase()]
    if (color)
      return {
        status: 'COMPILED',
        abilities: [
          {
            id: 'compiled-color-cost-reduction',
            sourceCardName: input.cardName,
            kind: 'STATIC',
            effects: [
              {
                type: 'MODIFY_COST',
                operation: 'REDUCE_GENERIC_COST',
                amount: Number(costReduction[2]),
                filter: {
                  controller: 'YOU',
                  colors: [color as 'W' | 'U' | 'B' | 'R' | 'G'],
                },
              },
            ],
          },
        ],
      }
  }
  if (massAttackingReturn(oracleText))
    return {
      status: 'PARTIAL',
      abilities: [
        {
          id: 'compiled-return-attacking-creatures',
          sourceCardName: input.cardName,
          kind: 'SPELL_EFFECT',
          automation: 'ASSISTED',
          effects: [
            {
              type: 'FOR_EACH',
              query: {
                zones: ['battlefield'],
                cardTypes: ['Creature'],
                attacking: true,
              },
              effects: [
                {
                  type: 'MOVE_ZONE',
                  target: 'CURRENT_OBJECT',
                  destination: 'hand',
                },
              ],
            },
          ],
        },
      ],
      unsupportedFragments: [
        'External attacking creatures require tabletop-assisted resolution.',
      ],
    }
  // This recognizes only the exact, self-contained instruction. A following
  // sentence remains explicitly unsupported rather than being approximated.
  if (/^counter target spell\.?$/i.test(oracleText))
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-counter-target-spell',
          sourceCardName: input.cardName,
          kind: 'SPELL_EFFECT',
          effects: [{ type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' }],
          automation: 'ASSISTED',
        },
      ],
    }
  if (/^counter target spell\./i.test(oracleText))
    return {
      status: 'PARTIAL',
      abilities: [
        {
          id: 'compiled-counter-target-spell',
          sourceCardName: input.cardName,
          kind: 'SPELL_EFFECT',
          effects: [{ type: 'COUNTER_SPELL', target: 'SELECTED_STACK_OBJECT' }],
          automation: 'ASSISTED',
        },
      ],
      unsupportedFragments: [
        oracleText.replace(/^counter target spell\.\s*/i, ''),
      ],
      warnings: ['Only the immediate counter effect was mapped.'],
    }
  const boost = otherMerfolkBoost(oracleText)
  const genericBoost = subtypeBoost(oracleText)
  if (genericBoost)
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-subtype-pt',
          sourceCardName: input.cardName,
          kind: 'STATIC',
          effects: [
            {
              type: 'MODIFY_POWER_TOUGHNESS',
              power: Number(genericBoost[3]),
              toughness: Number(genericBoost[4]),
              filter: {
                controller: 'YOU',
                cardType: 'Creature',
                subtype: genericBoost[2],
                excludeSource: Boolean(genericBoost[1]),
              },
            },
          ],
        },
      ],
    }
  if (boost)
    return {
      status: 'PARTIAL',
      abilities: [
        {
          id: 'compiled-other-merfolk-pt',
          sourceCardName: input.cardName,
          kind: 'STATIC',
          effects: [
            {
              type: 'MODIFY_POWER_TOUGHNESS',
              ...boost,
              filter: {
                controller: 'YOU',
                cardType: 'Creature',
                subtype: 'Merfolk',
                excludeSource: true,
              },
            },
          ],
        },
      ],
      unsupportedFragments: [oracleText],
      warnings: [
        'Only the independent power/toughness static effect was mapped.',
      ],
    }
  if (cosiPattern(oracleText))
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-opponent-shuffled-optional-counter',
          sourceCardName: input.cardName,
          kind: 'TRIGGERED',
          trigger: { type: 'PLAYER_SHUFFLED' },
          conditions: [{ type: 'EVENT_CONTROLLER_IS', value: 'OPPONENT' }],
          effects: [
            {
              type: 'OPTIONAL_EFFECT',
              prompt: 'You may put a +1/+1 counter on this creature.',
              effects: [
                {
                  type: 'ADD_COUNTER',
                  target: 'SOURCE',
                  counterType: '+1/+1',
                  amount: { type: 'LITERAL', value: 1 },
                },
              ],
            },
          ],
          automation: 'ASSISTED',
        },
      ],
    }
  if (deeprootPattern(oracleText))
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-nontoken-merfolk-tapped-token',
          sourceCardName: input.cardName,
          kind: 'TRIGGERED',
          trigger: { type: 'PERMANENT_BECAME_TAPPED', oneOrMore: true },
          conditions: [
            { type: 'EVENT_CONTROLLER_IS', value: 'YOU' },
            { type: 'EVENT_IS_TOKEN', value: false },
            { type: 'EVENT_HAS_SUBTYPE', value: 'Merfolk' },
          ],
          effects: [
            {
              type: 'CREATE_TOKEN',
              tokenId: 'BLUE_MERFOLK_1_1_HEXPROOF',
              amount: { type: 'LITERAL', value: 1 },
            },
          ],
          automation: 'AUTO',
        },
      ],
    }
  if (merfolkCastTokenPattern(oracleText))
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-merfolk-spell-hexproof-token',
          sourceCardName: input.cardName,
          kind: 'TRIGGERED',
          trigger: { type: 'SPELL_CAST' },
          conditions: [{ type: 'EVENT_HAS_SUBTYPE', value: 'Merfolk' }],
          effects: [
            {
              type: 'CREATE_TOKEN',
              tokenId: 'BLUE_MERFOLK_1_1_HEXPROOF',
              amount: { type: 'LITERAL', value: 1 },
            },
          ],
          automation: 'AUTO',
        },
      ],
    }
  const endStepUntap = endStepUntapPattern(oracleText)
  if (endStepUntap)
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-end-step-untap-subtype',
          sourceCardName: input.cardName,
          kind: 'TRIGGERED',
          trigger: { type: 'END_STEP_STARTED' },
          conditions: [{ type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' }],
          effects: [
            {
              type: 'FOR_EACH',
              query: {
                zones: ['battlefield'],
                controller: 'SOURCE_CONTROLLER',
                subtypes: [endStepUntap[1]],
              },
              effects: [{ type: 'UNTAP_PERMANENT', target: 'CURRENT_OBJECT' }],
            },
          ],
          automation: 'AUTO',
        },
      ],
    }
  const rhystic = rhysticPattern(oracleText)
  if (rhystic)
    return {
      status: 'COMPILED',
      abilities: [
        {
          id: 'compiled-opponent-spell-unless-payment-draw',
          sourceCardName: input.cardName,
          kind: 'TRIGGERED',
          trigger: { type: 'SPELL_CAST' },
          conditions: [
            { type: 'EVENT_CONTROLLER_IS', value: 'OPPONENT' },
            ...(rhystic[1]
              ? [{ type: 'SPELL_IS_CREATURE' as const, value: false }]
              : []),
          ],
          effects: [
            {
              type: 'PAYMENT_BRANCH',
              payer: 'EVENT_PLAYER',
              cost: { type: 'FIXED_MANA', cost: `{${rhystic[2]}}` },
              ifPaid: [],
              ifNotPaid: [
                {
                  type: 'OPTIONAL_EFFECT',
                  prompt: 'You may draw a card.',
                  effects: [
                    {
                      type: 'DRAW_CARD',
                      amount: { type: 'LITERAL', value: 1 },
                    },
                  ],
                },
              ],
            },
          ],
          automation: 'ASSISTED',
        },
        ...(cumulativeUpkeepCost(oracleText)
          ? [
              {
                id: 'compiled-cumulative-upkeep',
                sourceCardName: input.cardName,
                kind: 'TRIGGERED' as const,
                trigger: { type: 'UPKEEP_STARTED' as const },
                conditions: [
                  { type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' as const },
                ],
                effects: [
                  {
                    type: 'ADD_COUNTER' as const,
                    target: 'SOURCE' as const,
                    counterType: 'AGE',
                    amount: { type: 'LITERAL' as const, value: 1 },
                  },
                  {
                    type: 'PAYMENT_BRANCH' as const,
                    payer: 'SOURCE_CONTROLLER' as const,
                    cost: {
                      type: 'GENERIC_FROM_VALUE' as const,
                      value: {
                        type: 'MULTIPLY' as const,
                        values: [
                          {
                            type: 'LITERAL' as const,
                            value: Number(cumulativeUpkeepCost(oracleText)),
                          },
                          {
                            type: 'COUNTER_COUNT' as const,
                            target: 'SOURCE' as const,
                            counterType: 'AGE',
                          },
                        ],
                      },
                    },
                    ifPaid: [],
                    ifNotPaid: [
                      { type: 'SACRIFICE' as const, target: 'SOURCE' as const },
                    ],
                  },
                ],
                automation: 'ASSISTED' as const,
              },
            ]
          : []),
      ],
    }
  const upkeep = cumulativeUpkeepCost(oracleText)
  if (upkeep)
    return {
      status: 'PARTIAL',
      abilities: [
        {
          id: 'compiled-cumulative-upkeep',
          sourceCardName: input.cardName,
          kind: 'TRIGGERED',
          trigger: { type: 'UPKEEP_STARTED' },
          conditions: [{ type: 'EVENT_ACTIVE_PLAYER_IS_SOURCE_CONTROLLER' }],
          effects: [
            {
              type: 'ADD_COUNTER',
              target: 'SOURCE',
              counterType: 'AGE',
              amount: { type: 'LITERAL', value: 1 },
            },
            {
              type: 'PAYMENT_BRANCH',
              payer: 'SOURCE_CONTROLLER',
              cost: {
                type: 'GENERIC_FROM_VALUE',
                value: {
                  type: 'MULTIPLY',
                  values: [
                    { type: 'LITERAL', value: Number(upkeep) },
                    {
                      type: 'COUNTER_COUNT',
                      target: 'SOURCE',
                      counterType: 'AGE',
                    },
                  ],
                },
              },
              ifPaid: [],
              ifNotPaid: [{ type: 'SACRIFICE', target: 'SOURCE' }],
            },
          ],
          automation: 'ASSISTED',
        },
      ],
      unsupportedFragments: [
        oracleText.replace(/cumulative upkeep \{\d+\}[\s\S]*/i, ''),
      ].filter(Boolean),
      warnings: ['Only cumulative upkeep was mapped.'],
    }
  if (hasTriggeredAbilityLanguage(oracleText))
    return {
      status: 'MANUAL',
      abilities: [],
      unsupportedFragments: [oracleText],
    }
  return { status: 'NO_RUNTIME_ABILITY', abilities: [] }
}
