import type { AbilityDefinition } from '../types/abilityTypes'

const linkKey = 'secret-invasion-exiled-creature'

export const secretInvasionAbilities: AbilityDefinition[] = [
  {
    id: 'secret-invasion-enter',
    sourceCardName: 'Secret Invasion',
    kind: 'TRIGGERED',
    trigger: { type: 'CARD_ENTERED_BATTLEFIELD' },
    conditions: [{ type: 'EVENT_SUBJECT_IS_SOURCE' }],
    effects: [
      {
        type: 'OPTIONAL_EFFECT',
        prompt: 'Exile up to one other target creature with Secret Invasion?',
        effects: [
          {
            type: 'TARGET_SELECTION',
            prompt: 'Choose another creature to exile with Secret Invasion.',
            constraints: {
              zones: ['battlefield'],
              cardTypes: ['Creature'],
              excludeSource: true,
              excludeAttachedToSource: true,
              controller: 'ANY',
            },
            effects: [
              {
                type: 'CONDITIONAL_EFFECT',
                condition: {
                  type: 'OBJECT_MATCHES_QUERY',
                  object: 'SOURCE',
                  query: { zones: ['battlefield'] },
                },
                ifTrue: [
                  {
                    type: 'LINK_OBJECT',
                    target: 'SELECTED_TARGET',
                    key: linkKey,
                    returnOnSourceLeaves: {
                      fromZone: 'exile',
                      destination: 'battlefield',
                      controller: 'OWNER',
                    },
                  },
                  {
                    type: 'COPY_OBJECT_CHARACTERISTICS',
                    target: 'ATTACHED_OBJECT',
                    source: 'SELECTED_TARGET',
                    duration: 'WHILE_SOURCE_ON_BATTLEFIELD',
                  },
                  {
                    type: 'MOVE_ZONE',
                    target: 'SELECTED_TARGET',
                    destination: 'exile',
                    controller: 'OWNER',
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
  {
    id: 'secret-invasion-ward',
    sourceCardName: 'Secret Invasion',
    kind: 'STATIC',
    effects: [
      {
        type: 'WARD',
        cost: '{2}',
        filter: { attachedToSource: true },
      },
    ],
  },
]
